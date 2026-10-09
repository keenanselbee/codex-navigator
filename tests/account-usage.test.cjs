const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { parseAccountUsage, sanitizeAccountUsage, resetEligibility } = require('../dist/account-usage');

test('reset eligibility uses a strict threshold and only fresh core windows', () => {
  const now = 1800000000000;
  const window = (usedPercent, windowDurationMins = 300) => ({ usedPercent, windowDurationMins });
  const usage = (primary, secondary) => ({ checkedAt: now, primary, secondary });
  for (const used of [0, 89.9, 90]) assert.equal(resetEligibility(usage(window(used)), now), 'unavailable');
  for (const used of [90.01, 96, 100]) {
    assert.equal(resetEligibility(usage(window(used), window(0, 10080)), now), 'eligible');
    assert.equal(resetEligibility(usage(window(0), window(used, 10080)), now), 'eligible');
  }
  for (const missing of [undefined, usage(), usage(window(96, 15)), usage(window(NaN)), usage(window(101)),
    { ...usage(window(96)), checkedAt: now - 300000 }, { ...usage(window(96)), checkedAt: now + 1 },
    usage({ ...window(96), resetsAt: now / 1000 })]) assert.equal(resetEligibility(missing, now), 'unknown');
});

function authFixture(plan) {
  return JSON.stringify({ auth_mode: 'chatgpt', tokens: {
    account_id: 'workspace',
    id_token: 'header.' + Buffer.from(JSON.stringify({ sub: 'user',
      'https://api.openai.com/auth': { chatgpt_plan_type: plan } })).toString('base64url') + '.signature',
    access_token: 'synthetic-access', refresh_token: 'SECRET-REFRESH',
  } });
}

function usageFixture() {
  return { rateLimits: { limitId: 'codex_other', primary: { usedPercent: 99, windowDurationMins: 15 } },
    rateLimitsByLimitId: { codex: { limitId: 'codex', planType: 'plus',
      primary: { usedPercent: 25, windowDurationMins: 15, resetsAt: 1780000000, secret: 'do not copy' },
      secondary: null }, codex_other: { primary: { usedPercent: 99, windowDurationMins: 15 } } },
    rateLimitResetCredits: { availableCount: 2, credits: [{ id: 'private-credit' }] },
    secret: 'do not copy' };
}

function usageWithClient(Client) {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/account-usage'), 'utf8'), {
    exports, process, Buffer, Date, setTimeout, clearTimeout,
    require: name => name === './account-runtime' ? { AccountClient: Client }
      : name.startsWith('./') ? require('../dist/' + name.slice(2)) : require(name),
  });
  return exports;
}

test('banked expiry uses the earliest valid available credit and survives the cache whitelist', () => {
  const credits = [
    { status: 'available', expiresAt: 5000, id: 'private' },
    { status: 'redeemed', expiresAt: 2000 },
    { status: 'redeeming', expiresAt: 2100 },
    { status: 'unknown', expiresAt: 2200 },
    { status: 'available', expiresAt: null },
    { status: 'available', expiresAt: 1 },
    { status: 'available', expiresAt: '2500' },
    { status: 'available', expiresAt: Infinity },
    { status: 'available', expiresAt: 32503680001 },
    { status: 'available', expiresAt: 3000 },
  ];
  const parsed = parseAccountUsage({ rateLimitResetCredits: { availableCount: 20, credits } }, 1000);
  assert.deepEqual(parsed, { checkedAt: 1000, bankedResets: 20, bankedResetExpiresAt: 3000 });
  assert.deepEqual(sanitizeAccountUsage(JSON.parse(JSON.stringify(parsed))), parsed);
  for (const details of [null, [], [{ status: 'available', expiresAt: null }]])
    assert.deepEqual(parseAccountUsage({ rateLimitResetCredits: { availableCount: 2, credits: details } }, 1000),
      { checkedAt: 1000, bankedResets: 2 });
  for (const count of [0, undefined]) assert.equal(sanitizeAccountUsage({ checkedAt: 1000,
    plan: 'plus', bankedResets: count, bankedResetExpiresAt: 3000 }).bankedResetExpiresAt, undefined);
});

