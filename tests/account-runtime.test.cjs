const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const runtime = require('../dist/account-runtime');
const { AccountError, accountErrorMessage } = require('../dist/account-errors');
function authFixture(refresh = 'old', id = 'fixture') {
  return JSON.stringify({ auth_mode: 'chatgpt', tokens: { account_id: 'workspace',
    id_token: 'header.' + Buffer.from(JSON.stringify({ sub: id })).toString('base64url') + '.signature',
    access_token: 'synthetic-access', refresh_token: refresh } });
}

function fixture(config = { cli_auth_credentials_store: 'file' }, requirements = null, files = fsp, login, check, onKill) {
  const calls = [], children = [];
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/account-runtime'), 'utf8'), {
    exports, process, Buffer, URL, setTimeout, clearTimeout,
    require: name => name === 'node:fs/promises' ? files : name === '../package.json' ? { version: '0.0.0' }
      : name === 'node:child_process' ? { spawn(_binary, _args, options) {
        const child = new EventEmitter(); children.push(child);
        child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
        child.stderr = { resume() {} }; child.kill = () => {
          child.killed = true;
          if (onKill) onKill(options.env.CODEX_HOME, child);
          else queueMicrotask(() => child.emit('close'));
        };
        child.stdin = { write(line, callback) {
          assert.ok(line.endsWith('\n'), 'JSON-RPC needs a real line terminator');
          const message = JSON.parse(line); calls.push(message.method);
          if (message.id) queueMicrotask(() => {
            const result = message.method === 'account/read' && check ? check(options.env.CODEX_HOME, child, message.params)
              : message.method === 'account/login/start' && login ? login(options.env.CODEX_HOME, child)
              : message.method === 'config/read' ? { config }
              : message.method === 'configRequirements/read' ? { requirements } : {};
            const framed = JSON.stringify(result.rpcError ? { id: message.id, error: result.rpcError } : { id: message.id, result }) + '\n';
            child.stdout.emit('data', framed.slice(0, 4)); child.stdout.emit('data', framed.slice(4));
          });
          callback?.();
        } }; return child;
      } } : name.startsWith('./') ? require('../dist/' + name.slice(2)) : require(name),
  });
  return { api: exports, calls, children };
}

test('account metadata RPC is framed and closes its private process', async () => {
  const f = fixture();
  assert.equal((await f.api.accountCapability('synthetic', '/fixture')).supported, true);
  assert.deepEqual(f.calls, ['initialize', 'initialized', 'config/read', 'configRequirements/read']);
  assert.equal(f.children[0].killed, true);
});

test('isolated login captures only its own result and removes temporary auth files', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-login-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let opened;
  const f = fixture(undefined, null, fsp, (home, child) => {
    assert.ok(fs.readFileSync(path.join(home, 'config.toml'), 'utf8').includes('\n[analytics]\n'));
    fs.writeFileSync(path.join(home, 'auth.json'), '{"synthetic":true}');
    // Completion can arrive before the request continuation assigns loginId.
    child.stdout.emit('data', JSON.stringify({ method: 'account/login/completed', params: { loginId: 'own-login', success: true } }) + '\n');
    return { loginId: 'own-login', authUrl: 'https://auth.openai.com/synthetic' };
  });
  const raw = await f.api.isolatedAccountLogin('synthetic', root, async url => { opened = url; }, new AbortController().signal);
  assert.equal(raw, '{"synthetic":true}'); assert.equal(opened, 'https://auth.openai.com/synthetic');
  assert.deepEqual(fs.readdirSync(root), []); assert.equal(f.children[0].killed, true);
});

test('isolated login waits for the helper to finish writing credentials before capture and cleanup', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-login-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const f = fixture(undefined, null, fsp, (home, child) => {
    fs.writeFileSync(path.join(home, 'auth.json'), '{"generation":"interim"}');
    child.stdout.emit('data', JSON.stringify({ method: 'account/login/completed', params: { loginId: 'own-login', success: true } }) + '\n');
    return { loginId: 'own-login', authUrl: 'https://auth.openai.com/synthetic' };
  }, undefined, (home, child) => {
    setTimeout(() => {
      fs.writeFileSync(path.join(home, 'auth.json'), '{"generation":"final"}');
      child.emit('close');
    }, 20);
  });
  const raw = await f.api.isolatedAccountLogin('synthetic', root, async () => {}, new AbortController().signal);
  assert.equal(raw, '{"generation":"final"}');
  assert.deepEqual(fs.readdirSync(root), []);
});

