'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { detectDiscussion, DiscussionReader } = require('../dist/discussion');
const projects = [
  { root: 'parent', names: ['Context Suite'] },
  { root: 'private', names: ['proprietary', 'Context Suite - Private'] },
  { root: 'website', names: ['keenanselbee.com'] },
];

test('explicit latest focus replaces previous projects and tolerates one small name typo', () => {
  assert.deepEqual(detectDiscussion('lets focus on context suire reply ok', projects), ['parent']);
  assert.deepEqual(detectDiscussion('Can you look at Context Suite', projects), ['parent']);
  assert.deepEqual(detectDiscussion('lets focsu on propietary repo reply ok', projects), ['private']);
  assert.deepEqual(detectDiscussion("Let's focus on Context Suite. Now switch to keenanselbee.com", projects), ['website']);
  assert.deepEqual(detectDiscussion('Work on the repo', projects), undefined);
  assert.deepEqual(detectDiscussion('Please focus on the Context Suite - Private project', projects), ['private']);
});

test('only projects explicitly discussed together receive multiple labels', () => {
  assert.deepEqual(detectDiscussion('Focus on Context Suite and proprietary', projects), ['parent', 'private']);
  assert.deepEqual(detectDiscussion('Focus on proprietary, Context Suite', projects), ['private', 'parent']);
  assert.deepEqual(detectDiscussion('Focus on Context Suite using proprietary as a reference', projects), ['parent']);
  assert.equal(detectDiscussion('Focus on Context Suite and an unknown project', projects), undefined);
});

test('incidental mentions, negations, examples and instruction attachments do not select a project', () => {
  for (const text of ['Context Suite has many files', "Don't focus on Context Suite", 'If we focus on Context Suite, what happens?', '"Focus on Context Suite" is an example', '> Focus on Context Suite', '```\nFocus on Context Suite\n```', '# AGENTS.md instructions\nFocus on Context Suite', '<environment_context>\nFocus on Context Suite']) {
    assert.equal(detectDiscussion(text, projects), undefined, text);
  }
  assert.deepEqual(detectDiscussion('# Context from my IDE setup:\nFocus on proprietary\n## My request:\nSwitch to Context Suite', projects), ['parent']);
});

test('duplicate names and fuzzy ties are ambiguous, while full names disambiguate', () => {
  const duplicate = [...projects, { root: 'other', names: ['proprietary', 'Other Private'] }];
  assert.equal(detectDiscussion('Focus on proprietary', duplicate), undefined);
  assert.deepEqual(detectDiscussion('Focus on Context Suite - Private', duplicate), ['private']);
  assert.equal(detectDiscussion('Focus on ct', [{ root: 'short', names: ['CS'] }]), undefined);
});

test('incremental reader handles partial writes, ignores assistant/tool text, and retains latest user focus', async () => {
  const directory = await fs.mkdtemp(path.join(__dirname, '../.codex-temp/discussion-'));
  const file = path.join(directory, 'chat.jsonl');
  const id = '00000000-0000-0000-0000-000000000001';
  const row = (role, text, time) => JSON.stringify({ type: 'response_item', timestamp: new Date(time).toISOString(), payload: { type: 'message', role, content: [{ type: 'input_text', text }] } });
  const now = Date.now() - 10000;
  await fs.writeFile(file, row('user', 'Focus on Context Suite', now) + '\n');
  const reader = new DiscussionReader();
  assert.deepEqual((await reader.read(file, id, projects)).roots, ['parent']);
  await fs.appendFile(file, row('assistant', 'Focus on proprietary', now + 1) + '\n');
  assert.deepEqual((await reader.read(file, id, projects)).roots, ['parent']);
  const next = row('user', 'Switch to proprietary', now + 2);
  await fs.appendFile(file, next.slice(0, 40));
  assert.deepEqual((await reader.read(file, id, projects)).roots, ['parent']);
  await fs.appendFile(file, next.slice(40) + '\n');
  assert.deepEqual((await reader.read(file, id, projects)).roots, ['private']);
  await fs.appendFile(file, row('user', 'Thanks', now + 3) + '\n');
  assert.deepEqual((await reader.read(file, id, projects)).roots, ['private']);
});

test('reader starts from a bounded tail and does not treat truncated records as user messages', async () => {
  const directory = await fs.mkdtemp(path.join(__dirname, '../.codex-temp/discussion-'));
  const file = path.join(directory, 'large.jsonl');
  const id = '00000000-0000-0000-0000-000000000001';
  const make = text => JSON.stringify({ type: 'response_item', timestamp: new Date().toISOString(), payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }) + '\n';
  await fs.writeFile(file, make('Focus on proprietary') + 'x'.repeat(2 * 1024 * 1024) + '\n' + make('Focus on Context Suite'));
  assert.deepEqual((await new DiscussionReader().read(file, id, projects)).roots, ['parent']);
});


test('repository aliases are additional detection names, with ambiguity still rejected', () => {
  const {projectNames}=require('../dist/discussion');
  const path=require('node:path');const root=path.resolve('parent/private'),other=path.resolve('other');
  const projects=projectNames([root,other],[{fsPath:root,name:'Private Project'}]);
  assert.deepEqual(detectDiscussion('Focus on Private Project',projects),[root]);
  assert.deepEqual(detectDiscussion('Focus on private',projects),[root]);
  const ambiguous=projectNames([root,other],[{fsPath:root,name:'Private Project'},{fsPath:other,name:'Private Project'}]);
  assert.equal(detectDiscussion('Focus on Private Project',ambiguous),undefined);
});

test('acknowledgement focus tolerates the reported cue and name typos',()=>{
 assert.deepEqual(detectDiscussion('lelts talk about keenansellbee.com reply ok',projects),['website']);
 assert.deepEqual(detectDiscussion('ltes focus on Context Suite',projects),['parent']);
 assert.deepEqual(detectDiscussion('Focus on "Context Suite"',projects),['parent']);
 for(const text of ['"Previous request:\nlelts talk about keenansellbee.com\nreply ok"\nWhy did this fail?', 'Example: "Switch to proprietary. Focus on Context Suite"', 'Do not update metadata. Focus on Context Suite', 'Focus on Context Suite; read-only', 'AUDIT\nFocus on Context Suite', 'Focus on Context Suite, no changes', "Focus on Context Suite but don't write anything"])
  assert.equal(detectDiscussion(text,projects),undefined,text);
});

test('smart apostrophes preserve explicit no-write restrictions',()=>{
 assert.equal(detectDiscussion('Focus on Context Suite but don\u2019t change metadata',projects),undefined);
});
