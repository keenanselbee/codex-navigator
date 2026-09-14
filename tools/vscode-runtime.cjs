'use strict';
const fs = require('node:fs'), path = require('node:path');

// Test tooling only. Always launch the real Electron binary with an isolated profile.
function vscodeExecutable(platform = process.platform, env = process.env, exists = fs.existsSync) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const candidates = env.VSCODE_EXECUTABLE ? [env.VSCODE_EXECUTABLE] : platform === 'win32' ? [
    paths.join(env.ProgramFiles || 'C:\\Program Files', 'Microsoft VS Code', 'Code.exe'),
    ...(env.LOCALAPPDATA ? [paths.join(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe')] : []),
  ] : platform === 'darwin' ? ['/Applications/Visual Studio Code.app/Contents/MacOS/Electron']
    : platform === 'linux' ? ['/usr/share/code/code', '/usr/share/visual-studio-code/code', '/opt/visual-studio-code/code'] : [];
  const executable = candidates.find(candidate => paths.isAbsolute(candidate) && exists(candidate));
  if (!executable) throw new Error('Set VSCODE_EXECUTABLE to the absolute path of the installed VS Code Electron binary (not the code shell launcher).');
  return executable;
}

function vscodeCli(executable, platform = process.platform, env = process.env, exists = fs.existsSync, read = fs.readFileSync) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  let candidates;
  if (env.VSCODE_CLI) candidates = [env.VSCODE_CLI];
  else if (platform === 'win32') {
    const bin = paths.join(paths.dirname(executable), 'bin');
    const relative = read(paths.join(bin, 'code.cmd'), 'utf8').match(/"%~dp0([^"\r\n]*cli\.js)"/)?.[1];
    candidates = relative ? [paths.resolve(bin, relative)] : [];
  } else {
    const directory = paths.dirname(executable);
    candidates = [paths.resolve(directory, '../Resources/app/out/cli.js'), paths.join(directory, 'resources/app/out/cli.js')];
  }
  const cli = candidates.find(candidate => paths.isAbsolute(candidate) && exists(candidate));
  if (!cli) throw new Error('Set VSCODE_CLI to the absolute path of this VS Code installation\'s resources/app/out/cli.js.');
  return cli;
}

module.exports = { vscodeExecutable, vscodeCli };
