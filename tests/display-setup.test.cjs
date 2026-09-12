'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const supportedVersion = require('../tools/patch-codex.cjs').supported.version;

function fixture(options = {}) {
  const calls = [], messages = [], commands = [], commandArgs = [];
  const choices = [...(options.choices ?? [])];
  const settings = { showTabPrefix: true, silentMode: options.silent ?? true };
  let patchStatus = options.status ?? 'compatible';
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
    window: { state: { focused: options.focused ?? true }, createStatusBarItem: () => bar,
      withProgress: async (_options, action) => action(),
      showQuickPick: async items => items.find(item => item.value === options.pick),
      showInformationMessage: async (...args) => { messages.push(args); if (args[1]?.modal) { options.onReview?.(() => { extension = undefined; }); } return options.notification ? options.notification() : choices.shift(); },
    },
    commands: { executeCommand: async (command, ...args) => { commands.push(command); commandArgs.push(args); } },
  };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/display-setup.js'), 'utf8'), {
    exports, process,
    require: name => name === 'vscode' ? api : name === 'node:child_process' ? {
      execFile: (executable, args, settings, callback) => {
        calls.push({ executable, args, settings });
        const mode = args[1];
        if (options.failure || options.applyFailure && mode === 'apply') { callback(new Error('failed'), '', 'Unsupported Codex version; nothing was changed.'); }
        else { if (mode !== 'check') patchStatus = mode === 'apply' ? 'patched' : 'compatible'; callback(null, JSON.stringify({ status: mode === 'restore' ? 'restored' : patchStatus }), ''); }
      },
    } : name === '../tools/patch-codex.cjs' ? require('../tools/patch-codex.cjs') : require(name),
  });
  const stored = options.stored ?? { chatLabelsEnabled: options.enabled ?? false };
  const context = { extensionPath: 'C:/fixture/companion', extension: { id: options.extensionId ?? 'keenanselbee.codex-repo-companion', packageJSON: { version: options.companionVersion ?? '1.1.0' } }, subscriptions: [], globalState: { update: async (key, value) => { stored[key] = value; }, get: (key, fallback) => stored[key] ?? fallback } };
  return { calls, messages, commands, commandArgs, settings, bar, stored,
    visible: value => exports.setChatSetupVisible(value),
    apply: mode => exports.applyChatLabels(context, mode, extension.extensionPath),
    updates: () => exports.checkForCompanionUpdates(context),
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
  assert.match(state.detail, /99.0.0/); assert.match(state.detail, /Project instruction routing/);
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

test('a previously enabled integration is reapplied after restart', async () => {
  const f = fixture({ enabled: true }); f.monitor(); await settle();
  assert.equal(f.bar.visible, true); assert.match(f.bar.text, /Reload/);
  assert.equal(f.calls.filter(call => call.args[1] === 'apply').length, 1);
  f.dispose();
});

test('reload status does not follow an old installation into a newer Codex version', async () => {
  const f = fixture({ choices: ['Enable Chat Labels'] }); await f.run();
  assert.equal((await f.status()).label, 'Reload needed');
  f.change('99.0.0'); assert.equal((await f.status()).label, 'Waiting for support');
});


test('automatic repair needs opt-in and supported bytes, and never enables routing', async () => {
  for (const options of [{ enabled: false }, { enabled: true, version: '99.0.0' }, { enabled: true, failure: true }, { enabled: true, status: 'partial' }]) {
    const f = fixture(options); f.monitor(); await settle();
    assert.equal(f.calls.filter(call => call.args[1] === 'apply').length, 0);
    assert.equal(f.settings.instructionRouting, undefined); f.dispose();
  }
  const f = fixture({ enabled: true, status: 'upgrade-available', silent: false }); f.monitor(); await settle();
  assert.equal(f.calls.filter(call => call.args[1] === 'apply').length, 1);
  assert.ok(f.messages.some(message => message[0].includes('were updated')));
  assert.equal(f.commands.length, 0); f.dispose();
});

test('failed automatic patches do not loop across restarts; a Companion update permits another attempt', async () => {
  const stored = { chatLabelsEnabled: true };
  for (const version of ['1.1.0', '1.1.0', '1.1.1']) {
    const f = fixture({ stored, companionVersion: version, applyFailure: true }); f.monitor(); await settle();
    assert.equal(f.calls.filter(call => call.args[1] === 'apply').length, version === '1.1.0' && stored.visited ? 0 : 1);
    stored.visited = true; assert.equal(f.bar.visible, true); f.dispose();
  }
});

test('Not Now or closing allows one later reminder; dismissal is per Codex version', async () => {
  for (const choice of ['Not Now', undefined, "Don't Ask Again for This Version"]) {
    const stored = { chatLabelsEnabled: true }; let count = 0;
    for (let startup = 0; startup < 3; startup++) {
      const f = fixture({ stored, version: '99.0.0', silent: false, choices: [choice] });
      f.monitor(); await settle(); count += f.messages.length;
      f.change('99.0.0'); await settle(); assert.ok(f.messages.length <= 1); f.dispose();
    }
    assert.equal(count, choice === "Don't Ask Again for This Version" ? 1 : 2);
    const newer = fixture({ stored, version: '99.0.1', silent: false }); newer.monitor(); await settle();
    assert.equal(newer.messages.length, 1); newer.dispose();
  }
});

test('silent, unfocused, routing-only and open-setup windows suppress failure popups', async () => {
  for (const options of [{ silent: true }, { focused: false }, { enabled: false }, { visible: true }]) {
    const f = fixture({ enabled: true, silent: false, version: '99.0.0', ...options });
    f.visible(!!options.visible); f.monitor(); await settle();
    assert.equal(f.messages.length, 0); assert.equal(f.stored['chatPatchReminders.v1'], undefined); f.dispose();
  }
});

test('manual failure stays in setup, manual retry works, and restoration prevents automatic reapply', async () => {
  const options = { enabled: true, applyFailure: true, silent: false }; const f = fixture(options);
  f.visible(true); f.monitor(); await settle();
  await assert.rejects(f.apply('apply'));
  assert.equal(f.messages.length, 0);
  options.applyFailure = false; await f.apply('apply'); await settle();
  await f.apply('restore'); await settle(); assert.equal(f.stored.chatLabelsEnabled, false);
  f.visible(false); f.change(supportedVersion); await settle();
  assert.equal(f.calls.filter(call => call.args[1] === 'apply').length, 2);
  f.dispose();
});

test('update action asks VS Code to check and opens Companion without installing anything', async () => {
  for (const extensionId of ['keenanselbee.codex-repo-companion', 'local-tools.codex-repo-companion']) {
    const f = fixture({ extensionId }); await f.updates();
    assert.deepEqual(f.commands, ['workbench.extensions.action.checkForUpdates', 'workbench.extensions.search']);
    assert.equal(f.commandArgs[1][0], `@id:${extensionId} @id:openai.chatgpt`);
    assert.equal(f.calls.length, 0);
  }
});


test('an unanswered failure notification does not block a later supported update', async () => {
  let close;
  const f = fixture({ enabled: true, version: '99.0.0', silent: false,
    notification: () => new Promise(resolve => { close = resolve; }) });
  f.monitor(); await settle(); assert.equal(f.messages.length, 1);
  f.change(supportedVersion); await settle();
  assert.equal(f.calls.filter(call => call.args[1] === 'apply').length, 1);
  assert.match(f.bar.text, /Reload/); f.dispose(); close();
});

test('restoring already-original Codex disables automatic reapplication across restarts', async () => {
  const stored = { chatLabelsEnabled: true };
  const f = fixture({ stored, status: 'compatible' });
  await f.run(true);
  assert.equal(stored.chatLabelsEnabled, false);
  assert.equal(f.calls.filter(call => call.args[1] !== 'check').length, 0);
  f.monitor(); await settle();
  assert.equal(f.calls.filter(call => call.args[1] === 'apply').length, 0);
  f.dispose();
  const restarted = fixture({ stored, status: 'compatible' });
  restarted.monitor(); await settle();
  assert.equal(restarted.calls.filter(call => call.args[1] === 'apply').length, 0);
  assert.equal((await restarted.status()).label, 'Off');
  restarted.dispose();
});

test('recognized existing patches preserve opt-in for older users, but explicit off is kept', async () => {
  for (const enabled of [undefined, false]) {
    const stored = enabled === undefined ? {} : { chatLabelsEnabled: enabled };
    const f = fixture({ stored, status: 'upgrade-available' }); f.monitor(); await settle();
    assert.equal(f.calls.filter(call => call.args[1] === 'apply').length, enabled === undefined ? 1 : 0);
    assert.equal(f.stored.chatLabelsEnabled, enabled === undefined); f.dispose();
  }
});
