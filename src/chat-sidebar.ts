import { ChatProfiles, SavedState } from './chat-profiles';
import { sameRoot } from './model';
import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { ActivitySnapshot } from './activity-events';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import { RecentConversation, threadIdPattern } from './history';
import { ChatGoal } from './chat-goals';
import { ChatActivity } from './chat-activity';
import { ColourOptions } from './colour-picker';
import { normaliseColour } from './colours';
import { chatPins, placePinnedChats } from './chat-pins';
import { LicenseAccess } from './license-access';
import { highlightMode } from './highlight-settings';
import { HookAdmission, HookReadiness } from './hook-admission';
import type { Accounts } from './accounts';

export interface SidebarChat extends RecentConversation {
  label: string;
  roots?: string[];
  colour?: string;
  starred: boolean;
  pinned?: boolean;
  hasCustomLabel?: boolean;
  originalTitle?: string;
  hasCustomName?: boolean;
  tooltip: string;
  activity?: ChatActivity;
  activityDetail?: string;
  completedAt?: number;
  goal?: ChatGoal;
  alertActivity?: ActivitySnapshot;
  activitySampledAt?: number;
}

const actions: Record<string, string> = {
  scope: 'scopeMenu', hide: 'hideChat', star: 'toggleStar', label: 'setCustomLabel', repositories: 'assignRepository', colour: 'setChatColour',
  automatic: 'useAutomaticScope', clear: 'clearRepository',
};
const nameActions = ['rename', 'originalName', 'resetName'];

function chatNames(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, name]) => threadIdPattern.test(id)
    && typeof name === 'string' && name.trim().length > 0 && name.length <= 200 && !/[\x00-\x1f\x7f]/.test(name)).slice(0, 2000));
}

// Uses Codex's existing URI handler. No file patch or private command is needed.
export async function openSidebarChat(id: string): Promise<void> {
  if (!threadIdPattern.test(id)) { throw new Error('Choose a saved local Codex chat.'); }
  if (vscode.env.remoteName) { throw new Error('Sidebar chat selection currently supports local VS Code windows.'); }
  const codex = vscode.extensions.getExtension('openai.chatgpt');
  if (!codex) { throw new Error('Install and enable the Codex extension to open chats.'); }
  await codex.activate();
  const uri = vscode.Uri.from({ scheme: vscode.env.uriScheme, authority: 'openai.chatgpt', path: '/local/' + id });
  await vscode.commands.executeCommand('vscode.open', uri);
}

export class ChatSidebar implements vscode.WebviewViewProvider, vscode.Disposable {
  accounts?: Accounts;
  onActivities?: (rows: SidebarChat[]) => void;
  onMonitoringStopped?: () => void;
  get visible() { return !!this.view?.visible && !this.disposed; }
  private accountsRequested = false;
  private accountsViewReady = false;
  get hasActiveWork() { return this.rows.some(row => row.activity === 'working' || row.activity === 'waiting'); }
  async publishAccounts() {
    if (this.accounts && this.view) await this.view.webview.postMessage({ type: 'accounts', state: this.accounts.snapshot() });
  }
  async showAccounts() {
    this.accountsRequested = true;
    await vscode.commands.executeCommand('codexNavigator.chats.focus');
    await this.publishAccounts();
    await this.openRequestedAccounts();
    await this.accounts?.refresh();
  }
  private async openRequestedAccounts() {
    if (!this.accountsRequested || !this.view || !this.accountsViewReady) return;
    this.accountsRequested = false;
    await this.view.webview.postMessage({ type: 'accountsOpen' });
  }
  private view?: vscode.WebviewView;
  private rows: SidebarChat[] = [];
  private pending = false;
  private startupRead = false;
  private dirty = false;
  private disposed = false;
  private timer?: ReturnType<typeof setInterval>;
  private subscriptions: vscode.Disposable[] = [];
  private visibleIds: string[] = [];
  private goalPending = false;
  private goalDirty = false;
  private goalChanging = false;
  private goals: Record<string, ChatGoal> = {};
  private setupRequired = true;
  private actionCount = 0;
  private profileVersion = 0;
  private publishedProfile = '';
  get busy() { return this.actionCount > 0; }
  private get saved(): SavedState { return this.profiles ?? this.context.globalState; }
  private hookAdmission: HookAdmission;
  private colour?: { token: string; options: ColourOptions; resolve: (value: string | null | undefined) => void };

