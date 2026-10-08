const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = require('../dist/account-runtime');
const { AccountError } = require('../dist/account-errors');
const { AccountStore } = require('../dist/account-store');

function auth(id, refresh = 'synthetic', plan) {
  const token = 'header.' + Buffer.from(JSON.stringify({ sub: id, email: id + '@example.invalid',
    'https://api.openai.com/auth': { chatgpt_plan_type: plan } })).toString('base64url') + '.signature';
  return JSON.stringify({ auth_mode: 'chatgpt', tokens: { id_token: token, access_token: 'synthetic', refresh_token: refresh, account_id: 'workspace' } });
}
async function fixture(t, overrides = {}, options = {}) {
  const scratch = path.join(__dirname, '..', '.codex-temp');
  fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'navigator-controller-'));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  const values = new Map(), globals = new Map(), commands = [], messages = [], calls = { read: 0, preflight: 0, login: 0, usage: 0 };
  let answer = 'Switch Account and Reload', allowed = true, active = options.activeWork, reloadFails = options.reloadFails;
  const secrets = { async get(k) { return values.get(k); }, async store(k,v) { values.set(k,v); }, async delete(k) { values.delete(k); } };
  const vscode = { workspace: { isTrusted: true, getConfiguration: () => ({ get: () => options.wsl || false }) },
    env: { openExternal: async () => true, clipboard: { async writeText() {} } },
    Uri: { parse: value => value },
    commands: { async executeCommand(...args) { commands.push(args); if (args[0] === 'workbench.action.reloadWindow' && reloadFails) throw Error('synthetic reload failure'); } },
    window: { async showWarningMessage(message) { messages.push(message); return typeof answer === 'function' ? answer(message) : answer; }, async showInformationMessage(message) { messages.push(message); return answer; } } };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/accounts'), 'utf8'), {
    exports, process: options.platform ? { ...process, platform: options.platform } : process, Date: options.clock || Date, setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout, AbortController,
    require: name => name === 'vscode' ? vscode : name === './account-store' ? require('../dist/account-store')
      : name === './account-usage' ? { ...require('../dist/account-usage'), readAccountUsage: overrides.readAccountUsage || (async () => {
        calls.usage++; return { checkedAt: Date.now(), plan: 'plus', primary: { usedPercent: 25, windowDurationMins: 300 }, bankedResets: 2 };
      }) }
      : name === './account-resets' ? { ...require('../dist/account-resets'),
        readBankedResets: overrides.readBankedResets || (async () => []),
        consumeBankedReset: overrides.consumeBankedReset || (async () => { throw Error('Unexpected consumption'); }) }
      : name === './account-runtime' ? { ...runtime,
        accountCapability: async () => ({ supported: true, isolatedLogin: true, message: 'fixture' }),
        prepareAccountCredentials: async (_binary, _directory, raw) => { calls.preflight++; return raw; },
        isolatedAccountLogin: async () => { calls.login++; return auth('new'); },
        readAccountFile: async (...args) => { calls.read++; return runtime.readAccountFile(...args); }, ...overrides } : name.startsWith('./') ? require('../dist/' + name.slice(2)) : require(name),
  });
  const context = { globalStorageUri: { fsPath: path.join(root, 'storage') }, secrets,
    globalState: { get: (key, fallback) => globals.has(key) ? globals.get(key) : fallback,
      async update(key, value) { globals.set(key, value); } } };
  const controller = new exports.Accounts(context,
    { home, binary: 'synthetic', canUse: () => allowed, beforeReload() {}, hasActiveWork: () => active });
  await controller.refresh();
  t.after(async () => {
    if (!controller.disposed) await controller.dispose();
    await controller.refreshing;
    await new Promise(resolve => setTimeout(resolve, 50));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
  });
  return { controller, Accounts: exports.Accounts, context, home, commands, calls, values, globals, secrets, messages, vscode,
    answer(value) { answer = value; }, access(value) { allowed = value; }, active(value) { active = value; }, reloadFailure(value) { reloadFails = value; } };
}

function action(account, name = 'switch') { return { action: name, id: account.id, generation: account.generation }; }
function reloads(f) { return f.commands.filter(([name]) => name === 'workbench.action.reloadWindow').length; }
function gate() { let open; const promise = new Promise(resolve => { open = resolve; }); return { promise, open }; }