test('cancelled login and an unexpected login URL never open a browser or retain auth', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-login-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const f = fixture(undefined, null, fsp, () => ({ loginId: 'own-login', authUrl: 'https://example.invalid/login' }));
  let opens = 0;
  await assert.rejects(f.api.isolatedAccountLogin('synthetic', root, async () => { opens++; }, new AbortController().signal), /unsupported sign-in address/);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(f.api.isolatedAccountLogin('synthetic', root, async () => { opens++; }, cancelled.signal), /cancelled/);
  assert.equal(opens, 0); assert.deepEqual(fs.readdirSync(root), []);
});

test('unsupported backends and managed login restrictions fail closed', async () => {
  for (const backend of ['auto', 'keyring', 'ephemeral', undefined]) {
    assert.equal((await fixture({ cli_auth_credentials_store: backend }).api.accountCapability('x', '/x')).supported, false);
  }
  for (const policy of [{ allowedLoginMethods: [] }, { allowedLoginMethods: ['api'] }, { cliAuthCredentialsStore: 'keyring' }]) {
    assert.equal((await fixture(undefined, policy).api.accountCapability('x', '/x')).supported, false);
  }
  const managed = await fixture(undefined, { allowedLoginMethods: ['chatgpt'] }).api.accountCapability('x', '/x');
  assert.equal(managed.supported, true); assert.equal(managed.isolatedLogin, false);
});

test('replacement is bounded, checks drift, and publishes only a complete file', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-auth-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = path.join(home, 'auth.json');
  fs.writeFileSync(file, '{"old":true}');
  await assert.rejects(runtime.replaceAccountFile(home, '{"new":true}', 'wrong'), /changed elsewhere/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"old":true}');
  await runtime.replaceAccountFile(home, '{"new":true}', runtime.authFingerprint('{"old":true}'));
  assert.equal(await runtime.readAccountFile(home), '{"new":true}');
  assert.deepEqual(fs.readdirSync(home), ['auth.json']);
  await assert.rejects(runtime.replaceAccountFile(home, 'x'.repeat(runtime.authLimit + 1), undefined), /size/);
  fs.writeFileSync(file, 'x'.repeat(runtime.authLimit + 1));
  await assert.rejects(runtime.readAccountFile(home), /large/);
});

test('a locked Windows-style rename retains the previous file and removes staging', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-auth-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.writeFileSync(path.join(home, 'auth.json'), '{}');
  let attempts = 0;
  const { api } = fixture(undefined, null, { ...fsp, rename: async () => { attempts++; throw Object.assign(Error('private diagnostic'), { code: 'EPERM' }); } });
  await assert.rejects(api.replaceAccountFile(home, '{"next":1}', runtime.authFingerprint('{}')), /previous file was retained/);
  assert.equal(attempts, 4); assert.equal(await runtime.readAccountFile(home), '{}');
  assert.deepEqual(fs.readdirSync(home), ['auth.json']);
});

test('a writer changing auth during staging is never overwritten', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-auth-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const target = path.join(home, 'auth.json'); fs.writeFileSync(target, '{}');
  const { api } = fixture(undefined, null, { ...fsp, writeFile: async (...args) => {
    await fsp.writeFile(...args); await fsp.writeFile(target, '{"external":1}');
  } });
  await assert.rejects(api.replaceAccountFile(home, '{"next":1}', runtime.authFingerprint('{}')), /changed elsewhere/);
  assert.equal(await runtime.readAccountFile(home), '{"external":1}');
  assert.deepEqual(fs.readdirSync(home), ['auth.json']);
});

