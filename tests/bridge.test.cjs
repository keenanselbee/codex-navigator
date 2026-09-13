'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const commands = new Map();
  const subscriptions = [];
  const sandbox = { module: { exports: {} }, setTimeout, clearTimeout, require: () => ({ commands: {
    registerCommand(name, callback) { commands.set(name, callback); return { dispose() { commands.delete(name); } }; },
    async executeCommand(name, ...args) { return commands.get(name)?.(...args); },
  }, Uri: { parse: value => ({ toString: () => value }) }, window: { showWarningMessage() {} } }) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../bridge/codex-repo-companion-bridge.cjs'), 'utf8'), sandbox);
  sandbox.module.exports.install({ subscriptions });
  class Panel {
    rendered = 'Original'; listeners = [];
    get title() { return this.rendered; }
    set title(value) { this.rendered = value; }
    onDidDispose(callback) { this.listeners.push(callback); return { dispose() {} }; }
  }
  return { bridge: sandbox.module.exports, commands, subscriptions, Panel };
}

test('prefix affects rendered title only and survives Codex title refreshes and reassignment', () => {
  const { bridge, commands, Panel, subscriptions } = fixture();
  const panel = new Panel();
  bridge.attach({ scheme: 'openai-codex', authority: 'route', path: '/local/abc' }, panel);
  const set = commands.get('codexRepoCompanion.bridge.setAssignments');
  set({ 'local/abc': { label: 'Parent' } });
  assert.equal(panel.rendered, '[Parent] Original');
  assert.equal(panel.title, 'Original');
  panel.title = 'Updated by Codex';
  assert.equal(panel.rendered, '[Parent] Updated by Codex');
  set({ 'local/abc': { label: 'Private' } });
  assert.equal(panel.rendered, '[Private] Updated by Codex');
  set({});
  assert.equal(panel.rendered, 'Updated by Codex');
  subscriptions.forEach(item => item.dispose());
  panel.title = 'After uninstall';
  assert.equal(panel.rendered, 'After uninstall');
});

function sidebarFixture() {
  const base = fixture();
  const visibility = new Set();
  let destroyed;
  const messages = [];
  const webview = { postMessage(message) { messages.push(message); return Promise.resolve(true); } };
  const view = { visible: true, shown: 0,
    show() { this.shown++; this.visible = true; for (const callback of [...visibility]) { callback(); } },
    onDidChangeVisibility(callback) { visibility.add(callback); return { dispose() { visibility.delete(callback); } }; },
  };
  base.bridge.observeSurface(webview, 'sidebar', callback => { destroyed = callback; return { dispose() {} }; }, view);
  return { ...base, webview, view, messages,
    state: () => base.commands.get('codexRepoCompanion.bridge.getState')(),
    route: (path, focused = true, hostId = 'local') => base.bridge.observeMessage(webview, { type: 'repo-companion-route', path, hostId, focused }),
    hide() { view.visible = false; for (const callback of [...visibility]) { callback(); } }, destroy() { destroyed(); },
  };
}

test('sidebar switches and new chats update identity without editor tab changes', () => {
  const f = sidebarFixture();
  f.route('/local/a');
  assert.equal(f.state().surfaces[0].key, 'local/a');
  const id = f.state().activeId;
  f.route('/local/b');
  assert.equal(f.state().activeId, id);
  assert.equal(f.state().surfaces[0].key, 'local/b');
  f.route('/');
  assert.equal(f.state().surfaces[0].key, null);
  assert.equal(f.state().activeId, id, 'new chat does not fall back to an unrelated editor');
});

test('sidebar receives only display labels, updates assignments, and clears labels on Back', () => {
  const f = sidebarFixture();
  const set = f.commands.get('codexRepoCompanion.bridge.setAssignments');
  set({ 'local/a': { label: 'Context Suite' } });
  f.route('/local/a');
  assert.equal(f.messages.at(-1).label, 'Context Suite');
  assert.equal(f.messages.at(-1).key, 'local/a');
  assert.deepEqual(Object.keys(f.messages.at(-1)).sort(), ['assignments', 'colours', 'customLabels', 'key', 'label', 'pinManualLabels', 'repositories', 'starred', 'tooltips', 'type']);
  const count = f.messages.length;
  set({ 'local/a': { label: 'Context Suite' } });
  assert.equal(f.messages.length, count, 'identical assignment refresh sends no message');
  set({ 'local/a': { label: 'Private' } });
  assert.equal(f.messages.at(-1).label, 'Private');
  f.route('/');
  assert.equal(f.messages.at(-1).label, '');
  assert.equal(f.messages.at(-1).assignments['local/a'], 'Private', 'history retains labels without an active conversation');
  set({ 'local/b': { label: 'Other', root: 'private path' } });
  assert.equal(f.messages.at(-1).assignments['local/a'], undefined);
  assert.equal(f.messages.at(-1).assignments['local/b'], 'Other');
  assert.ok(!JSON.stringify(f.messages.at(-1)).includes('private path'));
  f.route('/local/a'); set({});
  assert.equal(f.messages.at(-1).label, '');
});

