'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const installer = require('../dist/agent-helper');

function setup(t, options = {}) {
  const home = fs.mkdtempSync(path.join(__dirname, '..', '.codex-temp', 'setup-command-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.writeFileSync(path.join(home, 'AGENTS.md'), 'User instructions\n');
  const messages = [], commands = [], picks = [], updates = [], fileChoices = [];
  const choices = options.choices ?? [], pickChoices = options.picks ?? [];
  const values = { ...(options.values ?? {}) };
  const state = options.state ?? new Map();
  const context = { globalState: { get: (key, fallback) => state.get(key) ?? fallback, update: async (key, value) => { state.set(key, value); } } };
  const config = {
    get: (key, fallback) => values[key] ?? fallback,
    inspect: key => ({ workspaceValue: values[key] }),
    update: async (key, value, target) => { updates.push([key, value, target]); values[key] = value; },
  };
  const api = {
    env: { remoteName: options.remoteName },
    workspace: { isTrusted: true, workspaceFolders: [{ uri: { scheme: 'file', fsPath: home } }], getConfiguration: () => config },
    window: {
      state: { focused: true },
      withProgress: async (_options, action) => action(),
      showInformationMessage: async (...args) => { messages.push(args); options.onMessage?.(args, values); return choices.shift(); },
      showQuickPick: async (items, args) => { picks.push([items, args]); const choice = pickChoices.shift(); return items.find(item => item.value === choice); },
      showOpenDialog: async () => fileChoices.shift(),
    },
    ProgressLocation: { Window: 1 },
    ConfigurationTarget: { Workspace: 2 },
    commands: { executeCommand: async (...args) => { commands.push(args); } },
  };
  function reload() {
    const exports = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'setup.js'), 'utf8'), {
      exports,
      require: name => {
        if (name === 'vscode') { return api; }
        if (name === './agent-helper') { return { ...installer, prepareAgentHelper: () => installer.prepareAgentHelper(home) }; }
        if (name === './setup-page') { return { openSetupPage: async () => commands.push(['page']) }; }
        if (name === './model') { return require('../dist/model'); }
        return require(name);
      },
    });
    return { hub: () => exports.setUpNavigator(context), run: () => exports.setUpAgentHelper(context) };
  }
  return { home, messages, commands, picks, updates, fileChoices, values, state, api, reload, ...reload() };
}

test('both setup entry points open the page without enabling features or rewriting instructions', async t => {
  const f = setup(t);
  await f.hub(); await f.run();
  assert.deepEqual(f.commands, [['page'], ['page']]);
  assert.equal(f.updates.length, 0);
  assert.equal(f.messages.length, 0);
  assert.equal(f.state.get('navigatorWelcome.v1'), true);
  assert.deepEqual(fs.readdirSync(f.home), ['AGENTS.md']);
});

test('setup requires a trusted local workspace before changing onboarding state', async t => {
  const f = setup(t, { remoteName: 'ssh-remote' });
  await assert.rejects(f.run(), /trusted local/);
  f.api.env.remoteName = undefined; f.api.workspace.isTrusted = false;
  await assert.rejects(f.run(), /trusted local/);
  f.api.workspace.isTrusted = true; f.api.workspace.workspaceFolders = [];
  await assert.rejects(f.run(), /trusted local/);
  assert.equal(f.state.size, 0); assert.equal(f.commands.length, 0);
});
