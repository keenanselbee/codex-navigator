'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { prepareAgentHelper, installAgentHelper } = require('../dist/agent-helper');

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
  assert.ok(!fs.existsSync(path.join(root, 'repo-companion')));
  const second = prepareAgentHelper(root);
  fs.writeFileSync(path.join(root, 'AGENTS.override.md'), 'New effective override\n');
  assert.throws(() => installAgentHelper(second), /changed during setup/);
});

test('setup rejects malformed markers without installing helper files', t => {
  const root = fs.mkdtempSync(path.join(__dirname, '..', '.codex-temp', 'helper-markers-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const content of [
    '<!-- codex-repo-companion:start -->',
    '<!-- codex-repo-companion:end -->\n<!-- codex-repo-companion:start -->',
    '<!-- codex-repo-companion:start --><!-- codex-repo-companion:end -->'.repeat(2),
  ]) {
    fs.writeFileSync(path.join(root, 'AGENTS.md'), content);
    assert.throws(() => prepareAgentHelper(root), /Ambiguous/);
    assert.ok(!fs.existsSync(path.join(root, 'repo-companion')));
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
  assert.equal(override.split('<!-- codex-repo-companion:start -->').length, 2);
  assert.equal(fs.readFileSync(path.join(root, 'repo-companion', 'AGENTS.override.md.before-setup'), 'utf8'), 'Active override rules\n');
  assert.ok(fs.existsSync(path.join(root, 'repo-companion', 'report-scope.js')));
});

test('upgrading guidance keeps surrounding user rules and installs recovery separately', t => {
  const root = fs.mkdtempSync(path.join(__dirname, '..', '.codex-temp', 'helper-upgrade-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const instructions = path.join(root, 'AGENTS.md');
  const prefix = '# My rules\r\n\r\nKeep this exactly.\r\n';
  const suffix = '\r\n\r\n## More rules\r\nKeep these too.\r\n';
  const before = prefix + '<!-- codex-repo-companion:start -->\nOld detailed routing guidance.\n<!-- codex-repo-companion:end -->' + suffix;
  fs.writeFileSync(instructions, before);
  const plan = prepareAgentHelper(root);
  assert.equal(fs.existsSync(path.join(root, 'repo-companion')), false);
  installAgentHelper(plan);
  const after = fs.readFileSync(instructions, 'utf8');
  assert.ok(after.startsWith(prefix) && after.endsWith(suffix));
  assert.ok(!after.includes('Old detailed'));
  assert.ok(after.includes(path.join(root, 'repo-companion', 'fallback.md')));
  assert.equal(fs.readFileSync(path.join(root, 'repo-companion', 'AGENTS.md.before-setup'), 'utf8'), before);
  const fallback = path.join(root, 'repo-companion', 'fallback.md');
  const contents = fs.readFileSync(fallback, 'utf8');
  assert.ok(contents.includes('deepest matching scope') && contents.includes('Equally specific profiles must agree'));
  assert.ok(contents.includes('enabled: false') && contents.includes('ordinary project instruction discovery'));
  fs.unlinkSync(fallback);
  assert.equal(installAgentHelper(prepareAgentHelper(root)).changed, false);
  assert.equal(fs.readFileSync(fallback, 'utf8'), contents, 're-running setup repairs a missing fallback guide');
  assert.equal(fs.readFileSync(instructions, 'utf8'), after);
  assert.equal(fs.readFileSync(path.join(root, 'repo-companion', 'AGENTS.md.before-setup'), 'utf8'), before);
});
