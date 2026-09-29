'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { hash, revision, testSourceState, payload, inspectVsix } = require('./release-evidence.cjs');

async function packageExtension(root, { testBuild = false } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  if (!/^\d+\.\d\.\d$/.test(manifest.version) || manifest.version !== lock.version
      || manifest.version !== lock.packages?.['']?.version) {
    throw new Error('Set matching release versions in package.json and the lockfile root.');
  }
  const output = path.join(root, 'dist', `codex-navigator-${manifest.version}.vsix`);
  if (fs.existsSync(output)) {
    throw new Error(`Version ${manifest.version} is already packaged. Keep that artifact and choose a new version for changed contents.`);
  }
  require('./build.cjs').verifyPrivate(root);
  const privateRoot = path.join(root, 'proprietary');
  // An explicit local test keeps exact working-tree evidence; normal releases still require clean commits.
  const sourceState = testBuild ? testSourceState(root) : undefined;
  const revisions = { public: sourceState?.baseRevision ?? revision(root), private: revision(privateRoot) };
  require('./build.cjs').build(root);
  const configurationPath = path.join(root, 'dist', 'commercial', 'license-configuration.js');
  delete require.cache[require.resolve(configurationPath)];
  const { licenseConfiguration: config, licenseEnvironment } = require(configurationPath);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (licenseEnvironment !== 'production' || config?.environment !== 'production'
      || !uuid.test(config.organizationId) || !uuid.test(config.benefitId)
      || !/^https:\/\/(?:buy|api)\.polar\.sh\//.test(config.checkoutUrl ?? '')
      || !/^https:\/\/polar\.sh\//.test(config.portalUrl ?? '')) {
    throw new Error('Complete production licensing configuration is required before packaging; sandbox builds cannot be released here.');
  }
  const expected = payload(root);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = path.join(path.dirname(output), `.package-${randomUUID()}.vsix`);
  try {
    const result = spawnSync(process.execPath, [require.resolve('@vscode/vsce/vsce'), 'package',
      '--no-dependencies', '--no-rewrite-relative-links', '--no-gitHubIssueLinking', '--no-gitLabIssueLinking',
      '--out', temporary], { cwd: root, windowsHide: true, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Packaging failed (${result.status ?? result.signal}).`);
    const files = await inspectVsix(temporary, expected, { universal: true });
    const publicChanged = testBuild ? JSON.stringify(testSourceState(root)) !== JSON.stringify(sourceState) : revision(root) !== revisions.public;
    if (publicChanged || revision(privateRoot) !== revisions.private
        || JSON.stringify([...payload(root)]) !== JSON.stringify([...expected])) {
      throw new Error('Release inputs changed during packaging. Review and retry with stable inputs.');
    }
    const receipt = { version: manifest.version, target: 'universal', environment: 'production',
      ...(testBuild ? { testBuild: true, sourceState } : {}),
      revisions, sha256: hash(fs.readFileSync(temporary)), files, createdAt: new Date().toISOString() };
    // Publish without overwriting an artifact produced by another package process.
    fs.linkSync(temporary, output);
    fs.writeFileSync(output + '.json', JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    console.log(`${testBuild ? 'Uncommitted local test' : 'Release'} artifact: ${output}`);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

module.exports = { packageExtension };
if (require.main === module) {
  if (process.argv.slice(2).some(arg => arg !== '--test-build')) throw new Error('Unknown packaging option.');
  packageExtension(path.resolve(__dirname, '..'), { testBuild: process.argv.includes('--test-build') })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
