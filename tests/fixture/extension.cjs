const vscode = require('vscode');
const path = require('node:path');
exports.activate = function (context) {
  const root = process.env.REPO_COMPANION_TEST_ROOT;
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  const scratch = normalize(path.resolve(__dirname, '..', '..', '.codex-temp') + path.sep);
  if (process.env.REPO_COMPANION_ISOLATED_HOST !== '1'
      || context.extensionMode !== vscode.ExtensionMode.Development
      || !root || !normalize(path.resolve(root)).startsWith(scratch)
      || normalize(vscode.workspace.workspaceFile?.fsPath ?? '') !== normalize(path.join(root, 'test.code-workspace'))) { return; }
  // Do not block activation: opening a fixture editor waits for this extension.
  setImmediate(() => {
    require('../integration.cjs').run().catch(error => console.error(error)).finally(() => {
      // This fixture runs only inside the explicitly isolated development process.
      void vscode.commands.executeCommand('workbench.action.quit');
    });
  });
};
