import { chatPins } from './chat-pins';
import * as vscode from 'vscode';
import { assignAutomaticColours, resolvedRepositoryColours } from './automatic-colours';
import { ChatGoals } from './chat-goals';
import { ChatSidebar } from './chat-sidebar';
import { LicenseAccess } from './license-access';
import { TranscriptActivity, combineActivity } from './activity-events';
import { RuntimeActivity } from './activity-runtime';
import { readChatActivity } from './chat-activity';
import { inheritedColour, readColours, repositoryColourKey } from './colours';
import { chooseColour } from './colour-picker';
import { hideRedundantLabel, readStarredChats } from './model';
import { RoutingPublisher } from './routing';
import { setUpAgentHelper, setUpNavigator } from './setup';
import { lastHookEvent } from './hook-setup';
import { Assignment, readRepositoryAliases, readManualTimes, customLabelError, readCustomLabels, assignmentKey, conversationKey, historyContextKey, conversationViewType, isNewPanel, readAssignments, repositoryLabel, sameRoot } from './model';
import { readRecentConversations, threadIdPattern } from './history';
import { ChatRecency } from './chat-recency';
import { watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { codexHome, SessionIndex, readScopeReport, reportedThreadIds, parseScopeReport, ScopeReport } from './scope-store';
import { DiscussionReader, projectNames } from './discussion';
import { effectiveMode, modeKey, readModes, scopeAssignment } from './scope';

interface GitApi {
  readonly state: 'uninitialized' | 'initialized';
  onDidChangeState: vscode.Event<'uninitialized' | 'initialized'>;
  readonly repositories: { rootUri: vscode.Uri }[];
  onDidOpenRepository: vscode.Event<unknown>;
  onDidCloseRepository: vscode.Event<unknown>;
}


export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const gitExtension = vscode.extensions.getExtension<{ getAPI(version: number): GitApi }>('vscode.git');
  const git = (await gitExtension?.activate())?.getAPI(1);
  if (!git) { return; }
  const license = new LicenseAccess(context);
  context.subscriptions.push(license);
  await license.check();
  const output = vscode.window.createOutputChannel('Codex Navigator');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 15);
  status.command = 'codexNavigator.assignRepository';
  const assignments = readAssignments(context.workspaceState.get(assignmentKey));
  const manualTimes = readManualTimes(context.workspaceState.get('manualLabelTimes.v1'));
  const customLabels = readCustomLabels(context.workspaceState.get('customLabels.v1'));
  const starredChats = readStarredChats(context.workspaceState.get('starredChats.v1'));
  const chatColours = readColours(context.workspaceState.get('chatColours.v1'), 'chat');
  let automaticColours = readColours(context.globalState.get('automaticRepositoryColours.v1'), 'repository');
  let colourBackground = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight ? '#F3F3F3' : '#181818';
  let colourCache = { key: '', value: {} as Record<string, string> };
  const modes = readModes(context.workspaceState.get(modeKey));
  // Remove old guesses before publishing labels or routing, preserving manual choices.
  const detectOnStartup = vscode.workspace.getConfiguration('codexNavigator').get('detectChatFocus', false);
  for (const [key, assignment] of license.allowed() ? Object.entries(assignments) : []) {
    if (effectiveMode(modes[key], assignment) === 'auto' && !manualTimes[key] && !customLabels[key]
      && (assignment.source === 'directory' || assignment.source === 'discussion' && !detectOnStartup)) {
      delete assignments[key];
    }
  }
  if (license.allowed()) await context.workspaceState.update(assignmentKey, assignments);
  const home = codexHome();
  const routing = new RoutingPublisher(home);
  const customRouting: Record<string, string> = Object.create(null);
  const savedRouting = context.workspaceState.get<Record<string, unknown>>('customRouting.v1', {});
  for (const [key, root] of Object.entries(savedRouting ?? {})) {
    if (typeof root === 'string' && path.isAbsolute(root) && root.length <= 4096 && !/[\x00-\x1f]/.test(root)) { customRouting[key] = root; }
  }
  const sessions = new SessionIndex(home);
  const discussionReader = new DiscussionReader();
  const transcriptActivity = new TranscriptActivity();
  const codexPath = vscode.extensions.getExtension('openai.chatgpt')?.extensionPath;
  const runtimeActivity = new RuntimeActivity(codexPath ? path.join(codexPath, 'bin', 'windows-x86_64', 'codex.exe') : undefined, home,
    message => output.appendLine(JSON.stringify({ time: new Date().toISOString(), event: 'activity-runtime', message })));
  const chatGoals = new ChatGoals(!vscode.env.remoteName && codexPath ? path.join(codexPath, 'bin', 'windows-x86_64', 'codex.exe') : undefined, home,
    message => output.appendLine(JSON.stringify({ time: new Date().toISOString(), event: 'chat-goals', message })));
  context.subscriptions.push(runtimeActivity, chatGoals);
  const discussionKeys = new Set<string>();
  const discussionScopes: Record<string, ScopeReport> = Object.create(null);
  const savedDiscussion = context.workspaceState.get<Record<string, unknown>>('discussionScopes.v1', {});
  for (const [id, value] of Object.entries(savedDiscussion && typeof savedDiscussion === 'object' ? savedDiscussion : {}).slice(0, 2000)) {
    const record = parseScopeReport(value, id);
    if (record) { discussionScopes[id] = record; }
  }
  let discussionTimer: ReturnType<typeof setTimeout> | undefined;
  const knownKeys = new Set([...Object.keys(assignments), ...Object.keys(customLabels), ...Object.keys(chatColours)]);
  const pendingKeys = new Set<string>();
  let scopeTimer: ReturnType<typeof setTimeout> | undefined;
  let previousActive: vscode.Tab | undefined;
  let generation = 0;
  let queue = Promise.resolve();
  let disposed = false;
  const warned = new Set<string>();

  function repositoryNames() {
    const aliases = readRepositoryAliases(vscode.workspace.getConfiguration('codexNavigator').get('repositoryAliases'));
    return [...aliases, ...(vscode.workspace.workspaceFolders?.map(folder => ({ fsPath: folder.uri.fsPath, name: folder.name })) ?? [])];
  }

  function displayFor(key: string, folders = repositoryNames(), showRedundant = false) {
    const assignment = assignments[key];
    const mode = effectiveMode(modes[key], assignment);
    if (customLabels[key]) {
      return { label: customLabels[key], tooltip: mode === 'pinned' ? 'Custom label (fixed)' : 'Custom label (manual correction; follows newer discussion)' };
    }
    const roots = (assignment?.members ?? (assignment ? [assignment] : [])).map(item => ({ root: item.root, fsPath: vscode.Uri.parse(item.root).fsPath }));
    const display = scopeAssignment(roots, assignment?.source ?? 'agent', folders);
    if (!showRedundant && hideRedundantLabel(roots.map(root => root.fsPath), git!.repositories.filter(repo => repo.rootUri.scheme === 'file').map(repo => repo.rootUri.fsPath),
      mode === 'auto' && !manualTimes[key], vscode.workspace.getConfiguration('codexNavigator').get('hideRedundantRepositoryLabels', true))) {
      return { label: '', tooltip: 'Automatic repository label hidden in this single-repository workspace.' };
    }
    const origin = mode === 'pinned' ? 'Repository label (fixed)' : mode === 'none' ? 'Automatic labels paused' : manualTimes[key] ? 'Manual correction (follows newer discussion)' : assignment?.source === 'discussion' ? 'Automatic: detected from your chat message' : assignment?.source === 'agent' ? 'Automatic: reported by agent' : assignment?.source === 'correction' ? 'Automatic: user-corrected scope' : vscode.workspace.getConfiguration('codexNavigator').get('agentRepositoryLabels', false) ? 'Waiting for the agent to report repository scope' : 'Choose a repository, or enable Automatic labels in Navigator setup';
    return { label: roots.length === 1 && !assignment?.members ? repositoryLabel(roots[0].fsPath, folders) : display?.label ?? '', tooltip: [origin, ...roots.map(root => root.fsPath)].join('\n').slice(0, 16000) };
  }

  function repositoryColours() {
    const custom = readColours(vscode.workspace.getConfiguration('codexNavigator').get('repositoryColours'), 'repository');
    const key = JSON.stringify([automaticColours, custom, colourBackground]);
    if (key !== colourCache.key) colourCache = { key, value: resolvedRepositoryColours(automaticColours, custom, colourBackground) };
    return colourCache.value;
  }

  function pinRepositoryChoice() {
    const preference = vscode.workspace.getConfiguration('codexNavigator').inspect<boolean>('keepManualLabelsFixed');
    const explicit = preference?.workspaceFolderValue ?? preference?.workspaceValue ?? preference?.globalValue;
    return explicit ?? git!.repositories.filter(repo => repo.rootUri.scheme === 'file').length <= 1;
  }

  function colourFor(key: string, override = chatColours[key],
    repositories = repositoryColours(), folders = repositoryNames()) {
    const assignment = assignments[key];
    const roots = effectiveMode(modes[key], assignment) === 'none' ? [] : customLabels[key]
      ? (customRouting[key] ? [customRouting[key]] : [])
      : (assignment?.members ?? (assignment ? [assignment] : [])).map(item => vscode.Uri.parse(item.root).fsPath);
    const colour = inheritedColour(override, roots, repositories);
    const sources = [...new Set(roots.map(repositoryColourKey))].filter(root => repositories[root]);
    const detail = override ? `Chat colour: ${colour}` : colour
      ? `Repository colour${sources.length > 1 ? ' blend' : ''}: ${colour}\n${sources.map(root => `${repositoryLabel(root, folders)}: ${repositories[root]}`).join('\n')}` : '';
    return { colour, detail };
  }

  const recency = new ChatRecency(context.workspaceState.get('chatRecencyOrder.v1'));
  async function readSidebarChats(startup = false) {
    if (!license.allowed()) return [];
    let index: Awaited<ReturnType<typeof readRecentConversations>> = [];
    try { index = await readRecentConversations(home); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { if (!startup) throw error; report(error); } }
    const previous = JSON.stringify(recency.snapshot);
    if (!license.allowed()) return [];
    const nativeRecent = startup ? undefined : await chatGoals.readRecency();
    if (!license.allowed()) return [];
    const recent = recency.update(nativeRecent, index);
    if (JSON.stringify(recency.snapshot) !== previous) await context.workspaceState.update('chatRecencyOrder.v1', recency.snapshot);
    // Keep explicitly pinned chats even when they fall out of bounded native history.
    for (const pin of Object.values(chatPins(context.globalState.get('pinnedChats.v1')))) {
      if (!recent.some(item => item.id === pin.chat.id)) recent.push(pin.chat);
    }
    let updated = false;
    for (const item of startup ? [] : recent.slice(0, 8)) {
      const key = 'local/' + item.id;
      knownKeys.add(key);
      if (await updateAutoScope(key)) { updated = true; }
    }
    if (updated) { await context.workspaceState.update(assignmentKey, assignments); }
    const folders = repositoryNames(), colours = repositoryColours();
    const activityEnabled = !startup && context.globalState.get('activityHooks.enabled', false);
    const runtime = activityEnabled ? await runtimeActivity.read(new Set(recent.map(item => item.id))) : new Map();
    const seen = context.globalState.get<Record<string, number>>('activitySeen.v1', {});
    const items = [];
    // Sequential metadata lookups share the bounded session index. Unchanged tails are cached.
    for (const item of recent) {
      if (!license.allowed()) return [];
      const key = 'local/' + item.id, display = displayFor(key, folders, true), colour = colourFor(key, chatColours[key], colours, folders);
      let activity;
      if (activityEnabled) {
        const hook = await readChatActivity(home, item.id);
        const filename = await sessions.fileFor(item.id);
        const transcript = filename ? await transcriptActivity.read(filename) : { status: 'unknown' as const, workedAt: 0 };
        activity = combineActivity(hook, transcript, seen[item.id]);
        const live = runtime.get(item.id);
        if (live) activity = { ...live, workedAt: Math.max(activity.workedAt, live.workedAt) };
        if (activity.status === 'ready' && (activity.completedAt || 0) <= (seen[item.id] || 0)) activity = { ...activity, status: 'idle', detail: undefined };
      }
      items.push({ ...item, label: display.label, hasCustomLabel: !!customLabels[key], colour: colour.colour, starred: !!starredChats[key],
        activity: activity?.status, activityDetail: activity?.detail, completedAt: activity?.completedAt,
        tooltip: [item.title, display.tooltip, colour.detail].filter(Boolean).join('\n') });
    }
    return items;
  }
  const sidebar = new ChatSidebar(context, () => readSidebarChats(), { read: ids => chatGoals.read(ids), stop: () => chatGoals.stop(),
    change: (id, expected) => runtimeActivity.changeGoal(id, expected) }, background => {
      if (background !== colourBackground) { colourBackground = background; refresh(true); }
    }, () => git!.repositories.filter(repo => repo.rootUri.scheme === 'file').map(repo => ({
      root: repo.rootUri.fsPath, label: repositoryLabel(repo.rootUri.fsPath, repositoryNames()),
      colour: repositoryColours()[repositoryColourKey(repo.rootUri.fsPath)],
    })), async () => context.globalState.get('activityHooks.enabled', false)
      && !!await lastHookEvent(home, context.globalState.get('activityHooks.installedAt', 0)), () => readSidebarChats(true), license);
  context.subscriptions.push(sidebar, vscode.window.registerWebviewViewProvider('codexNavigator.chats', sidebar));
  context.subscriptions.push(license.onDidChange(() => {
    if (!license.allowed()) {
      generation++; clearTimeout(discussionTimer); discussionTimer = undefined; clearTimeout(scopeTimer);
      pendingKeys.clear(); chatGoals.stop(); runtimeActivity.stop(); status.hide();
      void routing.publish().catch(error => report(error));
    } else refresh(true);
    void sidebar.refresh();
  }));

  async function saveManualChoice(key: string, repository = false) {
    // Block in-flight automatic reads before awaiting metadata.
    modes[key] = 'pinned';
    const pin = repository ? pinRepositoryChoice() : vscode.workspace.getConfiguration('codexNavigator').get('keepManualLabelsFixed', true);
    if (pin) { delete manualTimes[key]; }
    else {
      const id = key.startsWith('local/') ? key.slice(6) : '';
      const reports = threadIdPattern.test(id) ? await Promise.all([readScopeReport(home, id), readScopeReport(home, id, 'corrections')]) : [];
      manualTimes[key] = Math.max(Date.now(), (manualTimes[key] ?? 0) + 1, discussionScopes[id]?.reportedAt ?? 0, ...reports.map(report => report?.reportedAt ?? 0));
      modes[key] = 'auto';
    }
    await context.workspaceState.update('manualLabelTimes.v1', manualTimes);
    await context.workspaceState.update(modeKey, modes);
  }

  async function updateAutoScope(key: string): Promise<boolean> {
    if (!license.allowed()) return false;
    const manualTime = manualTimes[key];
    if ((customLabels[key] && !manualTime) || !key.startsWith('local/') || effectiveMode(modes[key], assignments[key]) !== 'auto') { return false; }
    const id = key.slice(6);
    if (!threadIdPattern.test(id)) { return false; }
    const folders = repositoryNames();
    const [agentReport, correction] = await Promise.all([readScopeReport(home, id), readScopeReport(home, id, 'corrections')]);
    const detect = vscode.workspace.getConfiguration('codexNavigator').get('detectChatFocus', false);
    if (detect && discussionKeys.has(key)) {
      const filename = await sessions.fileFor(id);
      if (filename) {
        const detected = await discussionReader.read(filename, id, projectNames(git!.repositories.map(repo => repo.rootUri.fsPath), folders));
        if (!license.allowed()) return false;
        if (detected && detected.reportedAt > (discussionScopes[id]?.reportedAt ?? 0)) {
          discussionScopes[id] = detected;
          await context.workspaceState.update('discussionScopes.v1', discussionScopes);
        }
      }
    }
    const choices = [
      { report: vscode.workspace.getConfiguration('codexNavigator').get('agentRepositoryLabels', false) ? agentReport : undefined, source: 'agent' as const },
      { report: correction, source: 'correction' as const },
      { report: detect ? discussionScopes[id] : undefined, source: 'discussion' as const },
    ].filter(item => item.report).sort((a, b) => b.report!.reportedAt - a.report!.reportedAt);
    const chosen = choices[0];
    if (!chosen) return false;
    const reported = chosen.report;
    if (manualTime && (!reported || reported.reportedAt <= manualTime)) { return false; }
    let next: Assignment | undefined;
    if (reported) {
      const roots = [];
      for (const root of reported.roots) {
        const uri = vscode.Uri.file(root);
        // Labels can describe a Git root outside this window.
        try { await vscode.workspace.fs.stat(vscode.Uri.joinPath(uri, '.git')); }
        catch { return false; }
        roots.push({ root: uri.toString(), fsPath: uri.fsPath });
      }
      next = scopeAssignment(roots, chosen.source, folders);
    }
    // A manual correction made while metadata was being read always wins.
    if (!license.allowed() || manualTimes[key] !== manualTime || (customLabels[key] && !manualTime) || effectiveMode(modes[key], assignments[key]) !== 'auto' || disposed) { return false; }
    if (chosen.source === 'agent' && !vscode.workspace.getConfiguration('codexNavigator').get('agentRepositoryLabels', false)) return false;
    const replacedCustom = Boolean(customLabels[key]);
    if (manualTime) {
      delete customLabels[key]; delete manualTimes[key];
      await context.workspaceState.update('customLabels.v1', customLabels);
      await context.workspaceState.update('manualLabelTimes.v1', manualTimes);
    }
    if (JSON.stringify(next) === JSON.stringify(assignments[key])) { return replacedCustom; }
    if (next) { assignments[key] = next; } else { delete assignments[key]; }
    trace('scope-changed', { key, source: next?.source ?? 'empty', root: next?.root ?? null });
    return true;
  }

  function scheduleScopeRefresh(key?: string) {
    if (disposed || !license.allowed()) { return; }
    if (key) { knownKeys.add(key); pendingKeys.add(key); }
    else { for (const item of knownKeys) { pendingKeys.add(item); } }
    clearTimeout(scopeTimer);
    scopeTimer = setTimeout(() => {
      queue = queue.then(async () => {
        let changed = false;
        for (const item of [...pendingKeys]) {
          pendingKeys.delete(item);
          try { changed = await updateAutoScope(item) || changed; } catch (error) { report(error); }
        }
        if (changed) { await context.workspaceState.update(assignmentKey, assignments); }
      }).then(() => refresh()).catch(error => report(error));
    }, 150);
  }

  function editorChat(tab = vscode.window.tabGroups.activeTabGroup.activeTab) {
    const input = tab?.input;
    if (!(input instanceof vscode.TabInputCustom) || input.viewType !== conversationViewType) { return undefined; }
    const key = conversationKey(input.uri);
    return key && tab ? { key, uri: input.uri, tab, surfaceId: undefined as string | undefined, kind: 'panel' as const } : undefined;
  }

  function chat() { return editorChat(); }

  function isLauncher(tab = vscode.window.tabGroups.activeTabGroup.activeTab): boolean {
    const input = tab?.input;
    return (input instanceof vscode.TabInputCustom && input.viewType === conversationViewType && isNewPanel(input.uri))
      || (input instanceof vscode.TabInputWebview && input.viewType === 'chatgpt.panelView');
  }

  async function openSavedChat(id?: string): Promise<vscode.Uri | undefined> {
    if (!id) {
      let recent;
      try { recent = await readRecentConversations(); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
        throw new Error('No local Codex chat index was found. This picker currently supports local Windows Codex chats.');
      }
      if (!recent.length) { throw new Error('No saved local chats were found. Finish a first message in Codex, then try again.'); }
      const picked = await vscode.window.showQuickPick(recent.map(item => ({
        label: item.title || 'Untitled chat', description: new Date(item.updatedAt).toLocaleString(),
        detail: item.id, id: item.id,
      })), { title: 'Choose the saved Codex conversation to open', placeHolder: 'Most recently updated first; select your test conversation', matchOnDetail: true });
      if (!picked) { return undefined; }
      id = picked.id;
    }
    if (!threadIdPattern.test(id)) { throw new Error('The saved conversation ID is invalid.'); }
    if (!license.allowed() || disposed) return undefined;
    const uri = vscode.Uri.from({ scheme: 'openai-codex', authority: 'route', path: `/local/${id}` });
    await vscode.commands.executeCommand('vscode.openWith', uri, conversationViewType, { preview: false });
    return uri;
  }

  async function syncMetadata() {
    if (!license.allowed()) { await routing.publish(); return; }
    const custom = readColours(vscode.workspace.getConfiguration('codexNavigator').get('repositoryColours'), 'repository');
    const nextColours = automaticRepositoryColours(custom);
    if (JSON.stringify(nextColours) !== JSON.stringify(automaticColours)) {
      automaticColours = nextColours;
      await context.globalState.update('automaticRepositoryColours.v1', automaticColours);
    }
    const config = vscode.workspace.getConfiguration('codexNavigator');
    try {
      const workspace = vscode.workspace.workspaceFile?.scheme === 'file' ? vscode.workspace.workspaceFile.fsPath
        : vscode.workspace.workspaceFolders?.find(folder => folder.uri.scheme === 'file')?.uri.fsPath;
      if (workspace && !vscode.env.remoteName) {
        const chats: Record<string, string[]> = Object.create(null);
        for (const key of [...knownKeys].slice(-2000)) {
          if (!key.startsWith('local/')) { continue; }
          const assignment = assignments[key];
          chats[key] = effectiveMode(modes[key], assignment) === 'none' ? [] : customLabels[key]
            ? (customRouting[key] ? [customRouting[key]] : [])
            : (assignment?.members ?? (assignment ? [assignment] : [])).map(item => vscode.Uri.parse(item.root).fsPath);
        }
        const scopes = config.get<string[]>('instructionScope', []);
        const main = config.get('mainInstructionsFile', '');
        await routing.publish({ version: 2, pid: process.pid, main, chats, profile: {
          version: 1, workspace, enabled: config.get('instructionRouting', false), main,
          scopes: scopes.length ? scopes : (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath),
          fallbackNames: config.get<string[]>('instructionFallbackNames', []),
        } });
      } else { await routing.publish(); }
    } catch (error) { report(error); }
  }

  function automaticRepositoryColours(custom: Record<string, string>) {
    // Repository-open events arrive during Git's initial scan. Allocate only
    // once its full initial list is available; keep saved colours while waiting.
    if (git!.state !== 'initialized') return automaticColours;
    // Webview background reports can arrive before or after Git discovery.
    // Use a stable theme baseline to assign hues, then adapt them for display.
    const kind = vscode.window.activeColorTheme.kind;
    const background = kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight ? '#F3F3F3' : '#181818';
    return assignAutomaticColours(git!.repositories.filter(repo => repo.rootUri.scheme === 'file').map(repo => repo.rootUri.fsPath), automaticColours, custom, background);
  }

  function showStatus() {
    const active = chat();
    if (!active) {
      if (isLauncher()) {
        status.text = '$(repo) Open saved chat to assign repository';
        status.tooltip = 'This Codex tab has a generic panel address. Choose its saved conversation to open an identifiable chat tab.';
        status.command = 'codexNavigator.openSavedChat';
        status.show();
      } else { status.hide(); }
      return;
    }
    status.command = 'codexNavigator.scopeMenu';
    const display = displayFor(active.key);
    status.text = `$(repo) ${display.label || 'Assign chat repository'}`;
    status.tooltip = display.tooltip + '\nClick to change the label.';
    status.show();
  }

  function trace(event: string, details: Record<string, unknown> = {}) {
    output.appendLine(JSON.stringify({ time: new Date().toISOString(), event, ...details }));
  }

  function report(error: unknown, notify = false) {
    const message = error instanceof Error ? error.message : String(error);
    trace('error', { message, manual: notify });
    const silent = vscode.workspace.getConfiguration('codexNavigator').get('silentMode', true);
    if (notify || (!silent && !warned.has(message))) {
      warned.add(message);
      void vscode.window.showWarningMessage(`Codex Navigator: ${message}`);
    }
  }

  function refresh(force = false) {
    if (disposed || !license.allowed()) { return; }
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const changed = previousActive !== activeTab;
    previousActive = activeTab;
    if (changed || force) { generation++; }
    queue = queue.then(async () => {
      if (disposed || !license.allowed()) { return; }
      await syncMetadata();
      const active = chat();
      if (active) {
        knownKeys.add(active.key);
        discussionKeys.add(active.key);
        if (await updateAutoScope(active.key)) {
          await context.workspaceState.update(assignmentKey, assignments);
          await syncMetadata();
        }
      }
      showStatus();
      void sidebar.refresh();
    }).catch(error => report(error));
  }

  async function assign(uri?: vscode.Uri, repositoryUri?: vscode.Uri) {
    await syncMetadata();
    let current = uri instanceof vscode.Uri ? { key: conversationKey(uri) } : chat();
    if (!current?.key && (uri instanceof vscode.Uri ? isNewPanel(uri) : isLauncher())) {
      const saved = await openSavedChat();
      if (!saved) { return; }
      current = { key: conversationKey(saved) };
    }
    if (!current?.key) { throw new Error('Right-click a chat in Navigator to choose its repository, or open a saved chat tab first.'); }
    const folders = repositoryNames();
    const picks = git!.repositories.filter(repo => repo.rootUri.scheme === 'file').map(repo => ({
      label: repositoryLabel(repo.rootUri.fsPath, folders), description: repo.rootUri.fsPath,
      assignment: { root: repo.rootUri.toString(), label: repositoryLabel(repo.rootUri.fsPath, folders) } satisfies Assignment,
    }));
    const picked = repositoryUri instanceof vscode.Uri
      ? picks.find(item => sameRoot(item.assignment.root, repositoryUri.toString()))
      : await vscode.window.showQuickPick(picks, { title: 'Choose repository for this chat', matchOnDescription: true });
    if (repositoryUri && !picked) { throw new Error('The requested repository is not an open local Git repository.'); }
    if (!picked || !license.allowed() || disposed) { return; }
    delete customRouting[current.key];
    await context.workspaceState.update('customRouting.v1', customRouting);
    delete customLabels[current.key];
    await context.workspaceState.update('customLabels.v1', customLabels);
    assignments[current.key] = picked.assignment;
    await saveManualChoice(current.key, true);
    knownKeys.add(current.key);
    await context.workspaceState.update(modeKey, modes);
    await context.workspaceState.update(assignmentKey, assignments);
    refresh(true);
    await queue;
  }

  async function setCustomLabel(uri?: vscode.Uri, suppliedLabel?: string) {
    await syncMetadata();
    const key = uri instanceof vscode.Uri ? conversationKey(uri) : chat()?.key;
    if (!key) { throw new Error('Focus a saved Codex chat or right-click its title first.'); }
    const value = suppliedLabel ?? await vscode.window.showInputBox({
      title: 'Custom chat label', prompt: vscode.workspace.getConfiguration('codexNavigator').get('keepManualLabelsFixed', true) ? 'Display label only. Stays fixed until changed manually.' : 'Display label only. Newer discussion can update it.',
      value: customLabels[key] ?? assignments[key]?.label ?? '',
      placeHolder: 'For example: Elden Ring modding', validateInput: customLabelError,
    });
    if (value === undefined || !license.allowed() || disposed) { return; }
    if (typeof value !== 'string') { throw new Error('Enter a text label.'); }
    const error = customLabelError(value);
    if (error) { throw new Error(error); }
    if (!customLabels[key]) {
      delete customRouting[key];
      await context.workspaceState.update('customRouting.v1', customRouting);
    }
    customLabels[key] = value.trim();
    await saveManualChoice(key);
    knownKeys.add(key);
    await context.workspaceState.update('customLabels.v1', customLabels);
    await context.workspaceState.update(modeKey, modes);
    refresh(true);
    await queue;
  }


  async function setChatColour(uri?: vscode.Uri) {
    await syncMetadata();
    const key = uri instanceof vscode.Uri ? conversationKey(uri) : chat()?.key;
    if (!key) { throw new Error('Focus a saved Codex chat or right-click its title first.'); }
    let title;
    try { title = (await readRecentConversations(home)).find(item => item.id === key.slice(6))?.title; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') report(error); }
    const inherited = colourFor(key, '').colour;
    const colour = await chooseColour(context, title ? `Chat: ${title}` : 'Chat colour', chatColours[key],
      inherited, inherited ? 'Automatic (from repositories)' : 'Clear', sidebar, { repositories: Object.values(repositoryColours()) });
    if (colour === undefined || disposed || !license.allowed()) { return; }
    const next = { ...chatColours };
    if (colour === null) { delete next[key]; } else { next[key] = colour; }
    await context.workspaceState.update('chatColours.v1', next);
    if (colour === null) { delete chatColours[key]; } else { chatColours[key] = colour; }
    knownKeys.add(key);
    refresh(true);
  }

  async function setRepositoryColour(repositoryUri?: vscode.Uri) {
    await syncMetadata();
    const repositories = git!.repositories.filter(repo => repo.rootUri.scheme === 'file').map(repo => ({
      label: repositoryLabel(repo.rootUri.fsPath, repositoryNames()), description: repo.rootUri.fsPath, root: repo.rootUri.fsPath,
    }));
    const picked = repositoryUri instanceof vscode.Uri
      ? repositories.find(repo => sameRoot(repo.root, repositoryUri.fsPath))
      : await vscode.window.showQuickPick(repositories, { title: 'Choose repository colour', matchOnDescription: true });
    if (repositoryUri && !picked) throw new Error('Choose a repository currently open in this workspace.');
    if (!picked || !license.allowed() || disposed) { return; }
    const config = vscode.workspace.getConfiguration('codexNavigator');
    const key = repositoryColourKey(picked.root);
    const colours = readColours(config.get('repositoryColours'), 'repository');
    const previewOverrides = { ...colours }; delete previewOverrides[key];
    const previewAutomatic = automaticRepositoryColours(previewOverrides);
    const colour = await chooseColour(context, `Repository: ${picked.label}`, colours[key] === 'none' ? undefined : colours[key],
      resolvedRepositoryColours(previewAutomatic, {}, colourBackground)[key], 'Automatic', sidebar,
      { allowNone: true, initialNone: colours[key] === 'none', repositories: Object.values(repositoryColours()) });
    if (colour === undefined || disposed || !license.allowed()) { return; }
    const next = readColours(vscode.workspace.getConfiguration('codexNavigator').get('repositoryColours'), 'repository');
    if (colour === null) { delete next[key]; } else { next[key] = colour; }
    await config.update('repositoryColours', next, vscode.ConfigurationTarget.Global);
    refresh(true);
  }

  context.subscriptions.push(output, status, { dispose: () => { disposed = true; generation++; clearTimeout(discussionTimer); void queue.finally(() => routing.dispose()); } });
  const commands: [string, (...args: any[]) => unknown][] = [
    ['setUp', () => setUpNavigator(context, () => license.requireAccess())],
    ['license', () => license.show()],
    ['openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:keenanselbee.codex-navigator')],
    ['showChats', () => vscode.commands.executeCommand('codexNavigator.chats.focus')],
    ['refreshChats', () => sidebar.refresh()],
    ['restoreHiddenChats', () => sidebar.restoreHidden()],
    ['setUpActivity', () => setUpNavigator(context, () => license.requireAccess())],
    ['searchChats', () => sidebar.showControl('search')],
    ['filterChats', () => sidebar.showControl('filter')],
    ['newSidebarChat', () => vscode.commands.executeCommand('chatgpt.newChat')],
    ['setChatColour', setChatColour],
    ['setRepositoryColour', setRepositoryColour],
    ['showRepositoryColours', () => sidebar.showControl('repositoryPage')],
    ['setUpAgentHelper', () => setUpAgentHelper(context, () => license.requireAccess())],
    ['openSavedChat', openSavedChat],
    ['toggleStar', async (uri?: vscode.Uri) => {
      await syncMetadata();
      if (!license.allowed() || disposed) return;
      const key = uri instanceof vscode.Uri ? conversationKey(uri) : chat()?.key;
      if (!key || !historyContextKey({ webviewSection: 'codexNavigatorChat', codexNavigatorConversationKey: key })) { throw new Error('Open or right-click a saved local Codex chat first.'); }
      if (Object.hasOwn(starredChats, key)) { delete starredChats[key]; }
      else {
        if (Object.keys(starredChats).length >= 2000) { throw new Error('Unstar a chat before adding more than 2,000 stars.'); }
        let title;
        try { title = (await readRecentConversations(home)).find(item => item.id === key.slice(6))?.title; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } }
        if (!license.allowed() || disposed) return;
        starredChats[key] = (title || 'Saved chat ' + key.slice(6)).replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 500);
      }
      await context.workspaceState.update('starredChats.v1', starredChats);
      await syncMetadata();
      void sidebar.refresh();
    }],
    ['openStarredChats', async () => {
      if (!Object.keys(starredChats).length) {
        void vscode.window.showInformationMessage('No starred chats yet. Right-click a saved chat and choose Star Chat.');
        return;
      }
      let recent: Awaited<ReturnType<typeof readRecentConversations>> = [];
      try { recent = await readRecentConversations(home); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } }
      const picks = Object.entries(starredChats).map(([key, remembered]) => ({
        label: recent.find(item => item.id === key.slice(6))?.title || remembered,
        description: displayFor(key).label, detail: key.slice(6), key,
      })).sort((a, b) => a.label.localeCompare(b.label));
      const picked = await vscode.window.showQuickPick(picks, { title: 'Starred Codex chats', matchOnDescription: true, matchOnDetail: true });
      if (picked) { await openSavedChat(picked.key.slice(6)); }
    }],
    ['associateLabelRepository', async (uri?: vscode.Uri) => {
      await syncMetadata();
      const key = uri instanceof vscode.Uri ? conversationKey(uri) : chat()?.key;
      if (!key || !customLabels[key]) { throw new Error('This action links custom label text to a repository. Choose Custom Label first, or use the repository list to assign a normal repository label.'); }
      const picked = await vscode.window.showQuickPick([
        { label: 'No repository association', description: 'Keep this custom label organizational', root: '' },
        ...git!.repositories.filter(repo => repo.rootUri.scheme === 'file').map(repo => ({ label: repositoryLabel(repo.rootUri.fsPath, repositoryNames()), description: repo.rootUri.fsPath, root: repo.rootUri.fsPath })),
      ], { title: 'Repository for custom-label instruction routing', matchOnDescription: true });
      if (!picked || !license.allowed() || disposed) { return; }
      if (picked.root) { customRouting[key] = picked.root; } else { delete customRouting[key]; }
      await context.workspaceState.update('customRouting.v1', customRouting);
      refresh(true);
    }],
    ['setRepositoryAlias', async () => {
      const config = vscode.workspace.getConfiguration('codexNavigator');
      const picked = await vscode.window.showQuickPick(git!.repositories.map(repo => ({ label: repositoryLabel(repo.rootUri.fsPath, repositoryNames()), description: repo.rootUri.fsPath, root: repo.rootUri.fsPath })), { title: 'Choose repository to name', matchOnDescription: true });
      if (!picked || !license.allowed() || disposed) { return; }
      const current = config.get<Record<string, string>>('repositoryAliases', {}) ?? {};
      const name = await vscode.window.showInputBox({ title: 'Repository display name', value: current[picked.root] ?? '', prompt: 'Leave blank to use the normal repository name.', validateInput: value => value.trim() ? customLabelError(value) : undefined });
      if (name === undefined || !license.allowed() || disposed) { return; }
      const next = { ...current };
      // Remove alternate casing/spelling of this same absolute path.
      for (const root of Object.keys(next)) { if (sameRoot(path.resolve(root), path.resolve(picked.root))) { delete next[root]; } }
      if (name.trim()) { next[picked.root] = name.trim(); }
      await config.update('repositoryAliases', next, vscode.ConfigurationTarget.Workspace);
    }],
    ['assignRepository', assign],
    ['setCustomLabel', setCustomLabel],
    ['scopeMenu', async (uri?: vscode.Uri) => {
      await syncMetadata();
      const key = uri instanceof vscode.Uri ? conversationKey(uri) : chat()?.key;
      if (!key) { await assign(); return; }
      const picked = await vscode.window.showQuickPick([
        { label: 'Custom label...', description: 'Enter your own display label for this chat', action: 'custom' },
        { label: 'Auto', description: 'Follow the latest discussion or agent-reported scope', action: 'auto' },
        { label: 'Keep current labels fixed', description: 'Keep the current labels and primary repository', action: 'pin' },
        { label: 'Choose repositories...', description: 'Choose the primary repository, then any related repositories', action: 'choose' },
        { label: 'Clear', description: 'Pause automatic assignment for this chat', action: 'none' },
      ], { title: 'Chat repository scope' });
      if (!picked || !license.allowed() || disposed) { return; }
      if (picked.action === 'custom') {
        await setCustomLabel(vscode.Uri.from({ scheme: 'openai-codex', authority: 'route', path: '/' + key }));
        return;
      }
      if (picked.action === 'choose') {
        const folders = repositoryNames();
        const picks = git!.repositories.map(repo => ({ label: repositoryLabel(repo.rootUri.fsPath, folders), description: repo.rootUri.fsPath, repo }));
        const primary = await vscode.window.showQuickPick(picks, { title: 'Current project (shown first)' });
        if (!primary || !license.allowed() || disposed) { return; }
        const related = await vscode.window.showQuickPick(picks.filter(item => item !== primary), { title: 'Related repositories (optional)', canPickMany: true });
        if (!related || !license.allowed() || disposed) { return; }
        assignments[key] = scopeAssignment([primary, ...related].map(item => ({ root: item.repo.rootUri.toString(), fsPath: item.repo.rootUri.fsPath })), 'agent', folders)!;
        await saveManualChoice(key, true);
      } else if (picked.action === 'pin') {
        delete manualTimes[key];
        if (!assignments[key] && !customLabels[key]) { return; }
        modes[key] = 'pinned';
      } else {
        delete manualTimes[key];
        modes[key] = picked.action === 'auto' ? 'auto' : 'none';
        if (picked.action === 'none') { delete assignments[key]; }
      }
      if (picked.action !== 'pin') { delete customLabels[key]; }
      await context.workspaceState.update('manualLabelTimes.v1', manualTimes);
      await context.workspaceState.update('customLabels.v1', customLabels);
      await context.workspaceState.update(modeKey, modes);
      await context.workspaceState.update(assignmentKey, assignments);
      scheduleScopeRefresh(key);
    }],
    ['useAutomaticScope', async (uri?: vscode.Uri) => {
      await syncMetadata();
      if (!license.allowed() || disposed) return;
      const key = uri instanceof vscode.Uri ? conversationKey(uri) : chat()?.key;
      if (!key) { throw new Error('Open a saved chat first.'); }
      delete customLabels[key]; delete manualTimes[key];
      await context.workspaceState.update('manualLabelTimes.v1', manualTimes);
      await context.workspaceState.update('customLabels.v1', customLabels);
      modes[key] = 'auto';
      discussionKeys.add(key);
      await context.workspaceState.update(modeKey, modes);
      scheduleScopeRefresh(key);
    }],
    ['clearRepository', async (uri?: vscode.Uri) => {
      await syncMetadata();
      if (!license.allowed() || disposed) return;
      const key = uri instanceof vscode.Uri ? conversationKey(uri) : chat()?.key;
      if (!key) { throw new Error('Focus a saved Codex conversation first.'); }
      delete customLabels[key]; delete manualTimes[key];
      await context.workspaceState.update('manualLabelTimes.v1', manualTimes);
      await context.workspaceState.update('customLabels.v1', customLabels);
      delete assignments[key];
      modes[key] = 'none';
      await context.workspaceState.update(modeKey, modes);
      await context.workspaceState.update(assignmentKey, assignments);
      refresh(true);
    }],
    ['diagnostics', async () => {
      await syncMetadata();
      const result = { vscode: vscode.version, codex: vscode.extensions.getExtension('openai.chatgpt')?.packageJSON.version,
         repositories: git!.repositories.length, assignments: Object.keys(assignments).length,
        sidebar: true, activeKey: chat()?.key ?? null,
        assignedRoot: chat() && !customLabels[chat()!.key] ? assignments[chat()!.key]?.root ?? null : null,
        scopeMode: chat() ? effectiveMode(modes[chat()!.key], assignments[chat()!.key]) : null,
        labelExplanation: chat() ? displayFor(chat()!.key).tooltip : null,
        isStarred: chat() ? Object.hasOwn(starredChats, chat()!.key) : false, starredCount: Object.keys(starredChats).length,
        colour: chat() ? colourFor(chat()!.key).colour ?? null : null,
        scopeSource: chat() ? customLabels[chat()!.key] ? 'custom' : assignments[chat()!.key]?.source ?? null : null,
        activeChatKind: chat() ? 'saved-conversation' : isLauncher() ? 'generic-panel' : 'other',
        activeTabType: vscode.window.tabGroups.activeTabGroup.activeTab?.input?.constructor?.name };
      output.appendLine(JSON.stringify(result));
      output.show(true);
      return result;
    }],
  ];
  for (const [name, action] of commands) {
    const alwaysAvailable = ['license', 'setUp', 'setUpActivity', 'setUpAgentHelper', 'openSettings', 'showChats'];
    context.subscriptions.push(vscode.commands.registerCommand(`codexNavigator.${name}`, (...args) => Promise.resolve().then(async () => {
      if (alwaysAvailable.includes(name) || await license.requireAccess()) return action(...args);
    }).catch(error => report(error, true))));
  }
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(() => refresh()),
    vscode.window.tabGroups.onDidChangeTabGroups(() => refresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { scheduleScopeRefresh(); refresh(); }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('codexNavigator')) { refresh(); }
    }),
    git.onDidChangeState(() => refresh(true)),
    git.onDidOpenRepository(() => { scheduleScopeRefresh(); refresh(); }), git.onDidCloseRepository(() => refresh()),
  );
  for (const kind of ['reports', 'corrections'] as const) {
    const reportsDirectory = path.join(home, 'codex-navigator', kind);
    await mkdir(reportsDirectory, { recursive: true });
    const watcher = watch(reportsDirectory, (_event, filename) => {
      const id = filename?.toString().replace(/\.json$/, '');
      if (filename?.toString().endsWith('.json') && id && threadIdPattern.test(id)) { scheduleScopeRefresh('local/' + id); }
    });
    watcher.on('error', error => report(error));
    context.subscriptions.push({ dispose() { watcher.close(); clearTimeout(scopeTimer); } });
  }
  const activityDirectory = path.join(home, 'codex-navigator', 'activity');
  await mkdir(activityDirectory, { recursive: true });
  const activityWatcher = watch(activityDirectory, (_event, filename) => {
    if (filename?.toString().endsWith('.json') && context.globalState.get('activityHooks.enabled', false)) {
      void sidebar.refresh();
    }
  });
  activityWatcher.on('error', error => report(error));
  context.subscriptions.push({ dispose() { activityWatcher.close(); } });
  try {
    const sessionWatcher = watch(path.join(home, 'sessions'), { recursive: true }, (_event, filename) => {
      if (!license.allowed()) return;
      const id = /([0-9a-f-]{36})\.jsonl$/i.exec(filename?.toString() ?? '')?.[1];
      if (!id || !threadIdPattern.test(id)) { return; }
      const key = 'local/' + id;
      if (effectiveMode(modes[key], assignments[key]) !== 'auto') { return; }
      if (!vscode.workspace.getConfiguration('codexNavigator').get('detectChatFocus', false)) { return; }
      sessions.invalidate();
      if (knownKeys.has(key)) {
        discussionKeys.add(key);
        pendingKeys.add(key);
        // Throttle transcript appends while the agent streams; do not reset this
        // timer on every token and postpone the user's new focus indefinitely.
        discussionTimer ??= setTimeout(() => {
          discussionTimer = undefined;
          const pending = pendingKeys.values().next().value;
          if (pending) { scheduleScopeRefresh(pending); }
        }, 1000);
      }
    });
    sessionWatcher.on('error', error => report(error));
    context.subscriptions.push({ dispose() { sessionWatcher.close(); } });
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { report(error); } }
  // Bounded history initialization also labels rows before opening them.
  for (const kind of license.allowed() ? ['reports', 'corrections'] as const : []) {
    for (const id of await reportedThreadIds(home, kind)) { knownKeys.add('local/' + id); }
  }
  try { if (license.allowed()) for (const item of await readRecentConversations(home)) { knownKeys.add('local/' + item.id); } }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { report(error); } }
  scheduleScopeRefresh();
  refresh(true);

}