test('banked expiry tooltip uses local dates, time within three days and an honest stale indication', () => {
  const source = fs.readFileSync(path.join(__dirname, '../media/account-menu.js'), 'utf8');
  const start = source.indexOf('  function bankedExpiry('), end = source.indexOf('\n  function tooltip(', start);
  assert.ok(start > 0 && end > start);
  const now = new Date(2026, 9, 9, 15, 0).getTime();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = { Date: Clock }; vm.createContext(context);
  vm.runInContext(source.slice(start, end) + '\nthis.format = bankedExpiry;', context);
  const usage = delta => ({ bankedResets: 2, bankedResetExpiresAt: (now + delta) / 1000 });
  const dateOptions = { month: 'short', day: 'numeric' }, day = 86400000;
  assert.equal(context.format(usage(4 * day)), ' · expiry: ' + new Date(now + 4 * day).toLocaleString(undefined, dateOptions));
  assert.equal(context.format(usage(3 * day)), ' · expiry: ' + new Date(now + 3 * day).toLocaleString(undefined,
    { ...dateOptions, hour: 'numeric', minute: '2-digit' }));
  assert.match(context.format(usage(-day)), /passed; refresh usage/);
  assert.equal(context.format({ bankedResets: 0, bankedResetExpiresAt: (now + day) / 1000 }), '');
  assert.equal(context.format({ bankedResets: 2 }), '');
  assert.match(context.format({ bankedResets: 2, bankedResetExpiresAt: new Date(2027, 0, 1).getTime() / 1000 }), /2027/);
});

test('quota parser selects only Codex metadata and strips unknown fields', () => {
  assert.deepEqual(parseAccountUsage(usageFixture(), 1000), {
    checkedAt: 1000, plan: 'plus',
    primary: { usedPercent: 25, windowDurationMins: 15, resetsAt: 1780000000 },
    bankedResets: 2,
  });
  assert.deepEqual(parseAccountUsage({ rateLimits: { limitId: 'codex',
    primary: { usedPercent: 0, windowDurationMins: 300 } } }, 1000), {
    checkedAt: 1000, primary: { usedPercent: 0, windowDurationMins: 300 },
  });
  assert.deepEqual(parseAccountUsage({ rateLimits: { limitId: null,
    primary: { usedPercent: 5, windowDurationMins: 15 } } }, 1000), {
    checkedAt: 1000, primary: { usedPercent: 5, windowDurationMins: 15 },
  });
  assert.deepEqual(parseAccountUsage({ rateLimitsByLimitId: { codex_other: {} },
    rateLimits: { limitId: 'codex', primary: { usedPercent: 7, windowDurationMins: 15 } } }, 1000), {
    checkedAt: 1000, primary: { usedPercent: 7, windowDurationMins: 15 },
  });
});

test('missing, null, unrelated, and malformed quota fields stay unavailable', () => {
  for (const raw of [null, {}, { rateLimits: null },
    { rateLimitsByLimitId: { codex_other: { primary: { usedPercent: 1, windowDurationMins: 15 } } } },
    { rateLimits: { limitId: 'codex_other', primary: { usedPercent: 1, windowDurationMins: 15 } } },
    { rateLimitsByLimitId: { codex_other: {} }, rateLimits: { limitId: null,
      primary: { usedPercent: 1, windowDurationMins: 15 } } },
    { rateLimits: { primary: { usedPercent: -1, windowDurationMins: 15 }, planType: 'SECRET.PAYLOAD' },
      rateLimitResetCredits: { availableCount: null } }]) {
    assert.throws(() => parseAccountUsage(raw, 1000), /unavailable/);
  }
  assert.deepEqual(parseAccountUsage({ rateLimits: { primary: { usedPercent: 10, windowDurationMins: 15,
    resetsAt: Infinity }, secondary: { usedPercent: NaN, windowDurationMins: 15 }, planType: 'UNSAFE PLAN!' },
    rateLimitResetCredits: { availableCount: -5 } }, 1000), {
    checkedAt: 1000, primary: { usedPercent: 10, windowDurationMins: 15 },
  });
  assert.equal(sanitizeAccountUsage({ checkedAt: Infinity, plan: 'plus' }), undefined);
  assert.equal(sanitizeAccountUsage({ checkedAt: Date.now() + 3600000, plan: 'plus' }), undefined);
  assert.deepEqual(sanitizeAccountUsage({ checkedAt: 1000, plan: 'plus', accessToken: 'secret',
    primary: { usedPercent: 25, windowDurationMins: 15, token: 'secret' } }), {
    checkedAt: 1000, plan: 'plus', primary: { usedPercent: 25, windowDurationMins: 15 },
  });
  assert.deepEqual(sanitizeAccountUsage({ checkedAt: 1000, plan: 'Future_Tier_5X' }),
    { checkedAt: 1000, plan: 'future_tier_5x' });
  for (const plan of ['__proto__', 'constructor', 'prototype', 'bad.plan', ' bad', 'a'.repeat(65)])
    assert.equal(sanitizeAccountUsage({ checkedAt: 1000, plan }), undefined);
});

