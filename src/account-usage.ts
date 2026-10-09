import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parseAccountAuth } from './account-store';
import { AccountError } from './account-errors';
import { AccountClient } from './account-runtime';
import { accountPlan } from './account-plan';

export interface AccountUsageWindow {
  usedPercent: number;
  windowDurationMins: number;
  /** Unix seconds, as supplied by app-server. */
  resetsAt?: number;
}

export interface AccountUsage {
  checkedAt: number;
  plan?: string;
  primary?: AccountUsageWindow;
  secondary?: AccountUsageWindow;
  bankedResets?: number;
  /** Earliest expiry among available credits returned by Codex; Unix seconds. */
  bankedResetExpiresAt?: number;
}

export type ResetEligibility = 'eligible' | 'unavailable' | 'unknown';

/** Only fresh core five-hour/weekly windows can authorize spending a reset. */
export function resetEligibility(usage?: AccountUsage, now = Date.now()): ResetEligibility {
  if (!usage || !Number.isFinite(usage.checkedAt) || usage.checkedAt > now || now - usage.checkedAt >= 300000) return 'unknown';
  const windows = [usage.primary, usage.secondary].filter(window => window &&
    [300, 10080].includes(window.windowDurationMins) && Number.isFinite(window.usedPercent) &&
    window.usedPercent >= 0 && window.usedPercent <= 100 &&
    (window.resetsAt === undefined || window.resetsAt * 1000 > now));
  if (!windows.length) return 'unknown';
  return windows.some(window => window!.usedPercent > 90) ? 'eligible' : 'unavailable';
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function window(value: unknown): AccountUsageWindow | undefined {
  if (!object(value) || typeof value.usedPercent !== 'number' ||
      !Number.isFinite(value.usedPercent) || value.usedPercent < 0 || value.usedPercent > 100 ||
      !Number.isSafeInteger(value.windowDurationMins) ||
      (value.windowDurationMins as number) < 1 || (value.windowDurationMins as number) > 525600) return;
  const result: AccountUsageWindow = {
    usedPercent: value.usedPercent,
    windowDurationMins: value.windowDurationMins as number,
  };
  if (Number.isSafeInteger(value.resetsAt) && (value.resetsAt as number) > 0 &&
      (value.resetsAt as number) <= 32503680000) result.resetsAt = value.resetsAt as number;
  return result;
}

/** Whitelist the small, non-secret cache shape before it reaches the webview or disk. */
export function sanitizeAccountUsage(value: unknown): AccountUsage | undefined {
  if (!object(value) || !Number.isSafeInteger(value.checkedAt) ||
      (value.checkedAt as number) < 0 || (value.checkedAt as number) > Date.now() + 5 * 60 * 1000) return;
  const result: AccountUsage = { checkedAt: value.checkedAt as number };
  const plan = accountPlan(value.plan);
  if (plan) result.plan = plan;
  const primary = window(value.primary), secondary = window(value.secondary);
  if (primary) result.primary = primary;
  if (secondary) result.secondary = secondary;
  if (Number.isSafeInteger(value.bankedResets) && (value.bankedResets as number) >= 0 &&
      (value.bankedResets as number) <= 1000000) result.bankedResets = value.bankedResets as number;
  if (result.bankedResets && Number.isSafeInteger(value.bankedResetExpiresAt) &&
      (value.bankedResetExpiresAt as number) > (value.checkedAt as number) / 1000 &&
      (value.bankedResetExpiresAt as number) <= 32503680000)
    result.bankedResetExpiresAt = value.bankedResetExpiresAt as number;
  return result.plan !== undefined || result.primary || result.secondary || result.bankedResets !== undefined ? result : undefined;
}

/** Read only the Codex quota bucket. Invalid or absent fields remain unavailable. */
export function parseAccountUsage(raw: unknown, checkedAt = Date.now()): AccountUsage {
  if (!object(raw)) throw new AccountError('Codex account usage is unavailable.');
  const byId = raw.rateLimitsByLimitId;
  const bucket = object(byId) ? byId.codex ??
    (object(raw.rateLimits) && raw.rateLimits.limitId === 'codex' ? raw.rateLimits : undefined) : raw.rateLimits;
  const selected = object(bucket) && (bucket.limitId == null || bucket.limitId === 'codex') ? bucket : undefined;
  const credits = object(raw.rateLimitResetCredits) ? raw.rateLimitResetCredits : undefined;
  let earliestExpiry: number | undefined;
  // Only retain a timestamp, never credit identifiers or backend display text.
  if (Array.isArray(credits?.credits)) for (const credit of credits.credits.slice(0, 1000)) {
    if (!object(credit) || credit.status !== 'available' || !Number.isSafeInteger(credit.expiresAt) ||
        (credit.expiresAt as number) <= checkedAt / 1000 || (credit.expiresAt as number) > 32503680000) continue;
    earliestExpiry = Math.min(earliestExpiry ?? Infinity, credit.expiresAt as number);
  }
  const usage = sanitizeAccountUsage({
    checkedAt,
    plan: selected?.planType,
    primary: selected?.primary,
    secondary: selected?.secondary,
    bankedResets: credits?.availableCount,
    bankedResetExpiresAt: earliestExpiry,
  });
  if (!usage) throw new AccountError('Codex account usage is unavailable.');
  return usage;
}

/** External-token login keeps the user's live Codex home and refresh token untouched. */
export async function readAccountUsage(binary: string, directory: string, rawAuth: string,
  signal?: AbortSignal): Promise<AccountUsage> {
  let home: string | undefined;
  let client: AccountClient | undefined;
  const abort = () => client?.dispose();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw new AccountError('Account usage check cancelled.');
    const identity = parseAccountAuth(rawAuth);
    const parsed = JSON.parse(rawAuth) as { tokens: { access_token: string } };
    await mkdir(directory, { recursive: true, mode: 0o700 });
    home = await mkdtemp(path.join(directory, 'account-usage-'));
    await writeFile(path.join(home, 'config.toml'),
      'cli_auth_credentials_store = "ephemeral"\n[analytics]\nenabled = false\n',
      { flag: 'wx', mode: 0o600 });
    if (signal?.aborted) throw new AccountError('Account usage check cancelled.');
    client = new AccountClient(binary, home);
    await client.start();
    if (signal?.aborted) throw new AccountError('Account usage check cancelled.');
    const login = await client.request('account/login/start', {
      type: 'chatgptAuthTokens', accessToken: parsed.tokens.access_token, chatgptAccountId: identity.workspaceId,
      ...(identity.plan ? { chatgptPlanType: identity.plan } : {}),
    });
    if (login?.type !== 'chatgptAuthTokens') throw new AccountError('Codex account usage is unavailable.');
    if (signal?.aborted) throw new AccountError('Account usage check cancelled.');
    const response = await client.request('account/rateLimits/read', {});
    if (signal?.aborted) throw new AccountError('Account usage check cancelled.');
    if (response?.accountId != null && response.accountId !== identity.workspaceId)
      throw new AccountError('Codex account usage is unavailable.');
    const usage = parseAccountUsage(response);
    if (signal?.aborted) throw new AccountError('Account usage check cancelled.');
    return usage;
  } catch {
    if (signal?.aborted) throw new AccountError('Account usage check cancelled.');
    throw new AccountError('Codex account usage is unavailable.');
  } finally {
    signal?.removeEventListener('abort', abort);
    // A helper that has not exited could still be using this home; retain it on shutdown failure.
    if (client) await client.shutdown();
    if (home) await rm(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
