const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual command closures with isolated metadata and picker boundaries.
function fixture(label) {
  const source = ts.createSourceFile('extension.ts', fs.readFileSync(path.join(__dirname, '../src/extension.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const functions = {};
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && ['assign', 'setCustomLabel'].includes(node.name?.text)) functions[node.name.text] = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  class Uri {
    constructor(value) { this.value = value; this.scheme = value.startsWith('file:') ? 'file' : 'openai-codex'; this.fsPath = value.replace('file://', ''); }
    toString() { return this.value; }
    static parse(value) { return new Uri(value); }
  }
  const a = new Uri('file:///project-a'), b = new Uri('file:///project-b');
  const customLabels = label ? { chat: label } : {}, customRouting = {}, assignments = {}, modes = {};
  let choose = items => items.find(item => item.assignment), choices;
  const context = {
    vscode: { Uri, window: { showQuickPick: async items => { choices = items; return choose(items); } },
      workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) } },
    git: { repositories: [a, b].map(rootUri => ({ rootUri })) },
    syncMetadata: async () => {}, conversationKey: () => 'chat', chat: () => ({ key: 'chat' }),
    repositoryNames: () => ({}), repositoryLabel: root => root, sameRoot: (a,b) => a===b,
    license: { allowed: () => true }, disposed: false, customLabels, customRouting, assignments, modes,
    profiles: { update: async () => {} }, saveManualChoice: async (_key, repository) => { modes.chat = repository ? 'auto' : 'pinned'; },
    knownKeys: new Set(), modeKey: 'repositoryModes.v1', assignmentKey: 'repositoryAssignments.v1', refresh() {}, queue: Promise.resolve(),
    customLabelError: () => undefined, labelColourKey: s => s.toLowerCase(), colourFor: () => ({ colour: '#123456' }), labelColours: {},
    effectiveMode: mode => mode || 'auto',
  };
  const bind = name => vm.runInNewContext(ts.transpileModule('(' + functions[name] + ')', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { assign: bind('assign'), label: bind('setCustomLabel'), customLabels, customRouting, assignments, modes, a, b,
    pick: fn => { choose = fn; }, get choices() { return choices; } };
}

test('Choose Repository changes association without replacing custom text and can remove only the association', async () => {
  const f = fixture('Website polish');
  await f.assign(undefined, f.b);
  assert.equal(f.customLabels.chat, 'Website polish'); assert.equal(f.customRouting.chat, '/project-b');
  assert.equal(f.modes.chat, 'pinned');
  f.pick(items => items.find(item => !item.assignment)); await f.assign();
  assert.equal(f.customLabels.chat, 'Website polish'); assert.equal(f.customRouting.chat, undefined);
  assert.equal(f.assignments.chat, undefined);
});

test('repository-first then custom label retains the primary project; cancelled choices preserve state', async () => {
  const f = fixture();
  await f.assign(undefined, f.a); await f.label(undefined, 'Website polish');
  assert.equal(f.customRouting.chat, '/project-a'); assert.equal(f.customLabels.chat, 'Website polish');
  f.pick(() => undefined); await f.assign();
  assert.equal(f.customRouting.chat, '/project-a'); assert.equal(f.customLabels.chat, 'Website polish');
  await f.label(undefined, 'New label'); assert.equal(f.customRouting.chat, '/project-a');
});

test('separate association command is absent from menu and command contributions', () => {
  const p = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  assert.ok(!p.contributes.commands.some(c => /associateLabelRepository|sidebar\.associate$/.test(c.command)));
  assert.ok(!p.contributes.menus['webview/context'].some(c => c.command.endsWith('.associate')));
});