test('banked reset confirmation exposes dates only and consumes the exact preview once', async t => {
  const credit = { id: 'private-credit-id', expiresAt: Math.floor(Date.now() / 1000) + 86400 };
  const hold = gate(), consumed = [];
  const f = await fixture(t, {
    readBankedResets: async () => [credit, { id: 'later-credit', expiresAt: credit.expiresAt + 86400 }],
    consumeBankedReset: async (...args) => { consumed.push(args); await hold.promise; },
  });
  const raw = auth('first'); fs.writeFileSync(path.join(f.home, 'auth.json'), raw);
  await f.controller.enable(); const account = f.controller.store.list()[0];
  await f.controller.act(action(account, 'previewReset'));
  const preview = f.controller.snapshot().reset;
  assert.equal(preview.accountId, account.id);
  assert.deepEqual(Array.from(preview.expiresAt), [credit.expiresAt, credit.expiresAt + 86400]);
  assert.doesNotMatch(JSON.stringify(f.controller.snapshot()), /private-credit-id|later-credit|access_token|synthetic/);
  const request = { ...action(account, 'useReset'), token: preview.token };
  const first = f.controller.act(request);
  while (!consumed.length) await new Promise(resolve => setTimeout(resolve, 5));
  await f.controller.act(request); assert.equal(consumed.length, 1);
  hold.open(); await first;
  assert.equal(consumed[0][1].id, credit.id); assert.equal(consumed[0][2], preview.token);
  assert.equal(f.controller.snapshot().reset, undefined); assert.equal(f.calls.usage, 1);
  await f.controller.act(request); assert.equal(consumed.length, 1, 'spent confirmation cannot be replayed');
  assert.equal(await runtime.readAccountFile(f.home), raw); assert.equal(reloads(f), 0);
});

test('stale, cancelled and forged reset confirmations never consume another credit', async t => {
  let credits = [{ id: 'first-credit', expiresAt: Math.floor(Date.now() / 1000) + 100 }], consumed = 0;
  const f = await fixture(t, { readBankedResets: async () => credits,
    consumeBankedReset: async () => { consumed++; } });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable(); const account = f.controller.store.list()[0];
  await f.controller.act(action(account, 'previewReset'));
  await f.controller.act({ ...action(account, 'useReset'), token: 'forged' });
  assert.equal(consumed, 0);
  const token = f.controller.snapshot().reset.token;
  credits = [{ id: 'different-credit', expiresAt: credits[0].expiresAt + 100 }];
  await f.controller.act({ ...action(account, 'useReset'), token });
  assert.equal(consumed, 0); assert.match(f.controller.snapshot().reset.problem, /available resets changed/);
  await f.controller.act({ action: 'cancelReset' });
  await f.controller.act({ ...action(account, 'useReset'), token });
  assert.equal(consumed, 0);
});

test('reset cancellation during a read and a cross-window lease prevent consumption', async t => {
  const hold = gate(); let reads = 0, consumed = 0;
  const f = await fixture(t, { readBankedResets: async () => {
    reads++; await hold.promise; return [{ id: 'credit', expiresAt: Math.floor(Date.now() / 1000) + 100 }];
  }, consumeBankedReset: async () => { consumed++; } });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable(); const account = f.controller.store.list()[0];
  const loading = f.controller.act(action(account, 'previewReset'));
  while (!reads) await new Promise(resolve => setTimeout(resolve, 5));
  await f.controller.act({ action: 'cancelReset' }); hold.open(); await loading;
  assert.equal(f.controller.snapshot().reset, undefined);
  assert.equal(f.controller.store.acquireLease('peer', Date.now(), 60000), true);
  await f.controller.act(action(account, 'previewReset'));
  assert.equal(reads, 1); assert.equal(consumed, 0);
  f.controller.store.releaseLease('peer');
});