  constructor(private context: vscode.ExtensionContext, private readChats: () => Promise<SidebarChat[]>,
    private goalHost?: { read(ids: string[]): Promise<Record<string, ChatGoal>>; stop(): void;
      change(id: string, expected: ChatGoal): Promise<ChatGoal> }, private themeChanged?: (background: string) => void,
    private readRepositories: () => { root: string; label: string; colour?: string }[] = () => [],
    private activityReady: () => Promise<HookReadiness> = async () => ({ ready: false, message: 'Install and verify Navigator hooks to show your chats.' }),
    private readStartup?: () => Promise<SidebarChat[]>, private license?: LicenseAccess, private profiles?: ChatProfiles) {
    this.hookAdmission = new HookAdmission(profiles?.shared('browsingCompleted', false) || context.workspaceState.get('navigatorSetup.completed.v1', false));
    for (const action of [...Object.keys(actions).filter(action => action !== 'star'), ...nameActions]) {
      this.subscriptions.push(vscode.commands.registerCommand('codexNavigator.sidebar.' + action, async (value: unknown) => {
        if (!value || typeof value !== 'object') { return; }
        const target = value as Record<string, unknown>;
        if (target.webviewSection !== 'navigatorChat') { return; }
        await this.receive({ type: 'action', id: target.navigatorChatId, profileId: target.navigatorProfileId, action });
      }));
    }
    this.subscriptions.push(vscode.commands.registerCommand('codexNavigator.sidebar.repositoryColour', async (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      const target = value as Record<string, unknown>;
      if (target.webviewSection !== 'navigatorRepository') return;
      await this.receive({ type: 'repositoryColour', root: target.navigatorRepositoryRoot });
    }));
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.accountsViewReady = false;
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    const asset = (name: string) => view.webview.asWebviewUri(vscode.Uri.joinPath(media, name)).toString();
    view.webview.html = readFileSync(path.join(this.context.extensionPath, 'media', 'chat-sidebar.html'), 'utf8')
      .replaceAll('{{csp}}', view.webview.cspSource).replaceAll('{{nonce}}', randomBytes(24).toString('hex'))
      .replace('{{style}}', asset('chat-sidebar.css')).replace('{{layout}}', asset('chat-layout.js')).replace('{{script}}', asset('chat-sidebar.js'))
      .replace('{{colourScript}}', asset('sidebar-colour.js'))
      .replace('{{accountStyle}}', asset('account-menu.css')).replace('{{accountScript}}', asset('account-menu.js'));
    this.subscriptions.push(view.webview.onDidReceiveMessage(message => {
      void this.receive(message).catch(error => view.webview.postMessage({ type: 'error', message: String(error.message ?? error) }));
    }), view.onDidChangeVisibility(() => { if (view.visible) { void this.refresh(); void this.refreshGoals(); } else { this.goalHost?.stop(); this.onMonitoringStopped?.(); } }),
    view.onDidDispose(() => {
      if (this.view === view) { this.view = undefined; this.visibleIds = []; this.goalHost?.stop(); this.onMonitoringStopped?.(); clearInterval(this.timer); this.colour?.resolve(undefined); this.colour = undefined; }
    }));
    clearInterval(this.timer);
    this.timer = setInterval(() => { if (view.visible) { void this.refresh(); void this.refreshGoals(); } }, 5000);
  }

