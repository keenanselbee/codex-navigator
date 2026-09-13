'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { SessionIndex, readScopeReport, writeScopeReport, parseScopeReport } = require('../dist/scope-store');
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
