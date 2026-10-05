import { accountErrorMessage } from './account-errors';
import { Accounts } from './accounts';
import { ChatProfiles } from './chat-profiles';
import { chatPins } from './chat-pins';
import { ChatNotifications } from './chat-notifications';
import { NotificationDelivery } from './notification-delivery';
import { migrateNotificationSettings, notificationSettings, notificationChannels } from './notification-settings';
import * as vscode from 'vscode';
import { codexBinary } from './platform';
import { migrateHighlightSettings } from './highlight-settings';
import { assignAutomaticColours, resolvedRepositoryColours } from './automatic-colours';
import { ChatGoals } from './chat-goals';
import { ChatSidebar, externalChatLink } from './chat-sidebar';
import { LicenseAccess } from './license-access';
import { ActivityDiagnostics, TranscriptActivity, combineActivity } from './activity-events';
import { RuntimeActivity } from './activity-runtime';
import { readChatActivity } from './chat-activity';
import { inheritedColour, readColours, repositoryColourKey } from './colours';
import { labelColourKey, migrateLabelColours, readLabelColours } from './label-colours';
import { chooseColour } from './colour-picker';
import { hideRedundantLabel, readStarredChats } from './model';
import { RoutingPublisher } from './routing';
import { setUpAgentHelper, setUpNavigator } from './setup';
import { hookReadiness, hookSetupStatus } from './hook-setup';
import { Assignment, readRepositoryAliases, readManualTimes, customLabelError, readCustomLabels, assignmentKey, conversationKey, historyContextKey, conversationViewType, isNewPanel, readAssignments, repositoryLabel, sameRoot } from './model';
import { readRecentConversations, threadIdPattern } from './history';
import { ChatRecency } from './chat-recency';
import { watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { codexHome, SessionIndex, sessionThreadId, readScopeReport, reportedThreadIds, parseScopeReport, ScopeReport } from './scope-store';
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
  try { await migrateNotificationSettings(vscode.workspace.getConfiguration('codexNavigator')); }
  catch { output.appendLine('Notification settings could not be migrated; existing preferences remain in use.'); }
  try { await migrateHighlightSettings(vscode.workspace); }
  catch { output.appendLine('Highlight settings could not be migrated. Existing preferences remain available; check whether your settings file is writable.'); }
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 15);
  status.command = 'codexNavigator.assignRepository';
  const home = codexHome();
  const workspaceIdentity = vscode.workspace.workspaceFile?.toString() || vscode.workspace.workspaceFolders?.map(folder => folder.uri.toString()).join('|') || 'empty-window';
  const profiles = new ChatProfiles(context.globalStorageUri.fsPath, workspaceIdentity, home);
  profiles.migrate(context.workspaceState, context.globalState);
  const selectedProfile = context.workspaceState.get<string>('chatProfile.v1', 'default');
  if (profiles.list().some(item => item.id === selectedProfile)) profiles.select(selectedProfile);
  let profileEpoch = 0, activeActions = 0;
  const assignments = readAssignments(profiles.get(assignmentKey));
  const manualTimes = readManualTimes(profiles.get('manualLabelTimes.v1'));
  const customLabels = readCustomLabels(profiles.get('customLabels.v1'));
  const starredChats = readStarredChats(profiles.get('starredChats.v1'));
  let chatColours = readColours(profiles.get('chatColours.v1'), 'chat');
  let labelColours = readLabelColours(profiles.get('customLabelColours.v1'));
  let automaticColours = readColours(context.globalState.get('automaticRepositoryColours.v1'), 'repository');
  let colourBackground = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight ? '#F3F3F3' : '#181818';
  let colourCache = { key: '', value: {} as Record<string, string> };
  const modes = readModes(profiles.get(modeKey));
  // Remove old guesses before publishing labels or routing, preserving manual choices.
  const detectOnStartup = vscode.workspace.getConfiguration('codexNavigator').get('detectChatFocus', false);
  for (const [key, assignment] of license.allowed() ? Object.entries(assignments) : []) {
    if (effectiveMode(modes[key], assignment) === 'auto' && !manualTimes[key] && !customLabels[key]
      && (assignment.source === 'directory' || assignment.source === 'discussion' && !detectOnStartup)) {
      delete assignments[key];
    }
  }
  if (license.allowed()) await profiles.update(assignmentKey, assignments);
  const routing = new RoutingPublisher(home);
  const customRouting: Record<string, string> = Object.create(null);
  const savedRouting = context.workspaceState.get<Record<string, unknown>>('customRouting.v1', {});
  for (const [key, root] of Object.entries(savedRouting ?? {})) {
    if (typeof root === 'string' && path.isAbsolute(root) && root.length <= 4096 && !/[\x00-\x1f]/.test(root)) { customRouting[key] = root; }
  }
  const sessions = new SessionIndex(home);
  const discussionReader = new DiscussionReader();
  const transcriptActivity = new TranscriptActivity();
  const activityDiagnostics = new ActivityDiagnostics(record => output.appendLine(JSON.stringify({ time: new Date().toISOString(), ...record })));
  const codexPath = vscode.extensions.getExtension('openai.chatgpt')?.extensionPath;
  const runtimeActivity = new RuntimeActivity(!vscode.env.remoteName ? codexBinary(codexPath) : undefined, home,
    message => output.appendLine(JSON.stringify({ time: new Date().toISOString(), event: 'activity-runtime', message })));
  const chatGoals = new ChatGoals(!vscode.env.remoteName ? codexBinary(codexPath) : undefined, home,
    message => output.appendLine(JSON.stringify({ time: new Date().toISOString(), event: 'chat-goals', message })));
  context.subscriptions.push(runtimeActivity, chatGoals);
  const accounts = new Accounts(context, { home, binary: !vscode.env.remoteName ? codexBinary(codexPath) : undefined,
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, canUse: () => license.allowed(),
    beforeReload: () => { runtimeActivity.stop(); chatGoals.stop(); }, hasActiveWork: () => sidebar.hasActiveWork });
  context.subscriptions.push(accounts);
  const accountAction = async (action: () => Promise<unknown>) => {
    try { return await action(); }
    catch (error) { await vscode.window.showErrorMessage(accountErrorMessage(error)); }
  };

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
    const labelColour = customLabels[key] ? labelColours[labelColourKey(customLabels[key])] : undefined;
    const colour = inheritedColour(override || labelColour, roots, repositories);
    const sources = [...new Set(roots.map(repositoryColourKey))].filter(root => repositories[root]);
    const detail = override ? `Chat colour: ${colour}` : labelColour ? `Custom label colour: ${colour}` : colour
      ? `Repository colour${sources.length > 1 ? ' blend' : ''}: ${colour}\n${sources.map(root => `${repositoryLabel(root, folders)}: ${repositories[root]}`).join('\n')}` : '';
    return { colour, detail };
  }

  const recency = new ChatRecency(profiles.shared('chatRecencyOrder.v1', []));
  async function readSidebarChats(startup = false) {
    const sampledAt = Date.now();
    hydrateProfile();
    if (!license.allowed() || disposed) return [];
    let index: Awaited<ReturnType<typeof readRecentConversations>> = [];
    try { index = await readRecentConversations(home); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { if (!startup) throw error; report(error); } }
    const previous = JSON.stringify(recency.snapshot);
    if (!license.allowed() || disposed) return [];
    const nativeRecent = startup ? undefined : await chatGoals.readRecency();
    if (!license.allowed() || disposed) return [];
    const recent = recency.update(nativeRecent, index);
    if (JSON.stringify(recency.snapshot) !== previous) await profiles.updateShared('chatRecencyOrder.v1', recency.snapshot);
    // Keep explicitly pinned chats even when they fall out of bounded native history.
    for (const pin of Object.values(chatPins(profiles.get('pinnedChats.v1')))) {
      if (!recent.some(item => item.id === pin.chat.id)) recent.push(pin.chat);
    }
    for (const [key, title] of Object.entries(starredChats)) {
      const id = key.slice(6);
      if (threadIdPattern.test(id) && !recent.some(item => item.id === id)) recent.push({ id, title, updatedAt: new Date(0).toISOString() });
    }
    const selected = profiles.get<Record<string, { id: string; title: string; updatedAt: string }>>('profileSelection.v1');
    for (const item of Object.values(selected ?? {})) {
      if (threadIdPattern.test(item.id) && !recent.some(row => row.id === item.id)) recent.push(item);
    }
    let updated = false;
    for (const item of startup ? [] : recent.slice(0, 8)) {
      const key = 'local/' + item.id;
      knownKeys.add(key);
      if (await updateAutoScope(key)) { updated = true; }
    }
    if (updated) { await profiles.update(assignmentKey, assignments); }
    const folders = repositoryNames(), colours = repositoryColours();
    const activityEnabled = !startup && context.globalState.get('activityHooks.enabled', false);
    const runtime = activityEnabled ? await runtimeActivity.read(new Set(recent.map(item => item.id))) : new Map();
    const seen = context.globalState.get<Record<string, number>>('activitySeen.v1', {});
    const items = [];
    // Sequential metadata lookups share the bounded session index. Unchanged tails are cached.
    for (const item of recent) {
      if (!license.allowed() || disposed) return [];
      const key = 'local/' + item.id, display = displayFor(key, folders, true), colour = colourFor(key, chatColours[key], colours, folders);
      let activity;
      if (activityEnabled) {
        const hook = await readChatActivity(home, item.id);
        const filename = await sessions.fileFor(item.id);
        const transcript = filename ? await transcriptActivity.read(filename) : { status: 'unknown' as const, workedAt: 0 };
        activity = combineActivity(hook, transcript);
        const live = runtime.get(item.id);
        if (live) activity = { ...live, turnId: live.turnId || activity.turnId,
          asyncQuestion: !live.turnId || live.turnId === activity.turnId ? activity.asyncQuestion : undefined,
          inputId: live.status === 'waiting' && activity.status === 'waiting' ? activity.inputId : undefined,
          workedAt: Math.max(activity.workedAt, live.workedAt) };
        if (items.length < 200) activityDiagnostics.record(item.id, hook, transcript, live, activity);
      }
      const alreadySeen = activity?.status === 'ready' && (activity.completedAt || 0) <= (seen[item.id] || 0);
      items.push({ ...item, roots: scopeRoots(key), label: display.label, hasCustomLabel: !!customLabels[key], colour: colour.colour, starred: !!starredChats[key],
        alertActivity: activity, activitySampledAt: sampledAt,
        activity: alreadySeen ? 'idle' as const : activity?.status, activityDetail: alreadySeen ? undefined : activity?.detail, completedAt: activity?.completedAt,
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
    })), async () => hookReadiness(await hookSetupStatus(context, home, true)), () => readSidebarChats(true), license, profiles);
  sidebar.accounts = accounts;
  let notifications: ChatNotifications | undefined;
  const notificationReport = (message: string) => output.appendLine('Notifications: ' + message);
  try {
    if (!vscode.env.remoteName) {
      notifications = new ChatNotifications(context.globalStorageUri.fsPath, home, vscode.window.state.focused);
      context.subscriptions.push(notifications, vscode.window.onDidChangeWindowState(state => {
        try { notifications?.setFocused(state.focused); } catch { notificationReport('Window focus could not be shared.'); }
      }));
    }
  } catch { notificationReport('Shared alert storage is unavailable; automatic alerts are disabled.'); }
  const notificationDelivery = new NotificationDelivery({ extensionPath: context.extensionPath,
    report: notificationReport, chatLink: externalChatLink });
  let notificationQueue = Promise.resolve();
  let monitoringEpoch = 0;
  sidebar.onMonitoringStopped = () => { monitoringEpoch++; notifications?.reset(); };
  sidebar.onActivities = rows => {
    if (!notifications || !license.allowed()) return;
    const settings = vscode.workspace.getConfiguration('codexNavigator');
    try {
      const candidates = rows.filter(row => row.alertActivity);
      const alerts = notifications.observe(candidates.map(row => ({ id: row.id, title: row.title, activity: row.alertActivity! })),
        candidates[0]?.activitySampledAt || Date.now(), notificationSettings(settings), Date.now());
      const epoch = monitoringEpoch;
      for (const alert of alerts) notificationQueue = notificationQueue.then(async () => {
        await notificationDelivery.deliver({ ...alert, volume: vscode.workspace.getConfiguration('codexNavigator').get<number>('notificationVolume', 50),
          canDeliver: channel => epoch === monitoringEpoch && sidebar.visible && license.allowed() && alert[channel]
            && notificationChannels(notificationSettings(vscode.workspace.getConfiguration('codexNavigator')), alert.kind, notifications!.anyFocused())[channel] });
      }).catch(() => notificationReport('An alert could not be delivered.'));
    } catch { notificationReport('An activity alert could not be coordinated.'); }
  };
  accounts.onChange = () => { void sidebar.publishAccounts(); };
  function hydrateProfile(reset = false) {
    if (profiles.current.id !== profiles.activeId) {
      profiles.select('default'); reset = true; profileEpoch++;
      void context.workspaceState.update('chatProfile.v1', 'default');
      sidebar.profileChanged();
    }
    for (const [key, value] of [[assignmentKey, assignments], ['manualLabelTimes.v1', manualTimes], ['customLabels.v1', customLabels],
      ['starredChats.v1', starredChats], ['chatColours.v1', chatColours], ['customLabelColours.v1', labelColours], [modeKey, modes],
      ['customRouting.v1', customRouting], ['discussionScopes.v1', discussionScopes]] as const) profiles.refreshInto(key, value, reset);
    if (reset) routingBaseline = Object.fromEntries([...knownKeys].map(key => [key, scopeRoots(key)]));
  }
  function scopeRoots(key: string): string[] {
    const assignment = assignments[key];
    return effectiveMode(modes[key], assignment) === 'none' ? [] : customLabels[key]
      ? (customRouting[key] ? [customRouting[key]] : [])
      : (assignment?.members ?? (assignment ? [assignment] : [])).map(item => vscode.Uri.parse(item.root).fsPath);
  }
  let routingBaseline = Object.fromEntries([...knownKeys].map(key => [key, scopeRoots(key)]));
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
    await profiles.update('manualLabelTimes.v1', manualTimes);
    await profiles.update(modeKey, modes);
  }

  async function updateAutoScope(key: string): Promise<boolean> {
    if (!license.allowed()) return false;
    const epoch = profileEpoch;
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
        if (!license.allowed() || epoch !== profileEpoch) return false;
        if (detected && detected.reportedAt > (discussionScopes[id]?.reportedAt ?? 0)) {
          discussionScopes[id] = detected;
          await profiles.update('discussionScopes.v1', discussionScopes);
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
    if (!license.allowed() || epoch !== profileEpoch || manualTimes[key] !== manualTime || (customLabels[key] && !manualTime) || effectiveMode(modes[key], assignments[key]) !== 'auto' || disposed) { return false; }
    if (chosen.source === 'agent' && !vscode.workspace.getConfiguration('codexNavigator').get('agentRepositoryLabels', false)) return false;
    const replacedCustom = Boolean(customLabels[key]);
    if (manualTime) {
      delete customLabels[key]; delete manualTimes[key];
      await profiles.update('customLabels.v1', customLabels);
      await profiles.update('manualLabelTimes.v1', manualTimes);
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
        if (changed) { await profiles.update(assignmentKey, assignments); }
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
    if (!profiles.get('customLabelColourMigration.v1', false)) {
      const inherited = Object.fromEntries(Object.keys(customLabels).map(key => [key, colourFor(key, '').colour]));
      const migrated = migrateLabelColours(customLabels, chatColours, labelColours, inherited);
      labelColours = migrated.colours; chatColours = migrated.chats;
      await profiles.update('customLabelColours.v1', labelColours);
      await profiles.update('chatColours.v1', chatColours);
      await profiles.update('customLabelColourMigration.v1', true);
    }
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
        const next = Object.fromEntries([...knownKeys].slice(-2000).filter(key => key.startsWith('local/')).map(key => [key, scopeRoots(key)]));
        // Switching profiles resets the comparison baseline. Only actual scope edits publish routing changes.
        const previous = profiles.shared<Record<string, string[]>>('routingScopes.v1', {});
        const chats = { ...previous };
        for (const [key, roots] of Object.entries(next)) {
          if (!Object.hasOwn(previous, key) || JSON.stringify(roots) !== JSON.stringify(routingBaseline[key])) chats[key] = roots;
        }
        await profiles.updateShared('routingScopes.v1', chats, previous);
        routingBaseline = next;
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
          await profiles.update(assignmentKey, assignments);
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
      : await vscode.window.showQuickPick([
        ...(customLabels[current.key] ? [{ label: 'No repository association', description: 'Keep the custom label without a repository', assignment: undefined }] : []),
        ...picks,
      ], { title: 'Choose repository for this chat', matchOnDescription: true });
    if (repositoryUri && !picked) { throw new Error('The requested repository is not an open local Git repository.'); }
    if (!picked || !license.allowed() || disposed) { return; }
    if (customLabels[current.key] && picked.assignment) customRouting[current.key] = vscode.Uri.parse(picked.assignment.root).fsPath;
    else delete customRouting[current.key];
    await profiles.update('customRouting.v1', customRouting);
    if (picked.assignment) assignments[current.key] = picked.assignment;
    else delete assignments[current.key];
    await saveManualChoice(current.key, !customLabels[current.key]);
    knownKeys.add(current.key);
    await profiles.update(modeKey, modes);
    await profiles.update(assignmentKey, assignments);
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
    const labelKey = labelColourKey(value), previousColour = colourFor(key).colour;
    if (!labelColours[labelKey] && previousColour) {
      if (Object.keys(labelColours).length >= 2000) throw new Error('Clear a custom label colour before adding another.');
      labelColours[labelKey] = previousColour;
      await profiles.update('customLabelColours.v1', labelColours);
    }
    if (!customLabels[key]) {
      const assignment = assignments[key];
      if (assignment && effectiveMode(modes[key], assignment) !== 'none') customRouting[key] = vscode.Uri.parse(assignment.root).fsPath;
      else delete customRouting[key];
      await profiles.update('customRouting.v1', customRouting);
    }
    customLabels[key] = value.trim();
    await saveManualChoice(key);
    knownKeys.add(key);
    await profiles.update('customLabels.v1', customLabels);
    await profiles.update(modeKey, modes);
    refresh(true);
    await queue;
  }


  async function setChatColour(uri?: vscode.Uri) {
    await syncMetadata();
    const key = uri instanceof vscode.Uri ? conversationKey(uri) : chat()?.key;
    if (!key) { throw new Error('Focus a saved Codex chat or right-click its title first.'); }
    const label = customLabels[key];
    const target = label ? await vscode.window.showQuickPick([
      { label: `Label: ${label}`, description: 'All chats with this custom label in this profile', shared: true },
      { label: 'Only this chat', description: 'Override the shared label colour', shared: false },
    ], { title: 'Change colour for' }) : { shared: false };
    if (!target || disposed || !license.allowed() || customLabels[key] !== label) return;
    let title;
    try { title = (await readRecentConversations(home)).find(item => item.id === key.slice(6))?.title; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') report(error); }
    const inherited = target.shared ? undefined : colourFor(key, '').colour;
    const labelKey = label ? labelColourKey(label) : '';
    const colour = await chooseColour(context, target.shared ? `Label: ${label}` : title ? `Chat: ${title}` : 'Chat colour',
      target.shared ? labelColours[labelKey] : chatColours[key], inherited,
      target.shared ? 'Clear label colour' : inherited ? label ? 'Use label colour' : 'Automatic (from repositories)' : 'Clear',
      sidebar, { repositories: [...Object.values(repositoryColours()), ...Object.values(labelColours)] });
    if (colour === undefined || disposed || !license.allowed() || customLabels[key] !== label) { return; }
    if (target.shared) {
      if (colour === null) delete labelColours[labelKey];
      else {
        if (!labelColours[labelKey] && Object.keys(labelColours).length >= 2000) throw new Error('Clear a custom label colour before adding another.');
        labelColours[labelKey] = colour;
      }
      await profiles.update('customLabelColours.v1', labelColours);
      delete chatColours[key];
      await profiles.update('chatColours.v1', chatColours);
      refresh(true); return;
    }
    const next = { ...chatColours };
    if (colour === null) { delete next[key]; } else { next[key] = colour; }
    await profiles.update('chatColours.v1', next);
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

  context.subscriptions.push(output, status, { dispose: () => { disposed = true; generation++; clearTimeout(discussionTimer); void queue.finally(async () => { await routing.dispose(); profiles.dispose(); }); } });
  async function selectProfile(id: string) {
    if (activeActions || sidebar.busy) throw new Error('Finish the open Navigator action before switching profiles.');
    await queue;
    if (!license.allowed() || activeActions || sidebar.busy) return;
    profileEpoch++;
    profiles.select(id); hydrateProfile(true);
    knownKeys.clear(); pendingKeys.clear(); discussionKeys.clear();
    for (const key of new Set([...Object.keys(assignments), ...Object.keys(customLabels), ...Object.keys(chatColours)])) knownKeys.add(key);
    routingBaseline = Object.fromEntries([...knownKeys].map(key => [key, scopeRoots(key)]));
    await context.workspaceState.update('chatProfile.v1', id);
    sidebar.profileChanged();
    refresh(true); await sidebar.refresh();
  }
  let profileMenuOpen = false;
  async function manageProfiles() {
    if (profileMenuOpen) return;
    profileMenuOpen = true;
    try { await showProfileMenu(); } finally { profileMenuOpen = false; }
  }
  async function showProfileMenu() {
    const picked = await vscode.window.showQuickPick([
      ...profiles.list().map(item => ({ label: item.name, description: item.id === profiles.activeId ? 'Current profile' : '', id: item.id })),
      { label: 'Create Profile...', id: 'create' }, { label: 'Create Profile for This Workspace...', id: 'workspace' },
      { label: 'Choose Chats for This Profile...', id: 'chats' }, { label: 'Include All Recent Chats', id: 'all' }, { label: 'Rename Current Profile...', id: 'rename' },
      { label: 'Remove Current Profile...', id: 'remove' }, { label: 'Restore Workspace Organisation...', id: 'restore' },
    ], { title: 'Chat Profile', placeHolder: 'Your choice is remembered for this workspace' });
    if (!picked || !license.allowed()) return;
    if (activeActions || sidebar.busy) throw new Error('Finish the open Navigator action before changing profiles.');
    if (profiles.list().some(item => item.id === picked.id)) { await selectProfile(picked.id); return; }
    const epoch = profileEpoch;
    if (picked.id === 'all') { await profiles.update('profileSelection.v1', undefined); await sidebar.refresh(); return; }
    if (picked.id === 'chats') { await sidebar.chooseProfileChats(); return; }
    if (picked.id === 'restore') {
      const snapshot = await vscode.window.showQuickPick(profiles.legacy().map(item => ({ label: item.workspace, description: item.conflict ? 'Conflicting customisations preserved' : 'Original workspace snapshot', data: item.data })), { title: 'Restore into a new profile' });
      if (!snapshot || !license.allowed() || epoch !== profileEpoch) return;
      const name = await vscode.window.showInputBox({ title: 'Name for restored profile', value: 'Recovered workspace' });
      if (name && license.allowed() && epoch === profileEpoch) await selectProfile(profiles.create(name, false, snapshot.data));
      return;
    }
    if (picked.id === 'remove') {
      if (profiles.activeId === 'default') throw new Error('The Default profile cannot be removed.');
      const answer = await vscode.window.showWarningMessage(`Remove profile ${profiles.current.name}?`, { modal: true, detail: 'Conversations remain in Codex. Other workspaces using this profile return to Default.' }, 'Remove Profile');
      if (answer === 'Remove Profile' && license.allowed() && epoch === profileEpoch) { profiles.remove(); await selectProfile('default'); }
      return;
    }
    const name = await vscode.window.showInputBox({ title: picked.id === 'rename' ? 'Rename Chat Profile' : 'New Chat Profile',
      value: picked.id === 'rename' ? profiles.current.name : picked.id === 'workspace' ? vscode.workspace.name : '',
      prompt: 'Use a unique name of up to 60 characters' });
    if (!name || !license.allowed() || epoch !== profileEpoch) return;
    if (picked.id === 'rename') { profiles.rename(name); await sidebar.refresh(); return; }
    const source = await vscode.window.showQuickPick([{ label: 'Copy current organisation', copy: true }, { label: 'Start with an empty selection', copy: false }], { title: 'Initial profile contents' });
    if (!source || !license.allowed() || epoch !== profileEpoch) return;
    await selectProfile(profiles.create(name, source.copy));
    if (picked.id === 'workspace') await sidebar.setWorkspaceFilter(true);
  }

  const commands: [string, (...args: any[]) => unknown][] = [
    ['accounts', () => accountAction(() => sidebar.showAccounts())],
    ['accountStatus', () => accounts.status()],
    ['enableAccounts', () => accountAction(() => accounts.enable())],
    ['disableAccounts', () => accountAction(() => accounts.disable())],
    ['forgetAccounts', () => accountAction(() => accounts.forgetAll())],
    ['manageAccounts', () => accountAction(() => sidebar.showAccounts())],

    ['setUp', () => setUpNavigator(context, () => license.requireAccess())],
    ['license', () => license.show()],
    ['openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:keenanselbee.codex-navigator')],
    ['testNotification', async () => {
      if (!await license.requireAccess()) return;
      await vscode.commands.executeCommand('codexNavigator.chats.focus');
      await notificationDelivery.deliver({ title: 'Codex Navigator', message: 'Notification preview: a response finished or needs your attention.', sound: true, desktop: true, volume: vscode.workspace.getConfiguration('codexNavigator').get<number>('notificationVolume', 50) });
    }],
    ['chatProfiles', () => manageProfiles()],
    ['workspaceChats', () => sidebar.toggleWorkspaceFilter()],
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
      await profiles.update('starredChats.v1', starredChats);
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
      await profiles.update('manualLabelTimes.v1', manualTimes);
      await profiles.update('customLabels.v1', customLabels);
      await profiles.update(modeKey, modes);
      await profiles.update(assignmentKey, assignments);
      scheduleScopeRefresh(key);
    }],
    ['useAutomaticScope', async (uri?: vscode.Uri) => {
      await syncMetadata();
      if (!license.allowed() || disposed) return;
      const key = uri instanceof vscode.Uri ? conversationKey(uri) : chat()?.key;
      if (!key) { throw new Error('Open a saved chat first.'); }
      delete customLabels[key]; delete manualTimes[key];
      await profiles.update('manualLabelTimes.v1', manualTimes);
      await profiles.update('customLabels.v1', customLabels);
      modes[key] = 'auto';
      discussionKeys.add(key);
      await profiles.update(modeKey, modes);
      scheduleScopeRefresh(key);
    }],
    ['clearRepository', async (uri?: vscode.Uri) => {
      await syncMetadata();
      if (!license.allowed() || disposed) return;
      const key = uri instanceof vscode.Uri ? conversationKey(uri) : chat()?.key;
      if (!key) { throw new Error('Focus a saved Codex conversation first.'); }
      delete customLabels[key]; delete manualTimes[key];
      await profiles.update('manualLabelTimes.v1', manualTimes);
      await profiles.update('customLabels.v1', customLabels);
      delete assignments[key];
      modes[key] = 'none';
      await profiles.update(modeKey, modes);
      await profiles.update(assignmentKey, assignments);
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
    const alwaysAvailable = ['accountStatus', 'disableAccounts', 'forgetAccounts', 'manageAccounts', 'license', 'setUp', 'setUpActivity', 'setUpAgentHelper', 'openSettings', 'showChats'];
    context.subscriptions.push(vscode.commands.registerCommand(`codexNavigator.${name}`, (...args) => Promise.resolve().then(async () => {
      if (alwaysAvailable.includes(name) || await license.requireAccess()) {
        if (name === 'chatProfiles') return action(...args);
        activeActions++;
        try { return await action(...args); } finally { activeActions--; }
      }
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
    const sessionWatcher = watch(path.join(home, 'sessions'), { recursive: true }, (event, filename) => {
      if (!license.allowed()) return;
      const id = sessionThreadId(filename?.toString() ?? '');
      if (!id || !threadIdPattern.test(id)) { return; }
      if (event === 'rename') sessions.invalidate();
      const key = 'local/' + id;
      if (effectiveMode(modes[key], assignments[key]) !== 'auto') { return; }
      if (!vscode.workspace.getConfiguration('codexNavigator').get('detectChatFocus', false)) { return; }
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
