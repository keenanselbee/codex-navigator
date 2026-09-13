'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('release version changes leave dependency versions and constraints intact', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.match(manifest.version, /^\d+\.\d\.\d$/);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[''].version, manifest.version);
  assert.deepEqual(lock.packages[''].devDependencies, manifest.devDependencies);
  assert.equal(manifest.scripts.package, 'node tools/package.cjs');
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!name) continue;
    const filename = path.join(root, name, 'package.json');
    if (!fs.existsSync(filename)) continue; // Optional packages for another platform.
    const installed = JSON.parse(fs.readFileSync(filename, 'utf8'));
    assert.equal(entry.version, installed.version, name + ' version');
    for (const field of ['dependencies', 'engines']) {
      assert.deepEqual(entry[field] ?? {}, installed[field] ?? {}, name + ' ' + field);
    }
  }
});

test('packaging rejects mismatched versions and preserves an existing release artifact', async t => {
  const { packageExtension } = require('../tools/package.cjs');
  const scratch = path.join(root, '.codex-temp');
  fs.mkdirSync(scratch, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(scratch, 'package-guard-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ version: '1.1.2' }));
  const lockPath = path.join(fixture, 'package-lock.json');
  fs.writeFileSync(lockPath, JSON.stringify({ version: '1.1.1', packages: { '': { version: '1.1.1' } } }));
  await assert.rejects(() => packageExtension(fixture), /matching release versions/);
  fs.writeFileSync(lockPath, JSON.stringify({ version: '1.1.2', packages: { '': { version: '1.1.2' } } }));
  fs.mkdirSync(path.join(fixture, 'dist'));
  const artifact = path.join(fixture, 'dist', 'codex-navigator-1.1.2.vsix');
  fs.writeFileSync(artifact, 'reserved payload');
  await assert.rejects(() => packageExtension(fixture), /already packaged/);
  assert.equal(fs.readFileSync(artifact, 'utf8'), 'reserved payload');
});
