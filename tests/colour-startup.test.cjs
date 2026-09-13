'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { assignAutomaticColours } = require('../dist/automatic-colours');
const { repositoryColourKey } = require('../dist/colours');

async function fixture(t, { saved = {}, custom = {}, ready = false } = {}) {
  const commands = new Map(), values = new Map([['automaticRepositoryColours.v1', saved]]), errors = [];
  const event = () => {
    const listeners = new Set();
    return { subscribe: listener => { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; },
      fire: () => { for (const listener of listeners) listener(); } };
  };
  const state = event(), opened = event(), idleEvent = event(), disposable = { dispose() {} };
  const roots = ['a', 'b', 'c', 'd'].map(name => path.resolve('fixture-' + name));
  const repositories = list => list.map(root => ({ rootUri: { scheme: 'file', fsPath: root } }));
  const git = { state: ready ? 'initialized' : 'uninitialized', repositories: repositories(roots),
    onDidChangeState: state.subscribe, onDidOpenRepository: opened.subscribe, onDidCloseRepository: idleEvent.subscribe };
  const memory = { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, update: async (key, value) => { values.set(key, value); } };
  const context = { subscriptions: [], workspaceState: memory, globalState: memory };
  let reportBackground;
  class Idle { dispose() {} }
  const vscode = {
    extensions: { getExtension: id => id === 'vscode.git' ? { activate: async () => ({ getAPI: () => git }) } : undefined },
    StatusBarAlignment: { Left: 1 }, ColorThemeKind: { Light: 1, Dark: 2, HighContrastLight: 4 }, TabInputCustom: class {},
    env: {}, commands: { registerCommand: (name, action) => { commands.set(name, action); return disposable; } },
    window: { activeColorTheme: { kind: 2 }, createOutputChannel: () => ({ ...disposable, appendLine() {}, show() {} }),
      createStatusBarItem: () => ({ ...disposable, hide() {} }), showWarningMessage: message => errors.push(message),
      registerWebviewViewProvider: () => disposable,
      tabGroups: { activeTabGroup: {}, all: [], onDidChangeTabs: idleEvent.subscribe, onDidChangeTabGroups: idleEvent.subscribe } },
    workspace: { getConfiguration: () => ({ get: (key, fallback) => key === 'repositoryColours' ? custom : fallback }),
      onDidChangeWorkspaceFolders: idleEvent.subscribe, onDidChangeConfiguration: idleEvent.subscribe },
  };
  const mocks = {
    './license-access': { LicenseAccess: class extends Idle { async check() {} allowed() { return true; } async requireAccess() { return true; } onDidChange() { return disposable; } } },
    vscode, 'node:fs': { watch: () => ({ on() {}, close() {} }) }, 'node:fs/promises': { mkdir: async () => {} },
    './routing': { RoutingPublisher: class extends Idle { async publish() {} } },
    './scope-store': { codexHome: () => path.resolve('.codex-temp', 'unused-colour-fixture'), SessionIndex: Idle, reportedThreadIds: async () => [] },
    './discussion': { DiscussionReader: Idle }, './activity-events': { TranscriptActivity: Idle },
    './activity-runtime': { RuntimeActivity: Idle }, './chat-goals': { ChatGoals: Idle },
    './chat-recency': { ChatRecency: Idle }, './history': { readRecentConversations: async () => [] },
    './chat-sidebar': { ChatSidebar: class extends Idle { constructor(_context, _read, _goals, background) { super(); reportBackground = background; } async refresh() {} } },
    './setup': {}, './colour-picker': {}, './hook-setup': {}, './chat-activity': {},
  };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/extension'), 'utf8'), { exports,
    require: name => mocks[name] ?? (name.startsWith('./') ? require('../dist/' + name.slice(2)) : require(name)),
    setTimeout: () => 1, clearTimeout() {}, process });
  t.after(() => { for (const subscription of context.subscriptions) subscription.dispose(); });
  await exports.activate(context);
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(errors, []); };
  await flush();
  return { roots, git, values, reportBackground, flush,
    colours: () => values.get('automaticRepositoryColours.v1'),
    discover: async list => { git.repositories = repositories(list); opened.fire(); await flush(); },
    finish: async () => { git.state = 'initialized'; state.fire(); await flush(); } };
}

test('fresh colour assignments survive different startup discovery batches and webview timing', async t => {
  const first = await fixture(t);
  assert.deepEqual(first.colours(), {}, 'activation does not allocate before Git is ready');
  await first.discover(first.roots.slice(2));
  first.reportBackground('#222222');
  await first.discover([...first.roots].reverse());
  assert.deepEqual(first.colours(), {}, 'repository and background events cannot persist partial assignments');
  await first.finish();
  const expected = assignAutomaticColours(first.roots, {}, {}, '#181818');
  assert.deepEqual(first.colours(), expected, 'Git completion assigns the sorted full set');

  const reset = await fixture(t, { ready: true });
  reset.reportBackground('#222222');
  await reset.flush();
  assert.deepEqual(reset.colours(), expected, 'already-ready Git and later background report produce the same defaults');
});

test('startup colour allocation preserves saved identities, overrides and later additions', async t => {
  const key = repositoryColourKey(path.resolve('fixture-a'));
  const customKey = repositoryColourKey(path.resolve('fixture-b'));
  const saved = { [key]: '#FF8844' }, custom = { [customKey]: '#123456' };
  const run = await fixture(t, { saved, custom });
  assert.deepEqual(run.colours(), saved);
  await run.discover(run.roots.slice(0, 3));
  await run.finish();
  const before = { ...run.colours() };
  assert.equal(before[key], saved[key]);
  assert.equal(before[customKey], undefined, 'manual colour does not receive an automatic assignment');
  await run.discover(run.roots);
  for (const [root, colour] of Object.entries(before)) assert.equal(run.colours()[root], colour);
  assert.ok(run.colours()[repositoryColourKey(run.roots[3])]);
});
