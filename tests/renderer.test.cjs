'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const hook = fs.readFileSync(require.resolve('../bridge/renderer-route-hook.txt'), 'utf8');

test('renderer hook reports initial route and focus with metadata only, and releases listeners', () => {
  const messages = []; const listeners = new Map(); let cleanup;
  const sandbox = {
    J9: { useEffect(callback, deps) { cleanup = callback(); assert.equal(deps.length, 2); } },
    vd: { dispatchMessage(type, value) { messages.push({ type, ...value }); } },
    r: '/local/abc', i: '?hostId=local&privateQuery=not-reported', URLSearchParams, CustomEvent: class { constructor(type) { this.type = type; } },
    document: { hasFocus: () => false, body: {}, documentElement: {},
      addEventListener(name, handler) { listeners.set(name, handler); }, removeEventListener(name) { listeners.delete(name); } },
    window: { addEventListener(name, handler) { listeners.set(name, handler); }, removeEventListener(name) { listeners.delete(name); }, dispatchEvent(event) { assert.equal(event.type, 'repo-companion-label-changed'); } },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../bridge/renderer-menu.txt'), 'utf8'), sandbox);
  vm.runInNewContext(hook, sandbox);
  assert.deepEqual(messages[0], { type: 'repo-companion-route', path: '/local/abc', hostId: 'local', focused: false });
  sandbox.document.hasFocus = () => true;
  assert.equal(listeners.has('focusin'), false, 'renderer never intercepts element focus');
  let restored = false;
  sandbox.document.activeElement = { isConnected: true, focus() { restored = true; } };
  listeners.get('focus')();
  sandbox.document.activeElement = sandbox.document.body;
  listeners.get('focus')();
  assert.equal(messages[1].focused, true);
  assert.equal(restored, false, 'focus reports never move focus away from navigation controls');
  const receive = listeners.get('message');
  receive({ data: { type: 'codex-message' }, stopImmediatePropagation() { assert.fail('ordinary Codex messages must pass through'); } });
  let consumed = false;
  receive({ data: { type: 'repo-companion-label', key: 'local/abc', label: 'Repo', assignments: { 'local/abc': 'Repo', 'remote/def': 'Private', invalid: 'Ignored' } }, stopImmediatePropagation() { consumed = true; } });
  assert.equal(consumed, true);
  assert.equal(sandbox.window.__codexRepoCompanionLabel.label, 'Repo');
  assert.equal(sandbox.window.__codexRepoCompanionAssignments['remote/def'], 'Private');
  assert.equal(sandbox.window.__codexRepoCompanionAssignments.invalid, undefined);
  cleanup(); assert.equal(listeners.size, 0);
});
