'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');

function fixture(overrides = {}, configured = true) {
  let now = 100000, secretChanged, reads = 0;
  let state = { state: 'notStarted', allowed: false, message: 'Start a trial.', canStartTrial: true, canActivate: true };
  const commands = [], timers = new Map(), inputs = [];
  class EventEmitter {
    listeners = new Set();
    event = callback => { this.listeners.add(callback); return { dispose: () => this.listeners.delete(callback) }; };
    fire() { for (const listener of this.listeners) listener(); }
    dispose() { this.listeners.clear(); }
  }
  const api = { EventEmitter, commands: { executeCommand: async name => commands.push(name) },
    window: { showInputBox: async options => { inputs.push(options); return 'synthetic-customer-key'; } } };
  const manager = { status: async () => { reads++; return state; }, ...overrides };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/license-access'), 'utf8'), {
    exports, require: name => name === 'vscode' ? api : {}, Date: { now: () => now },
    setTimeout: (callback, delay) => { const id = {}; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const access = new exports.LicenseAccess({ globalStorageUri: { fsPath: 'fixture' },
    secrets: { onDidChange: callback => { secretChanged = callback; return { dispose() { secretChanged = undefined; } }; } } },
  () => ({ manager, secretKey: 'license.fixture', product: { environment: 'sandbox', configured } }));
  return { access, manager, timers, commands, inputs, reads: () => reads,
    state: value => { state = value; }, now: value => { now = value; },
    secret: key => secretChanged?.({ key }) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('access expires at the deadline even before the scheduled refresh runs', async t => {
  const f = fixture(); t.after(() => f.access.dispose());
  await f.access.check(); assert.equal(f.access.snapshot().visible, true);
  f.state({ state: 'trial', allowed: true, message: 'Trial', endsAt: 100500 });
  await f.access.check(); assert.equal(f.access.allowed(), true);
  assert.equal([...f.timers.values()][0].delay, 501);
  f.now(100500); assert.equal(f.access.allowed(), false);
  assert.equal(f.access.snapshot().visible, true);
  assert.equal(await f.access.requireAccess(), false);
  assert.deepEqual(f.commands, ['codexNavigator.chats.focus']);
});

test('late online replies cannot reopen access after another window changes protected state', async t => {
  let complete, refreshes = 0;
  const f = fixture({ refresh: () => { refreshes++; return new Promise(resolve => { complete = resolve; }); } });
  t.after(() => f.access.dispose());
  const active = { state: 'active', allowed: true, message: 'Active', refreshDue: true };
  f.state(active); await f.access.check(); await f.access.check();
  assert.equal(refreshes, 1, 'one background request per controller');
  f.state({ state: 'rejected', allowed: false, message: 'Deactivated' });
  f.secret('unrelated'); await settle(); assert.equal(f.access.allowed(), true);
  f.secret('license.fixture'); await settle(); assert.equal(f.access.allowed(), false);
  complete(active); await settle(); assert.equal(f.access.allowed(), false);
  assert.equal(f.access.snapshot().state, 'rejected');
});

test('failed refresh does not loop immediately or extend offline access', async t => {
  let refreshes = 0;
  const f = fixture({ refresh: async () => { refreshes++; throw new Error('offline'); } });
  t.after(() => f.access.dispose());
  f.state({ state: 'offline', allowed: true, message: 'Offline', endsAt: 101000, refreshDue: true });
  await f.access.check(); await settle();
  assert.equal(refreshes, 1); assert.equal(f.access.allowed(), true);
  f.now(101000); assert.equal(f.access.allowed(), false);
  assert.equal(f.access.snapshot().endsAt, 101000);
});

test('key input stays native and unexpected errors are redacted from the webview', async t => {
  let received;
  const f = fixture({ activate: async key => { received = key; throw new Error('failed: ' + key); } });
  t.after(() => f.access.dispose());
  await f.access.action('activate');
  assert.equal(received, 'synthetic-customer-key'); assert.equal(f.inputs[0].password, true);
  assert.ok(f.inputs[0].validateInput('x'.repeat(513)));
  assert.ok(!JSON.stringify(f.access.snapshot()).includes(received));
  assert.match(f.access.snapshot().notice, /Check its status/);
  await f.access.action('setup'); assert.deepEqual(f.commands, ['codexNavigator.setUp']);
});

test('disposal drops late replies and disables timers and protected-state events', async () => {
  let complete, changed = 0;
  const f = fixture({ refresh: () => new Promise(resolve => { complete = resolve; }) });
  f.access.onDidChange(() => changed++);
  f.state({ state: 'active', allowed: true, message: 'Active', refreshDue: true });
  await f.access.check(); const reads = f.reads();
  f.access.dispose(); complete({ state: 'active', allowed: true, message: 'Active' });
  f.secret('license.fixture'); await settle();
  assert.equal(f.timers.size, 0); assert.equal(f.reads(), reads); assert.equal(changed, 1);
});
