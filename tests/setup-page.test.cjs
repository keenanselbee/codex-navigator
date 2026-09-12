'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture(options = {}) {
  const messages = [], writes = [];
  let receive, dispose, foldersChanged, repoChanged, configChanged, labelsChanged;
  const choices = { main: '', scopes: [], fallbackNames: [], enabled: false };
  const folders = [{ name: 'Project', uri: uri('C:/workspace/project') }];
  const git = { repositories: [{ rootUri: folders[0].uri }], onDidOpenRepository: fn => { repoChanged = fn; return disposable(); }, onDidCloseRepository: () => disposable() };
  let panels = 0, revealed = 0;
  const panel = { reveal: () => revealed++, dispose: () => dispose(), onDidDispose: fn => { dispose = fn; }, webview: {
    cspSource: 'vscode-webview:', asWebviewUri: value => value,
    postMessage: async message => { messages.push(message); },
    onDidReceiveMessage: fn => { receive = fn; return disposable(); },
  } };
  const config = { get: (key, fallback) => fallback, update: async (...args) => writes.push(args) };
  const api = { env: {}, ViewColumn: { Active: -1 }, ConfigurationTarget: { Workspace: 2 }, Uri: { joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)) },
    window: { createWebviewPanel: () => { panels++; return panel; }, showOpenDialog: async () => undefined },
    workspace: { isTrusted: true, workspaceFolders: folders, getConfiguration: () => config,
      onDidChangeWorkspaceFolders: fn => { foldersChanged = fn; return disposable(); },
      onDidChangeConfiguration: fn => { configChanged = fn; return disposable(); } },
    extensions: { getExtension: () => ({ exports: { getAPI: () => git } }) }, commands: { executeCommand: async name => writes.push([name]) },
  };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/setup-page.js'), 'utf8'), {
    exports,
    require: name => {
      if (name === 'vscode') return api;
      if (name === './agent-helper') return { prepareAgentHelper: () => ({ instructions: 'C:/global/AGENTS.md', before: '', helper: 'missing', destination: 'missing' }) };
      if (name === './display-setup') return { watchChatLabels: (_context, fn) => { labelsChanged = fn; return disposable(); }, chatLabelsStatus: async () => ({ label: 'Off', root: 'C:/codex', status: 'compatible', detail: 'Ready' }), applyChatLabels: async (...args) => { writes.push(['labels', ...args.slice(1)]); await options.onApply?.(); } };
      if (name === './routing-setup') return { routingChoices: () => ({ ...choices }), saveRoutingChoices: async value => writes.push(['routing', value]) };
      return name.startsWith('./') ? require('../dist/' + name.slice(2)) : require(name);
    },
  });
  const root = path.join(__dirname, '..');
  return { messages, writes, panel, api, choices, git, folders, labelsChanged: state => labelsChanged(state),
    open: () => exports.openSetupPage({ extensionPath: root, extensionUri: uri(root), subscriptions: [] }),
    send: message => receive(message), changed: () => foldersChanged(), repositoryChanged: () => repoChanged(),
    stale: () => configChanged({ affectsConfiguration: () => true }), counts: () => ({ panels, revealed }),
  };
}
function disposable() { return { dispose() {} }; }
function uri(value) { return { fsPath: value, scheme: 'file', toString: () => value }; }

test('setup reuses one panel and renders settings as data under a restrictive CSP', async () => {
  const f = fixture(); await f.open(); await f.open(); await f.send({ type: 'ready' });
  assert.deepEqual(f.counts(), { panels: 1, revealed: 1 });
  assert.ok(f.panel.webview.html.includes("default-src 'none'"));
  assert.ok(!f.panel.webview.html.includes('{{'));
  const state = f.messages.find(message => message.type === 'state');
  assert.equal(state.repositories[0].name, 'Project');
  assert.equal(state.replaceChoices, true);
  assert.equal(f.writes.length, 0);
});

test('workspace and Git changes refresh the preview without resetting draft choices', async () => {
  const f = fixture(); await f.open(); await f.send({ type: 'ready' });
  f.folders.push({ name: 'New project', uri: uri('C:/workspace/new') });
  f.git.repositories.push({ rootUri: f.folders[1].uri });
  f.changed(); f.repositoryChanged();
  assert.equal(f.messages.at(-1).type, 'repositories');
  assert.equal(f.messages.at(-1).repositories.length, 2);
});