test('uncertain redemption cannot retry from the same confirmation and failed quota refresh does not undo success', async t => {
  let fail = true, consumed = 0; const attempts = [];
  const expiresAt = Math.floor(Date.now() / 1000) + 100;
  const f = await fixture(t, { readBankedResets: async () => [{ id: 'credit', expiresAt }],
    consumeBankedReset: async (_raw, credit, token, retry) => {
      consumed++; attempts.push({ credit, token, retry });
      if (fail) throw new (require('../dist/account-resets').UncertainResetError)();
    },
    readAccountUsage: async () => { throw Error('offline'); } });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable(); const account = f.controller.store.list()[0];
  await f.controller.act(action(account, 'previewReset'));
  const request = { ...action(account, 'useReset'), token: f.controller.snapshot().reset.token };
  await f.controller.act(request); await f.controller.act(request);
  assert.equal(consumed, 1);
  fail = false; await f.controller.act(action(account, 'previewReset'));
  assert.equal(f.controller.snapshot().reset.token, request.token, 'reopening keeps the same idempotency key');
  await f.controller.act({ ...request, token: f.controller.snapshot().reset.token });
  assert.equal(consumed, 2); assert.equal(f.controller.snapshot().reset, undefined);
  assert.equal(attempts[1].retry, true); assert.equal(attempts[0].token, attempts[1].token);
  assert.match(f.controller.snapshot().accounts[0].usageProblem, /Reset used/);
  assert.equal(f.controller.snapshot().accounts[0].usage.primary, undefined);
});

test('only Windows applies the WSL preference and other account access guards remain enforced', async t => {
  for (const platform of ['win32', 'darwin', 'linux']) for (const wsl of [false, true]) {
    const f = await fixture(t, {}, { platform, wsl });
    assert.equal(f.controller.allowed(), !(platform === 'win32' && wsl), platform + ' WSL=' + wsl);
    f.vscode.workspace.isTrusted = false; assert.equal(f.controller.allowed(), false);
    f.vscode.workspace.isTrusted = true; f.vscode.env.remoteName = 'ssh-remote'; assert.equal(f.controller.allowed(), false);
    f.vscode.env.remoteName = undefined; f.access(false); assert.equal(f.controller.allowed(), false);
  }
});

test('failed account enable stays visible without capture and a later explicit retry can enable', async t => {
  let supported = false, checks = 0;
  const reason = 'Account switching requires file-backed Codex authentication.';
  const f = await fixture(t, { accountCapability: async () => {
    checks++; return { supported, isolatedLogin: supported, message: supported ? 'Ready' : reason };
  } });
  assert.equal(f.controller.status().label, 'Off');
  let changes = 0; f.controller.onChange = () => changes++;
  await f.controller.enable(); await f.controller.refresh();
  assert.equal(f.controller.store.enabled, false);
  assert.equal(f.controller.status().label, 'Unavailable');
  assert.equal(f.controller.status().detail, reason);
  assert.equal(f.calls.read, 0); assert.equal(f.values.size, 0);
  assert.equal(checks, 1, 'disabled polling does not repeatedly launch the capability helper');
  assert.ok(changes > 0); assert.equal(f.messages.length, 0, 'failure stays inline');
  supported = true; await f.controller.enable();
  assert.equal(f.controller.store.enabled, true);
  assert.notEqual(f.controller.status().detail, reason);
  await f.controller.disable(); assert.equal(f.controller.status().label, 'Off');
});

test('account progress reports credential checks, browser sign-in, switching and reload then clears', async t => {
  const f = await fixture(t, { isolatedAccountLogin: async (_binary, _directory, open) => {
    await open('https://auth.openai.com/synthetic');
    return auth('new');
  } });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const target = await f.controller.store.capture(auth('second'), true);
  await f.controller.store.rename(target.id, 'Work');
  const progress = [];
  f.controller.onChange = () => progress.push(f.controller.snapshot().progress);
  await f.controller.act(action(target));
  assert.ok(progress.includes('Checking sign-in for Work...'));
  assert.ok(progress.includes('Switching to Work...'));
  assert.ok(progress.includes('Reloading VS Code with your selected account...'));
  assert.equal(f.controller.snapshot().progress, undefined);
  await f.controller.act({ action: 'add' });
  for (const message of ['Opening browser sign-in...', 'Waiting for browser sign-in...', 'Saving your sign-in...', 'Switching to new@example.invalid...'])
    assert.ok(progress.includes(message), message);
  assert.equal(f.controller.snapshot().progress, undefined);
});

