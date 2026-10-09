import { AccountError } from './account-errors';
import { AccountUsage, sanitizeAccountUsage } from './account-usage';
import { accountPlan } from './account-plan';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface SecretStorageLike {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export interface AccountIdentity {
  id: string;
  userId: string;
  workspaceId: string;
  email?: string;
  plan?: string;
}

export interface AccountSummary extends AccountIdentity {
  label?: string;
  generation: number;
}

export interface AccountStoreState {
  enabled: boolean;
  accounts: AccountSummary[];
  exclusions: string[];
  pending?: PendingSwitch;
}

export interface PendingSwitch {
  accountId: string;
  fingerprint: string;
  createdAt: number;
}

export interface ResetAttempt {
  creditId: string; expiresAt: number; requestId: string; status: 'pending' | 'used';
}

interface AccountRow {
  id: string;
  user_id: string;
  workspace_id: string;
  email: string | null;
  plan: string | null;
  label: string | null;
  secret_key: string;
  generation: number;
}

const maxBundleBytes = 1024 * 1024;
const maxAccounts = 20;
const authError = 'This Codex sign-in has an unsupported or ambiguous credential format.';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value);
}

function jwtClaims(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || parts[1].length > 131072) throw new AccountError(authError);
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!object(claims)) throw new AccountError(authError);
    return claims;
  } catch {
    throw new AccountError(authError);
  }
}

/** Parses identity hints only. A JWT payload is not proof of successful authentication. */
export function parseAccountAuth(raw: string): AccountIdentity {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > maxBundleBytes) throw new AccountError(authError);
  let auth: unknown;
  try { auth = JSON.parse(raw); } catch { throw new AccountError(authError); }
  if (!object(auth) || auth.auth_mode !== 'chatgpt' ||
      (auth.OPENAI_API_KEY !== undefined && auth.OPENAI_API_KEY !== null) || !object(auth.tokens)) throw new AccountError(authError);
  const tokens = auth.tokens;
  if (typeof tokens.id_token !== 'string' || typeof tokens.access_token !== 'string' ||
      typeof tokens.refresh_token !== 'string' || !tokens.access_token || !tokens.refresh_token ||
      !identifier(tokens.account_id)) throw new AccountError(authError);
  const claims = jwtClaims(tokens.id_token);
  if (!identifier(claims.sub)) throw new AccountError(authError);
  const claimedWorkspace = [claims.chatgpt_account_id, claims.workspace_id];
  const nested = claims['https://api.openai.com/auth'];
  if (object(nested)) claimedWorkspace.push(nested.chatgpt_account_id, nested.workspace_id);
  if (claimedWorkspace.some(value => value !== undefined && value !== null && value !== tokens.account_id)) throw new AccountError(authError);
  const userId = claims.sub;
  const workspaceId = tokens.account_id;
  const id = createHash('sha256').update(userId).update('\0').update(workspaceId).digest('hex').slice(0, 32);
  const email = typeof claims.email === 'string' && claims.email.length <= 320 &&
    !/[\x00-\x1f\x7f]/.test(claims.email) ? claims.email : undefined;
  const directPlan = accountPlan(claims.chatgpt_plan_type);
  const nestedPlan = object(nested) ? accountPlan(nested.chatgpt_plan_type) : undefined;
  const plan = directPlan && nestedPlan && directPlan !== nestedPlan ? undefined : directPlan ?? nestedPlan;
  return { id, userId, workspaceId, ...(email ? { email } : {}), ...(plan ? { plan } : {}) };
}

function summary(row: AccountRow): AccountSummary {
  return {
    id: row.id, userId: row.user_id, workspaceId: row.workspace_id,
    ...(row.email ? { email: row.email } : {}),
    ...(accountPlan(row.plan) ? { plan: accountPlan(row.plan) } : {}),
    ...(row.label ? { label: row.label } : {}), generation: row.generation,
  };
}

function refreshTime(raw: string): number | undefined {
  try {
    const auth: unknown = JSON.parse(raw);
    if (!object(auth) || typeof auth.last_refresh !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(auth.last_refresh)) return undefined;
    const time = Date.parse(auth.last_refresh);
    return Number.isFinite(time) ? time : undefined;
  } catch { return undefined; }
}

export class AccountStore {
  private db: DatabaseSync;
  private namespace: string;