test('usage check sends only access token and account ID in an isolated home', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-usage-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const live = path.join(root, 'live'); fs.mkdirSync(live);
  fs.writeFileSync(path.join(live, 'auth.json'), 'LIVE-AUTH-UNCHANGED');
  const calls = [];
  let helperHome;
  class Client {
    constructor(_binary, home) { helperHome = home; assert.notEqual(home, live); }
    async start() {
      assert.equal(fs.existsSync(path.join(helperHome, 'auth.json')), false);
      assert.match(fs.readFileSync(path.join(helperHome, 'config.toml'), 'utf8'), /cli_auth_credentials_store = "ephemeral"/);
    }
    async request(method, params) {
      calls.push({ method, params });
      return method === 'account/login/start' ? { type: 'chatgptAuthTokens' } : usageFixture();
    }
    async shutdown() { this.stopped = true; }
    dispose() { this.stopped = true; }
  }
  const result = await usageWithClient(Client).readAccountUsage('synthetic', root, authFixture());
  assert.equal(result.primary.usedPercent, 25);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { method: 'account/login/start', params: { type: 'chatgptAuthTokens', accessToken: 'synthetic-access', chatgptAccountId: 'workspace' } },
    { method: 'account/rateLimits/read', params: {} },
  ]);
  assert.equal(fs.readFileSync(path.join(live, 'auth.json'), 'utf8'), 'LIVE-AUTH-UNCHANGED');
  assert.deepEqual(fs.readdirSync(root), ['live']);
});

