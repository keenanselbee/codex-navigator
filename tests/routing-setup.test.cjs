'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const installer = require('../dist/agent-helper');
function fixture(t) {
  const home = fs.mkdtempSync(path.join(__dirname, '../.codex-temp/routing-page-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.writeFileSync(path.join(home, 'AGENTS.md'), 'My instructions\n');
  const values = {}, updates = [];
  const api = { env: {}, workspace: { isTrusted: true, workspaceFolders: [{}], getConfiguration: () => ({
    get: (key, fallback) => values[key] ?? fallback,
    update: async (key, value) => { updates.push(key); values[key] = value; },
  }) }, ConfigurationTarget: { Workspace: 2 } };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/routing-setup.js'), 'utf8'), { exports,
    require: name => name === 'vscode' ? api : name.startsWith('./') ? require('../dist/' + name.slice(2)) : require(name) });
  const previous = exports.routingChoices(), plan = installer.prepareAgentHelper(home);
  return { home, values, updates, plan, api, save: value => exports.saveRoutingChoices(value, previous, plan) };
}

test('workspace routing stays automatic and preserves shared/global instructions', async t => {
  const f = fixture(t), shared = path.join(f.home, 'shared.md'); fs.writeFileSync(shared, 'Shared');
  await f.save({ main: shared, scopes: [], fallbackNames: ['TEAM.md'] });
  assert.deepEqual(Array.from(f.values.instructionScope), []);
  assert.equal(f.values.mainInstructionsFile, shared);
  assert.equal(f.updates.at(-1), 'instructionRouting');
  assert.equal(f.values.instructionRouting, true);
  assert.ok(fs.readFileSync(path.join(f.home, 'AGENTS.md'), 'utf8').startsWith('My instructions'));
  assert.equal(fs.readFileSync(shared, 'utf8'), 'Shared');
});

test('project-only and custom folder routing both save explicit choices', async t => {
  const f = fixture(t); await f.save({ main: '', scopes: [f.home], fallbackNames: [] });
  assert.equal(f.values.mainInstructionsFile, '');
  assert.deepEqual(Array.from(f.values.instructionScope), [f.home]);
});

test('invalid files, global-as-shared, relative scopes and invalid fallback names make no writes', async t => {
  for (const value of [{ main: 'missing' }, { main: 'GLOBAL' }, { scopes: ['relative'] }, { fallbackNames: ['../bad'] }]) {
    const f = fixture(t);
    if (value.main === 'GLOBAL') value.main = path.join(f.home, 'AGENTS.md');
    await assert.rejects(f.save({ main: '', scopes: [], fallbackNames: [], ...value }));
    assert.equal(f.updates.length, 0);
    assert.deepEqual(fs.readdirSync(f.home), ['AGENTS.md']);
  }
});

test('settings/global instruction changes and loss of workspace trust stop the page save', async t => {
  for (const change of ['settings', 'global', 'trust']) {
    const f = fixture(t);
    if (change === 'settings') f.values.mainInstructionsFile = 'Elsewhere';
    if (change === 'global') fs.writeFileSync(path.join(f.home, 'AGENTS.md'), 'Edited outside setup');
    if (change === 'trust') f.api.workspace.isTrusted = false;
    await assert.rejects(f.save({ main: '', scopes: [], fallbackNames: [] }));
    assert.equal(f.updates.length, 0);
    assert.ok(!fs.existsSync(path.join(f.home, 'repo-companion')));
  }
});
