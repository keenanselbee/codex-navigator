import { AccountError } from './account-errors';
import { parseAccountAuth } from './account-store';

/** Short-lived host-only records. Credit identifiers never enter the webview or cache. */
export interface BankedReset { id: string; expiresAt: number }
export class UncertainResetError extends AccountError {
  constructor() { super('The reset result could not be confirmed. Go back and refresh usage before trying again.'); }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseBankedResets(value: unknown, now = Date.now()): BankedReset[] {
  if (!object(value) || !Array.isArray(value.credits) || value.credits.length > 1000 ||
      !Number.isSafeInteger(value.available_count) || (value.available_count as number) < 0)
    throw new AccountError('Banked resets are unavailable. Try again after refreshing usage.');
  const result: BankedReset[] = [], ids = new Set<string>();
  let available = 0;
  for (const credit of value.credits) {
    if (!object(credit) || credit.status !== 'available') continue;
    available++;
    const expiry = typeof credit.expires_at === 'string' ? Date.parse(credit.expires_at) / 1000
      : typeof credit.expires_at === 'number' ? credit.expires_at / (credit.expires_at > 32503680000 ? 1000 : 1) : NaN;
    if (typeof credit.id !== 'string' || !credit.id || credit.id.length > 512 || /[\x00-\x1f\x7f]/.test(credit.id) ||
        ids.has(credit.id) || !Number.isFinite(expiry) || expiry <= 0 || expiry > 32503680000)
      throw new AccountError('The available resets could not be verified. Check them in Codex.');
    ids.add(credit.id);
    if (expiry * 1000 > now) result.push({ id: credit.id, expiresAt: expiry });
  }
  if ((value.available_count as number) > available)
    throw new AccountError('The full list of banked resets is unavailable. Check them in Codex.');
  return result.sort((a, b) => a.expiresAt - b.expiresAt || a.id.localeCompare(b.id));
}

async function request(rawAuth: string, body?: { credit_id: string; redeem_request_id: string }): Promise<unknown> {
  const identity = parseAccountAuth(rawAuth);
  const auth = JSON.parse(rawAuth) as { tokens: { access_token: string } };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits' + (body ? '/consume' : ''), {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: controller.signal,
      headers: { Authorization: 'Bearer ' + auth.tokens.access_token, 'ChatGPT-Account-Id': identity.workspaceId,
        Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401 || response.status === 403)
      throw new AccountError('Sign in to this account again before using a banked reset.');
    if (!response.ok || !response.body) throw new Error('Request failed');
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 1024 * 1024) { await reader.cancel(); throw new Error('Response too large'); }
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof AccountError) throw error;
    if (body) throw new UncertainResetError();
    throw new AccountError('Banked resets could not be loaded. Check your connection or sign in to this account again.');
  } finally { clearTimeout(timeout); controller.abort(); }
}

export async function readBankedResets(rawAuth: string): Promise<BankedReset[]> {
  return parseBankedResets(await request(rawAuth));
}

export async function consumeBankedReset(rawAuth: string, credit: BankedReset, requestId: string, retryUncertain = false): Promise<void> {
  if (credit.expiresAt * 1000 <= Date.now()) throw new AccountError('This reset expired. Go back and check available resets again.');
  const response = await request(rawAuth, { credit_id: credit.id, redeem_request_id: requestId });
  if (object(response) && (response.code === 'reset' || retryUncertain && response.code === 'already_redeemed')) return;
  const code = object(response) ? response.code : undefined;
  if (!['already_redeemed', 'no_credit', 'nothing_to_reset'].includes(String(code))) throw new UncertainResetError();
  throw new AccountError(code === 'already_redeemed' ? 'This reset was already used. Go back and refresh usage.'
    : code === 'no_credit' ? 'This reset is no longer available. Go back and check available resets again.'
    : 'This account does not need a usage reset right now.');
}