  async refresh(): Promise<void> {
    if (this.disposed || !this.view?.visible) { return; }
    if (this.license) {
      await this.view.webview.postMessage({ type: 'license', license: this.license.snapshot() });
      if (!this.license.allowed()) {
        this.onMonitoringStopped?.();
        this.visibleIds = []; this.goals = {}; this.goalHost?.stop();
        this.colour?.resolve(undefined); this.colour = undefined;
        return;
      }
    }
    if (this.pending) { this.dirty = true; await this.publishState(); return; }
    this.pending = true;
    try {
      if (!this.startupRead && this.readStartup) {
        this.startupRead = true;
        const version = this.profileVersion;
        const rows = await this.readStartup();
        if (version === this.profileVersion) this.rows = rows;
        else this.dirty = true;
        await this.publishState();
      }
      do {
        this.dirty = false;
        const version = this.profileVersion;
        const rows = await this.readChats();
        if (version !== this.profileVersion) { this.dirty = true; continue; }
        this.rows = rows;
        await this.publishState();
      } while (this.dirty && this.visible && (!this.license || this.license.allowed()));
    } catch (error) {
      await this.view?.webview.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally { this.pending = false; }
  }

  private async publishState(): Promise<void> {
    if (this.disposed || this.license && !this.license.allowed()) return;
    const version = this.profileVersion;
    const pins = chatPins(this.saved.get('pinnedChats.v1'));
    const hidden = this.saved.get<Record<string, string>>('hiddenChats.v1', {})!;
    const recentOnly = vscode.workspace.getConfiguration('codexNavigator').get('recentChatsOnly', true);
    const seen = this.context.globalState.get<Record<string, number>>('activitySeen.v1', {});
    const names = chatNames(this.saved.get('chatNames.v1'));
    const profile = this.profiles?.current;
    const selection = this.profiles?.get<Record<string, RecentConversation>>('profileSelection.v1');
    const preferences = this.profiles?.get<{ workspaceOnly?: boolean }>('profileView.v1', {}) ?? {};
    const roots = this.readRepositories().map(repo => repo.root);
    const eligible = this.rows.filter(row => (!selection || Object.hasOwn(selection, row.id) || pins[row.id] || row.starred)
      && (!preferences.workspaceOnly || !row.roots?.length || row.roots.some(root => roots.some(other => sameRoot(root, other)))));
    const visible = placePinnedChats(eligible.filter(row => !Object.hasOwn(hidden, row.id) && (pins[row.id] || row.starred || selection?.[row.id] || !recentOnly || row.recencyAt === undefined || Math.max(row.recencyAt, seen[row.id] || 0) >= Date.now() - 86400000)), pins).map(row => ({ ...row, pinned: !!pins[row.id],
      title: names[row.id] || row.title, originalTitle: row.title, hasCustomName: !!names[row.id],
      tooltip: names[row.id] ? [names[row.id], 'Codex name: ' + row.title,
        ...(row.tooltip || '').split('\n').filter(line => line !== row.title)].filter(Boolean).join('\n') : row.tooltip }));
    let readiness: HookReadiness = { ready: false, transient: true, message: 'Hook status could not be checked. Open setup and choose Check Status.' };
    try { readiness = await this.activityReady(); } catch { /* Keep setup accessible if diagnostics fail. */ }
    if (this.disposed || version !== this.profileVersion) { this.dirty = true; return; }
    if (this.profiles?.shared('browsingCompleted', false)) this.hookAdmission.completed = true;
    const { welcome, notice } = this.hookAdmission.update(readiness);
    if (readiness.ready && this.profiles && !this.profiles.shared('browsingCompleted', false)) await this.profiles.updateShared('browsingCompleted', true);
    if (this.view) this.view.description = [profile && profile.id !== 'default' ? profile.name : '', preferences.workspaceOnly ? 'Workspace' : '', selection ? 'Selected chats' : ''].filter(Boolean).join(' / ');
    const profileToken = profile?.id ?? 'default';
    const profileChanged = profileToken !== this.publishedProfile;
    this.publishedProfile = profileToken;
    this.setupRequired = welcome;
    if (readiness.ready && !this.context.workspaceState.get('navigatorSetup.completed.v1', false)) {
      await this.context.workspaceState.update('navigatorSetup.completed.v1', true);
    }
    const setupStarted = this.context.globalState.get('navigatorSetup.started', false)
      || !!this.context.globalState.get('activityHooks.installedAt', 0);
    if (welcome) {
      this.onMonitoringStopped?.();
      this.visibleIds = []; this.goals = {}; this.goalHost?.stop();
      this.colour?.resolve(undefined); this.colour = undefined;
    }
    const settings = vscode.workspace.getConfiguration('codexNavigator');
    const highlights = highlightMode(settings);
    if (!this.disposed && (!this.license || this.license.allowed())) { await this.view?.webview.postMessage({ type: 'state', welcome, profileId: profileToken, profileChanged, profileView: this.profiles?.get('profileView.v1', {}), workspaceOnly: !!preferences.workspaceOnly,
      setupMessage: (setupStarted && welcome ? 'Setup needs attention. ' : '') + readiness.message, activityNotice: notice,
      rows: welcome ? [] : visible, repositories: welcome ? [] : this.readRepositories(), showChatTooltips: settings.get('showChatTooltips', false), highlightDurationSeconds: settings.get('highlightDurationSeconds', 180), highlightRecentlyViewedChats: highlights !== 'off', highlightOnlyLastViewedChat: highlights === 'last', emptyMessage: this.rows.length ? 'No chats to show. Check Chat Profile, workspace filtering, hidden chats or Recent Chats Only.' : 'No saved local chats yet.' }); }
    if (this.visible && !welcome) this.onActivities?.(visible);
  }

  private async refreshGoals(): Promise<void> {
    if (!this.goalHost || this.disposed || !this.view?.visible || this.colour || this.setupRequired || this.license && !this.license.allowed()) return;
    if (this.goalPending) { this.goalDirty = true; return; }
    this.goalPending = true;
    try {
      do {
        this.goalDirty = false;
        const ids = [...this.visibleIds];
        this.goals = await this.goalHost.read(ids);
        if (!this.disposed && !this.setupRequired && this.view?.visible && (!this.license || this.license.allowed())) await this.view.webview.postMessage({ type: 'goals', ids, goals: this.goals });
      } while (this.goalDirty && !this.setupRequired && !this.disposed && this.view?.visible && (!this.license || this.license.allowed()));
    } finally { this.goalPending = false; }
  }

  async showControl(type: 'search' | 'filter' | 'repositoryPage'): Promise<void> {
    if (this.license && !await this.license.requireAccess()) return;
    await vscode.commands.executeCommand('codexNavigator.chats.focus');
    await this.refresh();
    if (this.setupRequired) return;
    await this.view?.webview.postMessage({ type });
  }

  async pickColour(options: ColourOptions): Promise<string | null | undefined> {
    if (this.license && !await this.license.requireAccess()) return undefined;
    await vscode.commands.executeCommand('codexNavigator.chats.focus');
    if (this.setupRequired) return undefined;
    if (!this.view || this.disposed) throw new Error('Open Navigator to choose a colour.');
    this.colour?.resolve(undefined);
    return new Promise(resolve => {
      this.colour = { token: randomBytes(16).toString('hex'), options, resolve };
      void this.view!.webview.postMessage({ type: 'colour', token: this.colour.token, ...options });
    });
  }

  async restoreHidden(): Promise<void> {
    if (this.license && !await this.license.requireAccess()) return;
    const hidden = this.saved.get<Record<string, string>>('hiddenChats.v1', {})!;
    const names = chatNames(this.saved.get('chatNames.v1'));
    const choices = Object.entries(hidden).filter(([id]) => threadIdPattern.test(id)).map(([id, title]) => ({ label: names[id] || title || 'Untitled chat', id }));
    if (!choices.length) { void vscode.window.showInformationMessage('No hidden chats to restore.'); return; }
    const selected = await vscode.window.showQuickPick(choices, { title: 'Restore Hidden Chats', canPickMany: true, placeHolder: 'Choose chats to restore. The 24-hour filter still applies.' });
    if (!selected?.length || this.license && !this.license.allowed()) return;
    const current = this.saved.get<Record<string, string>>('hiddenChats.v1', {})!;
    for (const chat of selected) delete current[chat.id];
    await this.saved.update('hiddenChats.v1', current);
    await this.refresh();
  }

  private async receive(message: unknown): Promise<void> {
    const interactive = !!message && typeof message === 'object' && ['action', 'goal', 'open', 'repositoryColour', 'assignRepository', 'workspaceFilter'].includes(String((message as any).type));
    if (interactive && this.profiles && (message as any).profileId !== undefined && (message as any).profileId !== this.profiles.activeId) return;
    if (interactive) this.actionCount++;
    try { await this.handleMessage(message); } finally { if (interactive) this.actionCount--; }
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object' || this.disposed) { return; }
    const { type, id, action } = message as Record<string, unknown>;
    if (type === 'ready') {
      this.accountsViewReady = true;
      await this.publishAccounts();
      await this.openRequestedAccounts();
    }
    if (type === 'accountAction') { await this.accounts?.act(message); await this.publishAccounts(); return; }
    if (type === 'license' && typeof action === 'string') { await this.license?.action(action); return; }
    if (this.license && !this.license.allowed()) { await this.refresh(); return; }
    if (this.license && !['ready', 'refresh', 'visibleChats', 'theme'].includes(String(type)) && !await this.license.requireAccess()) return;
    if (type === 'welcomeSetup' || type === 'settings') {
      await this.context.globalState.update('navigatorSetup.started', true);
      await vscode.commands.executeCommand('codexNavigator.setUp');
      await this.refresh(); return;
    }
    if (type === 'theme') {
      const colour = normaliseColour((message as { background?: unknown }).background);
      if (colour) this.themeChanged?.(colour);
      return;
    }
    if (type === 'visibleChats') {
      if (this.setupRequired) return;
      const ids = (message as { ids?: unknown }).ids;
      if (!Array.isArray(ids) || ids.length > 200) return;
      const next = [...new Set(ids.filter((value): value is string => typeof value === 'string'
        && this.rows.some(row => row.id === value)))];
      if (JSON.stringify(next) !== JSON.stringify(this.visibleIds)) {
        this.visibleIds = next; await this.refreshGoals();
      }
      return;
    }
    if (type === 'colourResult') {
      const value = message as { token?: string; colour?: unknown; cancel?: boolean };
      if (!this.colour || value.token !== this.colour.token) return;
      const colour = value.colour === 'none' && this.colour.options.allowNone ? 'none' : value.colour === null ? null : typeof value.colour === 'string' ? normaliseColour(value.colour) : undefined;
      if (!value.cancel && colour === undefined) return;
      this.colour.resolve(value.cancel ? undefined : colour); this.colour = undefined;
      await this.view?.webview.postMessage({ type: 'colourClosed' }); return;
    }
    if (type === 'ready' || type === 'refresh') {
      if (type === 'refresh') {
        this.accountsViewReady = true;
        await this.publishAccounts();
        await this.openRequestedAccounts();
      }
      await this.refresh();
      if (this.colour) await this.view?.webview.postMessage({ type: 'colour', token: this.colour.token, ...this.colour.options });
      return;
    }
    if (this.setupRequired) return;
    if (type === 'profileView') {
      const value = (message as any).value;
      if (this.profiles && (message as any).profileId === this.profiles.activeId && value && typeof value.search === 'string' && value.search.length <= 200) {
        const current = this.profiles.get<Record<string, unknown>>('profileView.v1', {});
        await this.profiles.update('profileView.v1', { ...current, search: value.search, mode: value.mode === 'starred' ? 'starred' : 'recent' });
      }
      return;
    }
    if (type === 'workspaceFilter') { await this.toggleWorkspaceFilter(); return; }
    if (type === 'new') { await vscode.commands.executeCommand('chatgpt.newChat'); return; }
    if (type === 'repositoryColour') {
      const root = (message as { root?: unknown }).root;
      if (typeof root !== 'string' || !this.readRepositories().some(repo => repo.root === root)) return;
      await vscode.commands.executeCommand('codexNavigator.setRepositoryColour', vscode.Uri.file(root));
      await this.refresh(); return;
    }
    if (typeof id !== 'string' || !threadIdPattern.test(id) || !this.rows.some(row => row.id === id)) { return; }
    if (type === 'action' && typeof action === 'string' && nameActions.includes(action)) {
      const row = this.rows.find(row => row.id === id)!;
      if (action === 'originalName') {
        await vscode.window.showInformationMessage(row.title, { modal: true, detail: 'Original Codex chat name. Navigator renames do not change it.' });
        return;
      }
      const names = chatNames(this.saved.get('chatNames.v1'));
      const value = action === 'resetName' ? '' : await vscode.window.showInputBox({ title: 'Rename Chat in Navigator',
        value: names[id] || row.title, prompt: 'Codex name: ' + row.title,
        placeHolder: 'Leave blank to use the Codex name',
        validateInput: value => value.trim().length > 200 || /[\x00-\x1f\x7f]/.test(value) ? 'Use up to 200 characters on one line.' : undefined });
      if (value === undefined || this.disposed || this.setupRequired || this.license && !this.license.allowed()) return;
      const name = value.trim();
      if (name.length > 200 || /[\x00-\x1f\x7f]/.test(name)) return;
      // Re-read after the input dialog so another rename is not overwritten.
      const current = chatNames(this.saved.get('chatNames.v1'));
      if (!name || name === row.title) delete current[id];
      else {
        if (!current[id] && Object.keys(current).length >= 2000) throw new Error('Clear a renamed chat before adding another name.');
        current[id] = name;
      }
      await this.saved.update('chatNames.v1', current);
      await this.refresh(); return;
    }
    if (type === 'goal') {
      const expected = this.goals[id];
      const requested = (message as { goal?: Partial<ChatGoal> }).goal;
      if (!this.goalHost || this.goalChanging || !expected || requested?.status !== expected.status
        || requested?.objective !== expected.objective || requested?.createdAt !== expected.createdAt
        || !['active', 'paused'].includes(expected.status) || !this.visibleIds.includes(id)) {
        await this.view?.webview.postMessage({ type: 'goalSettled', id });
        await this.refreshGoals(); return;
      }
      this.goalChanging = true;
      try {
        if (vscode.env.remoteName || !vscode.workspace.isTrusted) throw new Error('Goal controls require a trusted local workspace.');
        this.goals[id] = await this.goalHost.change(id, expected);
      } catch (error) {
        await openSidebarChat(id);
        void vscode.window.showInformationMessage('Use the goal control in Codex. ' + (error instanceof Error ? error.message : String(error)));
      } finally {
        this.goalChanging = false;
        await this.refreshGoals();
        await this.view?.webview.postMessage({ type: 'goalSettled', id });
      }
      return;
    }
    if (type === 'assignRepository') {
      const root = (message as { root?: unknown }).root;
      if (typeof root !== 'string' || !this.readRepositories().some(repo => repo.root === root)) return;
      const uri = vscode.Uri.from({ scheme: 'openai-codex', authority: 'route', path: '/local/' + id });
      await vscode.commands.executeCommand('codexNavigator.assignRepository', uri, vscode.Uri.file(root));
      await this.refresh(); return;
    }
    if (type === 'action' && action === 'pin') {
      const pins = chatPins(this.saved.get('pinnedChats.v1'));
      if (pins[id]) delete pins[id];
      else {
        const position = (message as { position?: number }).position;
        if (!Number.isInteger(position) || position! < 0 || position! >= 200) return;
        if (Object.keys(pins).length >= 200) throw new Error('Unpin a chat before pinning another.');
        const row = this.rows.find(row => row.id === id)!;
        pins[id] = { position: position!, chat: { id, title: row.title, updatedAt: row.updatedAt } };
      }
      await this.saved.update('pinnedChats.v1', pins);
      await this.refresh(); return;
    }
    if (type === 'action' && action === 'hide') {
      const hidden = this.saved.get<Record<string, string>>('hiddenChats.v1', {})!;
      hidden[id] = this.rows.find(row => row.id === id)!.title;
      await this.saved.update('hiddenChats.v1', hidden);
      await this.refresh(); return;
    }
    if (type === 'open') {
      await openSidebarChat(id);
      const seen = this.context.globalState.get<Record<string, number>>('activitySeen.v1', {});
      seen[id] = Date.now();
      await this.view?.webview.postMessage({ type: 'selectedChat', id, at: seen[id] });
      const bounded = Object.fromEntries(Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 2000));
      await this.context.globalState.update('activitySeen.v1', bounded);
      await this.refresh(); return;
    }
    if (type !== 'action' || typeof action !== 'string' || !Object.hasOwn(actions, action)) { return; }
    const uri = vscode.Uri.from({ scheme: 'openai-codex', authority: 'route', path: '/local/' + id });
    await vscode.commands.executeCommand('codexNavigator.' + actions[action], uri);
    await this.refresh();
  }

