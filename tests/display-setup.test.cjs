'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const supportedVersion = require('../tools/patch-codex.cjs').supported.version;

function fixture(options = {}) {
  const calls = [], messages = [], commands = [];
  const choices = [...(options.choices ?? [])];
  const settings = { showTabPrefix: true };
  let extensionsChanged;
  const bar = { show() { this.visible = true; }, hide() { this.visible = false; }, dispose() {} };
  let extension = options.missing ? undefined : { extensionPath: 'C:/fixture/codex', extensionUri: { scheme: 'file' }, packageJSON: { version: options.version ?? supportedVersion } };
  const api = {
    env: { remoteName: options.remote }, workspace: { isTrusted: true, getConfiguration: () => ({ get: key => settings[key], update: async (key, value) => { settings[key] = value; } }) },
    ConfigurationTarget: { Workspace: 2 },
    extensions: { getExtension: () => extension, onDidChange: fn => { extensionsChanged = fn; return { dispose() {} }; } },
    StatusBarAlignment: { Right: 2 },
    EventEmitter: class { listeners = []; event = fn => { this.listeners.push(fn); return { dispose() {} }; }; fire() { this.listeners.forEach(fn => fn()); } },
    ProgressLocation: { Window: 1, Notification: 2 },
    window: { createStatusBarItem: () => bar,
      withProgress: async (_options, action) => action(),
      showQuickPick: async items => items.find(item => item.value === options.pick),
      showInformationMessage: async (...args) => { messages.push(args); if (args[1]?.modal) { options.onReview?.(() => { extension = undefined; }); } return choices.shift(); },
    },
    commands: { executeCommand: async command => commands.push(command) },
  };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/display-setup.js'), 'utf8'), {
    exports, process,
    require: name => name === 'vscode' ? api : name === 'node:child_process' ? {
      execFile: (executable, args, settings, callback) => {
        calls.push({ executable, args, settings });
        const mode = args[1];
        if (options.failure) { callback(new Error('failed'), '', 'Unsupported Codex version; nothing was changed.'); }
        else { callback(null, JSON.stringify({ status: mode === 'check' ? options.status ?? 'compatible' : mode === 'apply' ? 'patched' : 'restored' }), ''); }
      },
    } : name === '../tools/patch-codex.cjs' ? require('../tools/patch-codex.cjs') : require(name),
  });
  const stored = { chatLabelsEnabled: options.enabled ?? false };
  const context = { extensionPath: 'C:/fixture/companion', subscriptions: [], globalState: { update: async (key, value) => { stored[key] = value; }, get: (key, fallback) => stored[key] ?? fallback } };
  return { calls, messages, commands, settings, bar,
    change: version => { extension = { ...extension, packageJSON: { version }, extensionPath: 'C:/fixture/codex-' + version }; extensionsChanged?.(); },
    monitor: () => exports.monitorChatLabels(context), dispose: () => context.subscriptions.forEach(item => item.dispose()), status: () => exports.chatLabelsStatus(context), run: restore => exports.configureChatLabels(context, restore) };
}

test('label setup cancellation only checks Codex and never patches or reloads', async () => {
  const f = fixture(); await f.run();
  assert.deepEqual(f.calls.map(call => call.args[1]), ['check']);
  assert.deepEqual(f.commands, []);
  assert.equal(f.messages[0][1].modal, true);
});

test('label setup uses bundled installer and Electron Node after review, then offers reload', async () => {
  const f = fixture({ choices: ['Enable Chat Labels', 'Reload Window'] }); await f.run();
  assert.deepEqual(f.calls.map(call => call.args[1]), ['check', 'apply']);
  assert.equal(f.calls[1].settings.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(f.calls[1].settings.windowsHide, true);
  assert.ok(f.calls[1].args[0].endsWith(path.join('tools', 'patch-codex.cjs')));
  assert.deepEqual(f.commands, ['workbench.action.reloadWindow']);
  assert.equal((await f.status()).label, 'Reload needed');
});

test('restore requires explicit review and never enables routing', async () => {
  const f = fixture({ status: 'patched', choices: ['Restore Codex'] }); await f.run(true);
  assert.deepEqual(f.calls.map(call => call.args[1]), ['check', 'restore']);
  assert.ok(f.messages[0][1].detail.includes('project instructions are kept'));
  assert.deepEqual(f.commands, []);
});

test('missing or unsupported Codex leaves both features unchanged', async () => {
  for (const options of [{ missing: true }, { failure: true }]) {
    const f = fixture(options); await f.run();
    assert.ok(f.calls.every(call => call.args[1] === 'check'));
    assert.equal(f.messages.length, 1);
    assert.deepEqual(f.commands, []);
  }
});

test('Codex changing during review stops installation; remote setup is refused', async () => {
  const f = fixture({ choices: ['Enable Chat Labels'], onReview: remove => remove() });
  await assert.rejects(f.run(), /changed during setup/);
  assert.deepEqual(f.calls.map(call => call.args[1]), ['check']);
  const remote = fixture({ remote: 'ssh-remote' });
  await assert.rejects(remote.run(), /trusted local/);
  assert.equal(remote.calls.length, 0);
});


test('enabled chat integration offers visibility without reinstalling or restoring', async () => {
  const f = fixture({ status: 'patched', pick: 'visibility' }); await f.run();
  assert.equal(f.settings.showTabPrefix, false);
  assert.deepEqual(f.calls.map(call => call.args[1]), ['check']);
  assert.equal(f.messages.length, 0);
});

test('back from enabled chat settings leaves the installation unchanged', async () => {
  const f = fixture({ status: 'patched', pick: 'back' }); await f.run();
  assert.deepEqual(f.calls.map(call => call.args[1]), ['check']);
  assert.equal(f.messages.length, 0);
});


test('unsupported Codex has a clear update action without running the patcher', async () => {
  const f = fixture({ version: '99.0.0' }); const state = await f.status();
  assert.equal(state.label, 'Waiting for support'); assert.equal(state.extensions, true);
  assert.match(state.detail, /99.0.0/); assert.match(state.detail, /Project instructions/);
  assert.equal(f.calls.length, 0); assert.equal(state.root, undefined);
});

const settle = () => new Promise(resolve => setImmediate(resolve));
test('startup and extension changes expose compatibility without patching or repeated checks', async () => {
  const f = fixture({ status: 'patched' }); f.monitor(); await settle();
  assert.equal(f.bar.visible, false);
  f.change('99.0.0'); await settle();
  assert.equal(f.bar.visible, true); assert.match(f.bar.tooltip, /99.0.0/);
  assert.equal(f.bar.command, 'codexRepoCompanion.setUp');
  f.change(supportedVersion); await settle();
  assert.equal(f.bar.visible, false);
  const count = f.calls.length; f.change(supportedVersion); await settle();
  assert.equal(f.calls.length, count);
  assert.ok(f.calls.every(call => call.args[1] === 'check'));
  f.dispose(); f.change('99.0.0'); await settle(); assert.equal(f.bar.visible, false);
});

test('a previously enabled integration losing its patch asks for setup after restart', async () => {
  const f = fixture({ enabled: true }); f.monitor(); await settle();
  assert.equal(f.bar.visible, true); assert.match(f.bar.tooltip, /enable chat labels again/);
  f.dispose();
});

test('reload status does not follow an old installation into a newer Codex version', async () => {
  const f = fixture({ choices: ['Enable Chat Labels'] }); await f.run();
  assert.equal((await f.status()).label, 'Reload needed');
  f.change('99.0.0'); assert.equal((await f.status()).label, 'Waiting for support');
});
