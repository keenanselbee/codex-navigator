'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { execFileSync } = require('node:child_process');
const { ZipFile } = require('yazl');
const { hash, revision, inspectVsix } = require('../tools/release-evidence.cjs');
const scratch = path.resolve(__dirname, '../.codex-temp');

test('VSIX inspection requires exact runtime bytes and rejects source leaks, stale output and duplicates', async t => {
  fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'vsix-boundary-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const required = [['extension/dist/extension.js', 'public runtime'], ['extension/dist/commercial/service.js', 'compiled commercial runtime']];
  const expected = new Map(required.map(([name, data]) => [name, hash(data)]));
  const metadata = [['[Content_Types].xml', '<Types/>'], ['extension.vsixmanifest', '<PackageManifest/>']];
  let count = 0;
  async function archive(files) {
    const zip = new ZipFile(), filename = path.join(root, `${count++}.vsix`);
    const written = pipeline(zip.outputStream, fs.createWriteStream(filename));
    for (const [name, data] of files) zip.addBuffer(Buffer.from(data), name);
    zip.end(); await written; return filename;
  }
  const files = [...required, ...metadata];
  const receipt = await inspectVsix(await archive(files), expected);
  assert.equal(Object.keys(receipt).length, 4);
  const documented = new Map([...expected, ['extension/README.md', hash('readme')], ['extension/CHANGELOG.md', hash('changelog')]]);
  await inspectVsix(await archive([...files, ['extension/readme.md', 'readme'], ['extension/changelog.md', 'changelog']]), documented);
  for (const name of ['extension/proprietary/src/service.ts', 'extension/dist/commercial/service.js.map', 'extension/.git/config', 'extension/dist/stale.js']) {
    await assert.rejects(inspectVsix(await archive([...files, [name, 'leak']]), expected), /Unexpected/);
  }
  await assert.rejects(inspectVsix(await archive([...files, required[0]]), expected), /duplicate/);
  await assert.rejects(inspectVsix(await archive(files.slice(1)), expected), /Missing or changed/);
  await assert.rejects(inspectVsix(await archive([['extension/dist/extension.js', 'changed'], ...files.slice(1)]), expected), /Missing or changed/);
});

test('release revisions reject dirty inputs and a parent masquerading as the private checkout', t => {
  fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'release-revision-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', ['-C', root, ...args], { windowsHide: true });
  git(['init', '--quiet']); fs.writeFileSync(path.join(root, 'input.txt'), 'original');
  assert.throws(() => revision(root), /Commit reviewed release inputs/);
  git(['add', '--', 'input.txt']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture']);
  const before = revision(root); assert.match(before, /^[0-9a-f]{40}$/);
  fs.mkdirSync(path.join(root, 'proprietary'));
  assert.throws(() => revision(path.join(root, 'proprietary')), /independent Git roots/);
  fs.writeFileSync(path.join(root, 'input.txt'), 'changed');
  assert.throws(() => revision(root), /Commit reviewed release inputs/);
});
