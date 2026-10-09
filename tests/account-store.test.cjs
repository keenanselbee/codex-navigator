'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AccountStore, parseAccountAuth } = require('../dist/account-store');

function token(claims) {
  return `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
}

function auth(user = 'user-a', workspace = 'workspace-a', extra = {}, plan) {
  return JSON.stringify({
    auth_mode: 'chatgpt', OPENAI_API_KEY: null,
    tokens: {
      id_token: token({ sub: user, email: 'person@example.test', chatgpt_account_id: workspace,
        'https://api.openai.com/auth': { chatgpt_plan_type: plan } }),
      access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', account_id: workspace,
    },
    last_refresh: 'test-timestamp', ...extra,
  });
}

function fixture(t) {
  const root = path.join(__dirname, '..', '.codex-temp');
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'navigator-accounts-'));
  const values = new Map(), calls = { get: 0, store: 0, delete: 0 };
  const secrets = {
    async get(key) { calls.get++; return values.get(key); },
    async store(key, value) { calls.store++; values.set(key, value); },
    async delete(key) { calls.delete++; values.delete(key); },
  };
  const stores = [];
  t.after(() => {
    for (const store of stores) store.dispose();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const open = (home = path.join(directory, 'home'), secretStorage = secrets) => {
    const store = new AccountStore(directory, home, secretStorage);
    stores.push(store);
    return store;
  };
  return { open, secrets, values, calls, directory };
}

test('reset journal is shared across stores, retained while disabled, and removed when forgotten', async t => {
  const f = fixture(t), store = f.open();
  await store.enable(); const account = await store.capture(auth(), true);
  const attempt = { creditId: 'credit', expiresAt: 2000000000, requestId: 'same-request', status: 'pending' };
  store.saveResetAttempt(account.id, attempt);
  const peer = f.open();
  assert.deepEqual(peer.resetAttempt(account.id), attempt);
  await store.disable(); assert.deepEqual(peer.resetAttempt(account.id), attempt);
  await store.forget(account.id); assert.equal(peer.resetAttempt(account.id), undefined);
});

test('legacy account migrations exclude other writers and preserve saved metadata', t => {
  const { directory, secrets, open } = fixture(t);
  const { DatabaseSync } = require('node:sqlite');
  const home = path.join(directory, 'home');
  const namespace = require('node:crypto').createHash('sha256')
    .update(process.platform === 'win32' ? path.resolve(home).toLowerCase() : path.resolve(home)).digest('hex').slice(0, 32);
  const filename = path.join(directory, `accounts-${namespace}.sqlite`);
  const legacy = new DatabaseSync(filename);
  legacy.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
    email TEXT, label TEXT, secret_key TEXT NOT NULL, generation INTEGER NOT NULL);
    CREATE TABLE credential_keys (secret_key TEXT PRIMARY KEY, account_id TEXT NOT NULL);
    INSERT INTO accounts VALUES ('saved', 'user', 'workspace', 'person@example.test', 'Work', 'synthetic-key', 3);`);
  legacy.close();
  let lockedChecks = 0;
  class ObservedDatabase extends DatabaseSync {
    prepare(sql) {
      const statement = super.prepare(sql);
      if (!/^PRAGMA table_info\((accounts|credential_keys)\)$/.test(sql)) return statement;
      return { all: () => {
        const rows = statement.all();
        const contender = new DatabaseSync(filename);
        try {
          contender.exec('PRAGMA busy_timeout=0');
          assert.throws(() => contender.exec('BEGIN IMMEDIATE'), /locked/,
            'another window cannot acquire the writer lock between schema inspection and ALTER TABLE');
          lockedChecks++;
        } finally { contender.close(); }
        return rows;
      } };
    }
  }
  const exports = {};
  require('node:vm').runInNewContext(fs.readFileSync(require.resolve('../dist/account-store'), 'utf8'), { exports, process,
    require: name => name === 'node:sqlite' ? { DatabaseSync: ObservedDatabase }
      : name.startsWith('./') ? require('../dist/' + name.slice(2)) : require(name) });
  const upgraded = new exports.AccountStore(directory, home, secrets);
  try {
    assert.equal(lockedChecks, 2);
    const saved = upgraded.list()[0];
    assert.equal(saved.label, 'Work'); assert.equal(saved.generation, 3);
    assert.equal(saved.plan, undefined);
    assert.equal(open().list()[0].id, saved.id, 'another window opens the migrated catalog');
  } finally { upgraded.dispose(); }
});

