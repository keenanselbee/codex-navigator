import * as vscode from 'vscode';
import { LicenseFactory, LicenseService, LicenseServices, LicenseStatus } from './license-contracts';
import { createLicenseService } from './license-service';

export class LicenseAccess implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private readonly manager: LicenseService;
  private readonly product: LicenseServices['product'];
  private readonly subscription: vscode.Disposable;
  private current: LicenseStatus = { state: 'unavailable', allowed: false, message: 'Checking license...' };
  private timer?: ReturnType<typeof setTimeout>;
  private checking?: Promise<void>;
  private refreshing = false;
  private dirty = false;
  private disposed = false;
  private managing = false;
  private busy = false;
  private notice = '';

  constructor(context: vscode.ExtensionContext, factory: LicenseFactory = createLicenseService) {
    const service = factory({ directory: context.globalStorageUri.fsPath, secrets: context.secrets });
    this.manager = service.manager; this.product = service.product;
    this.subscription = context.secrets.onDidChange(event => { if (event.key === service.secretKey) void this.check(); });
  }

  allowed(): boolean {
    return this.current.allowed && (this.current.endsAt === undefined || Date.now() < this.current.endsAt);
  }

  snapshot() {
    return { ...this.current, allowed: this.allowed(), visible: this.managing || !this.allowed(), busy: this.busy,
      notice: this.notice, sandbox: this.product.environment === 'sandbox', canBuy: !!this.product.checkoutUrl,
      canActivate: this.current.canActivate && this.product.configured, canPortal: !!this.product.portalUrl,
      configured: this.product.configured };
  }

  async check(refreshOnline = true): Promise<void> {
    if (this.disposed) return;
    if (this.checking) { this.dirty = true; return this.checking; }
    this.checking = (async () => {
      do { this.dirty = false; this.current = await this.manager.status(); } while (this.dirty && !this.disposed);
      if (this.disposed) return;
      this.changed.fire();
      clearTimeout(this.timer);
      const remaining = (this.current.endsAt ?? Infinity) - Date.now();
      this.timer = setTimeout(() => void this.check(), remaining > 0 ? Math.min(60000, remaining + 1) : 60000);
      if (refreshOnline && this.current.refreshDue && !this.refreshing && this.product.configured) {
        this.refreshing = true;
        void this.manager.refresh().catch(() => {}).finally(async () => {
          this.refreshing = false;
          // Another window may have transferred or revoked access meanwhile.
          // Re-read protected state instead of publishing a stale reply.
          if (!this.disposed) await this.check(false);
        });
      }
    })();
    try { await this.checking; } finally { this.checking = undefined; }
  }

  async requireAccess(): Promise<boolean> {
    await this.check();
    if (this.allowed()) return true;
    await this.show(); return false;
  }

  async show(): Promise<void> {
    this.managing = true; this.changed.fire();
    await vscode.commands.executeCommand('codexNavigator.chats.focus');
  }

  async action(action: string): Promise<void> {
    if (this.busy || this.disposed) return;
    if (!['startTrial', 'activate', 'validate', 'deactivate', 'recover', 'buy', 'portal', 'back', 'setup'].includes(action)) return;
    if (action === 'back') { if (this.allowed()) { this.managing = false; this.changed.fire(); } return; }
    if (action === 'setup') { await vscode.commands.executeCommand('codexNavigator.setUp'); return; }
    if (action === 'buy' || action === 'portal') {
      const url = action === 'buy' ? this.product.checkoutUrl : this.product.portalUrl;
      if (url) await vscode.env.openExternal(vscode.Uri.parse(url));
      return;
    }
    this.busy = true; this.notice = ''; this.changed.fire();
    try {
      if (action === 'startTrial') {
        this.current = await this.manager.startTrial(); this.managing = false;
      } else if (action === 'activate') {
        const key = await vscode.window.showInputBox({ title: 'Activate Codex Navigator', prompt: 'Enter the license key from your Polar purchase.',
          password: true, ignoreFocusOut: true, validateInput: value => value.trim().length > 512 ? 'The key is too long.' : undefined });
        if (key?.trim()) { this.current = await this.manager.activate(key); if (this.current.allowed) this.managing = false; }
      } else if (action === 'validate') this.current = await this.manager.refresh(true);
      else if (action === 'deactivate') {
        const answer = await vscode.window.showWarningMessage('Deactivate this Navigator installation so you can activate another? Your saved chats and labels will stay here.', { modal: true }, 'Deactivate');
        if (answer === 'Deactivate') this.current = await this.manager.deactivate();
      } else if (action === 'recover') {
        const answer = await vscode.window.showWarningMessage('First remove this installation in your Polar customer portal. Recover only after Polar confirms it is deactivated. Recovery from damaged storage requires paid activation and does not start another trial.', { modal: true }, 'I have deactivated it');
        if (answer === 'I have deactivated it') this.current = await this.manager.recover(true);
      }
    } catch {
      // Unexpected provider/storage errors can contain customer credentials.
      this.notice = 'License action could not finish. Check its status before retrying.';
    } finally { this.busy = false; await this.check(); }
  }

  dispose(): void {
    this.disposed = true; clearTimeout(this.timer); this.subscription.dispose(); this.changed.dispose();
  }
}
