import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { threadIdPattern } from './history';
import { parseRecency } from './chat-recency';

export interface ChatGoal {
  status: 'active' | 'paused' | 'blocked' | 'usageLimited' | 'budgetLimited' | 'complete';
  objective: string;
  createdAt?: number;
  tokensUsed: number;
  tokenBudget?: number | null;
}

export function parseGoal(value: any, id: string): ChatGoal | undefined {
  if (value?.threadId !== id || typeof value.objective !== 'string' || value.objective.length > 4000
    || !['active', 'paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete'].includes(value.status)) return;
  return { status: value.status, objective: value.objective, createdAt: Number.isFinite(value.createdAt) ? value.createdAt : undefined, tokensUsed: Number.isFinite(value.tokensUsed) ? value.tokensUsed : 0,
    tokenBudget: Number.isFinite(value.tokenBudget) ? value.tokenBudget : null };
}

// This process only reads persisted chat metadata. It never loads a thread or writes state.
export class ChatGoals {
  private child?: ChildProcessWithoutNullStreams;
  private connecting?: Promise<boolean>;
  private sequence = 0;
  private retryAt = 0;
  private recencyRetryAt = 0;
  private disposed = false;
  private pending = new Map<number, { resolve: (value: any) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(private binary: string | undefined, private home: string, private report: (message: string) => void) {}

  private request(method: string, params: unknown): Promise<any> {
    if (!this.child) return Promise.resolve(undefined);
    const id = ++this.sequence;
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.retryAt = Date.now() + 60000; this.stop(); }, 2000);
      this.pending.set(id, { resolve, timer });
      this.child!.stdin.write(JSON.stringify({ id, method, params }) + '\n', error => { if (error) this.stop(); });
    });
  }

  private async connect(): Promise<boolean> {
    if (this.connecting) return this.connecting;
    if (this.child) return true;
    if (this.disposed || !this.binary || Date.now() < this.retryAt) return false;
    this.connecting = (async () => {
      const child = spawn(this.binary!, ['app-server', '--stdio'], {
        env: { ...process.env, CODEX_HOME: this.home }, windowsHide: true, stdio: 'pipe',
      });
      this.child = child;
      let buffer = '';
      child.stdout.setEncoding('utf8'); child.stderr.resume();
      const failed = () => { if (this.child === child) { this.retryAt = Date.now() + 60000; this.stop(); } };
      child.on('error', failed); child.on('exit', failed);
      child.stdout.on('data', data => {
        buffer += data.toString();
        if (buffer.length > 1024 * 1024) { failed(); return; }
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          try {
            const message = JSON.parse(line), wait = this.pending.get(message.id);
            if (wait) { clearTimeout(wait.timer); this.pending.delete(message.id); wait.resolve(message.error ? undefined : message.result); }
          } catch { /* Ignore non-protocol output. */ }
        }
      });
      const result = await this.request('initialize', { clientInfo: { name: 'codex_navigator_metadata', version: require('../package.json').version }, capabilities: { experimentalApi: true } });
      if (!result || this.child !== child) {
        this.retryAt = Date.now() + 60000; this.stop(); this.report('Chat metadata reader unavailable.'); return false;
      }
      child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
      return true;
    })();
    try { return await this.connecting; } finally { this.connecting = undefined; }
  }

  async readHooks(cwds: string[]): Promise<unknown> {
    if (!await this.connect()) return;
    return this.request('hooks/list', { cwds: cwds.slice(0, 100) });
  }

  async readRecency() {
    if (Date.now() < this.recencyRetryAt || !await this.connect()) return;
    const rows: NonNullable<ReturnType<typeof parseRecency>> = [];
    const ids = new Set<string>(), cursors = new Set<string>();
    let cursor: string | undefined;
    // Servers can cap a page below the requested limit. Bound both pages and total rows.
    for (let page = 0; page < 4; page++) {
      const response = await this.request('thread/list', {
        limit: 200 - rows.length, sortKey: 'recency_at', sortDirection: 'desc', sourceKinds: ['vscode'], archived: false, useStateDbOnly: true,
        ...(cursor ? { cursor } : {}),
      });
      const batch = parseRecency(response);
      if (!batch || batch.some(row => ids.has(row.id))) break;
      for (const row of batch) { ids.add(row.id); rows.push(row); }
      if (!response.nextCursor || rows.length >= 200 || !batch.length) return rows.slice(0, 200);
      if (typeof response.nextCursor !== 'string' || response.nextCursor.length > 4096 || cursors.has(response.nextCursor)) break;
      cursor = response.nextCursor; cursors.add(cursor!);
    }
    this.recencyRetryAt = Date.now() + 60000;
    this.report('Codex recency unavailable; retaining the previous chat order.');
    return undefined;
  }

  async read(ids: string[]): Promise<Record<string, ChatGoal>> {
    const result: Record<string, ChatGoal> = {};
    const queue = [...new Set(ids)].filter(id => threadIdPattern.test(id)).slice(0, 200);
    if (!queue.length || !await this.connect()) return result;
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      let id;
      while (this.child && (id = queue.shift())) {
        const response = await this.request('thread/goal/get', { threadId: id });
        const goal = parseGoal(response?.goal, id);
        if (goal) result[id] = goal;
      }
    }));
    return result;
  }

  stop(): void {
    const child = this.child; this.child = undefined; child?.kill();
    for (const { resolve, timer } of this.pending.values()) { clearTimeout(timer); resolve(undefined); }
    this.pending.clear();
  }

  dispose(): void { this.disposed = true; this.stop(); }
}
