'use strict';
const fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const yauzl = require('yauzl');

const hash = data => createHash('sha256').update(data).digest('hex');
function testSourceState(root) {
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (normalize(git(['rev-parse', '--show-toplevel'])) !== normalize(root)) throw new Error('Test inputs must be an independent Git root.');
  const files = Object.fromEntries(require('./public-source.cjs').publicFiles(root)
    .map(name => [name.replaceAll(path.sep, '/'), hash(fs.readFileSync(path.join(root, name)))]));
  return { baseRevision: git(['rev-parse', 'HEAD']), status: git(['status', '--porcelain', '--untracked-files=all']), files };
}
function revision(root) {
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (normalize(git(['rev-parse', '--show-toplevel'])) !== normalize(root)) {
    throw new Error('Release inputs must be independent Git roots.');
  }
  if (git(['status', '--porcelain', '--untracked-files=all'])) throw new Error('Commit reviewed release inputs before packaging: ' + root);
  return git(['rev-parse', 'HEAD']);
}

function verifyMarketplaceIcon(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const icon = fs.readFileSync(path.join(root, manifest.icon));
  if (icon.length < 24 || !icon.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      || icon.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Marketplace icon must be a PNG image.');
  }
  const width = icon.readUInt32BE(16), height = icon.readUInt32BE(20);
  if (width < 128 || height < 128 || width > 1024 || height > 1024) {
    throw new Error(`Marketplace icon must be between 128 and 1024 pixels per side; found ${width} x ${height}.`);
  }
}

function payload(root) {
  verifyMarketplaceIcon(root);
  const files = new Map();
  const include = relative => {
    const filename = path.join(root, relative);
    if (fs.lstatSync(filename).isSymbolicLink()) throw new Error('Release payload cannot contain links: ' + relative);
    files.set('extension/' + relative, hash(fs.readFileSync(filename)));
  };
  for (const name of ['package.json', 'README.md', 'LICENSE.md', 'PRIVACY.md', 'CHANGELOG.md', 'docs/advanced.md', 'tools/chat-activity.cjs']) include(name);
  for (const name of ['media/notification-balafon.wav', 'docs/notification-sound-license.txt']) include(name);
  for (const name of fs.readdirSync(path.join(root, 'media')).filter(name => /\.(js|css|html|png)$/.test(name))) include('media/' + name);
  for (const [source, output] of [['src', 'dist'], ['proprietary/src', 'dist/commercial']]) {
    for (const name of fs.readdirSync(path.join(root, source)).filter(name => name.endsWith('.ts') && !name.endsWith('.d.ts'))) {
      include(output + '/' + name.replace(/\.ts$/, '.js'));
    }
  }
  if (!files.has('extension/dist/commercial/service.js')) throw new Error('Compiled commercial service is required.');
  return files;
}

function inspectVsix(filename, expected, { universal = false } = {}) {
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
        const metadata = [];
        stream.on('error', fail); stream.on('data', chunk => {
          digest.update(chunk);
          if (universal && name === 'extension.vsixmanifest') metadata.push(chunk);
        });
        stream.on('end', () => {
          if (metadata.length && /\bTargetPlatform\s*=/.test(Buffer.concat(metadata).toString('utf8'))) {
            return fail(new Error('Universal VSIX must not restrict the target platform.'));
          }
          actual.set(name, digest.digest('hex')); zip.readEntry();
        });
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
module.exports = { hash, revision, testSourceState, verifyMarketplaceIcon, payload, inspectVsix };
