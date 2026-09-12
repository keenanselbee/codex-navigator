'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const bridgeName = 'codex-repo-companion-bridge.cjs';
const rendererPath = 'webview/assets/app-initial-1e5ee25fb4ec.js';
const headerPath = 'webview/assets/header-fc6d647f8f9f.js';
const supported = {
  version: '26.908.40401',
  sha256: '820691c93be40e73f0929b633cddc694b41775050cd72283faba283e53941f4f',
  rendererSha256: '0d3e38dbac570fefa5a0b0ecec3522308df74aa7b1fe538e1ea2490489347dd9',
  previousPatchedRendererSha256: ['c8844fff650745091866022a27bccd69d08547659f36a6be228419789a813b86', 'f0b584c936965ebfbf0fe10b1f4c1ed12a9a02e0bd7f588c8c0ad1649512bc0c', '9ed2c34cf2a5dbefa68190132247de2015ac8172112ba449652100364c3bbda8', '473e3ddd2997bddb24a6c65049a735a3e050983136f00914fa9cf1f3c3f79de6', '495fc4a417a5eef04bc3453eb6a7b91ec913004c47c3bfd470374b6aa2c23982', '701fefbedd62124e39e8c1e1352fadf59e9fae47c4dbc816ccb6e2178b25b55f', '8ef579fd78ec82dc00592d6d81e4df81ad6d72b0c209062e5d8d073ef257f2b5', 'd6309c972d08565be4cf123c304440dd82f65eb9a64d118b02754b8b7cde8a2b', 'a8d8aaa0f44e8f440b6cd8496d0e235f83baae5d136152028b0f00f9a41831a7'],
  headerSha256: '8f7ef4b415a9dbad8ee0f61a1aef8ee5f5e6c5d668eff4b74a83e90911830d24',
  previousPatchedHeaderSha256: ['d7cfff010381844c578d82e549f9c7c9a2c9751c3a3a972459a03bcb35b3541a', '238a48cf2ca7b64a0e9e034821ae5e9342c3806a11a4e50ed715ccf50d746048', '0fc45dc39bf3ef464642949dd7c6fadc3626aedd217fd52755cea7182209182b', 'edf05d10675b5d9298cdaeb20985904f3e70bb1233e0fdf76e790953b72cc346', '9b7f738ff0721a322d3971e2b85cfb65efcc3fa20a1ab8890b8fdb7321d38be7'],
  previousBridgeSha256: ['c2a7ce44ec6136222a52d0977ed50c0da9b92196808168a77635bc386040f362', '78ca30a81f5a035e2123c77faf11abf2bc7c0390d701b981ffcecc7788e894b3', '019620df7591617a80965ea0485a3890b8734860121ed37b77294382c3a8579a', 'd3ef3cdd3e21aeae36d9ce92ca0b1d311a8f1a911f275494044995fd27f480df', '15ef19aa5820534aeb452738e16f698db295ffcf1431262395a5745ff9dff867', '65553a171aa79fac4a4f4cbccd886c0e060548f2e5f3aae326406753125a567c', '52b284b816205704fb35b2e0ba72f696c3a2183f471a08d97b55e1e608a35505', 'ead8905a6adc8e5585ee65a7be5650794cb96e05eea4200e91dc12a7ea97fec6'],
};
const requireBridge = 'require("./' + bridgeName + '")';
const hostEdits = [
  ['async function kIt(t){let{subscriptions:e}=t;', 'async function kIt(t){' + requireBridge + '.install(t);let{subscriptions:e}=t;'],
  ['resolveCustomEditor(e,r,n){let o=dI(e.uri);', 'resolveCustomEditor(e,r,n){' + requireBridge + '.attach(e.uri,r);let o=dI(e.uri);'],
  ['async initializeWebview(e,r,n,o){let i=', 'async initializeWebview(e,r,n,o){' + requireBridge + '.observeSurface(e,r,n,r==="sidebar"?Array.from(this.sidebarViews).find(v=>v.webview===e):this.findPanelByWebview(e));let i='],
  ['let a=e.onDidReceiveMessage(c=>{if(s.markMessageReceived(),c.type===', 'let a=e.onDidReceiveMessage(c=>{if(' + requireBridge + '.observeMessage(e,c))return;if(s.markMessageReceived(),c.type==='],
];
const rendererAnchor = 'function _Kr(){let e=(0,q9.c)(43),t=il($),{key:n,pathname:r,search:i,state:a}=sd(),o=(0,J9.useRef)(!1),s,c;';

function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) { throw new Error('Expected exactly one patch location; nothing was changed.'); }
  return text.replace(before, after);
}

function patchBytes(original) {
  if (hash(original) !== supported.sha256) { throw new Error('Unsupported Codex bundle checksum; nothing was changed.'); }
  let text = original.toString('utf8');
  for (const [before, after] of hostEdits) { text = replaceOnce(text, before, after); }
  new vm.Script(text, { filename: 'extension.js' });
  return Buffer.from(text);
}

