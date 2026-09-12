'use strict';
// Read installed Codex originals; all mutation tests use disposable copies under this repository.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const patch = require('./patch-codex.cjs');
const source = process.argv[2];
if (!source || !path.isAbsolute(source)) { throw new Error('Pass the absolute installed Codex extension directory.'); }
const scratch = path.resolve(__dirname, '..', '.codex-temp');
fs.mkdirSync(scratch, { recursive: true });
const root = fs.mkdtempSync(path.join(scratch, 'display-setup-'));
const entries = ['out/extension.js', patch.rendererPath, patch.headerPath];
const originals = new Map();
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  for (const relative of entries) {
    const installed = path.join(source, relative);
    const original = fs.existsSync(installed + '.repo-companion-original') ? installed + '.repo-companion-original' : installed;
    const bytes = fs.readFileSync(original);
    originals.set(relative, bytes);
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), bytes);
  }
  assert.equal(patch.run('check', root).status, 'compatible');
  assert.equal(patch.run('apply', root).status, 'patched');
  assert.equal(patch.run('apply', root).status, 'patched');
  const bridge = path.join(root, 'out/codex-repo-companion-bridge.cjs');
  fs.unlinkSync(bridge);
  assert.equal(patch.run('check', root).status, 'partial');
  assert.equal(patch.run('apply', root).status, 'patched');
  assert.equal(patch.run('restore', root).status, 'restored');
  for (const [relative, bytes] of originals) {
    assert.ok(fs.readFileSync(path.join(root, relative)).equals(bytes));
    assert.ok(!fs.existsSync(path.join(root, relative) + '.repo-companion-original'));
  }
  assert.ok(!fs.existsSync(bridge));
  const lock = path.join(root, '.repo-companion-setup.lock');
  fs.writeFileSync(lock, 'Another setup');
  assert.throws(() => patch.run('apply', root), /Another setup/);
  fs.unlinkSync(lock);
  // A hard interruption can leave the old fixed name or a newer unique temporary.
  // After the abandoned lock is removed, neither may block repair or restoration.
  const abandoned = path.join(root, entries[0]) + '.repo-companion-pending';
  const abandonedUnique = abandoned + '-interrupted-attempt';
  fs.writeFileSync(abandoned, 'Interrupted, incomplete bytes');
  fs.writeFileSync(abandonedUnique, 'Unknown bytes must be preserved');
  assert.equal(patch.run('apply', root).status, 'patched');
  assert.equal(patch.run('restore', root).status, 'restored');
  assert.equal(fs.readFileSync(abandoned, 'utf8'), 'Interrupted, incomplete bytes');
  assert.equal(fs.readFileSync(abandonedUnique, 'utf8'), 'Unknown bytes must be preserved');
  // Inject a second-file publication failure; verify rollback and recovery.
  let renames = 0;
  const testFs = Object.create(fs);
  testFs.renameSync = (...args) => {
    if (++renames === 2) { throw new Error('Simulated write failure'); }
    return fs.renameSync(...args);
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'patch-codex.cjs'), 'utf8'), {
    require: name => name === 'node:fs' ? testFs : require(name), module, exports: module.exports,
    __dirname, process, Buffer, console,
  });
  assert.throws(() => module.exports.run('apply', root), /Simulated write failure/);
  for (const [relative, bytes] of originals) { assert.ok(fs.readFileSync(path.join(root, relative)).equals(bytes)); }
  assert.ok(!fs.existsSync(bridge));
  assert.ok(!fs.existsSync(lock));
  assert.equal(patch.run('apply', root).status, 'patched');
  // Foreign edits must survive refused restoration.
  const target = path.join(root, entries[0]);
  const patched = fs.readFileSync(target);
  fs.appendFileSync(target, '\n// External change');
  assert.throws(() => patch.run('restore', root), /Refusing to overwrite/);
  assert.ok(fs.readFileSync(target, 'utf8').endsWith('// External change'));
  fs.writeFileSync(target, patched);
  patch.run('restore', root);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ ...manifest, version: '0.0.0' }));
  assert.throws(() => patch.run('apply', root), /Only openai.chatgpt/);
  for (const [relative, bytes] of originals) { assert.ok(fs.readFileSync(path.join(root, relative)).equals(bytes)); }
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  // Exercise the same Electron-as-Node path used by the real extension host.
  const electron = process.env.VSCODE_EXECUTABLE || 'C:\\Program Files\\Microsoft VS Code\\Code.exe';
  const result = execFileSync(electron, [path.join(__dirname, 'patch-codex.cjs'), 'check', root], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', timeout: 120000,
  });
  assert.equal(JSON.parse(result).status, 'compatible');
  console.log('PASS: apply, idempotence, missing-bridge repair, exact restore, lock refusal, interrupted temporary recovery, failed-write rollback, external-edit refusal, unsupported version, and Electron Node execution.');
} finally {
  const relative = path.relative(scratch, path.resolve(root));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) { throw new Error('Unsafe scratch cleanup path.'); }
  fs.rmSync(root, { recursive: true, force: true });
}
