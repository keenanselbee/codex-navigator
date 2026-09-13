'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { saveProfile, readProfiles, selectProfile, profileFilename } = require('../dist/routing-config');
const { RoutingPublisher, resolveRouting, instructionPaths } = require('../dist/routing');
const { prepareAgentHelper, installAgentHelper } = require('../dist/agent-helper');
const id = '00000000-0000-0000-0000-000000000010';

async function fixture(t) {
  const home = await fs.mkdtemp(path.join(__dirname, '..', '.codex-temp', 'routing-config-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const scope = path.join(home, 'repos'), repo = path.join(scope, 'first'), other = path.join(scope, 'second');
  for (const root of [repo, other]) {
    await fs.mkdir(root, { recursive: true });
    execFileSync('git', ['init', '--quiet', root], { windowsHide: true });
  }
  const sessions = path.join(home, 'sessions', '2026', '09', '12');
  await fs.mkdir(sessions, { recursive: true });
  await fs.writeFile(path.join(sessions, `rollout-${id}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { id, cwd: repo, source: 'vscode' } }));
  const main = path.join(home, 'shared.md');
  await fs.writeFile(main, 'Shared rules');
  const profile = { version: 1, workspace: path.join(home, 'collection.code-workspace'), enabled: true, scopes: [scope], main, fallbackNames: ['TEAM_GUIDE.md'] };
  return { home, scope, repo, other, main, profile };
}

test('explicit targets use durable routing after disposal and ignore stale chat labels', async t => {
  const { home, repo, other, main, profile } = await fixture(t);
  const publisher = new RoutingPublisher(home);
  t.after(() => publisher.dispose());
  await publisher.publish({ version: 2, pid: process.pid, main, profile, chats: { ['local/' + id]: [repo] } });
  assert.deepEqual((await resolveRouting(['--target', other], home, id)).roots, [other]);
  await publisher.publish({ version: 2, pid: process.pid, main, profile, chats: { ['local/' + id]: [] } });
  assert.deepEqual((await resolveRouting([], home, id)).roots, [], 'custom labels without a repository do not fabricate a root');
  assert.equal((await resolveRouting([], home, id)).status, 'unavailable');
  await publisher.dispose();
  const result = await resolveRouting(['--target', other], home, id);
  assert.equal(result.status, 'enabled');
  assert.equal(result.instructions[0], main);
  assert.equal((await resolveRouting([], home, id)).status, 'unavailable', 'no target is invented from saved metadata');
  assert.equal((await resolveRouting(['--target', home], home, id).catch(() => ({ invalid: true }))).invalid, true, 'explicit target must be an exact Git root');
  await assert.rejects(resolveRouting(['--target', repo], home, 'not-a-thread'), /verified/);
});

test('disabled state survives closing a window and remains distinct from missing configuration', async t => {
  const { home, repo, main, profile } = await fixture(t);
  assert.equal((await resolveRouting(['--target', repo], home, id)).status, 'unavailable');
  const publisher = new RoutingPublisher(home);
  await publisher.publish({ version: 2, pid: process.pid, main, profile: { ...profile, enabled: false }, chats: { ['local/' + id]: [repo] } });
  assert.equal((await resolveRouting([], home, id)).status, 'disabled');
  await publisher.dispose();
  const result = await resolveRouting(['--target', repo], home, id);
  assert.equal(result.status, 'disabled');
  assert.equal(result.instructions, undefined);
});

test('scopes use directory boundaries, specific overrides and explicit conflict refusal', async t => {
  const { home, scope, repo, other, profile } = await fixture(t);
  assert.equal(selectProfile(scope + '-unrelated', [profile]), undefined);
  const narrow = { ...profile, workspace: path.join(home, 'narrow.code-workspace'), scopes: [repo], enabled: false };
  assert.equal(selectProfile(repo, [profile, narrow]).enabled, false);
  assert.equal(selectProfile(other, [profile, narrow]).enabled, true);
  assert.throws(() => selectProfile(repo, [profile, { ...profile, workspace: narrow.workspace, enabled: false }]), /disagree/);
  assert.throws(() => selectProfile(repo, [profile], [profile, { ...profile, main: '' }]), /disagree/);
  assert.equal(selectProfile(repo, [profile], [{ ...profile, enabled: false }]).enabled, false, 'live state supersedes its saved copy');
  await saveProfile(home, profile);
  await saveProfile(home, { ...profile, workspace: narrow.workspace, main: '' });
  await assert.rejects(resolveRouting(['--target', repo], home, id), /disagree/);
});

test('fallback filenames work in nested directories and never override standard instruction names', async t => {
  const { repo, main } = await fixture(t);
  const nested = path.join(repo, 'src');
  await fs.mkdir(nested);
  const fallback = path.join(repo, 'TEAM_GUIDE.md'), nestedFallback = path.join(nested, 'TEAM_GUIDE.md');
  await fs.writeFile(fallback, 'Repository rules');
  await fs.writeFile(nestedFallback, 'Nested rules');
  assert.deepEqual((await instructionPaths(main, [repo], [path.join(nested, 'code.ts')], ['TEAM_GUIDE.md'])).slice(-2), [fallback, nestedFallback]);
  await fs.writeFile(path.join(repo, 'AGENTS.md'), 'Standard rules');
  await fs.writeFile(path.join(nested, 'AGENTS.override.md'), 'Override rules');
  const result = await instructionPaths(main, [repo], [path.join(nested, 'code.ts')], ['TEAM_GUIDE.md']);
  assert.ok(!result.includes(fallback) && !result.includes(nestedFallback));
  await assert.rejects(instructionPaths(main, [repo], [], ['../outside.md']), /plain filenames/);
});

test('saved configuration is idempotent, bounded, validated and rejects corruption', async t => {
  const { home, repo, profile } = await fixture(t);
  await saveProfile(home, profile);
  const filename = profileFilename(home, profile.workspace);
  const before = await fs.stat(filename);
  await saveProfile(home, profile);
  assert.equal((await fs.stat(filename)).mtimeMs, before.mtimeMs);
  assert.deepEqual(await readProfiles(home), [profile]);
  await assert.rejects(saveProfile(home, { ...profile, scopes: ['relative'] }), /Invalid saved/);
  await assert.rejects(resolveRouting(['--target', repo], home, id), /invalid saved routing/);
  await saveProfile(home, profile);
  assert.equal((await resolveRouting(['--target', repo], home, id)).enabled, true);
  await fs.writeFile(filename, '{broken');
  await assert.rejects(resolveRouting(['--target', repo], home, id), SyntaxError);
  await fs.writeFile(filename, JSON.stringify({ ...profile, fallbackNames: ['../../rules'] }));
  await assert.rejects(readProfiles(home), /plain filenames/);
});

test('managed guidance and readable saved settings survive a missing routing helper', async t => {
  const { home, repo, main, profile } = await fixture(t);
  await saveProfile(home, profile);
  const plan = prepareAgentHelper(home);
  installAgentHelper(plan);
  await fs.unlink(path.join(home, 'codex-navigator', 'routing.js'));
  const guidance = await fs.readFile(plan.instructions, 'utf8');
  const fallbackFile = path.join(home, 'codex-navigator', 'fallback.md');
  assert.ok(guidance.includes(fallbackFile));
  assert.ok(!guidance.includes('fallbackNames'), 'detailed recovery is not loaded into every chat');
  const fallback = await fs.readFile(fallbackFile, 'utf8');
  assert.ok(fallback.includes(path.join(home, 'codex-navigator', 'routing-config')));
  assert.ok(fallback.includes('enabled: false'));
  assert.ok(fallback.includes('AGENTS.override.md') && fallback.includes('fallbackNames'));
  const selected = selectProfile(repo, await readProfiles(home));
  assert.equal(selected.main, main);
  assert.equal(await fs.readFile(selected.main, 'utf8'), 'Shared rules');
  await saveProfile(home, { ...profile, enabled: false });
  assert.equal(selectProfile(repo, await readProfiles(home)).enabled, false);
  await fs.unlink(main);
  await saveProfile(home, profile);
  await assert.rejects(resolveRouting(['--target', repo], home, id), /ENOENT/);
});


test('routing readiness validates the shared file of a more specific selected profile', async t => {
  const { home, repo, main, profile } = await fixture(t);
  const { routingStatus } = require('../dist/routing-status');
  const specific = { ...profile, workspace: path.join(home, 'specific.code-workspace'), scopes: [repo], main: path.join(home, 'specific.md') };
  await saveProfile(home, profile); await saveProfile(home, specific);
  installAgentHelper(prepareAgentHelper(home));
  const plan = prepareAgentHelper(home);
  const choices = { enabled: true, main, scopes: profile.scopes, fallbackNames: profile.fallbackNames };
  const status = () => routingStatus(plan, choices, profile.workspace, profile.scopes, [repo]);
  assert.equal((await status()).label, 'Needs attention'); // Missing selected shared file.
  await fs.writeFile(specific.main, '');
  assert.equal((await status()).label, 'Needs attention');
  await fs.writeFile(specific.main, 'Specific shared rules');
  assert.equal((await status()).label, 'Ready');
  await saveProfile(home, { ...specific, main: repo });
  assert.equal((await status()).label, 'Needs attention'); // A directory is not a rules file.
  await saveProfile(home, { ...specific, enabled: false });
  assert.match((await status()).detail, /Routing is off/);
});

test('installed routing resolves shared and nested instructions with no bridge or live chat association', async t => {
  const { home, repo, main, profile } = await fixture(t);
  await saveProfile(home, profile);
  installAgentHelper(prepareAgentHelper(home));
  const nested = path.join(repo, 'src'); await fs.mkdir(nested);
  const projectRules = path.join(repo, 'AGENTS.md'), nestedRules = path.join(nested, 'AGENTS.override.md');
  await fs.writeFile(projectRules, 'Project rules'); await fs.writeFile(nestedRules, 'Nested rules');
  const result = JSON.parse(execFileSync(process.execPath, [path.join(home, 'codex-navigator', 'routing.js'),
    '--target', repo, '--file', path.join(nested, 'index.ts')], {
    env: { ...process.env, CODEX_HOME: home, CODEX_THREAD_ID: id }, windowsHide: true, encoding: 'utf8',
  }));
  assert.equal(result.status, 'enabled');
  assert.deepEqual(result.instructions, [main, path.join(home, 'AGENTS.md'), projectRules, nestedRules]);
  await assert.rejects(fs.access(path.join(home, 'codex-navigator', 'routing')));
  const { routingStatus } = require('../dist/routing-status');
  const plan = prepareAgentHelper(home);
  const choices = { enabled: true, main, scopes: profile.scopes, fallbackNames: profile.fallbackNames };
  assert.equal((await routingStatus(plan, choices, profile.workspace, profile.scopes, [repo])).label, 'Ready');
  await fs.unlink(path.join(home, 'codex-navigator', 'model.js'));
  assert.equal((await routingStatus(plan, choices, profile.workspace, profile.scopes, [repo])).label, 'Needs attention');
  assert.equal((await routingStatus(plan, { ...choices, enabled: false }, profile.workspace, profile.scopes, [repo])).label, 'Off');
});
