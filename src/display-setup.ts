import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import * as path from 'node:path';

interface PatchResult { status: 'patched' | 'compatible' | 'upgrade-available' | 'partial' | 'restored' }
interface LabelsStatus { label: string; detail: string; root?: string; status?: PatchResult['status']; extensions?: boolean; version?: string }
let changing = false;
let pendingReload: string | undefined;
let setupVisible = false;
const manualVersions = new Set<string>();
const automaticErrors = new Map<string, string>();

export function setChatSetupVisible(visible: boolean): void {
  const closed = setupVisible && !visible;
  setupVisible = visible;
  if (closed) { labelsChanged.fire(); }
}

export async function checkForCompanionUpdates(context: vscode.ExtensionContext): Promise<void> {
  await vscode.commands.executeCommand('workbench.extensions.action.checkForUpdates');
  await vscode.commands.executeCommand('workbench.extensions.search', `@id:${context.extension.id} @id:openai.chatgpt`);
}
const labelsChanged = new vscode.EventEmitter<void>();
const supportedVersion: string = require('../tools/patch-codex.cjs').supported.version;

async function runPatch(context: vscode.ExtensionContext, mode: 'check' | 'apply' | 'restore', root: string): Promise<PatchResult> {
  return new Promise((resolve, reject) => {
    // Electron provides Node for the bundled installer; users do not need a terminal or a separate Node install for labels.
    execFile(process.execPath, [path.join(context.extensionPath, 'tools', 'patch-codex.cjs'), mode, root], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) { reject(new Error(stderr.trim() || 'Could not update Codex. Close other setup windows and try again.')); return; }
      try {
        const result = JSON.parse(stdout) as PatchResult;
        if (!['patched', 'compatible', 'upgrade-available', 'partial', 'restored'].includes(result.status)) {
          throw new Error('Unexpected installer response.');
        }
        resolve(result);
      } catch { reject(new Error('Could not read the Codex setup result. Open setup again to check its status.')); }
    });
  });
}