test('account page metadata is cached without replacing credentials or repeating fresh reads', async t => {
  const f = await fixture(t);
  await f.controller.refreshUsage(); assert.equal(f.calls.usage, 0);
  const raw = auth('first'); fs.writeFileSync(path.join(f.home, 'auth.json'), raw);
  await f.controller.enable();
  await f.controller.refreshUsage();
  const account = f.controller.snapshot().accounts[0];
  assert.equal(account.name, ''); assert.equal(account.plan, 'plus');
  assert.equal(account.usage.bankedResets, 2); assert.equal(account.usage.primary.usedPercent, 25);
  assert.equal(await runtime.readAccountFile(f.home), raw);
  assert.equal(reloads(f), 0);
  await f.controller.refreshUsage(); assert.equal(f.calls.usage, 1);
  assert.doesNotMatch(JSON.stringify(account), /synthetic|refresh_token|access_token/);
  await f.controller.act({ ...action(f.controller.store.list()[0], 'rename'), label: 'Personal' });
  assert.equal(f.controller.snapshot().accounts[0].name, 'Personal');
  await f.controller.act({ ...action(f.controller.store.list()[0], 'rename'), label: '' });
  assert.equal(f.controller.snapshot().accounts[0].name, '');
});

test('failed usage reads retain cached metadata and do not block saved switching', async t => {
  const f = await fixture(t, { readAccountUsage: async () => { throw Error('PRIVATE credential detail'); } });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first')); await f.controller.enable();
  const first = f.controller.store.list()[0], target = await f.controller.store.capture(auth('second'), true);
  f.controller.store.saveUsage(first.id, first.generation, { checkedAt: 1, plan: 'plus', bankedResets: 0 });
  await f.controller.refreshUsage();
  const metadata = f.controller.snapshot().accounts.find(row => row.id === first.id);
  assert.equal(metadata.usage.bankedResets, 0);
  assert.match(metadata.usageProblem, /could not be updated/);
  assert.doesNotMatch(JSON.stringify(f.controller.snapshot()), /PRIVATE/);
  await f.controller.act(action(target)); assert.equal(reloads(f), 1);
});

test('missing usage retries after ten seconds, backs off, and stops once quota is cached', async t => {
  let now = Date.now(), reads = 0, succeed = false;
  const f = await fixture(t, { readAccountUsage: async () => {
    reads++;
    if (!succeed) return { checkedAt: now, plan: 'prolite', bankedResets: 0 };
    return { checkedAt: now, primary: { usedPercent: 1, windowDurationMins: 10080 } };
  } }, { clock: { now: () => now } });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  await f.controller.refreshUsage(); assert.equal(reads, 1);
  now += 9999; await f.controller.act({ action: 'retryUsage' }); assert.equal(reads, 1);
  now++; await f.controller.act({ action: 'retryUsage' }); assert.equal(reads, 2);
  now += 19999; await f.controller.act({ action: 'retryUsage' }); assert.equal(reads, 2);
  now++; await f.controller.act({ action: 'retryUsage' }); assert.equal(reads, 3);
  now += 39999; await f.controller.act({ action: 'retryUsage' }); assert.equal(reads, 3);
  succeed = true; now++; await f.controller.act({ action: 'retryUsage' }); assert.equal(reads, 4);
  now += 600000; await f.controller.act({ action: 'retryUsage' }); assert.equal(reads, 4);
  await f.controller.refreshUsage(); assert.equal(reads, 5);
});

test('plan metadata survives missing quota without replacing the last quota snapshot', async t => {
  const f = await fixture(t, { readAccountUsage: async () => ({ checkedAt: Date.now(), plan: 'prolite' }) });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first', 'synthetic', 'prolite'));
  await f.controller.enable();
  const account = f.controller.store.list()[0];
  f.controller.store.saveUsage(account.id, account.generation, { checkedAt: 1000, plan: 'plus',
    primary: { usedPercent: 25, windowDurationMins: 300 } });
  await f.controller.refreshUsage();
  const metadata = f.controller.snapshot().accounts[0];
  assert.equal(metadata.plan, 'prolite');
  assert.equal(metadata.usage.plan, 'prolite');
  assert.equal(metadata.usage.checkedAt, 1000);
  assert.equal(metadata.usage.primary.usedPercent, 25);
  assert.equal(f.controller.store.usage(account.id).plan, 'plus');
});

test('switching cancels an in-flight usage read before acquiring its mutation lease', async t => {
  const started = gate(); let aborted = false;
  const f = await fixture(t, { readAccountUsage: async (_binary, _directory, _raw, signal) => {
    started.open(); await new Promise((resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(Error('cancelled')); }, { once: true }));
  } });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first')); await f.controller.enable();
  const target = await f.controller.store.capture(auth('second'), true);
  const reading = f.controller.refreshUsage(); await started.promise;
  await f.controller.act(action(target)); await reading;
  assert.equal(aborted, true); assert.equal(reloads(f), 1);
  assert.equal(f.controller.snapshot().usageRefreshing, false);
});

