'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('header prefixes only the matching route and retains the original title value', () => {
  let route = { pathname: '/local/a', search: '' };
  const listeners = new Set();
  const sandbox = { URLSearchParams,
    E: () => route,
    Ln: { useSyncExternalStore(subscribe, snapshot) { return snapshot(); } },
    $: { Fragment: 'fragment', jsxs(type, props) { return props.children; } },
    window: { addEventListener(name, listener) { listeners.add(listener); }, removeEventListener(name, listener) { listeners.delete(listener); } },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../bridge/renderer-title-component.txt'), 'utf8'), sandbox);
  const props = { title: 'Review Context Suite' };
  const render = () => sandbox.RepoCompanionTitle(props).join('');
  assert.equal(render(), props.title);
  sandbox.window.__codexRepoCompanionLabel = { key: 'local/a', label: 'Context Suite' };
  assert.equal(render(), '[Context Suite] Review Context Suite');
  assert.equal(props.title, 'Review Context Suite');
  props.title = 'Updated by Codex';
  assert.equal(render(), '[Context Suite] Updated by Codex');
  route = { pathname: '/local/b', search: '' };
  assert.equal(render(), 'Updated by Codex', 'old route labels cannot leak to a new conversation');
  route = { pathname: '/local/a', search: '?hostId=ssh-remote' };
  assert.equal(render(), 'Updated by Codex');
  const dispose = sandbox.repoCompanionSubscribe(() => {});
  assert.equal(listeners.size, 1); dispose(); assert.equal(listeners.size, 0);
});

test('history rows show independent assignments with no active chat and never label remote hosts', () => {
  const sandbox = { Ln: { useSyncExternalStore(subscribe, snapshot) { return snapshot(); } },
    window: { __codexRepoCompanionAssignments: { 'local/a': 'Parent', 'remote/b': 'Private' } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../bridge/renderer-title-component.txt'), 'utf8'), sandbox);
  const row = sandbox.RepoCompanionRowPrefix;
  assert.equal(row({ conversationKey: 'local/a', hostId: 'local' }), '[Parent] ');
  assert.equal(row({ conversationKey: 'remote/b' }), '[Private] ');
  assert.equal(row({ conversationKey: 'local/a', hostId: 'ssh' }), null);
  assert.equal(row({ conversationKey: 'local/missing' }), null);
  sandbox.window.__codexRepoCompanionAssignments = {};
  assert.equal(row({ conversationKey: 'local/a' }), null);
});


test('history menu identity surrounds the entire row, including unassigned chats', () => {
  const sandbox = { window: {}, Ln: { useSyncExternalStore(subscribe,snapshot) { return snapshot(); } }, $: { jsx: (type, props) => ({ type, props }) } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../bridge/renderer-title-component.txt'), 'utf8'), sandbox);
  const component = () => {};
  const key = 'local/00000000-0000-0000-0000-000000000001';
  const onClick = () => {};
  const props = { component, repoCompanionKey: key, hostId: 'local', onClick, titlePrefix: null };
  const row = sandbox.RepoCompanionHistoryRow(props);
  assert.equal(row.type, 'div');
  assert.equal(row.props.style.display, 'contents');
  assert.deepEqual(JSON.parse(row.props['data-vscode-context']), {
    webviewSection: 'repoCompanionChat', repoCompanionConversationKey: key,
  });
  assert.equal(row.props.children.type, component);
  assert.equal(row.props.children.props.onClick, onClick, 'opening the chat remains Codex-owned');
  assert.equal(row.props.children.props.titlePrefix, null, 'unassigned rows still get the menu');
  assert.equal(row.props.children.props.repoCompanionKey, undefined);
  for (const override of [{ hostId: 'ssh' }, { repoCompanionKey: 'remote/a' }, { repoCompanionKey: 'local/new' }]) {
    const skipped = sandbox.RepoCompanionHistoryRow({ ...props, ...override });
    assert.equal(skipped.type, component);
    assert.equal(skipped.props['data-vscode-context'], undefined);
  }
});


test('the in-chat title carries its own local identity without changing its text', () => {
  const key = 'local/00000000-0000-0000-0000-000000000001';
  let route = { pathname: '/' + key, search: '' };
  const sandbox = { URLSearchParams, E: () => route,
    Ln: { useSyncExternalStore(subscribe,snapshot) { return snapshot(); } },
    $: { jsxs: (type,props) => ({type,props}) },
    window: { __codexRepoCompanionLabel: {key,label:'Parent'}, __codexRepoCompanionTooltips: {[key]:'Repository label (pinned)\n/root'} },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../bridge/renderer-title-component.txt'),'utf8'),sandbox);
  const render = () => sandbox.RepoCompanionTitle({title:'Discuss project'});
  assert.equal(JSON.parse(render().props['data-vscode-context']).repoCompanionConversationKey,key);
  assert.equal(render().props.children.join(''),'[Parent] Discuss project');
  assert.equal(render().props.title,'Repository label (pinned)\n/root');
  sandbox.window.__codexRepoCompanionTooltips[key]='Automatic: reported by agent';
  assert.equal(render().props.title,'Automatic: reported by agent','explanation can change without a title change');
  sandbox.window.__codexRepoCompanionLabel = {};
  assert.equal(JSON.parse(render().props['data-vscode-context']).repoCompanionConversationKey,key,'unassigned title still has a menu');
  for (const next of [{pathname:'/local/new',search:''},{pathname:'/'+key,search:'?hostId=ssh'},{pathname:'/remote/cloud',search:''}]) {
    route=next; assert.equal(render().props['data-vscode-context'],undefined);
  }
});


test('stars render without repository labels and never follow an unrelated or remote chat',()=>{
  const key='local/00000000-0000-0000-0000-000000000001';
  let route={pathname:'/'+key,search:''};
  const sandbox={URLSearchParams,E:()=>route,Ln:{useSyncExternalStore(sub,snapshot){return snapshot();}},$:{jsxs(type,props){return props.children;}},window:{__codexRepoCompanionStarred:[key]}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../bridge/renderer-title-component.txt'),'utf8'),sandbox);
  assert.equal(sandbox.RepoCompanionTitle({title:'Original'}).join(''),'\u2605 Original');
  assert.equal(sandbox.RepoCompanionRowPrefix({conversationKey:key}),'\u2605 ');
  assert.equal(sandbox.RepoCompanionRowPrefix({conversationKey:key,hostId:'ssh'}),null);
  route={pathname:'/local/other',search:''};
  assert.equal(sandbox.RepoCompanionTitle({title:'Original'}).join(''),'Original');
});
