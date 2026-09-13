import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import { RecentConversation, threadIdPattern } from './history';
import { ChatGoal } from './chat-goals';
import { ChatActivity } from './chat-activity';
import { ColourOptions } from './colour-picker';
import { normaliseColour } from './colours';
import { chatPins, placePinnedChats } from './chat-pins';
import { LicenseAccess } from './license-access';

export interface SidebarChat extends RecentConversation {
  label: string;
  colour?: string;
  starred: boolean;
  pinned?: boolean;
  hasCustomLabel?: boolean;
  tooltip: string;
  activity?: ChatActivity;
  activityDetail?: string;
  completedAt?: number;
  goal?: ChatGoal;
}

const actions: Record<string, string> = {
  scope: 'scopeMenu', hide: 'hideChat', star: 'toggleStar', label: 'setCustomLabel', repositories: 'assignRepository', colour: 'setChatColour',
  automatic: 'useAutomaticScope', clear: 'clearRepository', associate: 'associateLabelRepository',
};

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
  private colour?: { token: string; options: ColourOptions; resolve: (value: string | null | undefined) => void };

  constructor(private context: vscode.ExtensionContext, private readChats: () => Promise<SidebarChat[]>,
    private goalHost?: { read(ids: string[]): Promise<Record<string, ChatGoal>>; stop(): void;
      change(id: string, expected: ChatGoal): Promise<ChatGoal> }, private themeChanged?: (background: string) => void,
    private readRepositories: () => { root: string; label: string; colour?: string }[] = () => [],
    private activityReady: () => Promise<boolean> = async () => false,
    private readStartup?: () => Promise<SidebarChat[]>, private license?: LicenseAccess) {
    for (const action of Object.keys(actions).filter(action => action !== 'star')) {
      this.subscriptions.push(vscode.commands.registerCommand('codexNavigator.sidebar.' + action, async (value: unknown) => {
        if (!value || typeof value !== 'object') { return; }
        const target = value as Record<string, unknown>;
        if (target.webviewSection !== 'navigatorChat') { return; }
        await this.receive({ type: 'action', id: target.navigatorChatId, action });
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
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    const asset = (name: string) => view.webview.asWebviewUri(vscode.Uri.joinPath(media, name)).toString();
    view.webview.html = readFileSync(path.join(this.context.extensionPath, 'media', 'chat-sidebar.html'), 'utf8')
      .replaceAll('{{csp}}', view.webview.cspSource).replaceAll('{{nonce}}', randomBytes(24).toString('hex'))
      .replace('{{style}}', asset('chat-sidebar.css')).replace('{{layout}}', asset('chat-layout.js')).replace('{{script}}', asset('chat-sidebar.js'))
      .replace('{{colourScript}}', asset('sidebar-colour.js'));
    this.subscriptions.push(view.webview.onDidReceiveMessage(message => {
      void this.receive(message).catch(error => view.webview.postMessage({ type: 'error', message: String(error.message ?? error) }));
    }), view.onDidChangeVisibility(() => { if (view.visible) { void this.refresh(); void this.refreshGoals(); } else { this.goalHost?.stop(); } }),
    view.onDidDispose(() => {
      if (this.view === view) { this.view = undefined; this.visibleIds = []; this.goalHost?.stop(); clearInterval(this.timer); this.colour?.resolve(undefined); this.colour = undefined; }
    }));
    clearInterval(this.timer);
    this.timer = setInterval(() => { if (view.visible) { void this.refresh(); void this.refreshGoals(); } }, 5000);
  }

  async refresh(): Promise<void> {
    if (this.disposed || !this.view?.visible) { return; }
    if (this.license) {
      await this.view.webview.postMessage({ type: 'license', license: this.license.snapshot() });
      if (!this.license.allowed()) {
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
        this.rows = await this.readStartup();
        await this.publishState();
      }
      do {
        this.dirty = false;
        this.rows = await this.readChats();
        await this.publishState();
      } while (this.dirty && !this.disposed && (!this.license || this.license.allowed()));
    } catch (error) {
      await this.view?.webview.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally { this.pending = false; }
  }

  private async publishState(): Promise<void> {
    if (this.license && !this.license.allowed()) return;
    const pins = chatPins(this.context.globalState.get('pinnedChats.v1'));
    const hidden = this.context.globalState.get<Record<string, string>>('hiddenChats.v1', {});
    const recentOnly = vscode.workspace.getConfiguration('codexNavigator').get('recentChatsOnly', true);
    const seen = this.context.globalState.get<Record<string, number>>('activitySeen.v1', {});
    const visible = placePinnedChats(this.rows.filter(row => !Object.hasOwn(hidden, row.id) && (pins[row.id] || !recentOnly || row.recencyAt === undefined || Math.max(row.recencyAt, seen[row.id] || 0) >= Date.now() - 86400000)), pins).map(row => ({ ...row, pinned: !!pins[row.id] }));
    let activityPrompt = !this.context.globalState.get('activityPrompt.dismissed', false);
    if (activityPrompt) { try { activityPrompt = !await this.activityReady(); } catch { /* Setup explains missing evidence. */ } }
    activityPrompt = activityPrompt && !this.context.globalState.get('activityPrompt.dismissed', false);
    const welcome = !this.context.globalState.get('navigatorWelcome.v1', false);
    if (!this.disposed && (!this.license || this.license.allowed())) { await this.view?.webview.postMessage({ type: 'state', welcome, activityPrompt, rows: visible, repositories: this.readRepositories(), highlightDurationSeconds: vscode.workspace.getConfiguration('codexNavigator').get('highlightDurationSeconds', 180), highlightRecentlyViewedChats: vscode.workspace.getConfiguration('codexNavigator').get('highlightRecentlyViewedChats', true), highlightOnlyLastViewedChat: vscode.workspace.getConfiguration('codexNavigator').get('highlightOnlyLastViewedChat', false), emptyMessage: this.rows.length ? 'No chats to show. Restore hidden chats or turn off Recent Chats Only in Extension Settings.' : 'No saved local chats yet.' }); }
  }

  private async refreshGoals(): Promise<void> {
    if (!this.goalHost || this.disposed || !this.view?.visible || this.colour || this.license && !this.license.allowed()) return;
    if (this.goalPending) { this.goalDirty = true; return; }
    this.goalPending = true;
    try {
      do {
        this.goalDirty = false;
        const ids = [...this.visibleIds];
        this.goals = await this.goalHost.read(ids);
        if (!this.disposed && this.view?.visible && (!this.license || this.license.allowed())) await this.view.webview.postMessage({ type: 'goals', ids, goals: this.goals });
      } while (this.goalDirty && !this.disposed && this.view?.visible && (!this.license || this.license.allowed()));
    } finally { this.goalPending = false; }
  }

  async showControl(type: 'search' | 'filter' | 'repositoryPage'): Promise<void> {
    if (this.license && !await this.license.requireAccess()) return;
    await vscode.commands.executeCommand('codexNavigator.chats.focus');
    if (type === 'repositoryPage') await this.refresh();
    await this.view?.webview.postMessage({ type });
  }

  async pickColour(options: ColourOptions): Promise<string | null | undefined> {
    if (this.license && !await this.license.requireAccess()) return undefined;
    await vscode.commands.executeCommand('codexNavigator.chats.focus');
    if (!this.view || this.disposed) throw new Error('Open Navigator to choose a colour.');
    this.colour?.resolve(undefined);
    return new Promise(resolve => {
      this.colour = { token: randomBytes(16).toString('hex'), options, resolve };
      void this.view!.webview.postMessage({ type: 'colour', token: this.colour.token, ...options });
    });
  }

  async restoreHidden(): Promise<void> {
    if (this.license && !await this.license.requireAccess()) return;
    const hidden = this.context.globalState.get<Record<string, string>>('hiddenChats.v1', {});
    const choices = Object.entries(hidden).filter(([id]) => threadIdPattern.test(id)).map(([id, title]) => ({ label: title || 'Untitled chat', id }));
    if (!choices.length) { void vscode.window.showInformationMessage('No hidden chats to restore.'); return; }
    const selected = await vscode.window.showQuickPick(choices, { title: 'Restore Hidden Chats', canPickMany: true, placeHolder: 'Choose chats to restore. The 24-hour filter still applies.' });
    if (!selected?.length || this.license && !this.license.allowed()) return;
    const current = this.context.globalState.get<Record<string, string>>('hiddenChats.v1', {});
    for (const chat of selected) delete current[chat.id];
    await this.context.globalState.update('hiddenChats.v1', current);
    await this.refresh();
  }

  private async receive(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object' || this.disposed) { return; }
    const { type, id, action } = message as Record<string, unknown>;
    if (type === 'license' && typeof action === 'string') { await this.license?.action(action); return; }
    if (this.license && !this.license.allowed()) { await this.refresh(); return; }
    if (this.license && !['ready', 'refresh', 'visibleChats', 'theme'].includes(String(type)) && !await this.license.requireAccess()) return;
    if (type === 'continueWithoutSetup' || type === 'welcomeSetup') {
      await this.context.globalState.update('navigatorWelcome.v1', true);
      if (type === 'welcomeSetup') await vscode.commands.executeCommand('codexNavigator.setUp');
      await this.refresh(); return;
    }
    if (type === 'dismissActivityPrompt') {
      await this.context.globalState.update('activityPrompt.dismissed', true);
      await this.refresh(); return;
    }
    if (type === 'theme') {
      const colour = normaliseColour((message as { background?: unknown }).background);
      if (colour) this.themeChanged?.(colour);
      return;
    }
    if (type === 'visibleChats') {
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
      await this.refresh();
      if (this.colour) await this.view?.webview.postMessage({ type: 'colour', token: this.colour.token, ...this.colour.options });
      return;
    }
    if (type === 'new') { await vscode.commands.executeCommand('chatgpt.newChat'); return; }
    if (type === 'settings') { await vscode.commands.executeCommand('codexNavigator.setUp'); return; }
    if (type === 'repositoryColour') {
      const root = (message as { root?: unknown }).root;
      if (typeof root !== 'string' || !this.readRepositories().some(repo => repo.root === root)) return;
      await vscode.commands.executeCommand('codexNavigator.setRepositoryColour', vscode.Uri.file(root));
      await this.refresh(); return;
    }
    if (typeof id !== 'string' || !threadIdPattern.test(id) || !this.rows.some(row => row.id === id)) { return; }
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
      const pins = chatPins(this.context.globalState.get('pinnedChats.v1'));
      if (pins[id]) delete pins[id];
      else {
        const position = (message as { position?: number }).position;
        if (!Number.isInteger(position) || position! < 0 || position! >= 200) return;
        if (Object.keys(pins).length >= 200) throw new Error('Unpin a chat before pinning another.');
        const row = this.rows.find(row => row.id === id)!;
        pins[id] = { position: position!, chat: { id, title: row.title, updatedAt: row.updatedAt } };
      }
      await this.context.globalState.update('pinnedChats.v1', pins);
      await this.refresh(); return;
    }
    if (type === 'action' && action === 'hide') {
      const hidden = this.context.globalState.get<Record<string, string>>('hiddenChats.v1', {});
      hidden[id] = this.rows.find(row => row.id === id)!.title;
      await this.context.globalState.update('hiddenChats.v1', hidden);
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

  dispose(): void {
    this.disposed = true;
    this.goalHost?.stop();
    this.colour?.resolve(undefined); this.colour = undefined;
    clearInterval(this.timer);
    for (const subscription of this.subscriptions) { subscription.dispose(); }
  }
}