test('disabled automation avoids auth reads and snapshots expose metadata only', async t => {
  const f = await fixture(t);
  await f.controller.refresh(true);
  assert.equal(f.calls.read, 0);
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const saved = f.controller.store.list()[0];
  await f.controller.refresh(true);
  assert.equal(f.controller.store.list()[0].generation, saved.generation);
  const state = f.controller.snapshot();
  assert.equal(state.accounts[0].selected, true);
  assert.equal(state.accounts[0].email, 'first@example.invalid');
  assert.equal(JSON.stringify(state).includes('synthetic'), false);
  await f.controller.disable();
  const reads = f.calls.read;
  await f.controller.refresh(true);
  assert.equal(f.calls.read, reads);
});

test('switch publishes selected credentials and restart reconciles without confirmation', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const target = await f.controller.store.capture(auth('second'), true);
  await f.controller.act(action(target));
  assert.equal(await runtime.readAccountFile(f.home), auth('second'));
  assert.equal(reloads(f), 1);
  assert.equal(f.controller.store.state().pending.accountId, target.id);
  assert.equal(f.controller.snapshot().accounts.find(row => row.id === target.id).selected, true);
  assert.ok([...f.values.values()].includes(auth('first')));
  f.controller.dispose();
  await f.controller.refreshing;
  await new Promise(resolve => setTimeout(resolve, 50));
  const restarted = new f.Accounts(f.context, {
    home: f.home, binary: 'synthetic', canUse: () => true, beforeReload() {},
  });
  try {
    await restarted.refresh();
    await restarted.refresh(true);
    assert.equal(restarted.store.state().pending, undefined);
    assert.equal(restarted.snapshot().accounts.find(row => row.id === target.id).selected, true);
    assert.equal([...f.values.keys()].some(key => key.includes('accountRollback')), false);
  } finally {
    restarted.dispose();
    await restarted.refreshing;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
});

test('shared-home warning is shown once but known active work is warned each time', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const first = f.controller.store.list()[0];
  const second = await f.controller.store.capture(auth('second'), true);
  await f.controller.act(action(second));
  assert.match(f.messages[0], /shared with other Codex windows/);
  assert.equal(f.globals.get('accounts.reloadNotice.v1'), true);
  await f.controller.act(action(first));
  assert.equal(f.messages.length, 1);
  f.active(true);
  await f.controller.act(action(second));
  assert.match(f.messages[1], /active work/);
  assert.equal(reloads(f), 3);
});

test('cancelled warning and lost access preserve the live sign-in', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const target = await f.controller.store.capture(auth('second'), true);
  f.answer(undefined);
  await f.controller.act(action(target));
  assert.equal(await runtime.readAccountFile(f.home), auth('first'));
  assert.equal(reloads(f), 0);
  f.access(false);
  await f.controller.act(action(target));
  assert.match(f.controller.snapshot().problem, /Enable account switching/);
  assert.equal(f.controller.store.state().pending, undefined);
});

test('failed publication clears recovery state and reports a safe problem', async t => {
  const f = await fixture(t, { replaceAccountFile: async () => { throw Error('PRIVATE locked target'); } });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const target = await f.controller.store.capture(auth('second'), true);
  await f.controller.act(action(target));
  assert.equal(await runtime.readAccountFile(f.home), auth('first'));
  assert.equal(f.controller.store.state().pending, undefined);
  assert.equal(reloads(f), 0);
  assert.match(f.controller.snapshot().problem, /could not complete/);
  assert.doesNotMatch(f.controller.snapshot().problem, /PRIVATE/);
});

test('stale account generation and outgoing vault failure cannot publish', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const stale = await f.controller.store.capture(auth('second'), true);
  await f.controller.store.capture(auth('second', 'rotated'), true);
  await f.controller.act(action(stale));
  assert.match(f.controller.snapshot().problem, /changed/);
  assert.equal(reloads(f), 0);
  const target = f.controller.store.list().find(row => row.id === stale.id);
  f.secrets.store = async () => { throw Error('PRIVATE vault unavailable'); };
  await f.controller.act(action(target));
  assert.equal(await runtime.readAccountFile(f.home), auth('first'));
  assert.equal(f.controller.store.state().pending, undefined);
  assert.match(f.controller.snapshot().problem, /could not complete/);
  assert.doesNotMatch(f.controller.snapshot().problem, /PRIVATE/);
});

