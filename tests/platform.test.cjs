'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { codexBinary, codexRuntimeIssue, sameFilePath, shellArgument, activityCommand } = require('../dist/platform');
const { vscodeExecutable, vscodeCli } = require('../tools/vscode-runtime.cjs');

test('Unix runtime checks require execute permission and surface access failures', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  for (const platform of ['darwin', 'linux', 'win32']) {
    const exports = {}; let mode, denied = false;
    vm.runInNewContext(fs.readFileSync(require.resolve('../dist/platform'), 'utf8'), {
      exports, process: { platform, arch: 'arm64' },
      require: name => name === 'node:fs' ? { constants: fs.constants, accessSync: (_file, requested) => {
        mode = requested; if (denied) throw new Error('EACCES');
      } } : require(name),
    });
    assert.equal(exports.codexRuntimeIssue('/codex'), '');
    assert.equal(mode, platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    denied = true;
    assert.match(exports.codexRuntimeIssue('/codex'), /cannot be executed/);
  }
});

test('Codex discovery selects the host architecture without a fallback executable', () => {
  for (const [platform, system] of [['win32', 'windows'], ['darwin', 'macos'], ['linux', 'linux']]) {
    for (const [arch, cpu] of [['x64', 'x86_64'], ['arm64', 'aarch64']]) {
      const root = platform === 'win32' ? 'C:\\Codex Extension' : '/opt/Codex Extension';
      const expected = platform === 'win32' ? `${root}\\bin\\${system}-${cpu}\\codex.exe` : `${root}/bin/${system}-${cpu}/codex`;
      assert.equal(codexBinary(root, platform, arch), expected);
    }
    assert.equal(codexBinary('/extension', platform, 'ia32'), undefined);
  }
  assert.equal(codexBinary('/extension', 'freebsd', 'x64'), undefined);
  assert.equal(codexBinary(undefined), undefined);
  assert.match(codexRuntimeIssue(undefined), /requires the local Codex extension/);
  assert.match(codexRuntimeIssue('/navigator-no-such-runtime/codex'), /missing or cannot be executed/);
  assert.equal(codexRuntimeIssue(process.execPath), '');
});

test('path identity preserves Unix case and Windows case-insensitive identity', () => {
  assert.equal(sameFilePath('C:\\Repo\\a\\..', 'c:\\repo', 'win32'), true);
  for (const platform of ['darwin', 'linux']) {
    assert.equal(sameFilePath('/Repo/a/..', '/Repo', platform), true);
    assert.equal(sameFilePath('/Repo', '/repo', platform), false);
  }
});

test('Unix helper commands quote literal paths including apostrophes and shell syntax', () => {
  // Decode POSIX single-quoted words to verify that data cannot become shell syntax.
  const decode = word => {
    assert.match(word, /^'(?:[^']|'\\'')*'$/);
    return word.slice(1, -1).replace(/'\\''/g, "'");
  };
  const home = '/Users/O\'Brien/$home `cmd` $(cmd);& space';
  for (const platform of ['darwin', 'linux']) {
    assert.equal(decode(shellArgument(home, platform)), home);
    assert.equal(activityCommand(home, platform), `node ${shellArgument(home + '/codex-navigator/chat-activity.cjs', platform)} --home ${shellArgument(home, platform)}`);
  }
  assert.equal(activityCommand('C:\\Users\\A B', 'win32'), 'node "C:\\Users\\A B\\codex-navigator\\chat-activity.cjs" --home "C:\\Users\\A B"');
  assert.throws(() => shellArgument('C:\\$HOME', 'win32'), /unsupported Windows shell/);
  for (const platform of ['win32', 'darwin', 'linux']) assert.throws(() => shellArgument('bad\npath', platform), /control characters/);
});

test('isolated test launchers resolve platform locations and explicit overrides', () => {
  for (const [platform, executable, cli] of [
    ['darwin', '/Applications/Visual Studio Code.app/Contents/MacOS/Electron', '/Applications/Visual Studio Code.app/Contents/Resources/app/out/cli.js'],
    ['linux', '/usr/share/code/code', '/usr/share/code/resources/app/out/cli.js'],
  ]) {
    const exists = file => [executable, cli].includes(file);
    assert.equal(vscodeExecutable(platform, {}, exists), executable);
    assert.equal(vscodeCli(executable, platform, {}, exists), cli);
    assert.equal(vscodeExecutable(platform, { VSCODE_EXECUTABLE: '/custom/editor' }, file => file === '/custom/editor'), '/custom/editor');
    assert.equal(vscodeCli('/custom/editor', platform, { VSCODE_CLI: '/custom/cli.js' }, file => file === '/custom/cli.js'), '/custom/cli.js');
    assert.throws(() => vscodeExecutable(platform, { VSCODE_EXECUTABLE: '/missing' }, exists), /VSCODE_EXECUTABLE/);
    assert.throws(() => vscodeExecutable(platform, { VSCODE_EXECUTABLE: 'relative' }, () => true), /absolute path/);
    assert.throws(() => vscodeCli(executable, platform, {}, () => false), /VSCODE_CLI/);
  }
  const executable = 'C:\\Program Files\\Microsoft VS Code\\Code.exe';
  assert.equal(vscodeExecutable('win32', {}, file => file === executable), executable);
  assert.equal(vscodeCli(executable, 'win32', {}, () => true, () => '"%~dp0..\\version\\resources\\app\\out\\cli.js"'),
    'C:\\Program Files\\Microsoft VS Code\\version\\resources\\app\\out\\cli.js');
});
