'use strict';
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');

exports.run = async function (_fixtureContext, vscode) {
  const root = process.env.REPO_COMPANION_TEST_ROOT;
  const marker = name => path.join(root, 'license-window-' + name + '.json');
  const wait = async (check, label) => {
    const end = Date.now() + 20000;
    while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 60)); }
    throw new Error('Secondary window timed out: ' + label);
  };
  try {
    const { ChatSidebar } = require('../dist/chat-sidebar');
    _fixtureContext.subscriptions.push(vscode.window.registerUriHandler({ handleUri: uri => {
      fs.writeFileSync(marker('wrong-notification-window'), JSON.stringify({ path: uri.path }));
    } }));
    const { ChatGoals } = require('../dist/chat-goals');
    ChatGoals.prototype.readRecency = async () => [];
    ChatGoals.prototype.read = async () => ({});
    let context, license, profiles;
    const original = ChatSidebar.prototype.resolveWebviewView;
    ChatSidebar.prototype.resolveWebviewView = function (view) {
      original.call(this, view); context = this.context; license = this.license; profiles = this.profiles;
    };
    await vscode.extensions.getExtension('keenanselbee.codex-navigator').activate();
    await vscode.commands.executeCommand('codexNavigator.chats.focus');
    await wait(() => context && license?.allowed(), 'same profile admits the existing trial');
    const expected = JSON.parse(fs.readFileSync(path.join(root, 'trial-persistence.json'), 'utf8'));
    const record = JSON.parse(await context.secrets.get('license.production.v1'));
    assert.equal(record.installationId, expected.installationId);
    assert.equal(record.trialStartedAt, expected.trialStartedAt);
    assert.equal(profiles.activeId, 'default', 'new workspace inherits Default');
    assert.equal(profiles.get('customLabels.v1')['local/00000000-0000-0000-0000-000000000012'], 'UBC', 'workspace switch preserves custom labels');
    assert.equal(profiles.shared('browsingCompleted', false), true, 'new workspace retains browsing admission');
    const names = profiles.get('chatNames.v1', {});
    fs.writeFileSync(marker('ready'), JSON.stringify({ installationId: record.installationId }));
    const link=JSON.parse(fs.readFileSync(path.join(root,'notification-origin-link.json'),'utf8')).uri;
    const { vscodeExecutable, vscodeCli } = require('../tools/vscode-runtime.cjs');
    const executable=vscodeExecutable();
    require('node:child_process').execFileSync(executable,[vscodeCli(executable),
      '--user-data-dir='+path.join(root,'profile'),'--extensions-dir='+path.join(root,'extensions'),'--open-url',link],
      {windowsHide:true,timeout:10000,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'pipe'});
    await wait(() => fs.existsSync(marker('profile-start')), 'first window starts shared edit');
    names['00000000-0000-0000-0000-000000000091'] = 'Second window edit';
    await profiles.update('chatNames.v1', names);
    fs.writeFileSync(marker('profile-edited'), '{}');
    await wait(() => !license.allowed() && license.snapshot().state === 'trialExpired', 'expiry from the first window reaches this controller');
    fs.writeFileSync(marker('expired'), '{}');
    await wait(() => license.allowed(), 'restored access from the first window propagates');
    const restored = JSON.parse(await context.secrets.get('license.production.v1'));
    assert.equal(restored.trialStartedAt, expected.trialStartedAt);
    fs.writeFileSync(marker('passed'), JSON.stringify({ passed: true }));
  } catch (error) {
    fs.writeFileSync(marker('failed'), JSON.stringify({ error: error.stack || String(error) })); throw error;
  }
};
