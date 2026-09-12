'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');

function packageExtension(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  if (!/^\d+\.\d\.\d$/.test(manifest.version) || manifest.version !== lock.version
      || manifest.version !== lock.packages?.['']?.version) {
    throw new Error('Set matching release versions in package.json and the lockfile root.');
  }
  const output = path.join(root, 'dist', `codex-repo-companion-${manifest.version}.vsix`);
  if (fs.existsSync(output)) {
    throw new Error(`Version ${manifest.version} is already packaged. Keep that artifact and choose a new version for changed contents.`);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = path.join(path.dirname(output), `.package-${randomUUID()}.vsix`);
  try {
    const result = spawnSync(process.execPath, [require.resolve('@vscode/vsce/vsce'), 'package',
      '--no-dependencies', '--target', 'win32-x64', '--out', temporary], { cwd: root, windowsHide: true, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Packaging failed (${result.status ?? result.signal}).`);
    // Publish without overwriting an artifact produced by another package process.
    fs.linkSync(temporary, output);
    console.log(`Release artifact: ${output}`);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

module.exports = { packageExtension };
if (require.main === module) {
  try { packageExtension(path.resolve(__dirname, '..')); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
