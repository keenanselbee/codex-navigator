'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { ChatProfiles } = require('../dist/chat-profiles');

function fixture(t) {
  fs.mkdirSync(path.join(__dirname, '..', '.codex-temp'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(__dirname, '..', '.codex-temp', 'navigator-profiles-'));
  const stores = [];
  t.after(() => { for (const store of stores) store.dispose(); fs.rmSync(directory, { recursive: true, force: true }); });
  return (workspace = 'workspace-a', home = directory) => {
    const store = new ChatProfiles(directory, workspace, home); stores.push(store); return store;
  };
}
const state = data => ({ get: (key, fallback) => data[key] ?? fallback });

test('Default shares organisation across workspaces and preserves conflicting migration snapshots', async t => {
  const open = fixture(t), a = open(), b = open('workspace-b');
  a.migrate(state({ 'customLabels.v1': { a: 'Work' }, 'navigatorSetup.completed.v1': true }), state({ 'chatNames.v1': { a: 'Renamed' } }));
  b.migrate(state({ 'customLabels.v1': { a: 'School', b: 'Other' } }), state({}));
  assert.deepEqual(a.get('customLabels.v1'), { a: 'Work', b: 'Other' });
  assert.equal(b.shared('browsingCompleted', false), true);
  assert.equal(b.legacy().find(item => item.workspace === 'workspace-b').data['customLabels.v1'].a, 'School');
  assert.equal(b.legacy().find(item => item.workspace === 'workspace-b').conflict, true);
  b.migrate(state({ 'customLabels.v1': { a: 'Changed legacy value' } }), state({}));
  assert.equal(a.get('customLabels.v1').a, 'Work', 'migration is once per workspace');
  const id = b.create('Recovered', false, b.legacy()[1].data); b.select(id);
  assert.equal(b.get('customLabels.v1').a, 'School');
});

test('two windows merge independent changes and deletions without reviving stale values', async t => {
  const open = fixture(t), a = open(), b = open();
  const left = a.get('chatNames.v1', {}), right = b.get('chatNames.v1', {});
  left.a = 'First'; right.b = 'Second';
  await Promise.all([a.update('chatNames.v1', left), b.update('chatNames.v1', right)]);
  assert.deepEqual(a.get('chatNames.v1'), { a: 'First', b: 'Second' });
  const first = a.get('chatNames.v1'), second = b.get('chatNames.v1');
  delete first.a; second.b = 'New';
  await a.update('chatNames.v1', first);
  b.get('chatNames.v1'); // A background render must not replace the pending edit's baseline.
  await b.update('chatNames.v1', second);
  assert.deepEqual(a.get('chatNames.v1'), { b: 'New' });
});

test('new profiles isolate organisation, copies stay independent and routing is shared separately', async t => {
  const open = fixture(t), store = open();
  await store.update('customLabels.v1', { a: 'Default label' });
  await store.updateShared('routingScopes.v1', { a: ['/repo'] });
  const id = store.create('Education', true); store.select(id);
  const values = store.get('customLabels.v1'); values.a = 'School'; await store.update('customLabels.v1', values);
  store.select('default'); assert.equal(store.get('customLabels.v1').a, 'Default label');
  assert.deepEqual(store.shared('routingScopes.v1', {}), { a: ['/repo'] });
  assert.throws(() => store.create('education'), /already/);
  assert.throws(() => store.remove(), /Default/);
  store.select(id); store.remove(); assert.equal(store.activeId, 'default');
  const fresh = open('another-workspace'); assert.equal(fresh.get('customLabels.v1').a, 'Default label');
  assert.equal(open('same', '/different-codex-home').get('customLabels.v1'), undefined);
});

test('later workspace migration does not restore a globally removed rename or hide', async t => {
  const open = fixture(t), first = open();
  const global = state({ 'chatNames.v1': { a: 'Old' }, 'hiddenChats.v1': { a: 'Hidden' } });
  first.migrate(state({}), global);
  first.get('chatNames.v1'); await first.update('chatNames.v1', {});
  first.get('hiddenChats.v1'); await first.update('hiddenChats.v1', {});
  const later = open('later'); later.migrate(state({}), global);
  assert.deepEqual(later.get('chatNames.v1'), {});
  assert.deepEqual(later.get('hiddenChats.v1'), {});
});

test('refresh merges remote state while retaining pending local edits', async t => {
  const open = fixture(t), a = open(), b = open();
  const values = a.get('customLabels.v1', {}); values.a = 'Pending';
  await b.update('customLabels.v1', { b: 'Remote' });
  a.refreshInto('customLabels.v1', values);
  assert.deepEqual(values, { a: 'Pending', b: 'Remote' });
  await a.update('customLabels.v1', values);
  assert.deepEqual(b.get('customLabels.v1'), values);
});


test('custom palette keys are data even when they use JavaScript property names', async t => {
  const open=fixture(t),store=open();
  const palette=JSON.parse('{"__proto__":"#123456","constructor":"#654321"}');
  store.migrate(state({'customLabelColours.v1':palette}),state({}));
  const colours=store.get('customLabelColours.v1');
  assert.equal(Object.getPrototypeOf(colours),Object.prototype);
  assert.equal(colours.__proto__,'#123456');
  colours.__proto__='#abcdef';await store.update('customLabelColours.v1',colours);
  assert.equal(store.get('customLabelColours.v1').__proto__,'#abcdef');
});