export async function chatLabelsStatus(context: vscode.ExtensionContext): Promise<LabelsStatus> {
  const codex = vscode.extensions.getExtension('openai.chatgpt');
  if (!codex || codex.extensionUri.scheme !== 'file') {
    return { label: 'Needs Codex', detail: 'Install and enable the OpenAI Codex extension, then return here.', extensions: true };
  }
  if (codex.packageJSON.version !== supportedVersion) {
    return { label: 'Waiting for support', version: codex.packageJSON.version, extensions: true,
      detail: `Codex ${codex.packageJSON.version} needs a compatible Repo Companion update. Check Extensions for updates, then refresh setup. Project instruction routing does not require this integration. This release supports Codex ${supportedVersion}.` };
  }
  const reload = pendingReload === codex.extensionPath;
  try {
    const result = await runPatch(context, 'check', codex.extensionPath);
    const current = vscode.extensions.getExtension('openai.chatgpt');
    if (current?.extensionPath !== codex.extensionPath || current?.packageJSON.version !== codex.packageJSON.version) {
      return chatLabelsStatus(context);
    }
    const attempted = context.globalState.get<string[]>('chatPatchAttempts.v1', []).includes(
      JSON.stringify([codex.extensionPath, codex.packageJSON.version, context.extension.packageJSON.version]));
    const failure = automaticErrors.get(codex.extensionPath) || (result.status === 'compatible' && attempted
      && context.globalState.get('chatLabelsEnabled', false) ? 'Chat labels and stars still need setup. Enable them below to try again.' : '');
    return { root: codex.extensionPath, version: codex.packageJSON.version, status: result.status,
      label: reload ? 'Reload needed' : failure ? 'Needs attention' : result.status === 'patched' ? 'Enabled' : result.status === 'compatible' ? 'Off' : 'Needs attention',
      detail: reload ? 'Reload this window to finish the change.' : failure || (result.status === 'patched'
        ? 'Chat labels and stars are installed. Choose to restore Codex if you want to remove them.'
        : result.status === 'partial' ? 'Setup was interrupted. Enable chat labels to repair it, or restore Codex below.'
        : result.status === 'upgrade-available' ? 'A chat integration update is ready. Enable chat labels to apply it.'
        : 'Show project labels and save favourites. Enabling updates your installed Codex files.'),
    };
  } catch (error) {
    return { label: 'Needs attention', version: codex.packageJSON.version, extensions: true, detail: `Chat labels are unavailable for this installation. ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function configureChatLabels(context: vscode.ExtensionContext, restoreOnly = false): Promise<void> {
  if (changing) { return; }
  if (vscode.env.remoteName || !vscode.workspace.isTrusted) { throw new Error('Open a trusted local window to set up chat labels.'); }
  changing = true;
  try {
    const state = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Checking Codex...' }, () => chatLabelsStatus(context));
    if (!state.root || !state.status) {
      await vscode.window.showInformationMessage(state.detail);
      return;
    }
    if (state.label === 'Reload needed' && !restoreOnly) {
      if (await vscode.window.showInformationMessage('Reload this window to finish setting up chat labels.', 'Reload Window') === 'Reload Window') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
      return;
    }
    if (state.status === 'patched' && !restoreOnly) {
      const config = vscode.workspace.getConfiguration('codexRepoCompanion');
      const visible = config.get('showTabPrefix', true);
      const action = await vscode.window.showQuickPick([
        { label: visible ? 'Hide project labels' : 'Show project labels', description: 'Stars stay available.', value: 'visibility' },
        { label: 'Restore Codex...', description: 'Remove the chat integration and restore original files.', value: 'restore' },
        { label: 'Back', value: 'back' },
      ], { title: 'Chat Labels and Stars', placeHolder: 'The chat integration is installed.', ignoreFocusOut: true });
      if (action?.value === 'visibility') {
        await config.update('showTabPrefix', !visible, vscode.ConfigurationTarget.Workspace);
        return;
      }
      if (action?.value !== 'restore') { return; }
    }
    const restore = restoreOnly || state.status === 'patched';
    if (restore && state.status === 'compatible') {
      await context.globalState.update('chatLabelsEnabled', false);
      if (state.version) { manualVersions.add(state.version); }
      automaticErrors.delete(state.root);
      labelsChanged.fire();
      await vscode.window.showInformationMessage('Codex is already using its original files.');
      return;
    }
    if (state.version) { manualVersions.add(state.version); }
    const button = restore ? 'Restore Codex' : 'Enable Chat Labels';
    const choice = await vscode.window.showInformationMessage(restore ? 'Remove chat labels and stars from Codex?' : 'Enable chat labels and stars?', {
      modal: true,
      detail: restore
        ? 'This restores the original Codex files. Your chats, saved labels and project instructions are kept. Reload the window afterward. Restore before uninstalling Repo Companion.'
        : 'This modifies your installed Codex extension to show project labels and stars. It is an unofficial integration. Original files are backed up so you can restore them from setup. After updates, Companion reapplies this integration automatically only when the Codex version and files are supported. Reload the window afterward.\n\nProject instructions are a separate, optional setup step.',
    }, button);
    if (choice !== button) { return; }
    const current = vscode.extensions.getExtension('openai.chatgpt');
    if (!current || current.extensionPath !== state.root) { throw new Error('Codex changed during setup. Open setup again to check the new installation.'); }
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: restore ? 'Restoring Codex...' : 'Enabling chat labels...', cancellable: false },
      () => runPatch(context, restore ? 'restore' : 'apply', state.root!));
    automaticErrors.delete(state.root!);
    pendingReload = state.root;
    await context.globalState.update('chatLabelsEnabled', !restore);
    labelsChanged.fire();
    if (await vscode.window.showInformationMessage(restore ? 'Codex files restored. Reload to finish.' : 'Chat labels are installed. Reload to finish.', 'Reload Window') === 'Reload Window') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  } finally { changing = false; }
}


// The setup page presents consent beside its buttons; no secondary dialogs are needed.
export async function applyChatLabels(context: vscode.ExtensionContext, mode: 'apply' | 'restore', expectedRoot: string, automatic = false): Promise<void> {
  if (changing) { throw new Error('Chat setup is already running. Wait for it to finish.'); }
  if (vscode.env.remoteName || !vscode.workspace.isTrusted) { throw new Error('Open a trusted local window to set up chat labels.'); }
  changing = true;
  try {
    const current = vscode.extensions.getExtension('openai.chatgpt');
    if (!current || current.extensionPath !== expectedRoot) { throw new Error('Codex changed. Refresh setup before trying again.'); }
    if (!automatic) { manualVersions.add(current.packageJSON.version); }
    await runPatch(context, mode, expectedRoot);
    automaticErrors.delete(expectedRoot);
    pendingReload = expectedRoot;
    await context.globalState.update('chatLabelsEnabled', mode === 'apply');
    labelsChanged.fire();
  } finally { changing = false; }
}

// Check once at startup and when the Codex installation or our patch changes.
// Unrelated extension events neither repeat the check nor disturb setup drafts.
export function watchChatLabels(context: vscode.ExtensionContext, receive: (state: LabelsStatus) => void): vscode.Disposable {
  let disposed = false, generation = 0, identity = '';
  const refresh = async (force = false) => {
    const codex = vscode.extensions.getExtension('openai.chatgpt');
    const next = JSON.stringify([codex?.extensionPath, codex?.packageJSON.version]);
    if (disposed || (!force && identity === next)) { return; }
    identity = next;
    const current = ++generation;
    const state = await chatLabelsStatus(context);
    if (!disposed && current === generation) { receive(state); }
  };
  const subscriptions = [vscode.extensions.onDidChange(() => { void refresh(); }),
    labelsChanged.event(() => { void refresh(true); })];
  void refresh();
  return { dispose() { disposed = true; generation++; subscriptions.forEach(item => item.dispose()); } };
}

export function monitorChatLabels(context: vscode.ExtensionContext): void {
  if (vscode.env.remoteName || !vscode.workspace.isTrusted) { return; }
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  status.name = 'Codex Repo Companion setup';
  status.command = 'codexRepoCompanion.setUp';
  let disposed = false;
  let queue = Promise.resolve();
  const notified = new Set<string>();
  async function update(state: LabelsStatus) {
    if (disposed) { return; }
    const codex = vscode.extensions.getExtension('openai.chatgpt');
    if (!codex || codex.packageJSON.version !== state.version || state.root && state.root !== codex.extensionPath) { status.hide(); return; }
    if (pendingReload && pendingReload === state.root && state.label !== 'Reload needed') { state = await chatLabelsStatus(context); }
    // Recognized older installations are evidence of opt-in; an explicit restore wins.
    if ((state.status === 'patched' || state.status === 'upgrade-available')
      && context.globalState.get('chatLabelsEnabled') === undefined) {
      await context.globalState.update('chatLabelsEnabled', true);
    }
    const enabled = context.globalState.get('chatLabelsEnabled', false);
    const attempt = JSON.stringify([codex.extensionPath, state.version, context.extension.packageJSON.version]);
    const attempts = context.globalState.get<string[]>('chatPatchAttempts.v1', []);
    if (enabled && !changing && !setupVisible && !manualVersions.has(state.version!)
      && state.label !== 'Reload needed' && ['compatible', 'upgrade-available'].includes(state.status ?? '')
      && state.root && !attempts.includes(attempt)) {
      // Persist before starting: a crash or failed attempt must not create a retry loop.
      await context.globalState.update('chatPatchAttempts.v1', [...attempts.slice(-15), attempt]);
      if (disposed || setupVisible || changing) { return; }
      try { await applyChatLabels(context, 'apply', state.root, true); }
      catch (error) {
        automaticErrors.set(state.root, `Could not restore chat labels and stars automatically. Open setup to try again. ${error instanceof Error ? error.message : String(error)}`);
        labelsChanged.fire();
      }
      state = await chatLabelsStatus(context);
    }
    if (disposed || vscode.extensions.getExtension('openai.chatgpt')?.packageJSON.version !== state.version) { return; }
    const reload = state.label === 'Reload needed';
    const needsSetup = enabled && state.status === 'compatible' && !reload;
    const problem = state.label === 'Needs attention' || state.label === 'Waiting for support' || state.status === 'upgrade-available' || needsSetup;
    if (reload || problem) {
      status.text = reload ? '$(refresh) Reload Codex chat labels' : '$(warning) Codex chat labels';
      status.tooltip = state.detail;
      status.show();
    } else { status.hide(); }
    if (!enabled || (!problem && !reload) || changing || setupVisible || manualVersions.has(state.version!)
      || !vscode.window.state.focused || vscode.workspace.getConfiguration('codexRepoCompanion').get('silentMode', true)
      || notified.has(state.version!)) { return; }
    notified.add(state.version!);
    // Waiting for a notification response must not hold up later compatibility checks.
    void (async () => {
      if (reload) {
        if (await vscode.window.showInformationMessage('Chat labels and stars were updated. Reload when you are ready.', 'Reload Window', 'Not Now') === 'Reload Window' && !disposed) {
          await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
        return;
      }
      const reminders = context.globalState.get<Record<string, { shown: number; dismissed: boolean }>>('chatPatchReminders.v1', {});
      const previous = reminders[state.version!] ?? { shown: 0, dismissed: false };
      if (previous.dismissed || previous.shown >= 2) { return; }
      const reminder = { shown: previous.shown + 1, dismissed: false };
      reminders[state.version!] = reminder;
      await context.globalState.update('chatPatchReminders.v1', reminders);
      const choice = await vscode.window.showInformationMessage(
        'Chat labels and stars need attention for Codex ' + state.version + '. Project instruction routing does not require this integration.',
        'Open Setup', 'Not Now', "Don't Ask Again for This Version");
      if (choice === "Don't Ask Again for This Version") {
        await context.globalState.update('chatPatchReminders.v1', { ...context.globalState.get('chatPatchReminders.v1', {}), [state.version!]: { ...reminder, dismissed: true } });
      } else if (choice === 'Open Setup' && !disposed) { await vscode.commands.executeCommand('codexRepoCompanion.setUp'); }
    })().catch(error => console.warn('Codex Repo Companion notification failed:', error));
  }
  const watcher = watchChatLabels(context, state => {
    queue = queue.then(() => update(state)).catch(error => {
      if (!disposed) { status.text = '$(warning) Codex chat labels'; status.tooltip = String(error); status.show(); }
    });
  });
  context.subscriptions.push(status, watcher, { dispose() { disposed = true; } });
}
