'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');

// Loaded only by the guarded isolated fixture. Close this editor before the
// next phase so real SecretStorage must survive, rather than bypassing the check.
exports.run = async function (_context, vscode) {
  const root = process.env.REPO_COMPANION_TEST_ROOT;
  try {
    const extension = vscode.extensions.getExtension('keenanselbee.codex-navigator');
    const { ChatSidebar } = require(path.join(extension.extensionUri.fsPath, 'dist/chat-sidebar'));
    const original = ChatSidebar.prototype.resolveWebviewView;
    let license;
    ChatSidebar.prototype.resolveWebviewView = function (view) { original.call(this, view); license = this.license; };
    await extension.activate();
    await vscode.commands.executeCommand('codexNavigator.chats.focus');
    const deadline = Date.now() + 15000;
    while (!license && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 60));
    assert.ok(license, 'captured production service composition');
    await license.check(false);
    const status = license.snapshot();
    assert.equal(status.allowed, false);
    assert.equal(status.storageCheck, true);
    assert.ok(!status.canStartTrial && !status.canActivate);
    fs.writeFileSync(path.join(root, 'result-storage.json'), JSON.stringify({ phase: 'storage', passed: true,
      scope: 'Harmless SecretStorage probe only; no trial, activation or provider request.' }));
  } catch (error) {
    fs.writeFileSync(path.join(root, 'failure.txt'), String(error.stack ?? error)); throw error;
  }
};