test('usage cache survives reopen, rejects late generations, and is removed by forgetting', async t => {
  const { open } = fixture(t), store = open();
  await store.enable();
  const account = await store.capture(auth());
  const usage = { checkedAt: Date.now(), plan: 'plus', primary: { usedPercent: 30, windowDurationMins: 300, resetsAt: 1800000000 }, bankedResets: 2 };
  store.saveUsage(account.id, account.generation, { ...usage, refresh_token: 'must-not-persist' });
  assert.deepEqual(open().usage(account.id), usage);
  store.saveUsage(account.id, account.generation + 1, { ...usage, bankedResets: 8 });
  store.saveUsage(account.id, account.generation, { ...usage, checkedAt: usage.checkedAt - 1, bankedResets: 9 });
  assert.equal(store.usage(account.id).bankedResets, 2);
  await store.forget(account.id);
  store.saveUsage(account.id, account.generation, usage);
  assert.equal(open().usage(account.id), undefined);
});

test('known identity plans persist apart from usage and unsafe plan fields stay private', async t => {
  const { open } = fixture(t), store = open();
  await store.enable();
  const raw = auth('plan-user', 'workspace-a', { planType: 'SECRET', accessToken: 'SECRET' }, 'prolite');
  const account = await store.capture(raw);
  assert.equal(account.plan, 'prolite');
  assert.equal(open().list()[0].plan, 'prolite');
  assert.equal(store.usage(account.id), undefined);
  store.savePlan(account.id, account.generation, 'plus');
  assert.equal(open().list()[0].plan, 'plus');
  assert.equal((await store.capture(raw)).plan, 'plus');
  assert.equal(open().list()[0].plan, 'plus');
  store.savePlan(account.id, account.generation + 1, 'enterprise');
  store.savePlan(account.id, account.generation, 'PRIVATE TOKEN');
  assert.equal(store.list()[0].plan, 'plus');
  const updated = await store.capture(auth('plan-user', 'workspace-a', {}, 'pro'));
  assert.equal(updated.plan, 'pro');
  assert.equal(open().list()[0].plan, 'pro');
  assert.doesNotMatch(JSON.stringify(store.list()), /SECRET|accessToken/);
  await store.forget(account.id);
  assert.equal(open().list().length, 0);
});

test('empty custom account label restores its default identity display', async t => {
  const { open } = fixture(t), store = open();
  await store.enable(); const account = await store.capture(auth());
  await store.rename(account.id, 'Studio');
  assert.equal(store.list()[0].label, 'Studio');
  await store.rename(account.id, '   ');
  assert.equal(store.list()[0].label, undefined);
  assert.equal(store.list()[0].email, 'person@example.test');
});

test('consent is off by default and disabled capture never touches secure storage', async t => {
  const { open, calls } = fixture(t), store = open();
  assert.deepEqual(store.state(), { enabled: false, accounts: [], exclusions: [] });
  assert.equal(await store.capture('not JSON'), undefined);
  assert.deepEqual(calls, { get: 0, store: 0, delete: 0 });
  await store.enable();
  assert.equal(store.enabled, true);
  await store.disable();
  assert.equal(open().enabled, false);
});

test('full bundle is secure, metadata is home scoped, and a reopened store can load it', async t => {
  const { open } = fixture(t), first = open(), peer = open(), otherHome = open('/other-codex-home');
  await first.enable();
  const raw = auth('same-user', 'work-a', { other_native_field: { keep: true } });
  const saved = await first.capture(raw);
  assert.equal(peer.list()[0].id, saved.id);
  assert.equal(peer.list()[0].workspaceId, 'work-a');
  assert.equal(peer.state().enabled, true);
  assert.equal(otherHome.list().length, 0);
  assert.equal(await peer.load(saved.id), raw);
  assert.equal(JSON.stringify(peer.state()).includes('synthetic-refresh'), false);
  assert.equal(JSON.stringify(peer.state()).includes('other_native_field'), false);
});

