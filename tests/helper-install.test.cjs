'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { prepareAgentHelper, installAgentHelper, prepareLabelHelper, labelHelperStatus } = require('../dist/agent-helper');

test('Unix guidance preserves backticks inside Markdown code spans without writing files', () => {
  const vm = require('node:vm');
  for (const platformName of ['darwin', 'linux']) {
    const platform = {}, helper = {};
    vm.runInNewContext(fs.readFileSync(require.resolve('../dist/platform'), 'utf8'), {
      exports: platform, process: { platform: platformName, arch: 'arm64' }, require: name => name === 'node:path' ? path.posix : require(name),
    });
    vm.runInNewContext(fs.readFileSync(require.resolve('../dist/agent-helper'), 'utf8'), {
      exports: helper, __dirname: '/extension/dist', Buffer,
      require: name => name === 'node:fs' ? { existsSync: () => false, readFileSync: () => Buffer.from('fixture') }
        : name === 'node:path' ? path.posix : name === './platform' ? platform : name === './scope-store' ? {} : require(name),
    });
    const home = '/Users/one`two``three';
    for (const plan of [helper.prepareAgentHelper(home), helper.prepareLabelHelper(home)]) {
      const match = plan.after.match(/run (`+) (node .+?) \1\./);
      assert.ok(match, 'entire command occupies one Markdown code span');
      assert.equal(match[1], '```'); assert.ok(match[2].includes(home));
      assert.ok(!match[2].includes('```'), 'delimiter is longer than any run in the command');
    }
  }
});

test('setup preview makes no writes and refuses instruction changes before installation', t => {
  const root = fs.mkdtempSync(path.join(__dirname, '..', '.codex-temp', 'helper-preview-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const instructions = path.join(root, 'AGENTS.md');
  fs.writeFileSync(instructions, 'User rules\n');
  const plan = prepareAgentHelper(root);
  assert.deepEqual(fs.readdirSync(root), ['AGENTS.md']);
  assert.equal(fs.readFileSync(instructions, 'utf8'), 'User rules\n');
  fs.writeFileSync(instructions, 'Edited while reviewing\n');
  assert.throws(() => installAgentHelper(plan), /changed during setup/);
  assert.equal(fs.readFileSync(instructions, 'utf8'), 'Edited while reviewing\n');
  assert.ok(!fs.existsSync(path.join(root, 'codex-navigator')));
  const second = prepareAgentHelper(root);
  fs.writeFileSync(path.join(root, 'AGENTS.override.md'), 'New effective override\n');
  assert.throws(() => installAgentHelper(second), /changed during setup/);
});

test('setup rejects malformed markers without installing helper files', t => {
  const root = fs.mkdtempSync(path.join(__dirname, '..', '.codex-temp', 'helper-markers-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const content of [
    '<!-- codex-navigator:start -->',
    '<!-- codex-navigator:end -->\n<!-- codex-navigator:start -->',
    '<!-- codex-navigator:start --><!-- codex-navigator:end -->'.repeat(2),
  ]) {
    fs.writeFileSync(path.join(root, 'AGENTS.md'), content);
    assert.throws(() => prepareAgentHelper(root), /Ambiguous/);
    assert.ok(!fs.existsSync(path.join(root, 'codex-navigator')));
    assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), content);
  }
});

test('one-time setup preserves instructions, uses the effective override, and is idempotent', () => {
  const root = fs.mkdtempSync(path.join(__dirname, '..', '.codex-temp', 'helper-install-'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Original global rules\n');
  fs.writeFileSync(path.join(root, 'AGENTS.override.md'), 'Active override rules\n');
  const install = () => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'install-agent-helper.cjs'), root], { encoding: 'utf8', windowsHide: true }));
  assert.equal(install().changed, true);
  assert.equal(install().changed, false);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), 'Original global rules\n');
  const override = fs.readFileSync(path.join(root, 'AGENTS.override.md'), 'utf8');
  assert.ok(override.startsWith('Active override rules'));
  assert.equal(override.split('<!-- codex-navigator:start -->').length, 2);
  assert.equal(fs.readFileSync(path.join(root, 'codex-navigator', 'AGENTS.override.md.before-setup'), 'utf8'), 'Active override rules\n');
  assert.ok(fs.existsSync(path.join(root, 'codex-navigator', 'report-scope.js')));
});

