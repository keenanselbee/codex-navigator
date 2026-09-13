'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const id = '00000000-0000-0000-0000-000000000001', calls = [], sent = [], commands = new Map();
  let receive, disposed, visibleChanged;
  const uri = value => ({ ...value, fsPath: value.path, toString: () => `${value.scheme}://${value.authority}${value.path}` });
  const vscode = { Uri: { from: uri, file: root => uri({ scheme: 'file', path: root }), joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath, ...parts) }) },
    env: { uriScheme: 'vscode' }, workspace: { isTrusted: true, getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: { showInformationMessage: async text => calls.push(['info', text]) },
    extensions: { getExtension: () => ({ activate: async () => {} }) },
    commands: { executeCommand: async (...args) => { calls.push(args); },
      registerCommand: (name, fn) => { commands.set(name, fn); return { dispose: () => commands.delete(name) }; } } };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/chat-sidebar'), 'utf8'), { exports,
    require: name => name === 'vscode' ? vscode : name === './chat-pins' ? require('../dist/chat-pins') : name === './history' ? require('../dist/history') : name === './colours' ? require('../dist/colours') : name === './chat-goals' ? require('../dist/chat-goals') : require(name),
    setInterval: () => 1, clearInterval() {} });
  const stored = new Map();
  const context = { globalState: { get: (key, fallback) => stored.get(key) ?? fallback, update: async (key, value) => { stored.set(key, value); } }, extensionUri: { fsPath: path.resolve('.') }, extensionPath: path.resolve('.') };
  const sidebar = new exports.ChatSidebar(context, async () => [{ id, title: 'A', label: 'Repo', colour: '#123456', starred: false }]);
  const view = { visible: true, webview: { cspSource: 'vscode-webview:', asWebviewUri: v => v.fsPath,
    postMessage: async m => { sent.push(m); return true; }, onDidReceiveMessage: fn => { receive = fn; return { dispose() {} }; } },
    onDidDispose: fn => { disposed = fn; return { dispose() {} }; }, onDidChangeVisibility: fn => { visibleChanged = fn; return { dispose() {} }; } };
  sidebar.resolveWebviewView(view);
  return { sidebar, calls, sent, id, view, exports, vscode, commands, stored, receive: m => sidebar.receive(m) };
}

test('native menu actions use their captured row ID and reject missing or foreign context', async () => {
  const f = fixture(); await f.sidebar.refresh();
  const action = f.commands.get('codexNavigator.sidebar.colour');
  for (const value of [undefined, {}, { webviewSection: 'elsewhere', navigatorChatId: f.id },
    { webviewSection: 'navigatorChat', navigatorChatId: '../other' },
    { webviewSection: 'navigatorChat', navigatorChatId: '00000000-0000-0000-0000-000000000002' }]) await action(value);
  assert.equal(f.calls.length, 0);
  await action({ webviewSection: 'navigatorChat', navigatorChatId: f.id });
  assert.equal(f.calls[0][0], 'codexNavigator.setChatColour');
  assert.equal(f.calls[0][1].path, '/local/' + f.id);
  f.sidebar.dispose(); assert.equal(f.commands.size, 0);
});

test('sidebar validates row identity and actions before running existing chat commands', async () => {
  const f = fixture(); await f.receive({ type: 'ready' });
  assert.equal(f.sent[0].rows.length, 1);
  for (const message of [{ type: 'open', id: '../other' }, { type: 'action', id: f.id, action: '__proto__' },
    { type: 'open', id: '00000000-0000-0000-0000-000000000002' }]) await f.receive(message);
  assert.equal(f.calls.length, 0);
  await f.receive({ type: 'action', id: f.id, action: 'colour' });
  assert.equal(f.calls[0][0], 'codexNavigator.setChatColour');
  assert.equal(f.calls[0][1].path, '/local/' + f.id);
  await f.receive({ type: 'action', id: f.id, action: 'repositories' });
  assert.equal(f.calls[1][0], 'codexNavigator.assignRepository');
  f.sidebar.dispose(); await f.receive({ type: 'open', id: f.id }); assert.equal(f.calls.length, 2);
});

