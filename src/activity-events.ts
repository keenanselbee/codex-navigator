import { open, stat } from 'node:fs/promises';
import { ChatActivity } from './chat-activity';

export interface ActivitySnapshot {
  status: ChatActivity; workedAt: number; observedAt?: number; turnId?: string; completedAt?: number; detail?: string;
}
interface TranscriptState extends ActivitySnapshot { pendingInput?: string }
const unknown = (): TranscriptState => ({ status: 'unknown', workedAt: 0 });

// Only explicit lifecycle records are interpreted. Never classify prose or tool exit codes.
export function reduceActivity(state: TranscriptState, record: any, now: number): TranscriptState {
  const time = Date.parse(record?.timestamp);
  if (!Number.isFinite(time) || time > now + 5000 || time < (state.observedAt || 0)) return state;
  const p = record.payload;
  if (!p || typeof p !== 'object') return state;
  if (record.type === 'event_msg') {
    if (p.type === 'task_started' && typeof p.turn_id === 'string') {
      return { status: 'working', turnId: p.turn_id, observedAt: time, workedAt: time, detail: 'Working (local activity)' };
    }
    if (['task_complete', 'turn_aborted'].includes(p.type) && typeof p.turn_id === 'string'
        && (!state.turnId || state.turnId === p.turn_id)) {
      return { status: p.type === 'task_complete' ? 'ready' : 'unknown', turnId: p.turn_id,
        observedAt: time, workedAt: time, completedAt: p.type === 'task_complete' ? time : undefined,
        detail: p.type === 'task_complete' ? 'Turn finished since last viewed' : 'Turn interrupted' };
    }
  }
  if (record.type === 'response_item' && p.type === 'reasoning' && !state.pendingInput
      && ['unknown', 'working'].includes(state.status) && (!state.turnId || state.status === 'working')) {
    return { ...state, status: 'working', observedAt: time, workedAt: time, detail: 'Working (recent local reasoning event)' };
  }
  if (record.type === 'response_item' && (['working', 'waiting'].includes(state.status) || !state.turnId && state.status === 'unknown')) {
    if (p.type === 'function_call' && ['request_user_input', 'functions.request_user_input'].includes(p.name)
        && typeof p.call_id === 'string') {
      return { ...state, status: 'waiting', pendingInput: p.call_id, observedAt: time, detail: 'Waiting for your answer (local activity)' };
    }
    if (p.type === 'function_call_output' && state.pendingInput === p.call_id && typeof p.call_id === 'string') {
      return { ...state, status: 'working', pendingInput: undefined, observedAt: time, detail: 'Working (local activity)' };
    }
  }
  return state;
}

// Small incremental reads, cached for unchanged files. Partial records are retried next time.
export class TranscriptActivity {
  private cache = new Map<string, { size: number; modified: number; offset: number; state: TranscriptState }>();
  async read(filename: string, now = Date.now()): Promise<ActivitySnapshot> {
    try {
      const info = await stat(filename), cached = this.cache.get(filename);
      if (cached?.size === info.size && cached.modified === info.mtimeMs) return this.fresh(cached.state, info.mtimeMs, now);
      const continuing = cached && info.size > cached.size && info.size - cached.offset <= 65536;
      let start = continuing ? cached.offset : Math.max(0, info.size - 65536);
      const file = await open(filename, 'r');
      let text: string;
      try {
        const buffer = Buffer.alloc(Math.min(65536, info.size - start));
        const result = await file.read(buffer, 0, buffer.length, start); text = buffer.subarray(0, result.bytesRead).toString('utf8');
      } finally { await file.close(); }
      let state = continuing ? cached.state : unknown();
      if (start > 0 && !continuing) { const first = text.indexOf('\n'); if (first < 0) return unknown(); start += Buffer.byteLength(text.slice(0, first + 1)); text = text.slice(first + 1); }
      const last = text.lastIndexOf('\n'), complete = last < 0 ? '' : text.slice(0,last+1);
      for (const line of complete.split('\n')) { try { state = reduceActivity(state, JSON.parse(line), now); } catch { /* partial/unknown schema */ } }
      this.cache.set(filename, { size: info.size, modified: info.mtimeMs, offset: start + Buffer.byteLength(complete), state });
      if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value!);
      return this.fresh(state, info.mtimeMs, now);
    } catch { return unknown(); }
  }
  private fresh(state: TranscriptState, modified: number, now: number): ActivitySnapshot {
    if (['working','waiting'].includes(state.status) && now - modified > 15 * 60 * 1000) return { ...state, status: 'unknown', detail: 'Activity signal expired' };
    return state;
  }
}

export function combineActivity(hook: ActivitySnapshot, transcript: ActivitySnapshot, seenAt = 0): ActivitySnapshot {
  // A newer hook start must win over an older completed transcript. Hook Stop is only idle,
  // so a definitive completion from the same turn is allowed to supply the ready dot.
  let result = transcript.observedAt && (transcript.observedAt >= (hook.observedAt || hook.workedAt)
    || transcript.turnId === hook.turnId && hook.status === 'idle') ? transcript : hook;
  if (result.status === 'ready' && (result.completedAt || 0) <= seenAt) result = { ...result, status: 'idle', detail: undefined };
  return result;
}
