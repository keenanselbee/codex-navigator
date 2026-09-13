'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

async function main() {
  // VS Code terminals may inherit this from a CLI launcher. The test host is Electron.
  delete process.env.ELECTRON_RUN_AS_NODE;
  const root = path.resolve(__dirname, '..');
  const scratch = path.join(root, '.codex-temp');
  fs.mkdirSync(scratch, { recursive: true });
  const testRoot = fs.mkdtempSync(path.join(scratch, 'integration-'));
  const parent = path.join(testRoot, 'parent');
  const nested = path.join(parent, 'private');
  for (const directory of [parent, nested]) {
    fs.mkdirSync(directory, { recursive: true });
    execFileSync('git', ['init', '--quiet', directory], { windowsHide: true });
  }
  fs.writeFileSync(path.join(parent, '.gitignore'), 'private/\n');
  fs.writeFileSync(path.join(parent, 'parent.txt'), 'Parent test input\n');
  fs.writeFileSync(path.join(nested, 'private.txt'), 'Nested test input\n');
  const codexHome = path.join(testRoot, 'codex-home');
  const sessions = path.join(codexHome, 'sessions', '2026', '09', '11');
  fs.mkdirSync(sessions, { recursive: true });
  for (const [id, cwd] of [['00000000-0000-0000-0000-000000000001', parent], ['00000000-0000-0000-0000-000000000002', nested]]) {
    fs.writeFileSync(path.join(sessions, `rollout-${id}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { id, cwd, source: 'vscode' } }) + '\n');
  }
  const workspace = path.join(testRoot, 'test.code-workspace');
  fs.writeFileSync(workspace, JSON.stringify({ folders: [{ path: parent, name: 'Parent' }, { path: nested, name: 'Parent - Private' }], settings: {
    'git.openRepositoryInParentFolders': 'never', 'git.autofetch': false,
    'scm.repositories.selectionMode': 'multiple', 'security.workspace.trust.enabled': false,
    'telemetry.telemetryLevel': 'off', 'window.restoreWindows': 'none',
    'codexNavigator.instructionRouting': false,
  } }, null, 2));
  const executable = process.env.VSCODE_EXECUTABLE ?? 'C:\\Program Files\\Microsoft VS Code\\Code.exe';
  if (!fs.existsSync(executable)) { throw new Error('Set VSCODE_EXECUTABLE to an installed VS Code executable.'); }
  const userDirectory = path.join(testRoot, 'profile', 'User');
  fs.mkdirSync(userDirectory, { recursive: true });
  fs.writeFileSync(path.join(userDirectory, 'settings.json'), JSON.stringify({
    'window.confirmBeforeClose': 'never', 'window.confirmSaveUntitledWorkspace': false,
    'window.restoreWindows': 'none', 'window.closeWhenEmpty': true,
    'telemetry.telemetryLevel': 'off', 'update.mode': 'none',
  }, null, 2));
  console.log(`Isolated integration profile: ${testRoot}`);
  for (const phase of ['initial', 'restart']) {
    // --extensionTestsPath deliberately forces in-memory VS Code storage. A normal
    // isolated development host is required to test real restart persistence.
    const child = spawn(executable, [workspace,
      '--extensionDevelopmentPath=' + root,
      '--extensionDevelopmentPath=' + path.join(root, 'tests', 'fixture'),
      '--user-data-dir=' + path.join(testRoot, 'profile'),
      '--extensions-dir=' + path.join(testRoot, 'extensions'),
      '--disable-extensions', '--disable-telemetry', '--disable-updates',
      '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--new-window',
    ], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CODEX_HOME: codexHome, REPO_COMPANION_ISOLATED_HOST: '1',
        REPO_COMPANION_TEST_SUITE: 'sidebar', REPO_COMPANION_TEST_ROOT: testRoot, REPO_COMPANION_TEST_PHASE: phase },
    });
    const log = fs.createWriteStream(path.join(testRoot, `host-${phase}.log`));
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('Isolated test host exceeded 150 seconds.')); }, 150000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Test host exited with ${code}.`)); });
    });
    log.end();
    const resultPath = path.join(testRoot, `result-${phase}.json`);
    if (!fs.existsSync(resultPath)) {
      const failure = path.join(testRoot, 'failure.txt');
      throw new Error(fs.existsSync(failure) ? fs.readFileSync(failure, 'utf8') : `No test result; inspect ${testRoot}`);
    }
    console.log(fs.readFileSync(resultPath, 'utf8'));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
