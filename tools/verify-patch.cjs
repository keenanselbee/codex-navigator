'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { run, rendererPath, headerPath, supported } = require('./patch-codex.cjs');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = process.argv[2];
if (!source) { throw new Error('Pass the installed Codex extension directory. Only a scratch copy will be modified.'); }
run('check', source);
const scratch = path.join(root, '.codex-temp');
fs.mkdirSync(scratch, { recursive: true });
const copy = fs.mkdtempSync(path.join(scratch, 'patch-check-'));
fs.copyFileSync(path.join(source, 'package.json'), path.join(copy, 'package.json'));
const targets = ['out/extension.js', rendererPath, headerPath].map(relative => {
  const target = path.join(copy, relative);
  const sourceTarget = path.join(source, relative);
  const original = fs.readFileSync(fs.existsSync(sourceTarget + '.repo-companion-original') ? sourceTarget + '.repo-companion-original' : sourceTarget);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, original);
  return { target, original };
});
assert.equal(run('apply', copy).status, 'patched');
const installedRenderer = fs.readFileSync(path.join(source, rendererPath));
const upgradesPrevious = supported.previousPatchedRendererSha256.includes(crypto.createHash('sha256').update(installedRenderer).digest('hex'))
  || supported.previousPatchedHeaderSha256.includes(crypto.createHash('sha256').update(fs.readFileSync(path.join(source, headerPath))).digest('hex'));
if (upgradesPrevious) {
  fs.writeFileSync(targets[1].target, installedRenderer);
  fs.copyFileSync(path.join(source, headerPath), targets[2].target);
  fs.copyFileSync(path.join(source, 'out/codex-repo-companion-bridge.cjs'), path.join(copy, 'out/codex-repo-companion-bridge.cjs'));
  assert.equal(run('check', copy).status, 'upgrade-available');
  assert.equal(run('apply', copy).status, 'patched');
}
assert.equal(run('apply', copy).status, 'patched');
assert.equal(run('restore', copy).status, 'restored');
for (const { target, original } of targets) {
  assert.ok(fs.readFileSync(target).equals(original), 'restore is byte-identical');
  fs.appendFileSync(target, '\n// incompatible update\n');
  assert.throws(() => run('apply', copy), /checksum/);
  assert.ok(!fs.existsSync(targets[0].target + '.repo-companion-original'), 'preflight does not write backups');
  fs.writeFileSync(target, original);
  run('apply', copy);
  const patched = fs.readFileSync(target);
  fs.appendFileSync(target, '\n// external edit\n');
  assert.throws(() => run('restore', copy), /changed since backup/);
  fs.writeFileSync(target, patched);
  run('restore', copy);
}
run('apply', copy);
fs.writeFileSync(targets[1].target, targets[1].original);
assert.equal(run('check', copy).status, 'partial');
assert.equal(run('apply', copy).status, 'patched');
run('restore', copy);
for (const { target, original } of targets) { assert.ok(fs.readFileSync(target).equals(original)); }
console.log(JSON.stringify({ passed: true, scope: 'scratch copy', copy, verified: ['host, route renderer, and header syntax', 'apply', 'idempotence', 'byte-identical restore of all three bundles', 'update refusal for all three bundles', 'external modification refusal', 'partial patch recovery', ...(upgradesPrevious ? ['recognized previous renderer and bridge upgrade with originals preserved'] : [])] }, null, 2));