test('page rejects unknown commands and stale revisions and preserves drafts after label setup', async () => {
  const f = fixture(); await f.open(); await f.send({ type: 'ready' });
  await f.send({ type: 'deleteEverything', revision: 1 }); assert.equal(f.writes.length, 0);
  await f.send({ type: 'saveRouting', revision: 0, choices: {} }); assert.equal(f.writes.length, 0);
  assert.ok(f.messages.some(message => message.type === 'error'));
  await f.send({ type: 'enableLabels', revision: 1 });
  assert.equal(f.writes[0][0], 'labels');
  assert.equal(f.messages.filter(message => message.type === 'state').length, 1);
  assert.ok(f.messages.some(message => message.type === 'labels'));
});

test('changes outside the page and loss of trust prevent applying stale settings', async () => {
  const f = fixture(); await f.open(); await f.send({ type: 'ready' });
  f.choices.main = 'Changed elsewhere'; f.stale();
  await f.send({ type: 'saveRouting', revision: 1 }); assert.equal(f.writes.length, 0);
  f.api.workspace.isTrusted = false;
  await f.send({ type: 'disableRouting', revision: 1 }); assert.equal(f.writes.length, 0);
});


test('settings changed while labels are installing cannot be silently overwritten', async () => {
  let finish;
  const waiting = new Promise(resolve => { finish = resolve; });
  const f = fixture({ onApply: () => waiting });
  await f.open(); await f.send({ type: 'ready' });
  const installing = f.send({ type: 'enableLabels', revision: 1 });
  f.choices.main = 'Changed elsewhere during patch'; f.stale();
  finish(); await installing;
  assert.ok(f.messages.some(message => message.type === 'stale'));
  await f.send({ type: 'saveRouting', revision: 1, choices: { main: 'Old draft' } });
  assert.equal(f.writes.filter(write => write[0] === 'routing').length, 0);
  assert.match(f.messages.filter(message => message.type === 'error').at(-1).text, /Settings changed/);
});

test('Codex updates refresh only label status and keep routing drafts and revisions', async () => {
  const f = fixture(); await f.open(); await f.send({ type: 'ready' });
  f.labelsChanged({ label: 'Waiting for support', detail: 'Update Companion', extensions: true });
  assert.equal(f.messages.at(-1).type, 'labels');
  assert.equal(f.messages.at(-1).labels.label, 'Waiting for support');
  assert.equal(f.messages.filter(message => message.type === 'state').length, 1);
  await f.send({ type: 'enableLabels', revision: 1 });
  assert.equal(f.writes.length, 0);
});


test('setup view updates compatibility without replacing a draft or hiding its conflict warning', () => {
  const nodes = new Map(); let receive;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', hidden: false, textContent: '',
      addEventListener() {}, replaceChildren() {}, append() {}, classList: { toggle() {} } });
    return nodes.get(id);
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../media/setup.js'), 'utf8'), {
    acquireVsCodeApi: () => ({ postMessage() {} }),
    document: { getElementById: node, querySelectorAll: () => [], createElement: () => node('item'), body: { setAttribute() {} } },
    window: { addEventListener: (_event, fn) => { receive = message => fn({ data: message }); } },
  });
  receive({ type: 'state', replaceChoices: true, revision: 1,
    choices: { main: 'Saved file', scopes: [], fallbackNames: [], enabled: false },
    labels: { label: 'Enabled', status: 'patched', root: 'C:/codex' }, repositories: [] });
  node('main').value = 'Unsaved file'; receive({ type: 'stale' });
  receive({ type: 'labels', labels: { label: 'Waiting for support', detail: 'Update Companion', extensions: true } });
  assert.equal(node('main').value, 'Unsaved file'); assert.equal(node('stale').hidden, false);
  assert.equal(node('labels-status').textContent, 'Waiting for support');
  assert.equal(node('enable-labels').disabled, true); assert.equal(node('extensions').hidden, false);
  assert.equal(node('save-routing').disabled, false);
});