test('sidebar links use the existing Codex extension URI handler and reject unavailable targets', async () => {
  const f = fixture(); await f.exports.openSidebarChat(f.id);
  assert.equal(f.calls[0][0], 'vscode.open');
  assert.equal(f.calls[0][1].toString(), 'vscode://openai.chatgpt/local/' + f.id);
  await assert.rejects(f.exports.openSidebarChat('not-a-chat'), /saved local/);
  f.vscode.env.remoteName = 'ssh'; await assert.rejects(f.exports.openSidebarChat(f.id), /local VS Code/);
  f.vscode.env.remoteName = undefined; f.vscode.extensions.getExtension = () => undefined;
  await assert.rejects(f.exports.openSidebarChat(f.id), /Install and enable/);
});

test('hidden and disposed sidebar views stop history reads', async () => {
  const f = fixture(); f.view.visible = false; await f.sidebar.refresh(); assert.equal(f.sent.length, 0);
  f.view.visible = true; await f.sidebar.refresh(); assert.equal(f.sent.length, 1);
  f.sidebar.dispose(); await f.sidebar.refresh(); assert.equal(f.sent.length, 1);
});


test('in-panel colour results are token-bound, validated and cancelled without saving', async () => {
 const f=fixture(); const options={title:'Chat',initial:'#123456',resetLabel:'Automatic',recent:[],repositories:[]};
 const choice=f.sidebar.pickColour(options); await new Promise(setImmediate);
 const token=f.sent.at(-1).token;
 await f.receive({type:'colourResult',token:'wrong',colour:'#abcdef'});
 await f.receive({type:'colourResult',token,colour:'invalid'});
 assert.equal(f.sent.at(-1).type,'colour');
 await f.receive({type:'colourResult',token,colour:'#abc'});assert.equal(await choice,'#AABBCC');
 const cancelled=f.sidebar.pickColour(options);await new Promise(setImmediate);
 await f.receive({type:'colourResult',token:f.sent.at(-1).token,cancel:true});assert.equal(await cancelled,undefined);
 f.sidebar.dispose();
});


test('goal messages require a visible known chat and the displayed goal; failed controls open native Codex', async () => {
 const f=fixture(),reads=[],changes=[];
 const goal={status:'active',objective:'Current goal',tokensUsed:0,createdAt:10};
 f.sidebar.goalHost={read:async ids=>{reads.push(ids);return ids.includes(f.id)?{[f.id]:goal}:{};},stop(){},
  change:async(id,expected)=>{changes.push(id);throw new Error('Runtime unavailable');}};
 await f.sidebar.refresh();
 await f.receive({type:'visibleChats',ids:[f.id,'other']});assert.equal(reads.at(-1).length,1);
 await f.receive({type:'goal',id:f.id,goal:{...goal,createdAt:9}});assert.equal(changes.length,0);
 assert.equal(f.sent.some(m=>m.type==='goalSettled'),true,'stale click releases its pending button');
 await f.receive({type:'goal',id:f.id,goal});assert.deepEqual(changes,[f.id]);
 assert.equal(f.calls[0][0],'vscode.open');assert.equal(f.calls[0][1].path,'/local/'+f.id);
 assert.ok(f.calls.some(call=>call[0]==='info'&&call[1].includes('Runtime unavailable')));
 f.sidebar.dispose();
});


test('hide and restore persist only Navigator visibility without invoking archive or delete', async () => {
  const f=fixture(); await f.sidebar.refresh();
  await f.commands.get('codexNavigator.sidebar.hide')({webviewSection:'navigatorChat',navigatorChatId:f.id});
  assert.equal(f.sent.at(-1).rows.length,0);assert.ok(f.stored.get('hiddenChats.v1')[f.id]);assert.equal(f.calls.length,0);
  f.vscode.window.showQuickPick=async choices=>choices;
  await f.sidebar.restoreHidden();assert.equal(f.sent.at(-1).rows.length,1);assert.equal(Object.keys(f.stored.get('hiddenChats.v1')).length,0);
});

test('24-hour filter uses interaction recency, preserves unknowns and can be disabled', async () => {
  const f=fixture();const now=Date.now();
  f.sidebar.readChats=async()=>[{id:f.id,title:'Old but working',updatedAt:new Date(now).toISOString(),recencyAt:now-86400001}];
  await f.sidebar.refresh();assert.equal(f.sent.at(-1).rows.length,0);
  f.stored.set('activitySeen.v1',{[f.id]:now});await f.sidebar.refresh();assert.equal(f.sent.at(-1).rows.length,1);
  f.stored.set('activitySeen.v1',{});f.vscode.workspace.getConfiguration=()=>({get:()=>false});await f.sidebar.refresh();assert.equal(f.sent.at(-1).rows.length,1);
});