test('reauthentication resumes the requested switch once without redundant preflight', async t => {
  const fresh = auth('second', 'fresh');
  let checks = 0, logins = 0;
  const f = await fixture(t, {
    prepareAccountCredentials: async () => { checks++; throw new AccountError('Expired sign-in.', 'reauthenticate'); },
    isolatedAccountLogin: async () => { logins++; return fresh; },
  });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const target = await f.controller.store.capture(auth('second'), true);
  f.answer(message => message.includes('needs reconnecting') ? 'Sign In Again' : 'Switch Account and Reload');
  await f.controller.act(action(target));
  assert.equal(await runtime.readAccountFile(f.home), fresh);
  assert.equal(await f.controller.store.load(target.id), fresh);
  assert.equal(checks, 1);
  assert.equal(logins, 1);
  assert.equal(reloads(f), 1);
});

test('wrong account and cancelled reconnect preserve the active credentials', async t => {
  const f = await fixture(t, {
    prepareAccountCredentials: async () => { throw new AccountError('Expired sign-in.', 'reauthenticate'); },
    isolatedAccountLogin: async () => auth('wrong'),
  });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const target = await f.controller.store.capture(auth('second'), true);
  f.answer(message => message.includes('needs reconnecting') ? 'Sign In Again' : 'Switch Account and Reload');
  await f.controller.act(action(target));
  assert.match(f.controller.snapshot().problem, /different account/);
  assert.equal(await runtime.readAccountFile(f.home), auth('first'));
  assert.equal(reloads(f), 0);
  f.answer(message => message.includes('needs reconnecting') ? undefined : 'Switch Account and Reload');
  await f.controller.act(action(target));
  assert.match(f.controller.snapshot().problem, /needs a new sign-in/);
  assert.equal(await runtime.readAccountFile(f.home), auth('first'));
  assert.equal(reloads(f), 0);
});

test('cancelling an in-progress browser login leaves the active sign-in alone', async t => {
  let started;
  const loginStarted = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, { isolatedAccountLogin: async (_binary, _directory, _open, signal) => {
    started();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new AccountError('Sign-in cancelled.')), { once: true }));
  } });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const adding = f.controller.act({ action: 'add' });
  await loginStarted;
  await f.controller.act({ action: 'cancelLogin' });
  await adding;
  assert.equal(await runtime.readAccountFile(f.home), auth('first'));
  assert.equal(f.controller.store.list().length, 1);
  assert.equal(reloads(f), 0);
});

test('failed secure save during reconnect never publishes browser credentials', async t => {
  const f = await fixture(t, {
    prepareAccountCredentials: async () => { throw new AccountError('Expired sign-in.', 'reauthenticate'); },
    isolatedAccountLogin: async () => auth('second', 'fresh'),
  });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const target = await f.controller.store.capture(auth('second'), true);
  f.secrets.store = async () => { throw Error('PRIVATE vault failure'); };
  f.answer(message => message.includes('needs reconnecting') ? 'Sign In Again' : 'Switch Account and Reload');
  await f.controller.act(action(target));
  assert.equal(await runtime.readAccountFile(f.home), auth('first'));
  assert.equal(await f.controller.store.load(target.id), auth('second'));
  assert.equal(reloads(f), 0);
  assert.match(f.controller.snapshot().problem, /securely/);
  assert.doesNotMatch(f.controller.snapshot().problem, /PRIVATE/);
});

test('live sign-in drift during browser login keeps the active credentials', async t => {
  const f = await fixture(t, {
    isolatedAccountLogin: async () => {
      fs.writeFileSync(path.join(f.home, 'auth.json'), auth('external'));
      return auth('new');
    },
  });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  await f.controller.act({ action: 'add' });
  assert.equal(await runtime.readAccountFile(f.home), auth('external'));
  assert.match(f.controller.snapshot().problem, /changed during browser login/);
  assert.equal(reloads(f), 0);
});

test('outgoing token rotation during preflight is remembered before publication', async t => {
  let f;
  f = await fixture(t, { prepareAccountCredentials: async (_binary, _directory, raw) => {
    fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first', 'rotated'));
    return raw;
  } });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const first = f.controller.store.list()[0];
  const target = await f.controller.store.capture(auth('second'), true);
  await f.controller.act(action(target));
  assert.equal(await runtime.readAccountFile(f.home), auth('second'));
  assert.equal(await f.controller.store.load(first.id), auth('first', 'rotated'));
});

