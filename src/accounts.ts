import { AccountError, accountErrorMessage } from './account-errors';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { watch, FSWatcher } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { AccountStore, AccountSummary, parseAccountAuth } from './account-store';
import { AccountCapability, accountCapability, readAccountFile, replaceAccountFile, authFingerprint, isolatedAccountLogin, prepareAccountCredentials } from './account-runtime';
import { AccountUsage, readAccountUsage, resetEligibility, ResetEligibility } from './account-usage';
import { BankedReset, readBankedResets, consumeBankedReset, ResetRejectedError } from './account-resets';

export interface AccountOptions {
  home: string; binary?: string; cwd?: string; canUse: () => boolean;
  beforeReload: () => void; hasActiveWork?: () => boolean;
}
export interface AccountStatus { enabled: boolean; label: string; detail: string; count: number; supported: boolean }
export interface AccountMenuState extends AccountStatus {
  accounts: { id: string; generation: number; name: string; email?: string; workspace: string; selected: boolean;
    plan?: string; usage?: AccountUsage; usageProblem?: string }[];
  busy: boolean; canSwitch: boolean; canAdd: boolean; problem?: string; recovery: boolean;
  reloadNeeded: boolean; loginEmail?: string; usageRefreshing?: boolean; progress?: string; resetResult?: string;
  reset?: { accountId: string; token: string; expiresAt: number[]; eligibility: ResetEligibility; retry?: boolean; usage?: AccountUsage; problem?: string };
}