function patchRenderer(original) {
  if (hash(original) !== supported.rendererSha256) { throw new Error('Unsupported Codex renderer checksum; nothing was changed.'); }
  const hook = fs.readFileSync(path.join(__dirname, '..', 'bridge', 'renderer-route-hook.txt'), 'utf8').trim();
  const text = replaceOnce(original.toString('utf8'), rendererAnchor, fs.readFileSync(path.join(__dirname, '..', 'bridge', 'renderer-menu.txt'), 'utf8') + '\n' + rendererAnchor + hook);
  execFileSync(process.execPath, ['--check', '--input-type=module'], { input: text, windowsHide: true, timeout: 30000 });
  return Buffer.from(text);
}

function patchHeader(original) {
  if (hash(original) !== supported.headerSha256) { throw new Error('Unsupported Codex header checksum; nothing was changed.'); }
  let text = original.toString('utf8');
  for (const [className, title] of [['truncate', 'o'], ['min-w-0 flex-1 text-base text-default', 'd.task.title'], ['min-w-0 flex-1 text-base text-default', 'n']]) {
    const before = '(0,$.jsx)(`span`,{className:`' + className + '`,children:' + title + '})';
    const after = '(0,$.jsx)(`span`,{className:`' + className + '`,children:(0,$.jsx)(RepoCompanionTitle,{title:' + title + '})})';
    text = replaceOnce(text, before, after);
  }
  const rows = [
    ['(0,J.jsx)(j,{useStableTrailingRail:!0,', 'remote', 'e.task.id', 'undefined'],
    ['(0,J.jsx)(Ee,{useStableTrailingRail:!0,', 'local', 'e.conversation.id', 'e.conversation.hostId'],
    ['(0,Z.jsx)(j,{task:e.task,', 'remote', 'e.task.id', 'undefined'],
    ['(0,Z.jsx)(Ee,{conversationId:n,hostId:r,', 'local', 'n', 'r'],
    ['(0,Z.jsx)(j,{task:n.task,', 'remote', 'n.task.id', 'undefined'],
    ['(0,Z.jsx)(Ee,{conversationId:n.conversation.id,hostId:n.conversation.hostId,', 'local', 'n.conversation.id', 'n.conversation.hostId'],
  ];
  for (const [anchor, kind, id, host] of rows) {
    const rowAnchor = kind === 'local' ? anchor.replace('(Ee,{', '(RepoCompanionHistoryRow,{component:Ee,repoCompanionKey:`local/${' + id + '}`,') : anchor;
    text = replaceOnce(text, anchor, rowAnchor + 'titlePrefix:(0,$.jsx)(RepoCompanionRowPrefix,{conversationKey:`' + kind + '/${' + id + '}`,hostId:' + host + '}),');
  }
  text = replaceOnce(text, 'function Bn(e){', fs.readFileSync(path.join(__dirname, '..', 'bridge', 'renderer-title-component.txt'), 'utf8') + '\nfunction Bn(e){');
  execFileSync(process.execPath, ['--check', '--input-type=module'], { input: text, windowsHide: true, timeout: 30000 });
  return Buffer.from(text);
}

function rejectLink(file) {
  try {
    const info = fs.lstatSync(file);
    if (info.isSymbolicLink() || !info.isFile()) { throw new Error('A setup file is a link or is not a regular file. Nothing was changed.'); }
  } catch (error) { if (error.code !== 'ENOENT') { throw error; } }
}

function inspect(extensionDirectory) {
  const root = fs.realpathSync(extensionDirectory);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (manifest.publisher !== 'openai' || manifest.name !== 'chatgpt' || manifest.version !== supported.version) {
    throw new Error('Only openai.chatgpt ' + supported.version + ' is supported; nothing was changed.');
  }
  const entries = [['out/extension.js', patchBytes], [rendererPath, patchRenderer], [headerPath, patchHeader]].map(([relative, patch]) => {
    const target = path.join(root, relative);
    const resolved = fs.realpathSync(target);
    const inside = path.relative(root, resolved);
    if (inside.startsWith('..') || path.isAbsolute(inside) || fs.lstatSync(target).isSymbolicLink()) {
      throw new Error('A patch target is outside the extension or is a symbolic link.');
    }
    const backup = target + '.repo-companion-original';
    rejectLink(backup);
    const current = fs.readFileSync(target);
    const hasBackup = fs.existsSync(backup);
    const original = hasBackup ? fs.readFileSync(backup) : current;
    const patched = patch(original);
    const previous = hasBackup && (relative === rendererPath && supported.previousPatchedRendererSha256.includes(hash(current)) || relative === headerPath && supported.previousPatchedHeaderSha256.includes(hash(current)));
    if (!current.equals(original) && !current.equals(patched) && !previous) {
      throw new Error('A bundle changed since backup or has an older patch. Refusing to overwrite it.');
    }
    return { target, backup, current, original, patched, hasBackup, previous };
  });
  const bridge = path.join(root, 'out', bridgeName);
  rejectLink(bridge);
  return { root, entries, bridge };
}