test('selected account does not force token refresh or reload', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const first = f.controller.store.list()[0];
  await f.controller.act(action(first));
  assert.equal(f.calls.preflight, 0);
  assert.equal(reloads(f), 0);
  assert.equal(f.messages.length, 0);
});

test('unknown, untrusted and forgotten actions cannot switch credentials', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const target = await f.controller.store.capture(auth('second'), true);
  await f.controller.act({ action: 'unsupported', id: target.id, generation: target.generation });
  assert.equal(reloads(f), 0);
  f.vscode.workspace.isTrusted = false;
  await f.controller.act(action(target));
  assert.match(f.controller.snapshot().problem, /trusted local workspace/);
  f.vscode.workspace.isTrusted = true;
  f.answer('Forget');
  await f.controller.act(action(target, 'forget'));
  assert.equal(f.controller.store.list().some(row => row.id === target.id), false);
  await f.controller.refresh(true);
  await f.controller.act(action(target));
  assert.match(f.controller.snapshot().problem, /changed/);
  assert.equal(await runtime.readAccountFile(f.home), auth('first'));
  assert.equal(reloads(f), 0);
});

test('reload failure offers error-only restoration and rejects unrelated live drift', async t => {
  const f = await fixture(t, {}, { reloadFails: true });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const target = await f.controller.store.capture(auth('second'), true);
  await f.controller.act(action(target));
  assert.equal(await runtime.readAccountFile(f.home), auth('second'));
  assert.equal(f.controller.snapshot().recovery, true);
  assert.match(f.controller.snapshot().problem, /could not reload/);
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('external'));
  await f.controller.act({ action: 'restore' });
  assert.match(f.controller.snapshot().problem, /Credentials changed/);
  assert.equal(await runtime.readAccountFile(f.home), auth('external'));
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('second'));
  f.reloadFailure(false);
  await f.controller.act({ action: 'restore' });
  assert.equal(await runtime.readAccountFile(f.home), auth('first'));
  assert.equal(reloads(f), 2);
});

test('direct disable and forget-all cannot interrupt preflight or publication', async t => {
  const preflight = gate(), enteredPreflight = gate(), publication = gate(), enteredPublication = gate();
  const f = await fixture(t, {
    prepareAccountCredentials: async (_binary, _directory, raw) => { enteredPreflight.open(); await preflight.promise; return raw; },
    replaceAccountFile: async (...args) => { enteredPublication.open(); await publication.promise; return runtime.replaceAccountFile(...args); },
  });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const target = await f.controller.store.capture(auth('second'), true);
  const peer = new AccountStore(f.context.globalStorageUri.fsPath, f.home, f.secrets);
  f.answer(message => message.startsWith('Forget all') ? 'Forget Saved Accounts' : 'Switch Account and Reload');
  const switching = f.controller.act(action(target));
  try {
    await enteredPreflight.promise;
    assert.equal(peer.acquireLease('peer-window', Date.now(), 30000), false);
    await assert.rejects(f.controller.disable(), /finish/);
    await assert.rejects(f.controller.forgetAll(), /finish/);
    assert.equal(f.controller.store.enabled, true);
    preflight.open();
    await enteredPublication.promise;
    assert.equal(peer.acquireLease('peer-window', Date.now(), 30000), false);
    await assert.rejects(f.controller.disable(), /finish/);
    await assert.rejects(f.controller.forgetAll(), /finish/);
    assert.equal(await runtime.readAccountFile(f.home), auth('first'));
  } finally { preflight.open(); publication.open(); await switching; peer.dispose(); }
  assert.equal(await runtime.readAccountFile(f.home), auth('second'));
  assert.equal(f.controller.store.enabled, true);
});

test('another window lease blocks direct disable and forget-all mutations', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const peer = new AccountStore(f.context.globalStorageUri.fsPath, f.home, f.secrets);
  assert.equal(peer.acquireLease('peer-window', Date.now(), 30000), true);
  f.answer('Forget Saved Accounts');
  try {
    await assert.rejects(f.controller.disable(), /Another account operation/);
    await assert.rejects(f.controller.forgetAll(), /Another account operation/);
    assert.equal(f.controller.store.enabled, true);
    assert.equal(f.controller.store.list().length, 1);
  } finally { peer.releaseLease('peer-window'); peer.dispose(); }
});

