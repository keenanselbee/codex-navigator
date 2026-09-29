import { parseAccountAuth } from './account-store';
import { AccountError, accountProtocolError } from './account-errors';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { open, lstat, writeFile, rename, unlink, mkdir, mkdtemp, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const authLimit = 1024 * 1024;
export const authFingerprint = (raw: string) => createHash('sha256').update(raw).digest('hex');
export interface AccountCapability { supported: boolean; message: string; workspaces?: string[]; isolatedLogin?: boolean }

/** A private metadata/login client. It never owns or controls the user's chat runtime. */
export class AccountClient {
  private child?: ChildProcessWithoutNullStreams;
  private closed?: Promise<void>;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private disconnected?: () => void;
  private notification?: (method: string, params: any) => void;
  constructor(private binary: string, private home: string) {}
  async start() {
    const child = spawn(this.binary, ['app-server', '--stdio'], {
      env: { ...process.env, CODEX_HOME: this.home }, windowsHide: true, stdio: 'pipe',
    });
    this.child = child;
    this.closed = new Promise(resolve => child.once('close', resolve));
    let buffer = '';
    child.stdout.setEncoding('utf8'); child.stderr.resume();
    child.on('error', () => this.dispose()); child.on('exit', () => this.dispose()); child.on('close', () => this.dispose());
    child.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 2 * authLimit) { this.dispose(); return; }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        try {
          const message = JSON.parse(line);
          if (message.method === 'account/chatgptAuthTokens/refresh' &&
              (typeof message.id === 'number' || typeof message.id === 'string')) {
            child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32603, message: 'Token refresh is unavailable.' } }) + '\n');
            this.dispose();
            continue;
          }
          const request = this.pending.get(message.id);
          if (request) {
            this.pending.delete(message.id); clearTimeout(request.timer);
            if (message.error) request.reject(accountProtocolError(message.error));
            else request.resolve(message.result);
          } else if (typeof message.method === 'string') this.notification?.(message.method, message.params);
        } catch { /* Never expose raw protocol or authentication errors. */ }
      }
    });
    await this.request('initialize', { clientInfo: { name: 'codex_navigator_accounts', version: require('../package.json').version }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  }
  request(method: string, params: unknown): Promise<any> {
    if (!['initialize', 'config/read', 'configRequirements/read', 'getAuthStatus', 'account/read', 'account/login/start', 'account/login/cancel', 'account/rateLimits/read'].includes(method)) {
      return Promise.reject(new AccountError('Unsupported account operation.'));
    }
    if (!this.child) return Promise.reject(new AccountError('Codex account connection is unavailable.'));
    const child = this.child, id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.dispose(); }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n', error => { if (error) this.dispose(); });
    });
  }
  onNotification(callback: (method: string, params: any) => void) { this.notification = callback; }
  onDisconnect(callback: () => void) { this.disconnected = callback; }
  dispose() {
    const child = this.child; this.child = undefined; child?.kill();
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new AccountError('Codex account connection ended or timed out.')); }
    this.pending.clear();
    const disconnected = this.disconnected; this.disconnected = undefined; disconnected?.();
  }
  async shutdown() {
    const closed = this.closed;
    this.dispose();
    if (!closed) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([closed, new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new AccountError('Codex account helper did not stop in time.')), 2000);
      })]);
    } finally { clearTimeout(timer); }
  }
}