  profileChanged(): void {
    this.onMonitoringStopped?.();
    this.profileVersion++; this.rows = []; this.visibleIds = []; this.goals = {}; this.dirty = true;
    this.colour?.resolve(undefined); this.colour = undefined;
  }

  async setWorkspaceFilter(enabled: boolean): Promise<void> {
    if (!this.profiles || this.license && !await this.license.requireAccess()) return;
    const current = this.profiles.get<Record<string, unknown>>('profileView.v1', {});
    await this.profiles.update('profileView.v1', { ...current, workspaceOnly: enabled });
    await this.refresh();
  }

  async toggleWorkspaceFilter(): Promise<void> {
    const current = this.profiles?.get<{ workspaceOnly?: boolean }>('profileView.v1', {});
    await this.setWorkspaceFilter(!current?.workspaceOnly);
  }

  async chooseProfileChats(): Promise<void> {
    if (!this.profiles || this.license && !await this.license.requireAccess()) return;
    this.actionCount++;
    try {
      const selected = this.profiles.get<Record<string, RecentConversation>>('profileSelection.v1');
      const picks = await vscode.window.showQuickPick(this.rows.map(row => ({ label: row.title, description: row.label, picked: !selected || !!selected[row.id], row })),
        { title: 'Chats saved in this profile', canPickMany: true, placeHolder: 'Selected chats stay available beyond the recency filter. Pins and favourites are also retained.' });
      if (!picks || this.license && !this.license.allowed()) return;
      await this.profiles.update('profileSelection.v1', Object.fromEntries(picks.map(({ row }) => [row.id, { id: row.id, title: row.title, updatedAt: row.updatedAt }])));
      await this.refresh();
    } finally { this.actionCount--; }
  }

  dispose(): void {
    this.disposed = true;
    this.onMonitoringStopped?.();
    this.goalHost?.stop();
    this.colour?.resolve(undefined); this.colour = undefined;
    clearInterval(this.timer);
    for (const subscription of this.subscriptions) { subscription.dispose(); }
  }
}