test('quota without plan does not present a JWT or account-read plan as fresh metadata', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-usage-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  class Client {
    async start() {}
    async request(method, params) {
      calls.push({ method, params });
      if (method === 'account/login/start') return { type: 'chatgptAuthTokens' };
      if (method === 'account/rateLimits/read') return { rateLimits: { limitId: 'codex',
        primary: { usedPercent: 9, windowDurationMins: 15 } } };
      return { account: { type: 'chatgpt', planType: 'pro', email: 'secret@example.com' } };
    }
    async shutdown() {}
    dispose() {}
  }
  const usage = await usageWithClient(Client).readAccountUsage('synthetic', root, authFixture());
  assert.equal(usage.plan, undefined);
  assert.equal(usage.primary.usedPercent, 9);
  assert.deepEqual(calls.map(call => call.method), ['account/login/start', 'account/rateLimits/read']);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('identity plan is sent to isolated login but unavailable quota remains unavailable', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-usage-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  class Client {
    async start() {}
    async request(method, params) {
      calls.push({ method, params });
      if (method === 'account/login/start') return { type: 'chatgptAuthTokens' };
      if (method === 'account/rateLimits/read') throw Error('synthetic quota unavailable');
      return { account: { type: 'chatgpt', planType: 'UNSAFE PLAN!', accessToken: 'SECRET' } };
    }
    async shutdown() {}
    dispose() {}
  }
  await assert.rejects(usageWithClient(Client).readAccountUsage('synthetic', root, authFixture('prolite')), /unavailable/);
  assert.equal(calls[0].params.chatgptPlanType, 'prolite');
  assert.deepEqual(calls.map(call => call.method), ['account/login/start', 'account/rateLimits/read']);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('unknown plan metadata is omitted from isolated login and does not escape quota failure', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-usage-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let login;
  class Client {
    async start() {}
    async request(method, params) {
      if (method === 'account/login/start') { login = params; return { type: 'chatgptAuthTokens' }; }
      return { account: { type: 'chatgpt', planType: 'SECRET-PLAN', token: 'SECRET' } };
    }
    async shutdown() {}
    dispose() {}
  }
  await assert.rejects(usageWithClient(Client).readAccountUsage('synthetic', root, authFixture('SECRET-PLAN')), /unavailable/);
  assert.equal(login.chatgptPlanType, undefined);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('usage home is removed only after the native helper has stopped', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-usage-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let home;
  class Client {
    constructor(_binary, isolatedHome) { home = isolatedHome; }
    async start() {}
    async request(method) { return method === 'account/login/start' ? { type: 'chatgptAuthTokens' } : usageFixture(); }
    async shutdown() {
      assert.equal(fs.existsSync(home), true);
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(fs.existsSync(home), true);
    }
    dispose() {}
  }
  await usageWithClient(Client).readAccountUsage('synthetic', root, authFixture());
  assert.deepEqual(fs.readdirSync(root), []);
});

test('unsupported login, invalid credentials, and abort clean the isolated home', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-usage-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  class UnsupportedClient {
    async start() {}
    async request() { return { type: 'chatgpt' }; }
    async shutdown() {}
    dispose() {}
  }
  const read = usageWithClient(UnsupportedClient).readAccountUsage;
  await assert.rejects(read('synthetic', root, authFixture()), /unavailable/);
  await assert.rejects(read('synthetic', root, '{"tokens":{"refresh_token":"SECRET"}}'), /unavailable/);
  assert.deepEqual(fs.readdirSync(root), []);
  class WrongAccountClient {
    async start() {}
    async request(method) { return method === 'account/login/start' ? { type: 'chatgptAuthTokens' }
      : { ...usageFixture(), accountId: 'another-workspace' }; }
    async shutdown() {}
    dispose() {}
  }
  await assert.rejects(usageWithClient(WrongAccountClient).readAccountUsage('synthetic', root, authFixture()), /unavailable/);
  assert.deepEqual(fs.readdirSync(root), []);
  const controller = new AbortController();
  class WaitingClient {
    async start() {}
    request(method) {
      if (method === 'account/login/start') return Promise.resolve({ type: 'chatgptAuthTokens' });
      controller.abort();
      return Promise.reject(Error('PRIVATE-DIAGNOSTIC'));
    }
    async shutdown() {}
    dispose() {}
  }
  await assert.rejects(usageWithClient(WaitingClient).readAccountUsage('synthetic', root, authFixture(), controller.signal), /cancelled/);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('native refresh requests fail promptly without returning credentials', async () => {
  const writes = [];
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/account-runtime'), 'utf8'), {
    exports, process, Buffer, URL, setTimeout, clearTimeout,
    require: name => name === '../package.json' ? { version: '0.0.0' }
      : name === 'node:child_process' ? { spawn() {
        const child = new EventEmitter();
        child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
        child.stderr = { resume() {} };
        child.kill = () => queueMicrotask(() => child.emit('close'));
        child.stdin = { write(line, callback) {
          const message = JSON.parse(line); writes.push(message);
          if (message.method === 'initialize') queueMicrotask(() => child.stdout.emit('data',
            JSON.stringify({ id: message.id, result: {} }) + '\n'));
          if (message.method === 'account/rateLimits/read') queueMicrotask(() => child.stdout.emit('data',
            JSON.stringify({ id: 44, method: 'account/chatgptAuthTokens/refresh', params: { previousAccountId: 'workspace' } }) + '\n'));
          callback?.();
        } };
        return child;
      } } : name.startsWith('./') ? require('../dist/' + name.slice(2)) : require(name),
  });
  const client = new exports.AccountClient('synthetic', '/isolated');
  await client.start();
  await assert.rejects(client.request('account/rateLimits/read', {}), /connection ended/);
  await client.shutdown();
  assert.deepEqual(writes.at(-1), { id: 44, error: { code: -32603, message: 'Token refresh is unavailable.' } });
  assert.doesNotMatch(JSON.stringify(writes), /SECRET-REFRESH|synthetic-access/);
});
