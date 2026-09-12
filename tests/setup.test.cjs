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
        if (name === './display-setup') { return { chatLabelsStatus: async () => ({ label: 'Off', detail: 'Enable labels' }), configureChatLabels: async () => { commands.push(['labels']); } }; }
        if (name === './model') { return require('../dist/model'); }
        return require(name);
      },
    });
    return { hub: () => exports.setUpCompanion(context), run: () => exports.setUpAgentHelper(context), offer: () => exports.offerRoutingSetup(context) };
  }
  return { home, messages, commands, picks, updates, fileChoices, values, state, api, reload, ...reload() };
}

test('Not Now allows one reminder on a later startup, then never asks again', async t => {
  const fixture = setup(t, { choices: ['Not Now', "Don't Ask Again"] });
  await fixture.offer();
  assert.equal(fixture.messages[0][2], 'Not Now');
  await fixture.reload().offer();
  assert.equal(fixture.messages[1][2], "Don't Ask Again");
  await fixture.reload().offer();
  assert.equal(fixture.messages.length, 2);
  assert.equal(fixture.updates.length, 0);
  assert.ok(!fs.existsSync(path.join(fixture.home, 'repo-companion')));
});

test('ignored invitations also stop after two startups; choosing setup ends reminders', async t => {
  const ignored = setup(t);
  await ignored.offer(); await ignored.reload().offer(); await ignored.reload().offer();
  assert.equal(ignored.messages.length, 2);
  const accepted = setup(t, { choices: ['Set Up'] });
  await accepted.offer(); await accepted.reload().offer();
  assert.equal(accepted.messages.length, 1);
  assert.deepEqual(accepted.commands, [['codexRepoCompanion.setUp']]);
});

test('invitations respect configured users, explicit off, remote and unfocused windows', async t => {
  const configured = setup(t, { values: { instructionRouting: true } });
  installer.installAgentHelper(installer.prepareAgentHelper(configured.home));
  await configured.offer();
  assert.equal(configured.messages.length, 0);
  const off = setup(t, { values: { instructionRouting: false } });
  await off.offer(); assert.equal(off.messages.length, 0);
  const remote = setup(t, { remoteName: 'ssh-remote' });
  await remote.offer(); assert.equal(remote.messages.length, 0);
  const background = setup(t); background.api.window.state.focused = false;
  await background.offer(); assert.equal(background.messages.length, 0);
});



test('both setup entry points open one page and stop reminders without writing settings', async t => {
  const fixture = setup(t);
  await fixture.hub(); await fixture.run(); await fixture.reload().offer();
  assert.deepEqual(fixture.commands, [['page'], ['page']]);
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.messages.length, 0);
  assert.deepEqual(fs.readdirSync(fixture.home), ['AGENTS.md']);
});

test('old invitation dismissals survive upgrades', async t => {
  const fixture = setup(t, { state: new Map([['routingInvitation.v1', { shown: 2, handled: true }]]) });
  await fixture.offer(); assert.equal(fixture.messages.length, 0);
});
