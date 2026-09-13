import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import { prepareAgentHelper, prepareLabelHelper, installAgentHelper, labelHelperStatus } from './agent-helper';
import { configureActivityHooks } from './chat-activity';
import { hookSetupStatus, openHookReview } from './hook-setup';
import { codexHome } from './scope-store';
import { routingChoices, saveRoutingChoices } from './routing-setup';
import { routingStatus } from './routing-status';
import { containsPath } from './routing-config';

let currentPanel: vscode.WebviewPanel | undefined;

export async function openSetupPage(context: vscode.ExtensionContext, canUse?: () => Promise<boolean>): Promise<vscode.WebviewPanel> {
  if (currentPanel) { currentPanel.reveal(); return currentPanel; }
  const media = vscode.Uri.joinPath(context.extensionUri, 'media');
  const panel = vscode.window.createWebviewPanel('codexNavigator.setup', 'Set Up Codex Navigator', vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] });
  currentPanel = panel;
  const home = codexHome();
  const nonce = randomBytes(24).toString('hex');
  const asset = (name: string) => panel.webview.asWebviewUri(vscode.Uri.joinPath(media, name)).toString();
  panel.webview.html = readFileSync(path.join(context.extensionPath, 'media', 'setup.html'), 'utf8')
    .replaceAll('{{csp}}', panel.webview.cspSource).replaceAll('{{nonce}}', nonce)
    .replace('{{style}}', asset('setup.css')).replace('{{script}}', asset('setup.js'));
  let disposed = false, busy = false, revision = 0;
  let choices = routingChoices();
  let plan: ReturnType<typeof prepareAgentHelper> | undefined;
  let activity: Awaited<ReturnType<typeof hookSetupStatus>> | undefined;
  let checking: Promise<boolean> | undefined;
  async function refreshActivity(): Promise<boolean> {
    if (disposed) return false;
    if (checking) return checking;
    checking = (async () => {
      try { activity = await hookSetupStatus(context, home); send({ type: 'activity', activity }); return true; }
      catch (error) { send({ type: 'error', text: error instanceof Error ? error.message : String(error) }); return false; }
    })();
    try { return await checking; } finally { checking = undefined; }
  }
  const subscriptions: vscode.Disposable[] = [];
  const send = (message: unknown) => { if (!disposed) { void panel.webview.postMessage(message); } };
  function labelsStatus() {
    try { return { ...labelHelperStatus(home), enabled: vscode.workspace.getConfiguration('codexNavigator').get('agentRepositoryLabels', false) }; }
    catch (error) { return { installed: false, enabled: false, error: String(error) }; }
  }
  const git = vscode.extensions.getExtension('vscode.git')?.exports?.getAPI(1);
  function repositories() {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const aliases = vscode.workspace.getConfiguration('codexNavigator').get<Record<string, string>>('repositoryAliases', {});
    return (git?.repositories ?? []).filter((repo: any) => repo.rootUri.scheme === 'file'
      && folders.some(folder => folder.uri.scheme === 'file' && containsPath(folder.uri.fsPath, repo.rootUri.fsPath)))
      .slice(0, 500).map((repo: any) => ({ path: repo.rootUri.fsPath,
        name: aliases[repo.rootUri.fsPath] || folders.find(folder => folder.uri.toString() === repo.rootUri.toString())?.name || path.basename(repo.rootUri.fsPath) }));
  }
  async function refresh(replaceChoices = true) {
    choices = routingChoices();
    let routingError = '';
    try { plan = prepareAgentHelper(); } catch (error) { plan = undefined; routingError = String(error); }
    const workspace = vscode.workspace.workspaceFile?.scheme === 'file' ? vscode.workspace.workspaceFile.fsPath
      : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const scopes = choices.scopes.length ? choices.scopes : (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath);
    const routing = await routingStatus(plan, choices, workspace, scopes, repositories().map((repo: { path: string }) => repo.path));
    await refreshActivity();
    send({ type: 'state', routing, labels: labelsStatus(), replaceChoices, revision: ++revision, choices, activity, globalFile: plan?.instructions ?? '', routingError,
      repositories: repositories() });
    if (JSON.stringify(routingChoices()) !== JSON.stringify(choices)) { send({ type: 'stale' }); }
    return routing;
  }
  const listChanged = () => send({ type: 'repositories', repositories: repositories() });
  subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(listChanged),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (['instructionRouting', 'mainInstructionsFile', 'instructionScope', 'instructionFallbackNames'].some(key => event.affectsConfiguration('codexNavigator.' + key))) { send({ type: 'stale' }); }
      if (event.affectsConfiguration('codexNavigator.agentRepositoryLabels')) { send({ type: 'labels', labels: labelsStatus() }); }
    }));
  const poll = setInterval(() => { if (panel.visible && !busy) void refreshActivity(); }, 5000);
  subscriptions.push({ dispose() { clearInterval(poll); } });
  if (git) { subscriptions.push(git.onDidOpenRepository(listChanged), git.onDidCloseRepository(listChanged)); }
  subscriptions.push(panel.webview.onDidReceiveMessage(async message => {
    if (!message || typeof message !== 'object' || typeof message.type !== 'string' || busy || disposed) { return; }
    const allowed = ['ready', 'refresh', 'browseMain', 'browseScope', 'saveRouting', 'disableRouting', 'enableAutomaticLabels', 'disableAutomaticLabels', 'installHooks', 'disableHooks', 'verifyHooks', 'reviewHooks', 'showNavigator', 'arrangeNavigator', 'reload', 'focusSettings', 'done'];
    if (!allowed.includes(message.type)) { return; }
    if (message.type === 'done') { panel.dispose(); return; }
    if (vscode.env.remoteName || !vscode.workspace.isTrusted || !vscode.workspace.workspaceFolders?.length) {
      send({ type: 'error', text: 'Open a trusted local workspace to continue.' }); return;
    }
    busy = true;
    send({ type: 'busy', busy: true });
    try {
      if (['saveRouting', 'enableAutomaticLabels', 'installHooks'].includes(message.type) && canUse && !await canUse()) {
        send({ type: 'error', text: 'Start your trial or activate Navigator before enabling features. Removal remains available here.' }); return;
      }
      if (message.type === 'ready' || message.type === 'refresh') { await refresh(); }
      else if (message.type === 'browseMain' || message.type === 'browseScope') {
        const file = message.type === 'browseMain';
        const selected = await vscode.window.showOpenDialog({ title: file ? 'Choose shared instructions' : 'Choose project folder',
          openLabel: file ? 'Use This File' : 'Use This Folder', canSelectFiles: file, canSelectFolders: !file, canSelectMany: false,
          ...(file ? { filters: { 'Rules files': ['md', 'txt'] } } : {}) });
        if (!disposed && selected?.[0]?.scheme === 'file') { send({ type: file ? 'main' : 'scope', path: selected[0].fsPath }); }
      } else if (message.type === 'reload') { await vscode.commands.executeCommand('workbench.action.reloadWindow'); }
      else if (message.type === 'focusSettings') { await vscode.commands.executeCommand('workbench.action.openSettings', 'codexNavigator.detectChatFocus'); }
      else if (message.type === 'arrangeNavigator') {
        await vscode.commands.executeCommand('codexNavigator.chats.focus');
        send({ type: 'notice', text: 'Drag the Navigator heading above the Codex heading. Release when the insertion indicator appears above Codex, then resize the divider. VS Code remembers your arrangement.' });
      }
      else if (message.type === 'showNavigator') { await vscode.commands.executeCommand('codexNavigator.chats.focus'); }
      else if (message.type === 'reviewHooks') { openHookReview(home); send({ type: 'notice', text: 'In the Codex terminal, type /hooks and trust all Navigator hooks. Then reload this VS Code window and send a normal chat message.' }); }
      else if (message.type === 'verifyHooks') {
        if (await refreshActivity()) send({ type: 'notice', text: 'Status checked. ' + activity?.nextStep });
      }
      else if (message.type === 'enableAutomaticLabels' || message.type === 'disableAutomaticLabels') {
        const enable = message.type === 'enableAutomaticLabels';
        installAgentHelper(prepareLabelHelper(home, enable));
        // Refresh only the global-file snapshot we changed, preserving routing drafts and their settings revision.
        try { plan = prepareAgentHelper(home); } catch { plan = undefined; }
        await vscode.workspace.getConfiguration('codexNavigator').update('agentRepositoryLabels', enable, vscode.ConfigurationTarget.Global);
        send({ type: 'labels', labels: labelsStatus() });
        send({ type: 'notice', text: enable ? 'Automatic labels enabled. Start a new Codex chat to load the reporting guidance. Project instruction routing is unchanged.'
          : 'Automatic agent reports are off. Existing labels are kept. Start a new chat to stop loading the reporting guidance.' });
      }
      else if (message.type === 'installHooks' || message.type === 'disableHooks') {
        if (checking) await checking;
        const enable = message.type === 'installHooks';
        await configureActivityHooks(context.extensionPath, home, enable);
        await context.globalState.update('activityHooks.enabled', enable);
        if (enable) await context.globalState.update('activityHooks.installedAt', Date.now());
        await refreshActivity();
        send({ type: 'notice', text: enable ? 'Hooks installed. Review them in Codex, reload this window, then send a normal chat message to verify activity.' : 'Navigator hooks removed. Reload this window to refresh running Codex sessions.' });
      }
      else {
        if (message.revision !== revision || JSON.stringify(routingChoices()) !== JSON.stringify(choices)) {
          throw new Error('Settings changed. Refresh this page before applying your choices.');
        }
        if (message.type === 'saveRouting') {
          if (!plan) { throw new Error('Your global instructions need attention. Refresh to check them again.'); }
          await saveRoutingChoices(message.choices, choices, plan);
        } else if (message.type === 'disableRouting') {
          await vscode.workspace.getConfiguration('codexNavigator').update('instructionRouting', false, vscode.ConfigurationTarget.Workspace);
        }
        const routing = await refresh(message.type === 'saveRouting' || message.type === 'disableRouting');
        if (message.type === 'saveRouting' && routing?.label !== 'Ready') {
          send({ type: 'error', text: `Settings saved. Routing needs attention. ${routing?.detail ?? ''}`.trim() });
        } else { send({ type: 'notice', text: message.type === 'saveRouting' ? 'Project instructions are ready. Start a new Codex chat to use them.'
          : message.type === 'disableRouting' ? 'Routing is off for this workspace. Your other Codex instructions still apply.'
          : '' }); }
      }
    } catch (error) {
      send({ type: 'error', text: error instanceof Error ? error.message : String(error) }); }
    finally { busy = false; send({ type: 'busy', busy: false }); }
  }));
  panel.onDidDispose(() => { disposed = true; currentPanel = undefined; subscriptions.forEach(item => item.dispose()); });
  context.subscriptions.push(panel);
  return panel;
}
