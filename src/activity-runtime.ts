import { ChatGoal, parseGoal } from './chat-goals';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { ActivitySnapshot } from './activity-events';

// Connect only to an existing managed server. Never start/resume a thread or answer requests.
export class RuntimeActivity {
  private child?: ChildProcessWithoutNullStreams;
  private connecting?: Promise<boolean>;
  private retryAt = 0;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: any) => void; timer: ReturnType<typeof setTimeout> }>();
  private completed = new Map<string, { updated: number; snapshot: ActivitySnapshot }>();
  constructor(private binary: string | undefined, private home: string, private report: (message: string) => void) {}

  private request(method: string, params: unknown): Promise<any> {
    if (!this.child) return Promise.resolve(undefined);
    const id = ++this.sequence;
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve(undefined); this.disconnect(); }, 1500);
      this.pending.set(id, { resolve, timer });
      this.child!.stdin.write(JSON.stringify({ id, method, params }) + '\n', error => { if (error) this.disconnect(); });
    });
  }
  private disconnect() {
    const child = this.child; this.child = undefined; child?.kill(); this.retryAt = Date.now() + 300000;
    for (const { resolve, timer } of this.pending.values()) { clearTimeout(timer); resolve(undefined); }
    this.pending.clear();
  }
  private async connect(): Promise<boolean> {
    if (this.connecting) return this.connecting;
    if (this.child) return true;
    if (!this.binary || Date.now() < this.retryAt) return false;
    this.connecting = (async () => {
      const child = spawn(this.binary!, ['app-server', 'proxy'], { env: { ...process.env, CODEX_HOME: this.home }, windowsHide: true, stdio: 'pipe' });
      this.child = child; let buffer = '';
      child.stdout.setEncoding('utf8'); child.stderr.resume();
      child.on('error', () => this.disconnect()); child.on('exit', () => { if (this.child === child) this.disconnect(); });
      child.stdout.on('data', data => {
        buffer += data.toString(); if (buffer.length > 4 * 1024 * 1024) { this.disconnect(); return; }
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0,end); buffer = buffer.slice(end+1);
          try {
            const message = JSON.parse(line), wait = this.pending.get(message.id);
            if (wait) { clearTimeout(wait.timer); this.pending.delete(message.id); wait.resolve(message.error ? undefined : message.result); }
          } catch { /* Ignore non-protocol output. */ }
        }
      });
      const response = await this.request('initialize', { clientInfo: { name: 'codex_navigator_status', version: require('../package.json').version }, capabilities: { experimentalApi: true } });
      if (!response || !this.child) { this.disconnect(); this.report('Existing runtime unavailable; using hooks and local lifecycle records.'); return false; }
      this.child.stdin.write(JSON.stringify({ method: 'initialized' })+'\n');
      this.report('Connected to existing runtime for read-only activity status.'); return true;
    })();
    try { return await this.connecting; } finally { this.connecting = undefined; }
  }

  async read(ids: Set<string>): Promise<Map<string, ActivitySnapshot>> {
    const result = new Map<string, ActivitySnapshot>();
    if (!await this.connect()) return result;
    const response = await this.request('thread/list', { limit: 200, sortKey: 'updated_at', useStateDbOnly: true });
    if (!Array.isArray(response?.data)) return result;
    for (const thread of response.data) {
      if (!ids.has(thread.id)) continue;
      const status = thread.status;
      if (status?.type === 'active') {
        const flags = status.activeFlags || [], waiting = flags.includes('waitingOnApproval') || flags.includes('waitingOnUserInput');
        result.set(thread.id, { status: waiting ? 'waiting' : 'working', workedAt: 0,
          detail: flags.includes('waitingOnApproval') ? 'Waiting for approval' : waiting ? 'Waiting for your answer' : 'Working' });
        this.completed.delete(thread.id);
      } else if (status?.type === 'systemError') {
        result.set(thread.id, { status: 'error', workedAt: 0, detail: 'Codex reported a system error' });
      } else if (status?.type === 'idle') {
        const cached = this.completed.get(thread.id);
        if (cached && cached.updated === thread.updatedAt) { result.set(thread.id,cached.snapshot); continue; }
        const turns = await this.request('thread/turns/list', { threadId: thread.id, limit: 1, sortDirection: 'desc', itemsView: 'notLoaded' });
        const turn = turns?.data?.[0];
        if (!turn || !['completed','failed','interrupted'].includes(turn.status)) continue;
        const time = typeof turn.completedAt === 'number' ? turn.completedAt * 1000 : 0;
        const snapshot: ActivitySnapshot = { status: turn.status === 'failed' ? 'error' : turn.status === 'completed' && time ? 'ready' : 'idle',
          completedAt: time, workedAt: time, turnId: turn.id,
          detail: turn.status === 'failed' ? 'Turn failed' : turn.status === 'completed' ? 'Turn finished since last viewed' : 'Turn interrupted' };
        this.completed.set(thread.id,{ updated: thread.updatedAt, snapshot }); result.set(thread.id,snapshot);
        if (this.completed.size > 200) this.completed.delete(this.completed.keys().next().value!);
      }
    }
    return result;
  }
  async changeGoal(id: string, expected: ChatGoal): Promise<ChatGoal> {
    if (!await this.connect()) throw new Error('Goal control connection unavailable.');
    const loaded = await this.request('thread/loaded/list', {});
    if (!Array.isArray(loaded?.data) || !loaded.data.includes(id)) throw new Error('The connected runtime does not own this chat.');
    const response = await this.request('thread/goal/get', { threadId: id });
    const current = parseGoal(response?.goal, id);
    if (!current || !['active', 'paused'].includes(current.status) || current.status !== expected.status
      || current.objective !== expected.objective || current.createdAt !== expected.createdAt) throw new Error('The goal changed. Refresh Navigator before trying again.');
    // Status only: preserve the objective, budget and usage. Never resume a thread here.
    const status = current.status === 'active' ? 'paused' : 'active';
    const result = await this.request('thread/goal/set', { threadId: id, status });
    const updated = parseGoal(result?.goal, id);
    if (!updated || updated.status !== status) throw new Error('Goal change was not confirmed. Check its state in Codex before retrying.');
    return updated;
  }

  stop() { this.disconnect(); this.retryAt = 0; }
  dispose() { this.binary = undefined; this.disconnect(); }
}