test('background sidebar changes do not take focus from an editor chat', () => {
  const f = sidebarFixture();
  f.route('/local/a');
  const panel = new f.Panel(); panel.webview = {};
  f.bridge.attach({ scheme: 'openai-codex', authority: 'route', path: '/local/editor', toString: () => 'editor-uri' }, panel);
  f.bridge.observeMessage(panel.webview, { type: 'view-focused' });
  const active = f.state().activeId;
  f.route('/local/b', false);
  assert.equal(f.state().activeId, active);
  assert.equal(f.state().surfaces.find(item => item.id === active).key, 'local/editor');
  const revision = f.state().revision;
  f.bridge.observeMessage(panel.webview, { type: 'view-focused' });
  assert.equal(f.state().revision, revision, 'restoring focus does not create a navigation loop');
});

test('unsupported remote host and non-chat routes clear the previous identity', () => {
  const f = sidebarFixture();
  f.route('/local/a'); f.route('/local/a', true, 'ssh-remote');
  assert.equal(f.state().surfaces[0].key, null);
  f.route('/local/a'); f.route('/settings');
  assert.equal(f.state().surfaces[0].key, null);
  f.destroy();
  assert.equal(f.state().activeId, null);
  assert.equal(f.state().surfaces.length, 0);
});

test('SCM can temporarily hide the sidebar and restore it without losing the active chat', async () => {
  const f = sidebarFixture(); f.route('/local/a');
  const expected = { id: f.state().activeId, key: 'local/a' };
  f.commands.get('codexRepoCompanion.bridge.beginNavigation')(expected);
  f.hide();
  assert.equal(f.state().activeId, expected.id);
  assert.ok(await f.commands.get('codexRepoCompanion.bridge.focusSurface')(expected));
  f.commands.get('codexRepoCompanion.bridge.endNavigation')(expected.id);
  assert.ok(f.view.visible);
  assert.equal(f.state().activeId, expected.id);
  f.hide();
  assert.equal(f.state().activeId, null, 'ordinary sidebar hiding clears focus');
});

test('stale focus restoration cannot override a newer conversation', async () => {
  const f = sidebarFixture(); f.route('/local/a');
  const expected = { id: f.state().activeId, key: 'local/a' };
  f.route('/local/b');
  assert.equal(await f.commands.get('codexRepoCompanion.bridge.focusSurface')(expected), false);
  assert.equal(f.view.shown, 0);
});

test('assignments received before restored panels attach apply without duplicate prefixes', () => {
  const { bridge, commands, Panel } = fixture();
  const set = commands.get('codexRepoCompanion.bridge.setAssignments');
  set({ 'local/abc': { label: 'Repo' } });
  const panel = new Panel();
  const uri = { scheme: 'openai-codex', authority: 'route', path: '/local/abc' };
  bridge.attach(uri, panel);
  bridge.attach(uri, panel);
  set({ 'local/abc': { label: 'Repo' } });
  assert.equal(panel.rendered, '[Repo] Original');
  panel.listeners.forEach(callback => callback());
  assert.equal(set({}).panels, 0);
});

test('unsupported panel descriptor is left untouched', () => {
  const { bridge } = fixture();
  const panel = { title: 'Unchanged' };
  bridge.attach({ scheme: 'openai-codex', authority: 'route', path: '/local/abc' }, panel);
  assert.equal(panel.title, 'Unchanged');
});


test('direct menu choices carry exact clicked identity and accept only the published catalog', async () => {
  const {bridge,webview,messages,commands} = sidebarFixture();
  const key = 'local/00000000-0000-0000-0000-000000000001';
  const calls=[];
  commands.set('codexRepoCompanion.chooseHistoryRepository',(...args)=>calls.push(args));
  commands.set('codexRepoCompanion.autoHistoryScope',(...args)=>calls.push(args));
  commands.get('codexRepoCompanion.bridge.setAssignments')({},[{root:'file:///repo',label:'Repo',description:'/repo'}]);
  assert.equal(messages.at(-1).repositories[0].label,'Repo');
  for(const edit of [{root:'file:///other'},{key:'local/new'},{action:'arbitrary'},{action:'__proto__'}]) {
    assert.equal(bridge.observeMessage(webview,{type:'repo-companion-menu-action',key,action:'assign',root:'file:///repo',...edit}),true);
  }
  assert.equal(calls.length,0);
  bridge.observeMessage(webview,{type:'repo-companion-menu-action',key,action:'assign',root:'file:///repo'});
  assert.equal(calls[0][0].repoCompanionConversationKey,key);
  assert.equal(calls[0][1].toString(),'file:///repo');
  bridge.observeMessage(webview,{type:'repo-companion-menu-action',key,action:'auto'});
  assert.equal(calls.length,2);
  bridge.observeMessage({}, {type:'repo-companion-menu-action',key,action:'auto'});
  assert.equal(calls.length,2,'unregistered webviews cannot dispatch actions');
});


