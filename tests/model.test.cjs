'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readRepositoryAliases, readManualTimes, customLabelError, readCustomLabels, historyContextKey, conversationKey, readAssignments, repositoryLabel } = require('../dist/model');

test('conversation identity ignores query text and distinguishes local and remote', () => {
  assert.equal(conversationKey({ scheme: 'openai-codex', authority: 'route', path: '/local/abc', query: 'x=1' }), 'local/abc');
  assert.equal(conversationKey({ scheme: 'openai-codex', authority: 'route', path: '/remote/abc' }), 'remote/abc');
  for (const path of ['/new', '/local/', '/local/abc/extra']) {
    assert.equal(conversationKey({ scheme: 'openai-codex', authority: 'route', path }), undefined);
  }
  assert.equal(conversationKey({ scheme: 'file', authority: 'route', path: '/local/abc' }), undefined);
});

test('stored assignments retain exact nested repository roots and reject invalid records', () => {
  const value = readAssignments({ 'local/a': { root: 'file:///parent', label: 'Parent' },
    'local/b': { root: 'file:///parent/private', label: 'Private' },
    'local/c': { root: 42, label: 'Bad' }, invalid: { root: 'file:///x', label: 'Bad' } });
  assert.equal(Object.keys(value).length, 2);
  assert.equal(value['local/b'].root, 'file:///parent/private');
  assert.deepEqual(readAssignments(JSON.parse(JSON.stringify(value))), value);
});

test('repository label respects exact workspace folder names', () => {
  const path = require('node:path');
  const parent = path.resolve('parent');
  const nested = path.join(parent, 'private');
  assert.equal(repositoryLabel(nested, [{ fsPath: parent, name: 'Parent' }]), 'private');
  assert.equal(repositoryLabel(nested, [{ fsPath: nested, name: 'Parent - Private' }]), 'Parent - Private');
});


test('history commands require the clicked local chat identity and never fall back to focus', () => {
  const valid = { webviewSection: 'codexNavigatorChat', codexNavigatorConversationKey: 'local/00000000-0000-0000-0000-000000000001' };
  assert.equal(historyContextKey(valid), valid.codexNavigatorConversationKey);
  for (const input of [undefined, null, {}, [], valid.codexNavigatorConversationKey,
    { ...valid, webviewSection: 'editor' }, { ...valid, codexNavigatorConversationKey: 'local/new' },
    { ...valid, codexNavigatorConversationKey: 'remote/a' },
    { ...valid, codexNavigatorConversationKey: valid.codexNavigatorConversationKey + '/extra' }]) {
    assert.equal(historyContextKey(input), undefined);
  }
});


test('custom labels persist without a fabricated repository and reject empty or malformed text', () => {
  const labels=readCustomLabels({'local/a':'  Elden Ring modding  ','local/b':'<literal text>','local/c':'[bad]','local/d':'x\ny','local/e':'x'.repeat(101),'local/f':5,invalid:'Ignored'});
  assert.deepEqual({...labels},{'local/a':'Elden Ring modding','local/b':'<literal text>'});
  for(const value of ['', '   ', '[bad]', 'new\nline', '\x00', 'x'.repeat(101)]) assert.equal(typeof customLabelError(value),'string');
  assert.equal(customLabelError('x'.repeat(100)),undefined);
  assert.deepEqual({...readCustomLabels(null)},{});
});


test('aliases use exact absolute roots and manual timestamps reject malformed state', () => {
  const path=require('node:path');
  const root=path.resolve('parent/private');
  const aliases=readRepositoryAliases({[root]:'  Friendly Private  ',relative:'Bad',[path.resolve('bad')]:'[invalid]'});
  assert.deepEqual(aliases,[{fsPath:root,name:'Friendly Private'}]);
  assert.deepEqual({...readManualTimes({'local/a':123,'local/b':-1,'local/c':'123','local/d':Infinity,invalid:50})},{'local/a':123});
});


test('starred chat storage validates local identity and bounds remembered titles',()=>{
  const {readStarredChats}=require('../dist/model');
  const key='local/00000000-0000-0000-0000-000000000001';
  const result=readStarredChats({[key]:'a'.repeat(600),'remote/no':'Remote','local/new':'New','__proto__':'invalid'});
  assert.deepEqual(Object.keys(result),[key]);assert.equal(result[key].length,500);
  assert.deepEqual(Object.keys(readStarredChats(null)),[]);
});