test('upgrading guidance keeps surrounding user rules and installs recovery separately', t => {
  const root = fs.mkdtempSync(path.join(__dirname, '..', '.codex-temp', 'helper-upgrade-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const instructions = path.join(root, 'AGENTS.md');
  const prefix = '# My rules\r\n\r\nKeep this exactly.\r\n';
  const suffix = '\r\n\r\n## More rules\r\nKeep these too.\r\n';
  const before = prefix + '<!-- codex-navigator:start -->\nOld detailed routing guidance.\n<!-- codex-navigator:end -->' + suffix;
  fs.writeFileSync(instructions, before);
  const plan = prepareAgentHelper(root);
  assert.equal(fs.existsSync(path.join(root, 'codex-navigator')), false);
  installAgentHelper(plan);
  const after = fs.readFileSync(instructions, 'utf8');
  assert.ok(after.startsWith(prefix) && after.endsWith(suffix));
  assert.ok(!after.includes('Old detailed'));
  assert.ok(after.includes(path.join(root, 'codex-navigator', 'fallback.md')));
  assert.equal(fs.readFileSync(path.join(root, 'codex-navigator', 'AGENTS.md.before-setup'), 'utf8'), before);
  const fallback = path.join(root, 'codex-navigator', 'fallback.md');
  const contents = fs.readFileSync(fallback, 'utf8');
  assert.ok(contents.includes('deepest matching scope') && contents.includes('Equally specific profiles must agree'));
  assert.ok(contents.includes('enabled: false') && contents.includes('ordinary project instruction discovery'));
  fs.unlinkSync(fallback);
  assert.equal(installAgentHelper(prepareAgentHelper(root)).changed, false);
  assert.equal(fs.readFileSync(fallback, 'utf8'), contents, 're-running setup repairs a missing fallback guide');
  assert.equal(fs.readFileSync(instructions, 'utf8'), after);
  assert.equal(fs.readFileSync(path.join(root, 'codex-navigator', 'AGENTS.md.before-setup'), 'utf8'), before);
});

test('labels install independently, preserve routing and user rules, and can be removed separately', t => {
  const home = fs.mkdtempSync(path.join(__dirname, '..', '.codex-temp', 'labels-install-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = path.join(home, 'AGENTS.md'); fs.writeFileSync(file, 'My rules\n');
  installAgentHelper(prepareLabelHelper(home));
  let text = fs.readFileSync(file, 'utf8');
  assert.ok(text.startsWith('My rules')); assert.ok(!text.includes('codex-navigator:start'));
  assert.ok(text.includes('acknowledgement-only')); assert.ok(!fs.existsSync(path.join(home,'codex-navigator/routing.js')));
  assert.equal(labelHelperStatus(home).installed,true);
  assert.equal(installAgentHelper(prepareLabelHelper(home)).changed,false);
  installAgentHelper(prepareAgentHelper(home));
  text = fs.readFileSync(file, 'utf8');
  const routing = text.slice(text.indexOf('<!-- codex-navigator:start -->'));
  assert.ok(!routing.includes('After identifying/changing scope'));
  installAgentHelper(prepareLabelHelper(home,false));
  text = fs.readFileSync(file, 'utf8');
  assert.ok(!text.includes('codex-navigator-labels:start')); assert.ok(text.endsWith(routing));
  assert.equal(labelHelperStatus(home).installed,false);
});

test('label setup refuses malformed owned markers and detects missing installed files', t => {
  const home = fs.mkdtempSync(path.join(__dirname, '..', '.codex-temp', 'labels-markers-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = path.join(home, 'AGENTS.md');
  fs.writeFileSync(file, '<!-- codex-navigator-labels:start -->');
  assert.throws(() => prepareLabelHelper(home), /Ambiguous/);
  assert.throws(() => prepareLabelHelper(home,false), /Ambiguous/);
  assert.equal(fs.existsSync(path.join(home,'codex-navigator')),false);
  fs.writeFileSync(file, ''); installAgentHelper(prepareLabelHelper(home));
  fs.unlinkSync(path.join(home,'codex-navigator/report-scope.js'));
  assert.equal(labelHelperStatus(home).installed,false);
});