test('withdrawn permission during staging prevents publication', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-auth-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const target = path.join(home, 'auth.json'); fs.writeFileSync(target, '{}');
  let allowed = true;
  const { api } = fixture(undefined, null, { ...fsp, writeFile: async (...args) => {
    await fsp.writeFile(...args); allowed = false;
  } });
  await assert.rejects(api.replaceAccountFile(home, '{"next":1}', runtime.authFingerprint('{}'), () => {
    if (!allowed) throw Error('permission withdrawn');
  }), /permission withdrawn/);
  assert.equal(await runtime.readAccountFile(home), '{}');
  assert.deepEqual(fs.readdirSync(home), ['auth.json']);
});

test('preflight refreshes through Codex and preserves rotated credentials before cleanup', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-preflight-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const saved = [];
  const f = fixture(undefined, null, fsp, undefined, (home, _child, params) => {
    assert.equal(params.refreshToken, true);
    fs.writeFileSync(path.join(home, 'auth.json'), authFixture('new'));
    return { account: { type: 'chatgpt' } };
  });
  assert.equal(await f.api.prepareAccountCredentials('fixture', root, authFixture(), async raw => saved.push(raw)), authFixture('new'));
  assert.deepEqual(saved, [authFixture('new')]); assert.deepEqual(fs.readdirSync(root), []);
});

test('preflight rejects invalidated sign-ins without exposing native diagnostics', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-preflight-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const f = fixture(undefined, null, fsp, undefined, () => ({ rpcError: { message: '401 Unauthorized refresh_token_invalidated PRIVATE-CREDENTIAL' } }));
  await assert.rejects(f.api.prepareAccountCredentials('fixture', root, authFixture(), async () => assert.fail('no rotation')), error => {
    assert.equal(error.reason, 'reauthenticate'); assert.doesNotMatch(accountErrorMessage(error), /PRIVATE-CREDENTIAL/); return true;
  });
  assert.deepEqual(fs.readdirSync(root), []);
  assert.doesNotMatch(accountErrorMessage(new Error('PRIVATE-CREDENTIAL')), /PRIVATE-CREDENTIAL/);
  assert.match(accountErrorMessage(new AccountError('Sign in again.')), /Sign in again/);
});

test('preflight retains refreshed tokens even when a later native lookup fails', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-preflight-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const saved = [];
  const f = fixture(undefined, null, fsp, undefined, home => {
    fs.writeFileSync(path.join(home, 'auth.json'), authFixture('rotated'));
    return { rpcError: { message: 'workspace routing discovery failed: PRIVATE-DIAGNOSTIC' } };
  });
  await assert.rejects(f.api.prepareAccountCredentials('fixture', root, authFixture(), async raw => saved.push(raw)), /connection/);
  assert.deepEqual(saved, [authFixture('rotated')]); assert.deepEqual(fs.readdirSync(root), []);
});

test('preflight preserves a final rotation written during helper exit after a failed request', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-preflight-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const saved = [];
  const f = fixture(undefined, null, fsp, undefined, home => {
    fs.writeFileSync(path.join(home, 'auth.json'), authFixture('interim'));
    return { rpcError: { message: 'workspace lookup failed: PRIVATE-DIAGNOSTIC' } };
  }, (home, child) => {
    setTimeout(() => {
      fs.writeFileSync(path.join(home, 'auth.json'), authFixture('final'));
      child.emit('close');
    }, 20);
  });
  await assert.rejects(f.api.prepareAccountCredentials('fixture', root, authFixture(), async raw => saved.push(raw)), /connection/);
  assert.deepEqual(saved, [authFixture('final')]);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('preflight refuses identity changes and never saves the wrong account', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-preflight-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const f = fixture(undefined, null, fsp, undefined, home => {
    fs.writeFileSync(path.join(home, 'auth.json'), authFixture('new', 'different'));
    return { account: { type: 'chatgpt' } };
  });
  await assert.rejects(f.api.prepareAccountCredentials('fixture', root, authFixture(), async () => assert.fail('wrong identity')), /expected account/);
  assert.deepEqual(fs.readdirSync(root), []);
});
