import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import * as path from 'node:path';

interface PatchResult { status: 'patched' | 'compatible' | 'upgrade-available' | 'partial' | 'restored' }
interface LabelsStatus { label: string; detail: string; root?: string; status?: PatchResult['status']; extensions?: boolean }
let changing = false;
let pendingReload: string | undefined;
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
    return { label: 'Waiting for support', extensions: true,
      detail: `Codex ${codex.packageJSON.version} needs a compatible Repo Companion update. Check Extensions for updates, then refresh setup. Project instructions can still work. This release supports Codex ${supportedVersion}.` };
  }
  const reload = pendingReload === codex.extensionPath;
  try {
    const result = await runPatch(context, 'check', codex.extensionPath);
    const current = vscode.extensions.getExtension('openai.chatgpt');
    if (current?.extensionPath !== codex.extensionPath || current?.packageJSON.version !== codex.packageJSON.version) {
      return chatLabelsStatus(context);
    }
    return { root: codex.extensionPath, status: result.status,
      label: reload ? 'Reload needed' : result.status === 'patched' ? 'Enabled' : result.status === 'compatible' ? 'Off' : 'Needs attention',
      detail: reload ? 'Reload this window to finish the change.' : result.status === 'patched'
        ? 'Chat labels and stars are installed. Choose to restore Codex if you want to remove them.'
        : result.status === 'partial' ? 'Setup was interrupted. Enable chat labels to repair it, or restore Codex below.'
        : result.status === 'upgrade-available' ? 'A chat integration update is ready. Enable chat labels to apply it.'
        : 'Show project labels and save favourites. Enabling updates your installed Codex files.',
    };
  } catch (error) {
    return { label: 'Needs attention', extensions: true, detail: `Chat labels are unavailable for this installation. ${error instanceof Error ? error.message : String(error)}` };
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
      await vscode.window.showInformationMessage('Codex is already using its original files.');
      return;
    }
    const button = restore ? 'Restore Codex' : 'Enable Chat Labels';
    const choice = await vscode.window.showInformationMessage(restore ? 'Remove chat labels and stars from Codex?' : 'Enable chat labels and stars?', {
      modal: true,
      detail: restore
        ? 'This restores the original Codex files. Your chats, saved labels and project instructions are kept. Reload the window afterward. Restore before uninstalling Repo Companion.'
        : 'This modifies your installed Codex extension to show project labels and stars. It is an unofficial integration. Original files are backed up so you can restore them from setup. Codex updates may need a newer Companion version. Reload the window afterward.\n\nProject instructions are a separate, optional setup step.',
    }, button);
    if (choice !== button) { return; }
    const current = vscode.extensions.getExtension('openai.chatgpt');
    if (!current || current.extensionPath !== state.root) { throw new Error('Codex changed during setup. Open setup again to check the new installation.'); }
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: restore ? 'Restoring Codex...' : 'Enabling chat labels...', cancellable: false },
      () => runPatch(context, restore ? 'restore' : 'apply', state.root!));
    pendingReload = state.root;
    await context.globalState.update('chatLabelsEnabled', !restore);
    labelsChanged.fire();
    if (await vscode.window.showInformationMessage(restore ? 'Codex files restored. Reload to finish.' : 'Chat labels are installed. Reload to finish.', 'Reload Window') === 'Reload Window') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  } finally { changing = false; }
}


// The setup page presents consent beside its buttons; no secondary dialogs are needed.
export async function applyChatLabels(context: vscode.ExtensionContext, mode: 'apply' | 'restore', expectedRoot: string): Promise<void> {
  if (changing) { throw new Error('Chat setup is already running. Wait for it to finish.'); }
  if (vscode.env.remoteName || !vscode.workspace.isTrusted) { throw new Error('Open a trusted local window to set up chat labels.'); }
  changing = true;
  try {
    const current = vscode.extensions.getExtension('openai.chatgpt');
    if (!current || current.extensionPath !== expectedRoot) { throw new Error('Codex changed. Refresh setup before trying again.'); }
    await runPatch(context, mode, expectedRoot);
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
  const watcher = watchChatLabels(context, state => {
    const needsSetup = state.status === 'compatible' && context.globalState.get('chatLabelsEnabled', false);
    if (state.label === 'Needs attention' || state.label === 'Waiting for support' || needsSetup) {
      status.text = '$(warning) Codex chat labels';
      status.tooltip = needsSetup ? 'Codex changed. Open setup to enable chat labels again.' : state.detail;
      status.show();
    } else { status.hide(); }
  });
  context.subscriptions.push(status, watcher);
}
