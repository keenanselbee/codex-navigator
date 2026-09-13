'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

exports.run = async function (_fixtureContext, vscode) {
  const root = process.env.REPO_COMPANION_TEST_ROOT, phase = process.env.REPO_COMPANION_TEST_PHASE;
  try {
    const extension = vscode.extensions.getExtension('keenanselbee.codex-navigator');
    assert.ok(extension.extensionPath.toLowerCase().startsWith(path.join(root, 'extensions').toLowerCase() + path.sep));
    const expected = JSON.parse(fs.readFileSync(path.join(root, 'archive-receipt.json'), 'utf8'));
    let verifiedFiles = 0;
    for (const [name, hash] of Object.entries(expected.files)) {
      if (!name.startsWith('extension/') || name === 'extension/package.json') continue;
      assert.equal(createHash('sha256').update(fs.readFileSync(path.join(extension.extensionPath, name.slice(10)))).digest('hex'), hash, 'installed ' + name);
      verifiedFiles++;
    }
    assert.equal(extension.packageJSON.version, '0.0.0');
    const installedManifest=JSON.parse(fs.readFileSync(path.join(extension.extensionPath, 'package.json'), 'utf8'));
    delete installedManifest.__metadata; // Added by VS Code's installer.
    assert.deepEqual(installedManifest, JSON.parse(fs.readFileSync(path.join(root, 'expected-package.json'), 'utf8')));
    // VS Code loads the entry point from its URI fsPath (lowercase drive on Windows).
    // Matching that spelling avoids observing a second CommonJS module instance.
    const { ChatSidebar } = require(path.join(extension.extensionUri.fsPath, 'dist/chat-sidebar'));
    const { ChatGoals } = require(path.join(extension.extensionUri.fsPath, 'dist/chat-goals'));
    ChatGoals.prototype.readRecency = async () => [];
    ChatGoals.prototype.read = async () => ({});
    let context, license;
    const original = ChatSidebar.prototype.resolveWebviewView;
    ChatSidebar.prototype.resolveWebviewView = function (view) {
      original.call(this, view); context = this.context; license = this.license;
    };
    await extension.activate();
    await vscode.commands.executeCommand('codexNavigator.chats.focus');
    const until = async check => {
      const end = Date.now() + 15000;
      while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 60)); }
      throw new Error('Installed fixture timed out. ' + JSON.stringify({ active: extension.isActive,
        modules: Object.keys(require.cache).filter(name => /dist[\\/](extension|chat-sidebar)\.js$/.test(name)),
        context: !!context, license: !!license }));
    };
    await until(() => context && license);
    assert.equal(context.extensionMode, vscode.ExtensionMode.Production, 'loaded installed package, not development source');
    const secretKey = 'license.production.v1';
    const star = { 'local/00000000-0000-0000-0000-000000000001': true };
    let record;
    if (phase === 'installed') {
      assert.equal(license.allowed(), false);
      await license.action('startTrial'); assert.equal(license.allowed(), true);
      record = JSON.parse(await context.secrets.get(secretKey));
      record.trialStartedAt = Date.now() - 8*86400000; record.observedAt = Date.now();
      await context.secrets.store(secretKey, JSON.stringify(record));
      await context.workspaceState.update('starredChats.v1', star);
      await until(() => !license.allowed());
      fs.writeFileSync(path.join(root, 'expected-installation.json'), JSON.stringify({ installationId: record.installationId, trialStartedAt: record.trialStartedAt }));
    } else {
      record = JSON.parse(await context.secrets.get(secretKey));
      const prior = JSON.parse(fs.readFileSync(path.join(root, 'expected-installation.json'), 'utf8'));
      assert.equal(record.installationId, prior.installationId);
      assert.equal(record.trialStartedAt, prior.trialStartedAt);
      await until(() => license.snapshot().state === 'trialExpired');
      await license.action('startTrial');
      assert.equal(license.allowed(), false, 'settings reset and reinstall do not start another trial');
      assert.equal(JSON.parse(await context.secrets.get(secretKey)).trialStartedAt, prior.trialStartedAt);
      assert.deepEqual(context.workspaceState.get('starredChats.v1'), star, 'saved Navigator data survives reinstall');
    }
    fs.writeFileSync(path.join(root, 'result-' + phase + '.json'), JSON.stringify({ phase, passed: true, vscode: vscode.version,
      verifiedFiles, manifestVerified: true, installedVersion: '0.0.0', mode: 'Production', expired: !license.allowed(),
      scope: 'Disposable VSIX and isolated profile only. Trial state is deliberately expired by the fixture; no paid provider requests or normal installation changes.' }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(root, 'failure.txt'), error.stack || String(error)); throw error;
  }
};
