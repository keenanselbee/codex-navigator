'use strict';
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hash, payload, inspectVsix } = require('./release-evidence.cjs');

async function createTestPackage(prepareFixture) {
  const root = path.resolve(__dirname, '..'), scratch = path.join(root, '.codex-temp');
  fs.mkdirSync(scratch, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(scratch, 'package-acceptance-'));
  const expected = payload(root);
  for (const name of expected.keys()) {
    const relative = name.slice('extension/'.length), destination = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
  // Private integration may substitute fixed sandbox composition in this copy.
  // This hook is test tooling only; production packaging never calls it.
  if (prepareFixture) await prepareFixture(fixture);
  const fixtureChanges = [];
  for (const [name, originalHash] of expected) {
    const preparedHash = hash(fs.readFileSync(path.join(fixture, name.slice('extension/'.length))));
    if (preparedHash !== originalHash) fixtureChanges.push(name);
    expected.set(name, preparedHash);
  }
  fs.copyFileSync(path.join(root, '.vscodeignore'), path.join(fixture, '.vscodeignore'));
  const manifestFile = path.join(fixture, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.version = '0.0.0'; delete manifest.scripts; // Disposable fixture; never a release or normal-profile install target.
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  expected.set('extension/package.json', hash(fs.readFileSync(manifestFile)));
  fs.mkdirSync(path.join(fixture, 'proprietary', 'src'), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'proprietary', 'src', 'leak.ts'), '// synthetic private source exclusion sentinel');
  fs.writeFileSync(path.join(fixture, 'dist', 'commercial', 'service.js.map'), '{"synthetic":"source map exclusion sentinel"}');
  const archive = path.join(fixture, 'disposable-test.vsix');
  execFileSync(process.execPath, [require.resolve('@vscode/vsce/vsce'), 'package', '--no-dependencies',
    '--no-rewrite-relative-links', '--no-gitHubIssueLinking', '--no-gitLabIssueLinking',
    '--target', 'win32-x64', '--out', archive], { cwd: fixture, windowsHide: true, timeout: 60000, stdio: 'pipe' });
  const files = await inspectVsix(archive, expected);
  const receipt = { testOnly: true, installed: false, fixtureChanges, sha256: hash(fs.readFileSync(archive)), files };
  fs.writeFileSync(path.join(fixture, 'result.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ fixture, verifiedEntries: Object.keys(files).length, privateSourceIncluded: false }));
  return { fixture, archive, receipt };
}
module.exports = { createTestPackage };
if (require.main === module) createTestPackage().catch(error => { console.error(error.message); process.exitCode = 1; });
