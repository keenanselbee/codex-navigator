export interface HookReadiness { ready: boolean; message: string; transient?: boolean }

// Completion admits browsing only; it never supplies evidence of hook trust.
export class HookAdmission {
  private unavailableSince?: number;
  constructor(public completed = false) {}

  update(status: HookReadiness, now = Date.now()) {
    if (status.ready) { this.completed = true; this.unavailableSince = undefined; }
    else this.unavailableSince ??= now;
    const notice = !status.ready && this.completed && (!status.transient || now - this.unavailableSince! >= 30000)
      ? status.transient ? 'Activity status unavailable. Navigator will retry automatically.' : status.message : '';
    return { welcome: !this.completed, notice };
  }
}
