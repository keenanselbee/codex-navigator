'use strict';
const fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const yauzl = require('yauzl');

const hash = data => createHash('sha256').update(data).digest('hex');
function revision(root) {
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
  if (path.resolve(git(['rev-parse', '--show-toplevel'])).toLowerCase() !== path.resolve(root).toLowerCase()) {
    throw new Error('Release inputs must be independent Git roots.');
  }
  if (git(['status', '--porcelain', '--untracked-files=all'])) throw new Error('Commit reviewed release inputs before packaging: ' + root);
  return git(['rev-parse', 'HEAD']);
}

function payload(root) {
  const files = new Map();
  const include = relative => {
    const filename = path.join(root, relative);
    if (fs.lstatSync(filename).isSymbolicLink()) throw new Error('Release payload cannot contain links: ' + relative);
    files.set('extension/' + relative, hash(fs.readFileSync(filename)));
  };
  for (const name of ['package.json', 'README.md', 'LICENSE.md', 'PRIVACY.md', 'CHANGELOG.md', 'docs/advanced.md', 'tools/chat-activity.cjs']) include(name);
  for (const name of fs.readdirSync(path.join(root, 'media')).filter(name => /\.(js|css|html|png)$/.test(name))) include('media/' + name);
  for (const [source, output] of [['src', 'dist'], ['proprietary/src', 'dist/commercial']]) {
    for (const name of fs.readdirSync(path.join(root, source)).filter(name => name.endsWith('.ts') && !name.endsWith('.d.ts'))) {
      include(output + '/' + name.replace(/\.ts$/, '.js'));
    }
  }
  if (!files.has('extension/dist/commercial/service.js')) throw new Error('Compiled commercial service is required.');
  return files;
}

function inspectVsix(filename, expected) {
  // VSCE canonicalizes these two documentation names inside the archive.
  expected = new Map([...expected].map(([name, digest]) => [
    ['extension/README.md', 'extension/CHANGELOG.md'].includes(name) ? name.toLowerCase() : name, digest]));
  return new Promise((resolve, reject) => yauzl.open(filename, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
    if (error) return reject(error);
    const actual = new Map(); let total = 0;
    const fail = error => { zip.close(); reject(error); };
    zip.on('error', fail);
    zip.on('entry', entry => {
      const name = entry.fileName;
      if (actual.has(name) || (!expected.has(name) && !['[Content_Types].xml', 'extension.vsixmanifest'].includes(name))) {
        return fail(new Error('Unexpected or duplicate VSIX entry: ' + name));
      }
      if (entry.uncompressedSize > 16 * 1024 * 1024 || (total += entry.uncompressedSize) > 64 * 1024 * 1024) {
        return fail(new Error('VSIX exceeds the bounded Navigator payload size.'));
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error) return fail(error);
        const digest = createHash('sha256');
        stream.on('error', fail); stream.on('data', chunk => digest.update(chunk));
        stream.on('end', () => { actual.set(name, digest.digest('hex')); zip.readEntry(); });
      });
    });
    zip.on('end', () => {
      for (const [name, digest] of expected) {
        if (actual.get(name) !== digest) return fail(new Error('Missing or changed VSIX payload: ' + name));
      }
      for (const name of ['[Content_Types].xml', 'extension.vsixmanifest']) if (!actual.has(name)) return fail(new Error('Missing VSIX metadata: ' + name));
      resolve(Object.fromEntries([...actual].sort(([a], [b]) => a.localeCompare(b))));
    });
    zip.readEntry();
  }));
}
module.exports = { hash, revision, payload, inspectVsix };