for (const scenario of ['missing', 'mismatched']) {
  test('restart with ' + scenario + ' auth retains pending switch and rollback credentials', async t => {
    const f = await fixture(t);
    fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
    await f.controller.enable();
    const target = await f.controller.store.capture(auth('second'), true);
    await f.controller.act(action(target));
    const pending = f.controller.store.state().pending;
    assert.equal(pending.accountId, target.id);
    await f.controller.dispose();
    if (scenario === 'missing') fs.unlinkSync(path.join(f.home, 'auth.json'));
    else fs.writeFileSync(path.join(f.home, 'auth.json'), auth('external'));
    const restarted = new f.Accounts(f.context, {
      home: f.home, binary: 'synthetic', canUse: () => true, beforeReload() {},
    });
    try {
      await restarted.refresh();
      await restarted.refresh(true);
      assert.deepEqual(restarted.store.state().pending, pending);
      assert.equal([...f.values.values()].includes(auth('first')), true);
      assert.equal(restarted.snapshot().recovery, true);
      assert.match(restarted.snapshot().problem, /changed outside Navigator/);
      assert.equal(await runtime.readAccountFile(f.home), scenario === 'missing' ? undefined : auth('external'));
    } finally { await restarted.dispose(); }
  });
}

test('rename and setup leave reload-failure recovery available', async t => {
  const f = await fixture(t, {}, { reloadFails: true });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const target = await f.controller.store.capture(auth('second'), true);
  await f.controller.act(action(target));
  assert.equal(f.controller.snapshot().recovery, true);
  await f.controller.act({ ...action(target, 'rename'), label: 'Work' });
  assert.equal(f.controller.snapshot().accounts.find(row => row.id === target.id).name, 'Work');
  assert.equal(f.controller.snapshot().recovery, true);
  assert.match(f.controller.snapshot().problem, /could not reload/);
  await f.controller.act({ action: 'setup' });
  assert.equal(f.controller.snapshot().recovery, true);
  assert.match(f.controller.snapshot().problem, /could not reload/);
  assert.equal(await runtime.readAccountFile(f.home), auth('second'));
});

test('forget confirmation cannot remove credentials updated while the modal was open', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const stale = await f.controller.store.capture(auth('second'), true);
  f.answer(async message => {
    if (message.startsWith('Forget this saved')) {
      await f.controller.store.capture(auth('second', 'new-generation'), true);
      return 'Forget';
    }
    return 'Switch Account and Reload';
  });
  await f.controller.act(action(stale, 'forget'));
  assert.equal(await f.controller.store.load(stale.id), auth('second', 'new-generation'));
  assert.match(f.controller.snapshot().problem, /changed while the confirmation was open/);
  assert.equal(await runtime.readAccountFile(f.home), auth('first'));
});

test('successful capture clears a prior transient secure-storage problem', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first', 'rotated'));
  const store = f.secrets.store;
  f.secrets.store = async () => { throw Error('PRIVATE transient failure'); };
  await f.controller.refresh(true);
  assert.match(f.controller.snapshot().problem, /could not be remembered/);
  assert.doesNotMatch(f.controller.snapshot().problem, /PRIVATE/);
  f.secrets.store = store;
  await f.controller.refresh(true);
  assert.equal(f.controller.snapshot().problem, undefined);
  assert.equal(await f.controller.store.load(f.controller.store.list()[0].id), auth('first', 'rotated'));
});

test('clipboard failure during reconnect becomes a safe menu problem', async t => {
  const started = gate();
  const f = await fixture(t, { isolatedAccountLogin: async (_binary, _directory, _open, signal) => {
    started.open();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new AccountError('Sign-in cancelled.')), { once: true }));
  } });
  fs.writeFileSync(path.join(f.home, 'auth.json'), auth('first'));
  await f.controller.enable();
  const target = await f.controller.store.capture(auth('second'), true);
  f.vscode.env.clipboard.writeText = async () => { throw Error('PRIVATE clipboard diagnostic'); };
  const reconnecting = f.controller.act(action(target, 'reconnect'));
  try {
    await started.promise;
    assert.equal(f.controller.snapshot().loginEmail, 'second@example.invalid');
    await f.controller.act({ action: 'copyEmail' });
    assert.match(f.controller.snapshot().problem, /could not be copied/);
    assert.doesNotMatch(f.controller.snapshot().problem, /PRIVATE/);
  } finally { await f.controller.act({ action: 'cancelLogin' }); await reconnecting; }
  assert.equal(await runtime.readAccountFile(f.home), auth('first'));
});
