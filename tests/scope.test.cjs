'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { SessionIndex, sessionThreadId, readScopeReport, writeScopeReport, parseScopeReport } = require('../dist/scope-store');
const { reportScope } = require('../dist/report-scope');
const { scopeAssignment, effectiveMode } = require('../dist/scope');
const { correctScope } = require('../tools/correct-chat-scope.cjs');

const a = '00000000-0000-0000-0000-000000000001';
const b = '00000000-0000-0000-0000-000000000002';
async function fixture() {
  const root = await fs.mkdtemp(path.join(__dirname, '..', '.codex-temp', 'scope-'));
  const repo = path.join(root, 'Parent');
  await fs.mkdir(repo);
  execFileSync('git', ['init', '--quiet', repo], { windowsHide: true });
  const directory = path.join(root, 'sessions', '2026', '09', '11');
  await fs.mkdir(directory, { recursive: true });
  for (const id of [a, b]) {
    await fs.writeFile(path.join(directory, `rollout-${id}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { id, cwd: repo, source: 'vscode' } }) + '\nNOT VALID TRANSCRIPT JSON');
  }
  return { root, repo, directory };
}

test('legacy manual labels remain pinned while directory guesses remain automatic', () => {
  assert.equal(effectiveMode(undefined, { root: 'file:/a', label: 'A' }), 'pinned');
  assert.equal(effectiveMode(undefined, { root: 'file:/a', label: 'A', source: 'directory' }), 'auto');
});

test('three labels and overflow preserve primary identity and all tooltip members', () => {
  const roots = ['One', 'Two', 'Three', 'Four'].map(name => ({ root: 'file:/' + name, fsPath: path.resolve(name) }));
  const three = scopeAssignment(roots.slice(0, 3), 'agent', []);
  assert.equal(three.label, 'One \u00b7 Two \u00b7 Three');
  const four = scopeAssignment(roots, 'agent', []);
  assert.equal(four.label, 'One \u00b7 Two \u00b7 +2');
  assert.equal(four.root, roots[0].root);
  assert.equal(four.members.length, 4);
});

test('helper reports for two conversation IDs independently and suppresses identical writes', async () => {
  const f = await fixture();
  const index = new SessionIndex(f.root);
  assert.equal((await index.get(a)).cwd, f.repo);
  await Promise.all([reportScope([f.repo], f.root, a), reportScope(['--clear'], f.root, b)]);
  assert.equal((await readScopeReport(f.root, a)).roots.length, 1);
  assert.deepEqual((await readScopeReport(f.root, b)).roots, []);
  assert.equal(await reportScope([f.repo], f.root, a), false);
  await assert.rejects(reportScope([f.repo], f.root, '../wrong'), /verified/);
  await assert.rejects(reportScope([path.dirname(f.repo)], f.root, a));
});

test('subagent metadata, mismatched identity, and malformed reports fail closed', async () => {
  const f = await fixture();
  await fs.writeFile(path.join(f.directory, `rollout-${b}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { id: b, cwd: f.repo, source: { subagent: {} } } }));
  await assert.rejects(reportScope([f.repo], f.root, b), /verified/);
  assert.equal(parseScopeReport({ version: 1, threadId: b, roots: [f.repo], reportedAt: Date.now() }, a), undefined);
  assert.equal(parseScopeReport({ version: 1, threadId: a, roots: ['relative'], reportedAt: Date.now() }, a), undefined);
  await writeScopeReport(f.root, a, []);
  await fs.writeFile(path.join(f.root, 'codex-navigator', 'reports', a + '.json'), '{partial');
  assert.equal(await readScopeReport(f.root, a), undefined);
});

test('user correction stays separate and a fresh identical agent report can supersede it', async () => {
  const f = await fixture();
  await reportScope([f.repo], f.root, a);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(await correctScope(a, ['--clear'], f.root), true);
  const correction = await readScopeReport(f.root, a, 'corrections');
  assert.deepEqual(correction.roots, []);
  assert.equal((await readScopeReport(f.root, a)).roots.length, 1);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(await reportScope([f.repo], f.root, a), true);
  assert.ok((await readScopeReport(f.root, a)).reportedAt > correction.reportedAt);
  await assert.rejects(correctScope('../wrong', [f.repo], f.root), /existing local/);
});

test('rotated filenames retain the conversation identity for indexing and watchers', () => {
  for (const name of [
    'rollout-2026-09-27T18-28-24-' + a + '_' + b + '.jsonl',
    '2026/09/27/rollout-2026-09-27T18-28-24-' + a + '_' + b + '.jsonl',
    'rollout-' + a + '.jsonl'
  ]) assert.equal(sessionThreadId(name), a);
  assert.equal(sessionThreadId('rollout-' + a + '_invalid.jsonl'), undefined);
});

test('activity follows the newest rotated transcript on cold and cached reads', async () => {
  const { TranscriptActivity } = require('../dist/activity-events');
  const f = await fixture(), index = new SessionIndex(f.root);
  const original = path.join(f.directory, 'rollout-' + a + '.jsonl');
  const old = path.join(f.directory, 'rollout-2026-09-25T22-03-10-' + a + '.jsonl');
  await fs.rename(original, old);
  assert.equal(await index.fileFor(a), old);
  const now = Date.now(), timestamp = new Date(now).toISOString();
  const newerDirectory = path.join(f.root, 'sessions', '2026', '09', '27');
  await fs.mkdir(newerDirectory);
  const current = path.join(newerDirectory, 'rollout-2026-09-27T18-28-24-' + a + '_' + b + '.jsonl');
  await fs.writeFile(current, [
    { type: 'session_meta', payload: { id: a, cwd: f.repo, source: 'vscode' } },
    { timestamp, type: 'event_msg', payload: { type: 'task_started', turn_id: b } }
  ].map(record => JSON.stringify(record)).join('\n') + '\n');
  await fs.utimes(old, new Date(now + 10000), new Date(now + 10000));
  index.invalidate();
  assert.equal(await index.fileFor(a), current);
  assert.equal(await new SessionIndex(f.root).fileFor(a), current);
  assert.equal((await new TranscriptActivity().read(await index.fileFor(a), now)).status, 'working');
  // A missed watcher event still refreshes after the index TTL.
  await fs.unlink(current);
  const originalNow = Date.now;
  try {
    Date.now = () => now + 31000;
    assert.equal(await index.fileFor(a), old);
  } finally { Date.now = originalNow; }
  await fs.rm(f.root, { recursive: true, force: true });
});