export async function accountCapability(binary: string | undefined, home: string, cwd?: string): Promise<AccountCapability> {
  if (!binary) return { supported: false, message: 'A supported local Codex runtime is required.' };
  const client = new AccountClient(binary, home);
  try {
    await client.start();
    const result = await client.request('config/read', { cwd: cwd || null });
    const config = result?.config;
    const policy = await client.request('configRequirements/read', {});
    if (!policy || !Object.prototype.hasOwnProperty.call(policy, 'requirements'))
      return { supported: false, message: 'Codex authentication policy could not be verified.' };
    const requirements = policy.requirements;
    if (requirements != null && (typeof requirements !== 'object' || Array.isArray(requirements)))
      return { supported: false, message: 'Codex authentication policy is unsupported.' };
    if (requirements?.allowedLoginMethods != null &&
        (!Array.isArray(requirements.allowedLoginMethods) || !requirements.allowedLoginMethods.includes('chatgpt')))
      return { supported: false, message: 'Codex policy does not permit ChatGPT account switching.' };
    if (requirements?.cliAuthCredentialsStore != null && requirements.cliAuthCredentialsStore !== 'file')
      return { supported: false, message: 'Codex policy requires another credential backend.' };
    const standardEndpoint = (value: unknown) => value == null || value === 'https://chatgpt.com/backend-api/' || value === 'https://chatgpt.com/backend-api';
    if (!standardEndpoint(requirements?.chatgptBaseUrl) || !standardEndpoint(config?.chatgpt_base_url))
      return { supported: false, message: 'Custom Codex authentication endpoints are not supported by this test build.' };
    // Unknown/default backend is not proof that an existing auth.json is authoritative.
    if (config?.cli_auth_credentials_store !== 'file') return { supported: false, message: 'This test build supports file-backed Codex authentication. Your credential storage settings were not changed.' };
    if (config.forced_login_method && config.forced_login_method !== 'chatgpt') return { supported: false, message: 'Codex policy does not permit ChatGPT account switching.' };
    const forced = config.forced_chatgpt_workspace_id;
    const workspaces = typeof forced === 'string' ? [forced] : Array.isArray(forced) && forced.every(value => typeof value === 'string') ? forced : undefined;
    if (forced != null && !workspaces) return { supported: false, message: 'Codex workspace restrictions could not be verified.' };
    return { supported: true, message: 'File-backed accounts are available. Switching requires a reload and confirmation in Codex.', workspaces, isolatedLogin: requirements == null && !workspaces?.length };
  } catch { return { supported: false, message: 'Codex authentication settings could not be verified. Retry after Codex is ready.' }; }
  finally { client.dispose(); }
}

export async function readAccountFile(home: string): Promise<string | undefined> {
  const filename = path.join(home, 'auth.json');
  let info;
  try { info = await lstat(filename); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw new AccountError('Codex credentials could not be read.'); }
  if (!info.isFile() || info.isSymbolicLink() || info.size > authLimit) throw new AccountError('Codex credential file is unsupported or too large.');
  const file = await open(filename, 'r');
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino) throw new AccountError('Codex credential file changed while opening.');
    const buffer = Buffer.alloc(authLimit + 1), result = await file.read(buffer, 0, buffer.length, 0);
    if (result.bytesRead > authLimit) throw new AccountError('Codex credential file is too large.');
    return buffer.subarray(0, result.bytesRead).toString('utf8');
  } finally { await file.close(); }
}

/** Caller must hold the account lease and preserve outgoing secrets before calling. */
export async function replaceAccountFile(home: string, raw: string, expected: string | undefined, guard?: () => void): Promise<string> {
  if (Buffer.byteLength(raw) > authLimit) throw new AccountError('Saved credentials exceed the supported size.');
  try { JSON.parse(raw); } catch { throw new AccountError('Saved credentials are not valid JSON.'); }
  const fingerprint = authFingerprint(raw), filename = path.join(home, 'auth.json');
  const staged = path.join(home, 'auth.json.navigator-' + randomUUID() + '.tmp');
  const unchanged = async () => {
    const current = await readAccountFile(home);
    guard?.();
    if ((current === undefined ? undefined : authFingerprint(current)) !== expected) throw new AccountError('Codex credentials changed elsewhere. Refresh accounts and retry.');
  };
  await unchanged();
  try {
    await writeFile(staged, raw, { flag: 'wx', mode: 0o600 });
    await unchanged();
    for (let attempt = 0; ; attempt++) {
      try { await rename(staged, filename); break; }
      catch (error) {
        if (attempt >= 3 || !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code || '')) throw new AccountError('Codex credentials could not be replaced. The previous file was retained.');
        await new Promise(resolve => setTimeout(resolve, 30));
        await unchanged();
      }
    }
    const result = await readAccountFile(home);
    if (result === undefined || authFingerprint(result) !== fingerprint) throw new AccountError('Another process changed Codex credentials during switching. Check the account in Codex.');
    return fingerprint;
  } finally { await unlink(staged).catch(() => {}); }
}