test('identity needs a stable user and workspace and rejects unsupported modes', () => {
  const first = parseAccountAuth(auth('one', 'team-a'));
  const second = parseAccountAuth(auth('one', 'team-b'));
  assert.notEqual(first.id, second.id);
  assert.equal(first.email, 'person@example.test');
  assert.throws(() => parseAccountAuth(auth('one', 'team-a', { auth_mode: 'apikey' })), /unsupported/);
  assert.throws(() => parseAccountAuth(auth('one', 'team-a', { OPENAI_API_KEY: 'key' })), /unsupported/);
  assert.throws(() => parseAccountAuth(auth('one', 'team-a', { tokens: { account_id: 'team-a' } })), /unsupported/);
  const mismatch = JSON.parse(auth());
  mismatch.tokens.account_id = 'different';
  assert.throws(() => parseAccountAuth(JSON.stringify(mismatch)), /ambiguous/);
  assert.throws(() => parseAccountAuth('x'.repeat(1024 * 1024 + 1)), /unsupported/);
});

test('forget excludes the current identity until explicitly remembered; forget all turns consent off', async t => {
  const { open } = fixture(t), store = open();
  await store.enable();
  const raw = auth(), account = await store.capture(raw);
  await store.rename(account.id, 'Personal');
  assert.equal(store.list()[0].label, 'Personal');
  await store.forget(account.id);
  assert.deepEqual(store.list(), []);
  assert.deepEqual(store.state().exclusions, [account.id]);
  assert.equal(await store.capture(raw), undefined);
  assert.equal((await store.capture(raw, true)).id, account.id);
  await store.forgetAll();
  assert.equal(store.enabled, false);
  assert.deepEqual(store.list(), []);
});

test('a late secure write cannot replace a newer saved generation', async t => {
  const { open, secrets } = fixture(t);
  const firstRaw = auth('one', 'team', { revision: 'old' });
  const secondRaw = auth('one', 'team', { revision: 'new' });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const delayed = {
    get: secrets.get, delete: secrets.delete,
    async store(key, value) {
      if (value === firstRaw) await gate;
      return secrets.store(key, value);
    },
  };
  const a = open(path.join(__dirname, '..', '.codex-temp', 'generation-home'), delayed);
  const b = open(path.join(__dirname, '..', '.codex-temp', 'generation-home'));
  await a.enable();
  const oldCapture = a.capture(firstRaw);
  const newCapture = await b.capture(secondRaw);
  release();
  assert.equal(await oldCapture, undefined);
  assert.equal(await b.load(newCapture.id), secondRaw);
  assert.equal(b.list()[0].generation, 2);
});

test('identical captures are idempotent and an older refresh cannot replace a newer one', async t => {
  const { open, calls } = fixture(t), store = open();
  await store.enable();
  const recent = auth('one', 'team', { last_refresh: '2026-09-28T12:00:00Z' });
  const older = auth('one', 'team', { last_refresh: '2026-09-27T12:00:00Z' });
  const account = await store.capture(recent);
  const writes = calls.store;
  assert.deepEqual(await store.capture(recent), account);
  assert.equal(calls.store, writes);
  assert.equal(await store.capture(older), undefined);
  assert.equal(await store.load(account.id), recent);
  assert.equal(store.list()[0].generation, account.generation);
});