/** Credentials stay in the extension host; the menu receives metadata only. */
export class Accounts implements vscode.Disposable {
  readonly store: AccountStore;
  onChange?: () => void;
  private capability: AccountCapability = { supported: false, message: 'Checking Codex authentication settings.' };
  private identity?: string;
  private checkedAt = 0;
  private refreshing?: Promise<void>;
  private usageRefresh?: Promise<void>;
  private usageAbort?: AbortController;
  private usageAttempts = new Map<string, number>();
  private missingUsageAttempts = new Map<string, number>();
  private usageProblems = new Map<string, string>();
  private reset?: { accountId: string; generation: number; token: string; credits: BankedReset[]; retry?: boolean; usage?: AccountUsage; problem?: string };
  private resetResult = '';
  private busy = false;
  private acting = false;
  private progress = '';
  private disposed = false;
  private closing?: Promise<void>;
  private timer: ReturnType<typeof setInterval>;
  private watcher?: FSWatcher;
  private debounce?: ReturnType<typeof setTimeout>;
  private captureQueued = false;
  private login?: AbortController;
  private loginEmail?: string;
  private notice = '';
  private captureNotice = '';
  private reloadProblem = '';
  private reloadNeeded = false;
  private readonly rollbackKey: string;
  constructor(private context: vscode.ExtensionContext, private options: AccountOptions) {
    this.store = new AccountStore(context.globalStorageUri.fsPath, options.home, context.secrets);
    const resolvedHome = path.resolve(options.home);
    const namespace = createHash('sha256').update(process.platform === 'win32' ? resolvedHome.toLowerCase() : resolvedHome).digest('hex');
    this.rollbackKey = 'codexNavigator.accountRollback.' + namespace;
    this.timer = setInterval(() => { void this.refresh(); }, 10000);
    void this.refresh();
  }
  private allowed() {
    return !this.disposed && this.options.canUse() && vscode.workspace.isTrusted && !vscode.env.remoteName
      && !(process.platform === 'win32' && vscode.workspace.getConfiguration('chatgpt').get('runCodexInWindowsSubsystemForLinux', false));
  }
  status(): AccountStatus {
    const enabled = this.store.enabled;
    const problem = this.notice || this.reloadProblem || this.captureNotice;
    const unsupported = this.checkedAt > 0 && !this.capability.supported;
    return { enabled, count: this.store.list().length, supported: this.capability.supported,
      label: !enabled ? unsupported ? 'Unavailable' : 'Off' : !this.allowed() ? 'Unavailable' : problem ? 'Needs attention'
        : !this.capability.supported ? 'Unsupported authentication' : this.identity ? 'Remembering accounts' : 'Sign in to Codex',
      detail: !enabled ? unsupported ? this.capability.message : 'Optional. Remember Codex sign-ins securely on this device.'
        : !this.allowed() ? 'Account switching requires Navigator access and a trusted native local workspace.'
        : problem || (!this.capability.supported ? this.capability.message : 'Choose an account to switch and reload this window.') };
  }
  snapshot(): AccountMenuState {
    const usable = this.allowed() && this.store.enabled && this.capability.supported;
    const problem = this.notice || this.reloadProblem || this.captureNotice;
    const accounts = this.store.list().sort((a, b) => Number(b.id === this.identity) - Number(a.id === this.identity)
      || (a.label || a.email || a.id).localeCompare(b.label || b.email || b.id));
    return { ...this.status(), accounts: accounts.map(account => {
      const usage = this.store.usage(account.id);
      const displayUsage = usage && account.plan ? { ...usage, plan: account.plan } : usage;
      return { id: account.id, generation: account.generation, name: account.label || '',
      email: account.email, workspace: account.workspaceId, selected: account.id === this.identity,
      ...(displayUsage ? { usage: displayUsage } : {}), ...(account.plan || usage?.plan ? { plan: account.plan || usage?.plan } : {}),
      ...(this.usageProblems.has(account.id) ? { usageProblem: this.usageProblems.get(account.id) } : {}),
    }; }), busy: this.busy || this.acting, canSwitch: usable, canAdd: usable && !!this.capability.isolatedLogin,
    ...(problem ? { problem } : {}), recovery: !!problem && !!this.store.state().pending,
    reloadNeeded: this.reloadNeeded, usageRefreshing: !!this.usageRefresh,
    ...(this.resetResult ? { resetResult: this.resetResult } : {}),
    ...(this.reset ? { reset: { accountId: this.reset.accountId, token: this.reset.token,
      eligibility: resetEligibility(this.reset.usage), usage: this.reset.usage, retry: this.reset.retry,
      expiresAt: this.reset.credits.map(credit => credit.expiresAt), ...(this.reset.problem ? { problem: this.reset.problem } : {}) } } : {}),
    ...(this.progress ? { progress: this.progress } : {}),
    ...(this.loginEmail ? { loginEmail: this.loginEmail } : {}) };
  }
  /** Display-only metadata uses access tokens, never a second refresh-token owner. */
  async refreshUsage(force = false, missingOnly = false): Promise<void> {
    if (this.usageRefresh) return this.usageRefresh;
    if (!this.allowed() || !this.store.enabled || this.busy || this.acting || this.reloadNeeded) return;
    const controller = new AbortController(); this.usageAbort = controller;
    this.usageRefresh = (async () => {
      await this.refresh();
      if (!this.options.binary || !this.capability.supported || !this.capability.isolatedLogin || controller.signal.aborted) return;
      const accounts = this.store.list().sort((a, b) => Number(b.id === this.identity) - Number(a.id === this.identity));
      for (const account of accounts) {
        if (controller.signal.aborted || !this.allowed() || !this.store.enabled || this.busy || this.acting) break;
        const now = Date.now(), usage = this.store.usage(account.id);
        const hasQuota = !!(usage?.primary || usage?.secondary);
        if (missingOnly && hasQuota) continue;
        const retryDelay = hasQuota ? 300000 : Math.min(300000,
          10000 * 2 ** Math.max(0, (this.missingUsageAttempts.get(account.id) || 0) - 1));
        if (now - (this.usageAttempts.get(account.id) || 0) < (force ? 15000 : retryDelay) ||
            !force && hasQuota && now - usage!.checkedAt < 300000) continue;
        const owner = randomUUID();
        if (!this.store.acquireLease(owner, now, 60000)) break;
        this.usageAttempts.set(account.id, now);
        if (!hasQuota) this.missingUsageAttempts.set(account.id, Math.min(6, (this.missingUsageAttempts.get(account.id) || 0) + 1));
        const deadline = setTimeout(() => controller.abort(), 15000);
        try {
          const raw = await this.store.load(account.id);
          if (!raw || controller.signal.aborted || !this.allowed() || !this.store.enabled) continue;
          const result = await readAccountUsage(this.options.binary, path.join(this.context.globalStorageUri.fsPath, 'account-usage'), raw, controller.signal);
          if (!controller.signal.aborted && this.allowed() && this.store.enabled) {
            if (result.primary || result.secondary || result.bankedResets !== undefined)
              this.store.saveUsage(account.id, account.generation, result);
            this.store.savePlan(account.id, account.generation, result.plan);
            if (result.primary || result.secondary) this.missingUsageAttempts.delete(account.id);
            this.usageProblems.delete(account.id);
          }
        } catch {
          if (!controller.signal.aborted) this.usageProblems.set(account.id, 'Usage could not be updated. Showing the last known values, if available.');
        } finally { clearTimeout(deadline); this.store.releaseLease(owner); this.changed(); }
      }
    })().catch(() => { /* Usage failure must never prevent account selection. */ })
      .finally(() => { this.usageRefresh = undefined; this.usageAbort = undefined; this.changed(); });
    this.changed();
    return this.usageRefresh;
  }
  private async stopUsage() { this.usageAbort?.abort(); await this.usageRefresh; }
  private changed() { if (!this.disposed) this.onChange?.(); }
  private watchAuth() {
    if (this.watcher || !this.store.enabled || !this.allowed()) return;
    try {
      this.watcher = watch(this.options.home, (_event, name) => {
        if (name && name.toString().toLowerCase() !== 'auth.json') return;
        this.captureQueued = true; clearTimeout(this.debounce);
        this.debounce = setTimeout(() => { void this.refresh(); }, 250);
      });
      this.watcher.on('error', () => { this.watcher?.close(); this.watcher = undefined; });
    } catch { /* Polling remains available if the home is missing or not watchable. */ }
  }
  async refresh(force = false): Promise<void> {
    if (this.disposed) return;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      await vscode.commands.executeCommand('setContext', 'codexNavigator.accountsEnabled', this.store.enabled && this.allowed());
      if (!this.store.enabled || !this.allowed()) { this.watcher?.close(); this.watcher = undefined; return; }
      this.watchAuth();
      if (this.busy || this.reloadNeeded && !force) return;
      const owner = randomUUID();
      if (!this.store.acquireLease(owner, Date.now(), 30000)) return;
      try {
        if (force || Date.now() - this.checkedAt > 60000) {
          this.capability = await accountCapability(this.options.binary, this.options.home, this.options.cwd);
          this.checkedAt = Date.now();
        }
        if (!this.capability.supported || !this.store.enabled || !this.allowed()) return;
        this.captureQueued = false;
        const raw = await readAccountFile(this.options.home);
        const identity = raw ? parseAccountAuth(raw) : undefined;
        if (identity && this.capability.workspaces?.length && !this.capability.workspaces.includes(identity.workspaceId)) {
          this.identity = undefined; this.notice = 'This sign-in does not match the configured Codex workspace restriction.'; return;
        }
        if (raw) await this.store.capture(raw);
        this.identity = identity?.id;
        this.captureNotice = '';
        // A matching file after restart finishes publication, not verification of the private IDE runtime.
        const pending = this.store.state().pending;
        if (pending && !this.reloadNeeded) {
          if (pending.accountId !== identity?.id) this.notice = 'The sign-in changed outside Navigator. Your current credentials and recovery copy were kept. Choose an account or sign in through Codex.';
          else { await this.context.secrets.delete(this.rollbackKey); this.store.setPending(undefined); }
        }
      } finally { this.store.releaseLease(owner); }
    })().catch(() => { this.captureNotice = 'The current sign-in could not be remembered. Check secure storage and retry.'; })
      .finally(() => { this.refreshing = undefined; this.changed(); });
    return this.refreshing;
  }
  async enable() {
    if (this.busy || this.acting) throw new AccountError('Wait for the account operation to finish.');
    if (!this.allowed()) throw new AccountError('Open a trusted native local workspace with Navigator access first.');
    this.capability = await accountCapability(this.options.binary, this.options.home, this.options.cwd);
    this.checkedAt = Date.now();
    if (!this.capability.supported) { this.changed(); return; }
    await this.store.enable(); this.notice = ''; await this.refresh(true);
  }
  private async mutate(operation: () => Promise<void>) {
    const owner = randomUUID();
    if (!this.store.acquireLease(owner, Date.now(), 30000)) throw new AccountError('Another account operation is in progress. Retry shortly.');
    try { await operation(); } finally { this.store.releaseLease(owner); }
  }
  async disable() {
    await this.stopUsage();
    if (this.busy && !this.login) throw new AccountError('Wait for the account switch to finish.');
    this.login?.abort(); await this.mutate(() => this.store.disable()); this.checkedAt = 0; await this.refresh();
  }
  async forgetAll() {
    await this.stopUsage();
    const answer = await vscode.window.showWarningMessage('Forget all accounts saved by Navigator and turn off automatic remembering? Codex stays signed in.', { modal: true }, 'Forget Saved Accounts');
    if (answer !== 'Forget Saved Accounts') return;
    if (this.busy && !this.login) throw new AccountError('Wait for the account switch to finish.');
    this.login?.abort();
    await this.mutate(async () => { await this.store.forgetAll(); await this.context.secrets.delete(this.rollbackKey); });
    this.reloadNeeded = false; this.reloadProblem = ''; this.notice = ''; this.checkedAt = 0; await this.refresh();
  }
  /** All webview actions are validated again against host-owned state. */
  async act(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object' || this.disposed) return;
    const { action, id, generation, label, force, token } = message as Record<string, unknown>;
    if (action === 'cancelReset') {
      if (this.progress !== 'Using banked reset...') { this.reset = undefined; this.changed(); }
      return;
    }
    if (action === 'refreshUsage') { await this.refreshUsage(force === true); return; }
    if (action === 'retryUsage') { await this.refreshUsage(false, true); return; }
    if (action === 'cancelUsage') { await this.stopUsage(); return; }
    if (action === 'cancelLogin') { this.login?.abort(); return; }
    if (action === 'copyEmail') {
      try { if (this.loginEmail?.includes('@')) await vscode.env.clipboard.writeText(this.loginEmail); }
      catch { this.notice = 'The email could not be copied. Select it from the account menu instead.'; this.changed(); }
      return;
    }
    if (action === 'refresh') { await this.refresh(); return; }
    if (!['setup', 'forgetAll', 'forget', 'rename', 'remember', 'retryReload', 'restore', 'add', 'switch', 'reconnect', 'previewReset', 'useReset'].includes(String(action))) return;
    if (this.acting || this.busy) return;
    if (action === 'previewReset' && typeof id === 'string' && Number.isSafeInteger(generation)) {
      this.resetResult = '';
      this.reset = { accountId: id, generation: generation as number, token: randomUUID(), credits: [] };
    }
    this.acting = true; this.notice = '';
    this.progress = action === 'previewReset' ? 'Checking banked resets...'
      : action === 'useReset' ? 'Using banked reset...'
      : action === 'add' || action === 'reconnect' ? 'Preparing sign-in...'
      : action === 'switch' ? 'Preparing account switch...'
      : action === 'rename' ? 'Saving account label...'
      : action === 'forget' || action === 'forgetAll' ? 'Removing saved sign-in...'
      : action === 'restore' ? 'Restoring previous account...'
      : action === 'retryReload' ? 'Reloading VS Code...'
      : action === 'setup' ? 'Opening account setup...' : 'Saving your sign-in...';
    this.changed();
    try {
      await this.stopUsage();
      if (action === 'setup') { await vscode.commands.executeCommand('codexNavigator.setUp'); return; }
      if (action === 'forgetAll') { await this.forgetAll(); return; }
      const account = typeof id === 'string' ? this.store.list().find(item => item.id === id) : undefined;
      if (action === 'forget') {
        if (!account || account.generation !== generation) throw new AccountError('This account changed. Open the account menu again.');
        if (await vscode.window.showWarningMessage('Forget this saved sign-in? Codex stays signed in, and Navigator will not automatically save it again.', { modal: true }, 'Forget') !== 'Forget') return;
        await this.mutate(async () => {
          if (this.store.list().find(item => item.id === id)?.generation !== generation) throw new AccountError('This account changed while the confirmation was open. Choose Forget again.');
          const backup = await this.context.secrets.get(this.rollbackKey);
          if (backup && (parseAccountAuth(backup).id === account.id || this.store.state().pending?.accountId === account.id)) await this.context.secrets.delete(this.rollbackKey);
          await this.store.forget(account.id);
        }); return;
      }
      if (!this.allowed() || !this.store.enabled) throw new AccountError('Enable account switching in a trusted local workspace first.');
      if (action === 'rename') {
        if (!account || account.generation !== generation) throw new AccountError('This account changed. Open the account menu again.');
        if (typeof label !== 'string' || label.trim().length > 60 || /[\x00-\x1f\x7f]/.test(label)) throw new AccountError('Use a name of at most 60 characters.');
        await this.store.rename(account.id, label.trim()); return;
      }
      await this.refresh(true);
      if (!this.capability.supported) throw new AccountError(this.capability.message);
      if (action === 'previewReset' || action === 'useReset') {
        const current = this.store.list().find(item => item.id === id);
        if (!current || current.generation !== generation) throw new AccountError('This saved sign-in changed. Choose it again from the refreshed menu.');
        await this.bankedReset(current, action === 'useReset', token); return;
      }
      if (action === 'remember') {
        const raw = await readAccountFile(this.options.home);
        if (!raw) throw new AccountError('Sign in through Codex first.');
        await this.store.capture(raw, true); return;
      }
      if (action === 'retryReload') { if (this.reloadNeeded) await this.reload(); return; }
      if (action === 'restore') { await this.restore(); return; }
      if (action === 'add') { if (await this.confirmReload()) await this.add(); return; }
      if (!['switch', 'reconnect'].includes(String(action))) return;
      const current = this.store.list().find(item => item.id === id);
      if (!account || !current || current.generation !== generation) throw new AccountError('This saved sign-in changed. Choose it again from the refreshed menu.');
      if (action === 'switch' && account.id === this.identity && !this.reloadNeeded) return;
      if (!await this.confirmReload()) return;
      if (action === 'reconnect') await this.add(current);
      else await this.switchAccount(current);
    } catch (error) { this.notice = accountErrorMessage(error); }
    finally { this.acting = false; this.progress = ''; this.changed(); if (this.captureQueued && !this.reloadNeeded) void this.refresh(); }
  }
  private async bankedReset(account: AccountSummary, consume: boolean, token: unknown) {
    if (!this.options.binary || !this.capability.isolatedLogin || this.reloadNeeded)
      throw new AccountError('Banked resets are unavailable for this authentication configuration.');
    const preview = this.reset;
    if (!preview || preview.accountId !== account.id || preview.generation !== account.generation ||
        consume && (token !== preview.token || !preview.retry && (!preview.credits.length || !!preview.problem)))
      throw new AccountError('Open Use banked reset again to review the available resets.');
    this.changed();
    const owner = randomUUID();
    if (!this.store.acquireLease(owner, Date.now(), 60000))
      throw new AccountError('Another account operation is in progress. Retry shortly.');
    let confirmed = false;
    try {
      const guard = () => {
        if (!this.allowed() || !this.store.enabled || this.reset !== preview ||
            this.store.list().find(item => item.id === account.id)?.generation !== account.generation ||
            !this.store.acquireLease(owner, Date.now(), 60000))
          throw new AccountError('The account or confirmation changed. Open Use banked reset again.');
      };
      guard();
      const raw = await this.store.load(account.id);
      if (!raw) throw new AccountError('Sign in to this account again to use a banked reset.');
      let attempt = this.store.resetAttempt(account.id);
      if (consume && (attempt?.status === 'pending'
          ? !preview.retry || preview.token !== attempt.requestId : !!preview.retry))
        throw new AccountError('The previous reset attempt changed. Refresh this confirmation before continuing.');
      let credits: BankedReset[] = [];
      if (attempt?.status !== 'used') {
        try { credits = await readBankedResets(raw); }
        catch (error) { if (!attempt) throw error; }
        guard();
      }
      if (!consume) {
        preview.credits = credits;
        preview.retry = attempt?.status === 'pending';
        if (attempt) preview.token = attempt.requestId;
      }
      // Never authorize spending from the cached account tile or webview state.
      preview.usage = undefined;
      try {
        const usage = await readAccountUsage(this.options.binary, path.join(this.context.globalStorageUri.fsPath, 'account-usage'), raw);
        guard();
        preview.usage = usage;
        this.store.saveUsage(account.id, account.generation, usage);
        this.usageProblems.delete(account.id);
      } catch {
        guard();
        this.usageProblems.set(account.id, 'Usage could not be verified. Refresh usage before using a reset.');
      }
      if (attempt?.status !== 'used') {
        if (!consume) return;
        if (!attempt) {
          if (resetEligibility(preview.usage) !== 'eligible') return;
          const selected = preview.credits[0];
          if (!credits.length || credits[0].id !== selected.id || credits[0].expiresAt !== selected.expiresAt)
            throw new AccountError('The available resets changed. Go back and choose Use banked reset again.');
          // Persist before sending: a crash or timeout must never select another credit.
          attempt = { creditId: selected.id, expiresAt: selected.expiresAt, requestId: preview.token, status: 'pending' };
          this.store.saveResetAttempt(account.id, attempt);
        }
        guard();
        try {
          await consumeBankedReset(raw, { id: attempt.creditId, expiresAt: attempt.expiresAt }, attempt.requestId, !!preview.retry);
        } catch (error) {
          if (error instanceof ResetRejectedError) {
            this.store.clearResetAttempt(account.id);
            preview.retry = false;
          }
          throw error;
        }
      }
      confirmed = true;
      this.resetResult = 'Reset used for ' + (account.email || account.label || 'this account') + '.';
      this.reset = undefined;
      // Once OpenAI confirms success, local persistence/refresh failures cannot undo it.
      try { this.store.saveResetAttempt(account.id, { ...attempt, status: 'used' }); } catch { /* Keep the original pending key. */ }
      try {
        this.store.clearUsage(account.id);
        const usage = await readAccountUsage(this.options.binary, path.join(this.context.globalStorageUri.fsPath, 'account-usage'), raw);
        if (this.allowed() && this.store.enabled && !this.disposed) {
          this.store.saveUsage(account.id, account.generation, usage);
          this.usageProblems.delete(account.id);
        }
      } catch {
        this.usageProblems.set(account.id, 'Reset used. Usage could not be updated; refresh usage to check the new limits.');
        this.resetResult += ' Usage could not be updated; refresh usage.';
      }
      try { this.store.clearResetAttempt(account.id); } catch { /* A retained attempt still prevents a new redemption. */ }
    } catch (error) {
      if (this.reset === preview) preview.problem = accountErrorMessage(error);
      else throw error;
    } finally {
      try { this.store.releaseLease(owner); } catch (error) { if (!confirmed) throw error; }
    }
  }
  private async confirmReload(): Promise<boolean> {
    const active = this.options.hasActiveWork?.();
    if (!active && this.context.globalState.get('accounts.reloadNotice.v1', false)) return true;
    const answer = await vscode.window.showWarningMessage(active
      ? 'Codex has active work. Finish or stop it before switching accounts and reloading this window.'
      : 'Selecting an account reloads this window. It also changes the sign-in shared with other Codex windows and terminals using this environment. Finish their work first; other windows may need reloading.',
    { modal: true }, 'Switch Account and Reload');
    if (answer !== 'Switch Account and Reload' || !this.allowed() || !this.store.enabled) return false;
    await this.context.globalState.update('accounts.reloadNotice.v1', true); return true;
  }
  private async reload() {
    this.progress = 'Reloading VS Code with your selected account...';
    this.reloadNeeded = true; this.reloadProblem = ''; this.changed(); this.options.beforeReload();
    try { await vscode.commands.executeCommand('workbench.action.reloadWindow'); }
    catch { this.reloadProblem = 'The account was selected, but the window could not reload. Retry Reload or restore the previous account.'; throw new AccountError(this.reloadProblem); }
  }
  private async add(expected?: AccountSummary) {
    if (!this.options.binary || !this.allowed() || !this.store.enabled) return;
    if (!this.capability.isolatedLogin) throw new AccountError('Isolated sign-in is unavailable for this authentication policy.');
    const before = await readAccountFile(this.options.home);
    this.busy = true; const controller = new AbortController(); this.login = controller;
    this.loginEmail = expected?.email || 'your new account';
    this.progress = 'Opening browser sign-in...'; this.changed();
    let saved: AccountSummary | undefined;
    try {
      const raw = await isolatedAccountLogin(this.options.binary, path.join(this.context.globalStorageUri.fsPath, 'account-logins'),
        async url => {
          if (!await vscode.env.openExternal(vscode.Uri.parse(url))) throw new AccountError('Could not open Codex sign-in.');
          this.progress = expected ? 'Waiting for browser sign-in to ' + (expected.label || expected.email || 'your account') + '...'
            : 'Waiting for browser sign-in...'; this.changed();
        }, controller.signal);
      if (controller.signal.aborted || !this.allowed() || !this.store.enabled) return;
      if (expected && parseAccountAuth(raw).id !== expected.id)
        throw new AccountError('The browser signed in to a different account or workspace. Your current sign-in was kept. Try Sign In Again with the account shown.');
      if (expected && this.store.list().find(item => item.id === expected.id)?.generation !== expected.generation)
        throw new AccountError('This saved account changed during sign-in. Choose it again.');
      this.progress = 'Saving your sign-in...'; this.changed();
      saved = await this.store.capture(raw, true);
      if (!saved) throw new AccountError('The sign-in could not be saved securely. Your current sign-in was kept.');
      const current = await readAccountFile(this.options.home);
      if (current !== before) throw new AccountError('Your Codex sign-in changed during browser login. The new account was saved; choose it when ready to switch.');
    } catch (error) { if (!controller.signal.aborted) throw error; }
    finally { this.busy = false; this.login = undefined; this.loginEmail = undefined; this.changed(); }
    // Successful native login already checked these credentials. Keep the original switch intent.
    if (saved && !controller.signal.aborted && this.allowed() && this.store.enabled) await this.switchAccount(saved, true);
  }
  private async switchAccount(account: AccountSummary, freshLogin = false) {
    if (this.busy || !this.options.binary || !this.allowed() || !this.store.enabled) return;
    const owner = randomUUID();
    if (!this.store.acquireLease(owner, Date.now(), 300000)) throw new AccountError('Another Navigator window is changing accounts. Retry shortly.');
    const name = account.label || account.email || 'your account';
    this.busy = true; this.progress = (freshLogin ? 'Switching to ' : 'Checking sign-in for ') + name + '...'; this.changed();
    let recovery = false, generation = account.generation;
    try {
      if (this.store.list().find(item => item.id === account.id)?.generation !== generation) throw new AccountError('This saved sign-in changed. Choose it again.');
      let raw = await this.store.load(account.id);
      if (!raw) throw new AccountError('This saved account needs a new Codex sign-in.', 'reauthenticate');
      const identity = parseAccountAuth(raw);
      if (this.capability.workspaces?.length && !this.capability.workspaces.includes(identity.workspaceId)) throw new AccountError('This account is outside the allowed Codex workspace.');
      let outgoing = await readAccountFile(this.options.home);
      if (outgoing && parseAccountAuth(outgoing).id !== account.id) await this.store.capture(outgoing);
      if (!freshLogin) raw = await prepareAccountCredentials(this.options.binary, path.join(this.context.globalStorageUri.fsPath, 'account-checks'), raw, async updated => {
        if (!this.allowed() || !this.store.enabled) throw new AccountError('Account switching was disabled.');
        const saved = await this.store.capture(updated);
        if (!saved) throw new AccountError('The refreshed account could not be saved. It may have been forgotten in another window.');
        generation = saved.generation;
      });
      const latest = await readAccountFile(this.options.home);
      if (latest !== outgoing) {
        if (!outgoing || !latest || parseAccountAuth(latest).id !== parseAccountAuth(outgoing).id || parseAccountAuth(latest).id === account.id)
          throw new AccountError('Codex sign-in changed while switching. Your current credentials were kept. Choose an account again.');
        outgoing = latest; await this.store.capture(outgoing);
      }
      if (outgoing) {
        await this.context.secrets.store(this.rollbackKey, outgoing);
        if (await this.context.secrets.get(this.rollbackKey) !== outgoing) throw new AccountError('The outgoing credentials could not be preserved.');
      } else await this.context.secrets.delete(this.rollbackKey);
      const guard = () => {
        if (!this.allowed() || !this.store.enabled || this.store.list().find(item => item.id === account.id)?.generation !== generation)
          throw new AccountError('The saved sign-in or account switching settings changed.');
        if (!this.store.acquireLease(owner, Date.now(), 300000)) throw new AccountError('Another account operation is in progress.');
      };
      this.progress = 'Switching to ' + name + '...'; this.changed();
      guard();
      const previous = outgoing === undefined ? undefined : authFingerprint(outgoing);
      this.store.setPending({ accountId: account.id, fingerprint: authFingerprint(raw), createdAt: Date.now() });
      try { await replaceAccountFile(this.options.home, raw, previous, guard); }
      catch (error) {
        const current = await readAccountFile(this.options.home).catch(() => null);
        if (current !== null && (current === undefined ? undefined : authFingerprint(current)) === previous) {
          this.store.setPending(undefined); await this.context.secrets.delete(this.rollbackKey);
        }
        throw error;
      }
      this.identity = account.id; this.store.releaseLease(owner); await this.reload();
    } catch (error) {
      if (error instanceof AccountError && error.reason === 'reauthenticate') {
        recovery = await vscode.window.showWarningMessage('This saved sign-in needs reconnecting. Sign in again to continue switching to ' + (account.email || account.label || 'this account') + '.', { modal: true }, 'Sign In Again') === 'Sign In Again';
        if (!recovery) this.notice = 'This account needs a new sign-in. Choose Sign In Again from its menu.';
      } else throw error;
    } finally { this.busy = false; this.store.releaseLease(owner); this.changed(); }
    if (recovery && this.allowed() && this.store.enabled) {
      const current = this.store.list().find(item => item.id === account.id);
      if (current) await this.add(current);
    }
  }
  private async restore() {
    const pending = this.store.state().pending;
    if (!pending) throw new AccountError('Choose the account you want to use from the menu.');
    const raw = await this.context.secrets.get(this.rollbackKey);
    const live = await readAccountFile(this.options.home);
    if (!raw || !live || authFingerprint(live) !== pending.fingerprint)
      throw new AccountError('Credentials changed after the switch. Choose a saved account to recover.');
    const id = parseAccountAuth(raw).id;
    const account = this.store.list().find(item => item.id === id);
    if (!account) throw new AccountError('The previous account is no longer saved. Sign in through Codex to recover.');
    if (await this.confirmReload()) await this.switchAccount(account);
  }
  dispose() {
    if (this.disposed) return this.closing;
    this.disposed = true; clearInterval(this.timer); clearTimeout(this.debounce); this.watcher?.close(); this.login?.abort(); this.usageAbort?.abort();
    if (!this.busy && !this.acting) this.closing = Promise.allSettled([this.refreshing, this.usageRefresh]).then(() => this.store.dispose());
    return this.closing;
  }
}