test('New Chat forwards only to the existing Codex command without repository arguments', () => {
  const {bridge,webview,commands} = sidebarFixture();
  const calls=[];
  commands.set('chatgpt.newChat',(...args)=>calls.push(args));
  const message={type:'repo-companion-menu-action',key:'local/00000000-0000-0000-0000-000000000001',action:'newChat'};
  bridge.observeMessage({},message);
  assert.equal(calls.length,0,'unregistered view rejected');
  bridge.observeMessage(webview,message);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0],[],'Codex owns the new-chat behavior');
});


test('Custom Label opens the companion command for the clicked chat only', () => {
  const {bridge,webview,commands} = sidebarFixture();
  const calls=[];
  commands.set('codexRepoCompanion.customHistoryLabel',(...args)=>calls.push(args));
  const key='local/00000000-0000-0000-0000-000000000001';
  bridge.observeMessage(webview,{type:'repo-companion-menu-action',key,action:'custom',root:'file:///ignored'});
  assert.equal(calls.length,1);
  assert.equal(calls[0][0].repoCompanionConversationKey,key);
  assert.equal(calls[0][1],undefined,'text is requested by the extension, not trusted from a webview message');
});


test('inline custom labels validate text and preserve clicked identity', () => {
  const {bridge,webview,commands} = sidebarFixture(); const calls=[];
  commands.set('codexRepoCompanion.customHistoryLabel',(...args)=>calls.push(args));
  const key='local/00000000-0000-0000-0000-000000000001';
  for (const label of ['', '[bad]', 'a'.repeat(101), 42]) bridge.observeMessage(webview,{type:'repo-companion-menu-action',key,action:'custom',label});
  assert.equal(calls.length,0);
  bridge.observeMessage(webview,{type:'repo-companion-menu-action',key,action:'custom',label:'Release planning'});
  assert.equal(calls[0][0].repoCompanionConversationKey,key);
  assert.equal(calls[0][1],'Release planning');
});


test('star actions validate the clicked local chat and ordinary submit messages pass through', () => {
  const {bridge,webview,commands,messages}=sidebarFixture();const calls=[];
  commands.set('codexRepoCompanion.starHistoryChat',(...args)=>calls.push(args));
  const key='local/00000000-0000-0000-0000-000000000001';
  commands.get('codexRepoCompanion.bridge.setAssignments')({},[],true,{},[key,'remote/nope']);
  assert.deepEqual([...messages.at(-1).starred],[key]);
  bridge.observeMessage({}, {type:'repo-companion-menu-action',key,action:'star'});
  assert.equal(calls.length,0);
  bridge.observeMessage(webview, {type:'repo-companion-menu-action',key,action:'star'});
  assert.equal(calls[0][0].repoCompanionConversationKey,key);
  assert.equal(bridge.observeMessage(webview,{type:'submit-message',messageId:'queue-test'}),false);
});


test('colour-only metadata is validated, refreshed and cleared without changing chat titles', () => {
  const f = sidebarFixture(); f.route('/local/a');
  const set = f.commands.get('codexRepoCompanion.bridge.setAssignments');
  set({ 'local/a': { label: '', colour: '#aabbcc' }, 'local/b': { label: '', colour: 'url(x)' } });
  assert.equal(f.messages.at(-1).colours['local/a'], '#AABBCC');
  assert.equal(f.messages.at(-1).colours['local/b'], undefined);
  assert.equal(f.messages.at(-1).label, '');
  const before = f.messages.length;
  set({ 'local/a': { label: '', colour: '#112233' } });
  assert.equal(f.messages.length, before + 1);
  set({}); assert.equal(Object.keys(f.messages.at(-1).colours).length, 0);
});

test('colour menu actions retain the clicked chat identity and consume unregistered surfaces', () => {
  const f = sidebarFixture(), calls = [];
  const key = 'local/00000000-0000-0000-0000-000000000001';
  f.commands.set('codexRepoCompanion.chatHistoryColour', value => calls.push(value));
  f.bridge.observeMessage({}, { type: 'repo-companion-menu-action', key, action: 'colour' });
  assert.equal(calls.length, 0);
  f.bridge.observeMessage(f.webview, { type: 'repo-companion-menu-action', key, action: 'colour' });
  assert.equal(calls[0].repoCompanionConversationKey, key);
});