test('an identical-read race cannot restore an older generation', async t => {
  const { open, secrets } = fixture(t), home = '/shared-account-home';
  const first = open(home);
  await first.enable();
  const oldRaw = auth('one', 'team', { last_refresh: '2026-09-27T12:00:00Z' });
  const newRaw = auth('one', 'team', { last_refresh: '2026-09-28T12:00:00Z' });
  const original = await first.capture(oldRaw);
  let release, waiting;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { waiting = resolve; });
  let delayedOnce = false;
  const slowRead = open(home, {
    async get(key) {
      if (!delayedOnce && key.endsWith('.1')) { delayedOnce = true; waiting(); await gate; }
      return secrets.get(key);
    },
    store: secrets.store, delete: secrets.delete,
  });
  const duplicate = slowRead.capture(oldRaw);
  await entered;
  const updated = await first.capture(newRaw);
  release();
  assert.equal(await duplicate, undefined);
  assert.equal(updated.generation, original.generation + 1);
  assert.equal(await first.load(original.id), newRaw);
});

test('secure storage failures leave consent and prior credentials intact', async t => {
  const { open, secrets } = fixture(t);
  const broken = open('/broken', {
    get: secrets.get,
    async store() { throw new Error('sensitive implementation detail'); },
    delete: secrets.delete,
  });
  await assert.rejects(broken.enable(), /Secure account storage is unavailable/);
  assert.equal(broken.enabled, false);
  const store = open();
  await store.enable();
  const saved = await store.capture(auth());
  const failing = open(path.join(__dirname, '..', '.codex-temp', 'failure-home'));
  await failing.enable();
  const before = await failing.capture(auth());
  const readOnly = open(path.join(__dirname, '..', '.codex-temp', 'failure-home'), {
    get: secrets.get,
    async store() { throw new Error('sensitive implementation detail'); },
    delete: secrets.delete,
  });
  await assert.rejects(readOnly.capture(auth('one', 'team')), /Could not save/);
  assert.equal(await failing.load(before.id), auth());
  assert.equal(await store.load(saved.id), auth());
});

test('home lease and pending switch are shared and owner checked', t => {
  const { open } = fixture(t), a = open(), b = open();
  assert.equal(a.acquireLease('window-a', 100, 50), true);
  assert.equal(b.acquireLease('window-b', 110, 50), false);
  b.releaseLease('window-b');
  assert.equal(b.acquireLease('window-b', 150, 50), true);
  a.releaseLease('window-a');
  assert.equal(a.acquireLease('window-a', 160, 50), false);
  const pending = { accountId: 'a'.repeat(32), fingerprint: 'b'.repeat(64), createdAt: 123 };
  a.setPending(pending);
  assert.deepEqual(b.state().pending, pending);
  b.setPending(undefined);
  assert.equal(a.state().pending, undefined);
});

test('forget all retries cleanup of retired credential generations', async t => {
  const { open, secrets, values } = fixture(t);
  let locked = false;
  const store = open('/retired-cleanup', { ...secrets, async delete(key) {
    if (locked) throw Error('synthetic vault lock');
    return secrets.delete(key);
  } });
  await store.enable(); await store.capture(auth());
  locked = true;
  await store.capture(auth('user-a', 'workspace-a', { last_refresh: '2026-09-29T01:00:00Z' }));
  await assert.rejects(store.forgetAll(), /Could not remove/);
  assert.equal(store.enabled, false);
  locked = false; await store.forgetAll();
  assert.equal(store.list().length, 0);
  assert.equal(values.size, 0, 'retired and current full credential bundles are removed');
});

test('forget during an unfinished vault write retains cleanup evidence for a later retry', async t => {
  const { open, secrets, values } = fixture(t);
  let release, writing, locked = false;
  const started = new Promise(resolve => { writing = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const store = open('/unfinished-write', { ...secrets,
    async store(key, value) {
      if (!key.includes('.probe.')) { writing(); await gate; }
      await secrets.store(key, value);
    },
    async delete(key) { if (locked) throw Error('synthetic vault lock'); await secrets.delete(key); },
  });
  await store.enable(); const pending = store.capture(auth()); await started;
  await store.forgetAll(); locked = true; release();
  assert.equal(await pending, undefined);
  assert.equal(values.size, 1, 'failed cleanup leaves a credential awaiting a retry');
  locked = false; await store.forgetAll();
  assert.equal(values.size, 0); assert.equal(store.list().length, 0);
});