test('repository menu actions require a live workspace repository and captured chat identity',async()=>{
 const f=fixture();await f.receive({type:'ready'});
 const root=path.resolve('.');f.sidebar.readRepositories=()=>[{root,label:'Workspace repo'}];
 for(const message of [{type:'assignRepository',id:f.id,root:'outside'},{type:'assignRepository',id:'bad',root},{type:'repositoryColour',root:'outside'}])await f.receive(message);
 assert.equal(f.calls.length,0);
 await f.receive({type:'assignRepository',id:f.id,root});
 assert.equal(f.calls[0][0],'codexNavigator.assignRepository');assert.equal(f.calls[0][1].path,'/local/'+f.id);assert.equal(f.calls[0][2].fsPath,root);
 const colourAction=f.commands.get('codexNavigator.sidebar.repositoryColour');
 for (const value of [{},{webviewSection:'navigatorChat',navigatorRepositoryRoot:root},{webviewSection:'navigatorRepository',navigatorRepositoryRoot:'outside'}]) await colourAction(value);
 assert.equal(f.calls.length,1,'native repository context rejects wrong sections and unknown roots');
 await colourAction({webviewSection:'navigatorRepository',navigatorRepositoryRoot:root});assert.equal(f.calls[1][0],'codexNavigator.setRepositoryColour');assert.equal(f.calls[1][1].fsPath,root);
 f.sidebar.dispose();
});

test('welcome can be skipped without setup and the activity reminder is dismissible', async () => {
  const f = fixture(); await f.receive({type:'ready'});
  assert.equal(f.sent.at(-1).welcome,true);
  await f.receive({type:'continueWithoutSetup'});
  assert.equal(f.sent.at(-1).welcome,false); assert.equal(f.sent.at(-1).activityPrompt,true);
  assert.equal(f.sent.at(-1).rows.length,1); assert.equal(f.calls.length,0);
  await f.receive({type:'dismissActivityPrompt'});
  assert.equal(f.sent.at(-1).activityPrompt,false);
  await f.sidebar.refresh(); assert.equal(f.sent.at(-1).welcome,false);
  f.sidebar.dispose();
});

test('welcome setup opens only the setup page and real event evidence removes the reminder', async () => {
  const f = fixture(); await f.receive({type:'welcomeSetup'});
  assert.deepEqual(f.calls,[['codexNavigator.setUp']]);
  assert.equal(f.stored.has('activityHooks.enabled'),false);
  f.sidebar.activityReady=async()=>true; await f.sidebar.refresh();
  assert.equal(f.sent.at(-1).activityPrompt,false);
  f.sidebar.activityReady=async()=>false; await f.sidebar.refresh();
  assert.equal(f.sent.at(-1).activityPrompt,true);
  f.sidebar.dispose();
});

test('startup publishes cached chats before live reads settle and keeps actions usable on failure', async () => {
 const f=fixture();let rejectLive;
 f.sidebar.readStartup=async()=>[{id:f.id,title:'Saved title',label:'Repo',starred:false,updatedAt:new Date().toISOString()}];
 f.sidebar.readChats=()=>new Promise((_,reject)=>{rejectLive=reject;});
 f.stored.set('routingInvitation.v1',{handled:true});
 const loading=f.sidebar.refresh();await new Promise(setImmediate);
 assert.equal(f.sent.at(-1).rows[0].title,'Saved title');assert.equal(f.sent.at(-1).rows[0].activity,undefined);
 assert.equal(f.sent.at(-1).welcome,true,'obsolete setup flags do not suppress welcome');
 await f.receive({type:'continueWithoutSetup'});assert.equal(f.sent.at(-1).welcome,false);
 rejectLive(new Error('Metadata unavailable'));await loading;
 f.sidebar.readChats=async()=>{throw new Error('Still unavailable');};
 await f.receive({type:'open',id:f.id});assert.ok(f.calls.some(call=>call[0]==='vscode.open'));
 f.sidebar.dispose();
});
