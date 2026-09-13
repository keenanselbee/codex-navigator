'use strict';
const fs = require('node:fs'), path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { createTestPackage } = require('./test-package.cjs');

async function main() {
  const root = path.resolve(__dirname, '..'), scratch = path.join(root, '.codex-temp');
  const { fixture, archive, receipt } = await createTestPackage();
  const testRoot = fs.mkdtempSync(path.join(scratch, 'installed-acceptance-'));
  const profile = path.join(testRoot, 'profile'), extensions = path.join(testRoot, 'extensions');
  for (const directory of [profile, extensions]) {
    fs.mkdirSync(directory, { recursive: true });
    if (!fs.realpathSync(directory).startsWith(fs.realpathSync(scratch) + path.sep)) throw new Error('Installation fixture escaped scratch.');
  }
  const executable = process.env.VSCODE_EXECUTABLE ?? 'C:\\Program Files\\Microsoft VS Code\\Code.exe';
  const bin = path.join(path.dirname(executable), 'bin');
  const launcher = fs.readFileSync(path.join(bin, 'code.cmd'), 'utf8');
  const cliRelative = launcher.match(/"%~dp0([^"\r\n]*cli\.js)"/)?.[1];
  if (!cliRelative) throw new Error('Could not resolve the installed VS Code CLI from code.cmd.');
  const cli = path.resolve(bin, cliRelative);
  const scoped = ['--user-data-dir=' + profile, '--extensions-dir=' + extensions];
  const command = args => execFileSync(executable, [cli, ...scoped, ...args], { cwd: root, windowsHide: true, timeout: 60000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', VSCODE_DEV: '' }, encoding: 'utf8', stdio: 'pipe' });
  const parent = path.join(testRoot, 'parent'); fs.mkdirSync(parent);
  execFileSync('git', ['init', '--quiet', parent], { windowsHide: true });
  const workspace = path.join(testRoot, 'test.code-workspace');
  fs.writeFileSync(workspace, JSON.stringify({ folders: [{ path: parent }], settings: { 'git.autofetch': false } }));
  fs.mkdirSync(path.join(profile, 'User'));
  const settingsPath = path.join(profile, 'User', 'settings.json');
  const settings = { 'window.confirmBeforeClose': 'never', 'window.confirmSaveUntitledWorkspace': false,
    'window.restoreWindows': 'none', 'window.closeWhenEmpty': true, 'telemetry.telemetryLevel': 'off',
    'update.mode': 'none', 'extensions.autoUpdate': false, 'codexNavigator.highlightDurationSeconds': 23 };
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  fs.writeFileSync(path.join(testRoot, 'archive-receipt.json'), JSON.stringify(receipt));
  fs.copyFileSync(path.join(fixture, 'package.json'), path.join(testRoot, 'expected-package.json'));
  const codexHome = path.join(testRoot, 'codex-home'); fs.mkdirSync(codexHome);
  console.log('Installed test profile: ' + testRoot);
  for (const phase of ['installed', 'reinstalled']) {
    if (phase === 'reinstalled') {
      console.log(command(['--uninstall-extension', 'keenanselbee.codex-navigator']));
      if (command(['--list-extensions']).split(/\r?\n/).includes('keenanselbee.codex-navigator')) throw new Error('Fixture uninstall did not remove the extension.');
      // Reset only ordinary Navigator settings, with every test host already closed.
      const current = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      for (const name of Object.keys(current)) if (name.startsWith('codexNavigator.')) delete current[name];
      fs.writeFileSync(settingsPath, JSON.stringify(current));
    }
    console.log(command(['--install-extension', archive, '--force']));
    const env = { ...process.env, CODEX_HOME: codexHome, REPO_COMPANION_ISOLATED_HOST: '1',
      REPO_COMPANION_TEST_ROOT: testRoot, REPO_COMPANION_TEST_SUITE: 'installed', REPO_COMPANION_TEST_PHASE: phase };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, [workspace, ...scoped, '--extensionDevelopmentPath=' + path.join(root, 'tests', 'fixture'),
      '--disable-telemetry', '--disable-updates', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--new-window'],
    { cwd: root, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const log = fs.createWriteStream(path.join(testRoot, 'host-' + phase + '.log'));
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('Installed test host exceeded 90 seconds.')); }, 90000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Installed test host exited with ' + code)); });
    });
    log.end();
    const result = path.join(testRoot, 'result-' + phase + '.json');
    if (!fs.existsSync(result)) throw new Error(fs.existsSync(path.join(testRoot, 'failure.txt')) ? fs.readFileSync(path.join(testRoot, 'failure.txt'), 'utf8') : 'Installed fixture produced no result.');
    console.log(fs.readFileSync(result, 'utf8'));
  }
  console.log(command(['--uninstall-extension', 'keenanselbee.codex-navigator']));
  console.log('Disposable installed extension removed. Normal VS Code profile was not changed.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
