import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import { prepareAgentHelper } from './agent-helper';
import { chatLabelsStatus, applyChatLabels, watchChatLabels, setChatSetupVisible, checkForCompanionUpdates } from './display-setup';
import { routingChoices, saveRoutingChoices } from './routing-setup';
import { routingStatus } from './routing-status';
import { containsPath } from './routing-config';

let currentPanel: vscode.WebviewPanel | undefined;

export async function openSetupPage(context: vscode.ExtensionContext): Promise<void> {
  if (currentPanel) { currentPanel.reveal(); return; }
  const media = vscode.Uri.joinPath(context.extensionUri, 'media');
  const panel = vscode.window.createWebviewPanel('codexRepoCompanion.setup', 'Set Up Repo Companion', vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] });
  currentPanel = panel;
  setChatSetupVisible(true);
  const nonce = randomBytes(24).toString('hex');
  const asset = (name: string) => panel.webview.asWebviewUri(vscode.Uri.joinPath(media, name)).toString();
  panel.webview.html = readFileSync(path.join(context.extensionPath, 'media', 'setup.html'), 'utf8')
    .replaceAll('{{csp}}', panel.webview.cspSource).replaceAll('{{nonce}}', nonce)
    .replace('{{style}}', asset('setup.css')).replace('{{script}}', asset('setup.js'));
  let disposed = false, busy = false, revision = 0;
  let choices = routingChoices();
  let plan: ReturnType<typeof prepareAgentHelper> | undefined;
  let labels: Awaited<ReturnType<typeof chatLabelsStatus>> | undefined;
  const subscriptions: vscode.Disposable[] = [];
  const send = (message: unknown) => { if (!disposed) { void panel.webview.postMessage(message); } };
  const git = vscode.extensions.getExtension('vscode.git')?.exports?.getAPI(1);
  function repositories() {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const aliases = vscode.workspace.getConfiguration('codexRepoCompanion').get<Record<string, string>>('repositoryAliases', {});
    return (git?.repositories ?? []).filter((repo: any) => repo.rootUri.scheme === 'file'
      && folders.some(folder => folder.uri.scheme === 'file' && containsPath(folder.uri.fsPath, repo.rootUri.fsPath)))
      .slice(0, 500).map((repo: any) => ({ path: repo.rootUri.fsPath,
        name: aliases[repo.rootUri.fsPath] || folders.find(folder => folder.uri.toString() === repo.rootUri.toString())?.name || path.basename(repo.rootUri.fsPath) }));
  }
  async function refresh(replaceChoices = true) {
    if (!replaceChoices) {
      labels = await chatLabelsStatus(context);
      send({ type: 'labels', labels });
      return;
    }
    choices = routingChoices();
    let routingError = '';
    try { plan = prepareAgentHelper(); } catch (error) { plan = undefined; routingError = String(error); }
    const workspace = vscode.workspace.workspaceFile?.scheme === 'file' ? vscode.workspace.workspaceFile.fsPath
      : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const scopes = choices.scopes.length ? choices.scopes : (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath);
    const routing = await routingStatus(plan, choices, workspace, scopes, repositories().map((repo: { path: string }) => repo.path));
    labels = await chatLabelsStatus(context);
    send({ type: 'state', routing, replaceChoices, revision: ++revision, choices, labels, globalFile: plan?.instructions ?? '', routingError,
      repositories: repositories() });
    if (JSON.stringify(routingChoices()) !== JSON.stringify(choices)) { send({ type: 'stale' }); }
    return routing;
  }
  const listChanged = () => send({ type: 'repositories', repositories: repositories() });
  subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(listChanged),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('codexRepoCompanion')) { send({ type: 'stale' }); }
    }));
  subscriptions.push(watchChatLabels(context, state => { labels = state; send({ type: 'labels', labels }); }));
  if (git) { subscriptions.push(git.onDidOpenRepository(listChanged), git.onDidCloseRepository(listChanged)); }
  subscriptions.push(panel.webview.onDidReceiveMessage(async message => {
    if (!message || typeof message !== 'object' || typeof message.type !== 'string' || busy || disposed) { return; }
    const allowed = ['ready', 'refresh', 'browseMain', 'browseScope', 'saveRouting', 'disableRouting', 'enableLabels', 'restoreLabels', 'reload', 'extensions', 'done'];
    if (!allowed.includes(message.type)) { return; }
    if (message.type === 'done') { panel.dispose(); return; }
    if (vscode.env.remoteName || !vscode.workspace.isTrusted || !vscode.workspace.workspaceFolders?.length) {
      send({ type: 'error', text: 'Open a trusted local workspace to continue.' }); return;
    }
    busy = true;
    send({ type: 'busy', busy: true });
    try {
      if (message.type === 'ready' || message.type === 'refresh') { await refresh(); }
      else if (message.type === 'browseMain' || message.type === 'browseScope') {
        const file = message.type === 'browseMain';
        const selected = await vscode.window.showOpenDialog({ title: file ? 'Choose shared instructions' : 'Choose project folder',
          openLabel: file ? 'Use This File' : 'Use This Folder', canSelectFiles: file, canSelectFolders: !file, canSelectMany: false,
          ...(file ? { filters: { 'Rules files': ['md', 'txt'] } } : {}) });
        if (!disposed && selected?.[0]?.scheme === 'file') { send({ type: file ? 'main' : 'scope', path: selected[0].fsPath }); }
      } else if (message.type === 'reload') { await vscode.commands.executeCommand('workbench.action.reloadWindow'); }
      else if (message.type === 'extensions') { await checkForCompanionUpdates(context); }
      else {
        if (message.revision !== revision || JSON.stringify(routingChoices()) !== JSON.stringify(choices)) {
          throw new Error('Settings changed. Refresh this page before applying your choices.');
        }
        if (message.type === 'saveRouting') {
          if (!plan) { throw new Error('Your global instructions need attention. Refresh to check them again.'); }
          await saveRoutingChoices(message.choices, choices, plan);
        } else if (message.type === 'disableRouting') {
          await vscode.workspace.getConfiguration('codexRepoCompanion').update('instructionRouting', false, vscode.ConfigurationTarget.Workspace);
        } else {
          if (!labels?.root || !labels.status) { throw new Error('Chat setup is unavailable. Refresh to check Codex again.'); }
          await applyChatLabels(context, message.type === 'enableLabels' ? 'apply' : 'restore', labels.root);
        }
        const routing = await refresh(message.type === 'saveRouting' || message.type === 'disableRouting');
        if (message.type === 'saveRouting' && routing?.label !== 'Ready') {
          send({ type: 'error', text: `Settings saved. Routing needs attention. ${routing?.detail ?? ''}`.trim() });
        } else { send({ type: 'notice', text: message.type === 'saveRouting' ? 'Project instructions are ready. Start a new Codex chat to use them.'
          : message.type === 'disableRouting' ? 'Routing is off for this workspace. Your other Codex instructions still apply.'
          : 'Codex files updated. Reload this window when you are ready.' }); }
      }
    } catch (error) {
      if (message.type === 'enableLabels' || message.type === 'restoreLabels') { await refresh(false); }
      send({ type: 'error', text: error instanceof Error ? error.message : String(error) }); }
    finally { busy = false; send({ type: 'busy', busy: false }); }
  }));
  panel.onDidDispose(() => { disposed = true; currentPanel = undefined; subscriptions.forEach(item => item.dispose()); setChatSetupVisible(false); });
  context.subscriptions.push(panel);
}