  constructor(directory: string, home: string, private secrets: SecretStorageLike) {
    if (!directory || !home) throw new AccountError('Account storage needs a directory and Codex home.');
    mkdirSync(directory, { recursive: true });
    const normalizedHome = process.platform === 'win32' ? path.resolve(home).toLowerCase() : path.resolve(home);
    this.namespace = createHash('sha256').update(normalizedHome).digest('hex').slice(0, 32);
    this.db = new DatabaseSync(path.join(directory, `accounts-${this.namespace}.sqlite`));
    try {
      this.db.exec('PRAGMA busy_timeout=3000');
      // Hold the writer lock across schema inspection and migration in every window.
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), schema INTEGER NOT NULL, enabled INTEGER NOT NULL, epoch INTEGER NOT NULL);
          INSERT OR IGNORE INTO settings VALUES (1, 1, 0, 0);
          CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
            email TEXT, label TEXT, secret_key TEXT NOT NULL, generation INTEGER NOT NULL, plan TEXT);
          CREATE TABLE IF NOT EXISTS sequences (id TEXT PRIMARY KEY, latest INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS credential_keys (secret_key TEXT PRIMARY KEY, account_id TEXT NOT NULL, writing INTEGER NOT NULL DEFAULT 0);
          INSERT OR IGNORE INTO credential_keys (secret_key, account_id) SELECT secret_key, id FROM accounts;
          CREATE TABLE IF NOT EXISTS exclusions (id TEXT PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS account_usage (account_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS reset_attempts (account_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS lease (id INTEGER PRIMARY KEY CHECK (id = 1), owner TEXT NOT NULL, expires INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS pending (id INTEGER PRIMARY KEY CHECK (id = 1), account_id TEXT NOT NULL,
            fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL);`);
        if (!(this.db.prepare('PRAGMA table_info(credential_keys)').all()).some(row => row.name === 'writing'))
          this.db.exec('ALTER TABLE credential_keys ADD COLUMN writing INTEGER NOT NULL DEFAULT 0');
        if (!(this.db.prepare('PRAGMA table_info(accounts)').all()).some(row => row.name === 'plan'))
          this.db.exec('ALTER TABLE accounts ADD COLUMN plan TEXT');
        const schema = Number(this.db.prepare('SELECT schema FROM settings WHERE id = 1').get()!.schema);
        if (schema !== 1) throw new AccountError('Account storage uses an unsupported schema.');
      });
    } catch (error) { this.db.close(); throw error; }
  }

  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  get enabled(): boolean { return Number(this.db.prepare('SELECT enabled FROM settings WHERE id = 1').get()!.enabled) === 1; }

  list(): AccountSummary[] {
    return (this.db.prepare('SELECT * FROM accounts ORDER BY id').all() as unknown as AccountRow[]).map(summary);
  }

  usage(id: string): AccountUsage | undefined {
    const row = this.db.prepare('SELECT snapshot FROM account_usage WHERE account_id = ?').get(id);
    if (!row || typeof row.snapshot !== 'string' || row.snapshot.length > 4096) return;
    try { return sanitizeAccountUsage(JSON.parse(row.snapshot)); } catch { return; }
  }

  saveUsage(id: string, generation: number, value: AccountUsage): void {
    const usage = sanitizeAccountUsage(value);
    if (!usage) return;
    this.transaction(() => {
      const account = this.db.prepare('SELECT generation FROM accounts WHERE id = ?').get(id);
      if (!this.enabled || !account || Number(account.generation) !== generation ||
          this.db.prepare('SELECT id FROM exclusions WHERE id = ?').get(id)) return;
      if ((this.usage(id)?.checkedAt || 0) > usage.checkedAt) return;
      this.db.prepare(`INSERT INTO account_usage (account_id, snapshot) VALUES (?, ?)
        ON CONFLICT(account_id) DO UPDATE SET snapshot = excluded.snapshot`).run(id, JSON.stringify(usage));
    });
  }

  clearUsage(id: string): void {
    this.transaction(() => this.db.prepare('DELETE FROM account_usage WHERE account_id = ?').run(id));
  }

  resetAttempt(id: string): ResetAttempt | undefined {
    const row = this.db.prepare('SELECT snapshot FROM reset_attempts WHERE account_id = ?').get(id);
    if (!row) return;
    try {
      const value = JSON.parse(String(row.snapshot));
      if (!value || typeof value.creditId !== 'string' || !value.creditId || value.creditId.length > 512 ||
          /[\x00-\x1f\x7f]/.test(value.creditId) || !identifier(value.requestId) ||
          !Number.isFinite(value.expiresAt) || value.expiresAt <= 0 || value.expiresAt > 32503680000 ||
          !['pending', 'used'].includes(value.status)) throw new Error();
      return { creditId: value.creditId, expiresAt: value.expiresAt, requestId: value.requestId, status: value.status };
    } catch { throw new AccountError('The previous reset record could not be read. Check this account in Codex before trying another reset.'); }
  }

  saveResetAttempt(id: string, value: ResetAttempt): void {
    this.transaction(() => {
      if (!this.enabled || !this.db.prepare('SELECT id FROM accounts WHERE id = ?').get(id))
        throw new AccountError('This saved account is no longer available.');
      this.db.prepare('INSERT INTO reset_attempts (account_id, snapshot) VALUES (?, ?) ON CONFLICT(account_id) DO UPDATE SET snapshot = excluded.snapshot')
        .run(id, JSON.stringify(value));
    });
  }

  clearResetAttempt(id: string): void {
    this.transaction(() => this.db.prepare('DELETE FROM reset_attempts WHERE account_id = ?').run(id));
  }

  savePlan(id: string, generation: number, value: unknown): void {
    const plan = accountPlan(value);
    if (!plan) return;
    this.transaction(() => {
      const account = this.db.prepare('SELECT generation FROM accounts WHERE id = ?').get(id);
      if (!this.enabled || !account || Number(account.generation) !== generation ||
          this.db.prepare('SELECT id FROM exclusions WHERE id = ?').get(id)) return;
      this.db.prepare('UPDATE accounts SET plan = ? WHERE id = ?').run(plan, id);
    });
  }

  state(): AccountStoreState {
    const pending = this.db.prepare('SELECT account_id, fingerprint, created_at FROM pending WHERE id = 1').get();
    return {
      enabled: this.enabled, accounts: this.list(),
      exclusions: this.db.prepare('SELECT id FROM exclusions ORDER BY id').all().map(row => String(row.id)),
      ...(pending ? { pending: {
        accountId: String(pending.account_id), fingerprint: String(pending.fingerprint), createdAt: Number(pending.created_at),
      } } : {}),
    };
  }

  setPending(value: PendingSwitch | undefined): void {
    if (value && (!/^[0-9a-f]{32}$/.test(value.accountId) || !/^[0-9a-f]{64}$/.test(value.fingerprint) ||
      !Number.isSafeInteger(value.createdAt) || value.createdAt < 0)) throw new AccountError('Invalid pending account switch.');
    this.transaction(() => {
      if (!value) this.db.prepare('DELETE FROM pending WHERE id = 1').run();
      else this.db.prepare(`INSERT INTO pending (id, account_id, fingerprint, created_at) VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id,
        fingerprint = excluded.fingerprint, created_at = excluded.created_at`).run(
        value.accountId, value.fingerprint, value.createdAt);
    });
  }

  async enable(): Promise<void> {
    if (this.enabled) return;
    const epoch = Number(this.db.prepare('SELECT epoch FROM settings WHERE id = 1').get()!.epoch);
    const key = `codexNavigator.account.probe.${this.namespace}.${randomUUID()}`;
    const value = randomUUID();
    try {
      await this.secrets.store(key, value);
      if (await this.secrets.get(key) !== value) throw new AccountError('Secure storage did not return the saved check value.');
    } catch {
      throw new AccountError('Secure account storage is unavailable. Check your VS Code secret storage and try again.');
    } finally {
      try { await this.secrets.delete(key); } catch { /* A unique probe cannot expose an account. */ }
    }
    this.transaction(() => {
      const row = this.db.prepare('SELECT epoch FROM settings WHERE id = 1').get()!;
      if (Number(row.epoch) !== epoch) throw new AccountError('Account storage changed in another window. Try enabling again.');
      this.db.prepare('UPDATE settings SET enabled = 1, epoch = epoch + 1 WHERE id = 1').run();
    });
  }

  async disable(): Promise<void> {
    this.transaction(() => this.db.prepare('UPDATE settings SET enabled = 0, epoch = epoch + 1 WHERE id = 1').run());
  }

  async capture(raw: string, remember = false): Promise<AccountSummary | undefined> {
    if (!this.enabled) return undefined;
    const identity = parseAccountAuth(raw);
    let reservation: { generation: number; epoch: number; oldKey?: string } | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!remember && this.db.prepare('SELECT id FROM exclusions WHERE id = ?').get(identity.id)) return undefined;
      const snapshot = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(identity.id) as AccountRow | undefined;
      let previous: string | undefined;
      if (snapshot) {
        try { previous = await this.secrets.get(snapshot.secret_key); }
        catch { throw new AccountError('Secure account storage is unavailable. Check VS Code secret storage and try again.'); }
      }
      const outcome = this.transaction(() => {
        const settings = this.db.prepare('SELECT enabled, epoch FROM settings WHERE id = 1').get()!;
        if (Number(settings.enabled) !== 1) return { kind: 'skip' as const };
        if (!remember && this.db.prepare('SELECT id FROM exclusions WHERE id = ?').get(identity.id)) return { kind: 'skip' as const };
        const existing = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(identity.id) as AccountRow | undefined;
        if (existing?.secret_key !== snapshot?.secret_key) return { kind: 'retry' as const };
        if (existing && (existing.user_id !== identity.userId || existing.workspace_id !== identity.workspaceId)) throw new AccountError(authError);
        if (previous === raw && existing) {
          if (remember) this.db.prepare('DELETE FROM exclusions WHERE id = ?').run(identity.id);
          if (identity.plan && !existing.plan)
            this.db.prepare('UPDATE accounts SET plan = ? WHERE id = ?').run(identity.plan, identity.id);
          return { kind: 'same' as const, account: summary({ ...existing, plan: existing.plan ?? identity.plan ?? null }) };
        }
        const incomingTime = refreshTime(raw), previousTime = previous === undefined ? undefined : refreshTime(previous);
        if (incomingTime !== undefined && previousTime !== undefined && incomingTime < previousTime)
          return { kind: 'skip' as const };
        if (!existing && Number(this.db.prepare('SELECT COUNT(*) AS count FROM accounts').get()!.count) >= maxAccounts)
          throw new AccountError('The saved account limit is 20. Forget an account before adding another.');
        const sequence = this.db.prepare('SELECT latest FROM sequences WHERE id = ?').get(identity.id);
        const generation = Number(sequence?.latest ?? 0) + 1;
        this.db.prepare('INSERT INTO sequences (id, latest) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET latest = excluded.latest').run(identity.id, generation);
        return { kind: 'reserved' as const, generation, epoch: Number(settings.epoch), oldKey: existing?.secret_key };
      });
      if (outcome.kind === 'retry') continue;
      if (outcome.kind === 'skip') return undefined;
      if (outcome.kind === 'same') return outcome.account;
      reservation = outcome;
      break;
    }
    if (!reservation) throw new AccountError('This account changed in another window. Try again.');
    const key = `codexNavigator.account.${this.namespace}.${identity.id}.${reservation.generation}`;
    this.db.prepare('INSERT INTO credential_keys (secret_key, account_id, writing) VALUES (?, ?, 1)').run(key, identity.id);
    try {
      await this.secrets.store(key, raw);
      if (await this.secrets.get(key) !== raw) throw new AccountError('Secure storage did not return the saved credential.');
    } catch {
      this.db.prepare('UPDATE credential_keys SET writing = 0 WHERE secret_key = ?').run(key);
      try { await this.deleteCredential(key); } catch { /* A later attempt can replace this unused key. */ }
      throw new AccountError('Could not save this account securely. Check VS Code secret storage and try again.');
    }
    this.db.prepare('UPDATE credential_keys SET writing = 0 WHERE secret_key = ?').run(key);
    const saved = this.transaction(() => {
      const settings = this.db.prepare('SELECT enabled, epoch FROM settings WHERE id = 1').get()!;
      const sequence = this.db.prepare('SELECT latest FROM sequences WHERE id = ?').get(identity.id);
      if (Number(settings.enabled) !== 1 || Number(settings.epoch) !== reservation.epoch ||
          Number(sequence?.latest) !== reservation.generation ||
          (!remember && this.db.prepare('SELECT id FROM exclusions WHERE id = ?').get(identity.id))) return false;
      if (remember) this.db.prepare('DELETE FROM exclusions WHERE id = ?').run(identity.id);
      const existing = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(identity.id) as AccountRow | undefined;
      if (!existing && Number(this.db.prepare('SELECT COUNT(*) AS count FROM accounts').get()!.count) >= maxAccounts) return false;
      this.db.prepare(`INSERT INTO accounts (id, user_id, workspace_id, email, label, secret_key, generation, plan)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email,
        secret_key = excluded.secret_key, generation = excluded.generation,
        plan = COALESCE(excluded.plan, accounts.plan)`).run(
        identity.id, identity.userId, identity.workspaceId, identity.email ?? null, existing?.label ?? null,
        key, reservation.generation, identity.plan ?? null);
      return true;
    });
    if (!saved) {
      try { await this.deleteCredential(key); } catch { /* This key is not referenced by the catalog. */ }
      return undefined;
    }
    if (reservation.oldKey && reservation.oldKey !== key) {
      try { await this.deleteCredential(reservation.oldKey); } catch { /* Current generation remains usable. */ }
    }
    return this.list().find(item => item.id === identity.id);
  }

  async load(id: string): Promise<string | undefined> {
    if (!this.enabled) throw new AccountError('Account switching is off. Enable it in setup first.');
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined;
    if (!row) return undefined;
    let raw: string | undefined;
    try { raw = await this.secrets.get(row.secret_key); }
    catch { throw new AccountError('Secure account storage is unavailable. Check VS Code secret storage and try again.'); }
    if (!raw) throw new AccountError('This saved account is unavailable in the current VS Code secret storage.');
    let identity: AccountIdentity;
    try { identity = parseAccountAuth(raw); } catch { throw new AccountError('This saved account is damaged or unsupported. Sign in again.'); }
    if (identity.id !== row.id || identity.userId !== row.user_id || identity.workspaceId !== row.workspace_id)
      throw new AccountError('This saved account does not match its recorded identity. Sign in again.');
    const current = this.db.prepare('SELECT secret_key FROM accounts WHERE id = ?').get(id);
    if (!current || current.secret_key !== row.secret_key) throw new AccountError('This account changed in another window. Try again.');
    return raw;
  }

  private async deleteCredential(key: string): Promise<void> {
    await this.secrets.delete(key);
    // Keep a durable cleanup record while another window can still finish this write.
    this.db.prepare('DELETE FROM credential_keys WHERE secret_key = ? AND writing = 0').run(key);
  }

  async forget(id: string): Promise<void> {
    this.transaction(() => {
      this.db.prepare('INSERT OR IGNORE INTO exclusions (id) VALUES (?)').run(id);
      // Invalidate an in-flight capture, including explicit remembering.
      this.db.prepare('UPDATE sequences SET latest = latest + 1 WHERE id = ?').run(id);
    });
    const keys = this.db.prepare('SELECT secret_key FROM credential_keys WHERE account_id = ?').all(id);
    for (const row of keys) {
      try { await this.deleteCredential(String(row.secret_key)); }
      catch { throw new AccountError('Could not remove the saved credential from secure storage. Try again.'); }
    }
    this.transaction(() => {
      // A later explicit remember must not be removed by an older Forget operation.
      const row = this.db.prepare('SELECT secret_key FROM accounts WHERE id = ?').get(id);
      if (!row || keys.some(key => key.secret_key === row.secret_key)) {
        this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
        this.db.prepare('DELETE FROM account_usage WHERE account_id = ?').run(id);
        this.db.prepare('DELETE FROM reset_attempts WHERE account_id = ?').run(id);
        this.db.prepare('DELETE FROM pending WHERE account_id = ?').run(id);
      }
    });
  }

  async forgetAll(): Promise<void> {
    await this.disable();
    const ids = new Set([...this.list().map(account => account.id),
      ...this.db.prepare('SELECT DISTINCT account_id FROM credential_keys').all().map(row => String(row.account_id))]);
    for (const id of ids) await this.forget(id);
  }

  async rename(id: string, label: string): Promise<void> {
    const name = label.trim();
    if (name.length > 60 || /[\x00-\x1f\x7f]/.test(name)) throw new AccountError('Use an account name of at most 60 characters on one line.');
    this.transaction(() => {
      const result = this.db.prepare('UPDATE accounts SET label = ? WHERE id = ?').run(name || null, id);
      if (!result.changes) throw new AccountError('That saved account no longer exists.');
    });
  }

  acquireLease(ownerId: string, now = Date.now(), ttlMs = 30000): boolean {
    if (!identifier(ownerId) || !Number.isSafeInteger(now) || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 300000)
      throw new AccountError('Invalid account operation lease.');
    return this.transaction(() => {
      const row = this.db.prepare('SELECT owner, expires FROM lease WHERE id = 1').get();
      if (row && Number(row.expires) > now && row.owner !== ownerId) return false;
      this.db.prepare('INSERT INTO lease (id, owner, expires) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, expires = excluded.expires')
        .run(ownerId, now + ttlMs);
      return true;
    });
  }

  releaseLease(ownerId: string): void {
    this.transaction(() => this.db.prepare('DELETE FROM lease WHERE id = 1 AND owner = ?').run(ownerId));
  }

  dispose(): void { this.db.close(); }
}
