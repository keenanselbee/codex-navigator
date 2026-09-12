'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const version = '1.121.0';
const checksum = '37075ad1dd705898a991c3859242e2a29a8a0058b6f223e2c5ce4d025c1a4d6f';
const relative = 'out/vs/workbench/workbench.desktop.main.js';
const anchor = 'xt.registerCommandAndKeybindingRule({id:"workbench.scm.action.focusNextInput"';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function patchedBytes(original) {
  if (hash(original) !== checksum) { throw new Error('Unsupported VS Code workbench checksum. No changes made.'); }
  const text = original.toString('utf8');
  if (text.split(anchor).length !== 2) { throw new Error('Expected exactly one workbench patch anchor.'); }
  const hook = fs.readFileSync(path.join(__dirname, '..', 'bridge', 'workbench-select-repository.txt'), 'utf8').trim();
  const patched = Buffer.from(text.replace(anchor, hook + anchor));
  execFileSync(process.execPath, ['--check', '--input-type=module'], { input: patched, windowsHide: true, timeout: 30000, maxBuffer: 1048576 });
  return patched;
}

function patch(action, appRoot) {
  if (!['check', 'restore'].includes(action) || !appRoot) { throw new Error('The workbench patch is retired. Usage: node tools/patch-vscode.cjs check|restore "<VS Code resources/app directory>"'); }
  const root = path.resolve(appRoot);
  if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version !== version) { throw new Error('Unsupported VS Code version.'); }
  const file = path.join(root, relative), backup = file + '.repo-companion-original';
  const current = fs.readFileSync(file);
  const original = fs.existsSync(backup) ? fs.readFileSync(backup) : current;
  const expected = patchedBytes(original);
  const state = hash(current) === checksum ? 'original' : hash(current) === hash(expected) ? 'patched' : 'unknown';
  if (state === 'unknown') { throw new Error('Workbench was changed by another tool or update. Refusing to overwrite it.'); }
  if (action === 'check') { return { version, state, file }; }
  if (action === 'apply' && state === 'original' || action === 'restore' && state === 'patched') {
    if (!fs.existsSync(backup)) { fs.writeFileSync(backup, original, { flag: 'wx' }); }
    const next = action === 'apply' ? expected : original;
    const temporary = file + '.' + crypto.randomUUID() + '.pending';
    try {
      fs.writeFileSync(temporary, next, { flag: 'wx' });
      fs.renameSync(temporary, file);
    } finally { if (fs.existsSync(temporary)) { fs.unlinkSync(temporary); } }
  }
  return { version, state: action === 'apply' ? 'patched' : 'original', file, backup };
}

module.exports = { patch, patchedBytes };
if (require.main === module) {
  try { console.log(JSON.stringify(patch(process.argv[2], process.argv[3]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
