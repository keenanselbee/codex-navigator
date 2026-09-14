const vscode = require('vscode');
const path = require('node:path');
exports.activate = function (context) {
  const root = process.env.REPO_COMPANION_TEST_ROOT;
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  const scratch = normalize(path.resolve(__dirname, '..', '..', '.codex-temp') + path.sep);
  const workspace = normalize(vscode.workspace.workspaceFile?.fsPath ?? '');
  const secondary = workspace === normalize(path.join(root ?? '', 'test-secondary.code-workspace'));
  if (process.env.REPO_COMPANION_ISOLATED_HOST !== '1'
      || context.extensionMode !== vscode.ExtensionMode.Development
      || !root || !normalize(path.resolve(root)).startsWith(scratch)
      || (!secondary && workspace !== normalize(path.join(root, 'test.code-workspace')))) { return; }
  // Do not block activation: opening a fixture editor waits for this extension.
  setImmediate(() => {
    const suite = process.env.REPO_COMPANION_TEST_PHASE === 'storage' ? '../storage-preflight.cjs'
      : process.env.REPO_COMPANION_TEST_SUITE === 'installed' ? '../installed-integration.cjs'
      : secondary ? '../license-window-integration.cjs' : '../sidebar-integration.cjs';
    require(suite).run(context, vscode).catch(error => console.error(error)).finally(() => {
      // This fixture runs only inside the explicitly isolated development process.
      // Quit targets the last active development window, so two hosts can both
      // close the secondary window. Close Window targets this renderer's ID.
      void vscode.commands.executeCommand(process.platform === 'darwin' && !secondary ? 'workbench.action.quit' : 'workbench.action.closeWindow');
    });
  });
};