function atomicReplace(target, expected, replacement) {
  // A crashed attempt must not reserve the temporary filename for every later retry.
  // Leave abandoned files alone; only this attempt owns the new temporary file.
  const temporary = target + '.repo-companion-pending-' + crypto.randomUUID();
  fs.writeFileSync(temporary, replacement, { flag: 'wx' });
  try {
    if (!fs.readFileSync(target).equals(expected)) { throw new Error('A patch target changed during the operation.'); }
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) { fs.unlinkSync(temporary); }
  }
}

function run(mode, extensionDirectory) {
  if (mode === 'check') { return runUnlocked(mode, extensionDirectory); }
  if (!['apply', 'restore'].includes(mode) || !extensionDirectory) {
    throw new Error('Usage: node tools/patch-codex.cjs <check|apply|restore> <Codex extension directory>');
  }
  const files = inspect(extensionDirectory);
  const lock = path.join(files.root, '.repo-companion-setup.lock');
  let handle;
  try { handle = fs.openSync(lock, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') { throw new Error('Another setup may be running. If it was interrupted, close setup and remove ' + lock + ' before trying again.'); }
    throw error;
  }
  try { return runUnlocked(mode, extensionDirectory); }
  finally { fs.closeSync(handle); fs.unlinkSync(lock); }
}

function runUnlocked(mode, extensionDirectory) {
  if (!['check', 'apply', 'restore'].includes(mode) || !extensionDirectory) {
    throw new Error('Usage: node tools/patch-codex.cjs <check|apply|restore> <Codex extension directory>');
  }
  // Preflight every target before writing any file.
  const files = inspect(extensionDirectory);
  const bridge = fs.readFileSync(path.join(__dirname, '..', 'bridge', bridgeName));
  const bridgeExists = fs.existsSync(files.bridge);
  const currentBridge = bridgeExists ? fs.readFileSync(files.bridge) : null;
  const previousBridge = currentBridge && supported.previousBridgeSha256.includes(hash(currentBridge));
  if (currentBridge && !currentBridge.equals(bridge) && !previousBridge) {
    throw new Error('An unknown or older bridge file exists. Restore that patch before upgrading.');
  }
  const patched = files.entries.every(entry => entry.current.equals(entry.patched)) && currentBridge?.equals(bridge);
  const original = files.entries.every(entry => entry.current.equals(entry.original));
  if (mode === 'check') {
    // Missing bridge files are a repairable partial installation.
    return { version: supported.version, protocol: 2, status: patched ? 'patched' : original ? 'compatible' : files.entries.some(entry => entry.previous) ? 'upgrade-available' : 'partial',
      sha256: hash(files.entries[0].current), rendererSha256: hash(files.entries[1].current), headerSha256: hash(files.entries[2].current) };
  }
  if (mode === 'apply') {
    for (const entry of files.entries) {
      if (!entry.hasBackup) { fs.writeFileSync(entry.backup, entry.original, { flag: 'wx' }); }
    }
    const completed = [];
    let createdBridge = false;
    try {
      if (!bridgeExists) { fs.writeFileSync(files.bridge, bridge, { flag: 'wx' }); createdBridge = true; }
      if (currentBridge && !currentBridge.equals(bridge)) {
        atomicReplace(files.bridge, currentBridge, bridge);
        completed.push({ target: files.bridge, patched: bridge, current: currentBridge });
      }
      for (const entry of files.entries) {
        if (!entry.current.equals(entry.patched)) { atomicReplace(entry.target, entry.current, entry.patched); completed.push(entry); }
      }
    } catch (error) {
      // Roll back only bytes written by this attempt, without touching an external update.
      for (const entry of completed.reverse()) { atomicReplace(entry.target, entry.patched, entry.current); }
      if (createdBridge && fs.existsSync(files.bridge) && fs.readFileSync(files.bridge).equals(bridge)) { fs.unlinkSync(files.bridge); }
      throw error;
    }
    return runUnlocked('check', extensionDirectory);
  }
  if (!files.entries.some(entry => entry.hasBackup)) { throw new Error('No companion backup exists; nothing was changed.'); }
  for (const entry of files.entries) {
    if (!entry.current.equals(entry.original)) { atomicReplace(entry.target, entry.current, entry.original); }
  }
  if (bridgeExists) { fs.unlinkSync(files.bridge); }
  for (const entry of files.entries) { if (entry.hasBackup) { fs.unlinkSync(entry.backup); } }
  return { version: supported.version, protocol: 2, status: 'restored', sha256: hash(files.entries[0].original) };
}

module.exports = { run, patchBytes, patchRenderer, patchHeader, supported, rendererPath, headerPath };
if (require.main === module) {
  try { console.log(JSON.stringify(run(process.argv[2], process.argv[3]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