export async function isolatedAccountLogin(binary: string, directory: string, openLogin: (url: string) => Promise<void>,
  signal: AbortSignal): Promise<string> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const home = await mkdtemp(path.join(directory, 'account-login-'));
  const client = new AccountClient(binary, home);
  const abort = () => client.dispose();
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) throw new AccountError('Sign-in cancelled.');
    await writeFile(path.join(home, 'config.toml'), 'cli_auth_credentials_store = "file"\n[analytics]\nenabled = false\n', { flag: 'wx', mode: 0o600 });
    await client.start();
    let settle: (value: boolean) => void = () => {};
    const finished = new Promise<boolean>(resolve => { settle = resolve; });
    client.onDisconnect(() => settle(false));
    let loginId: string | undefined;
    const completions: { loginId?: string; success?: boolean }[] = [];
    client.onNotification((method, params) => {
      if (method !== 'account/login/completed') return;
      if (!loginId) completions.push(params || {});
      else if (params?.loginId === loginId) settle(params.success === true);
    });
    const result = await client.request('account/login/start', { type: 'chatgpt' });
    loginId = result?.loginId;
    if (typeof loginId !== 'string' || !loginId) throw new AccountError('Codex did not start a supported sign-in.');
    for (const completion of completions) if (completion.loginId === loginId) settle(completion.success === true);
    if (signal.aborted) throw new AccountError('Sign-in cancelled.');
    const url = new URL(result?.authUrl);
    if (url.protocol !== 'https:' || !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(url.hostname)) throw new AccountError('Codex returned an unsupported sign-in address.');
    await openLogin(url.toString());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelled = () => settle(false);
    signal.addEventListener('abort', cancelled, { once: true });
    try {
      timer = setTimeout(() => settle(false), 10 * 60 * 1000);
      if (signal.aborted || !await finished) throw new AccountError('Sign-in was cancelled or did not complete.');
    } finally { clearTimeout(timer); signal.removeEventListener('abort', cancelled); }
    await client.shutdown();
    if (signal.aborted) throw new AccountError('Sign-in cancelled.');
    const raw = await readAccountFile(home);
    if (!raw) throw new AccountError('Codex did not provide a reusable sign-in.');
    return raw;
  } finally {
    signal.removeEventListener('abort', abort); await client.shutdown();
    // This directory was created by mkdtemp directly under the owned login root.
    await rm(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

/** Refresh through Codex in an isolated home before touching the active auth file. */
export async function prepareAccountCredentials(binary: string, directory: string, raw: string,
  preserveRefresh: (updated: string) => Promise<void>): Promise<string> {
  const identity = parseAccountAuth(raw);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const home = await mkdtemp(path.join(directory, 'account-check-'));
  const client = new AccountClient(binary, home);
  try {
    await writeFile(path.join(home, 'config.toml'),
      'cli_auth_credentials_store = "file"\nforced_login_method = "chatgpt"\nforced_chatgpt_workspace_id = ' + JSON.stringify(identity.workspaceId) + '\n[analytics]\nenabled = false\n',
      { flag: 'wx', mode: 0o600 });
    await writeFile(path.join(home, 'auth.json'), raw, { flag: 'wx', mode: 0o600 });
    await client.start();
    let response: any, failure: unknown;
    try { response = await client.request('account/read', { refreshToken: true }); }
    catch (error) { failure = error; }
    await client.shutdown();
    const updated = await readAccountFile(home);
    if (!updated || parseAccountAuth(updated).id !== identity.id)
      throw new AccountError('Codex did not retain the expected account while checking the saved sign-in. The current sign-in was not replaced.');
    // A refresh can succeed before a later workspace lookup fails. Do not lose rotated tokens.
    if (updated !== raw) await preserveRefresh(updated);
    if (failure) throw failure instanceof AccountError ? failure
      : new AccountError('The saved account could not be checked. The current sign-in was not replaced.');
    if (response?.account?.type !== 'chatgpt')
      throw new AccountError('This saved account needs a new Codex sign-in before switching.', 'reauthenticate');
    return updated;
  } finally {
    await client.shutdown();
    await rm(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
