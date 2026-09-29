import { open, stat } from 'node:fs/promises';
import { ChatActivity } from './chat-activity';

export interface ActivitySnapshot {
  status: ChatActivity; workedAt: number; observedAt?: number; turnId?: string; completedAt?: number; detail?: string;
}
interface TranscriptState extends ActivitySnapshot { pendingInput?: string; contextAt?: number; ended?: boolean }
const unknown = (): TranscriptState => ({ status: 'unknown', workedAt: 0 });

// Only explicit lifecycle records are interpreted. Never classify prose or tool exit codes.
export function reduceActivity(state: TranscriptState, record: any, now: number): TranscriptState {
  const time = Date.parse(record?.timestamp);
  if (!Number.isFinite(time) || time > now + 5000 || time < Math.max(state.observedAt || 0, state.contextAt || 0)) return state;
  const p = record.payload;
  if (!p || typeof p !== 'object') return state;
  // Compaction can push task_started outside the bounded tail. Context identifies
  // the turn, but neither context nor compaction alone proves it is still working.
  if (record.type === 'turn_context' && typeof p.turn_id === 'string' && p.turn_id.length > 0) {
    return { ...(state.turnId === p.turn_id ? state : unknown()), turnId: p.turn_id, contextAt: time };
  }
  if (record.type === 'event_msg') {
    if (p.type === 'task_started' && typeof p.turn_id === 'string') {
      return { status: 'working', turnId: p.turn_id, observedAt: time, workedAt: time, detail: 'Working (local activity)' };
    }
    // These are live item lifecycle events, not the compacted history body.
    // They retain the turn ID even when task_started/context fell outside the tail.
    if (p.type === 'item_completed' && ['ContextCompaction', 'Reasoning', 'CommandExecution'].includes(p.item?.type)
        && typeof p.turn_id === 'string' && p.turn_id.length > 0
        && (!state.turnId || state.turnId === p.turn_id) && !state.ended && !state.pendingInput) {
      return { ...state, status: 'working', turnId: p.turn_id, observedAt: time, workedAt: time,
        detail: 'Working (local item activity)' };
    }
    if (['task_complete', 'turn_aborted'].includes(p.type) && typeof p.turn_id === 'string'
        && (!state.turnId || state.turnId === p.turn_id)) {
      return { status: p.type === 'task_complete' ? 'ready' : 'unknown', turnId: p.turn_id,
        observedAt: time, workedAt: time, ended: true, completedAt: p.type === 'task_complete' ? time : undefined,
        detail: p.type === 'task_complete' ? 'Turn finished since last viewed' : 'Turn interrupted' };
    }
  }
  if (record.type === 'response_item' && !state.ended && ['unknown', 'working', 'waiting'].includes(state.status)) {
    if (p.type === 'function_call' && ['request_user_input', 'functions.request_user_input'].includes(p.name)
        && typeof p.call_id === 'string') {
      return { ...state, status: 'waiting', pendingInput: p.call_id, observedAt: time, detail: 'Waiting for your answer (local activity)' };
    }
    if (p.type === 'function_call_output' && state.pendingInput === p.call_id && typeof p.call_id === 'string') {
      return { ...state, status: 'working', pendingInput: undefined, observedAt: time, detail: 'Working (local activity)' };
    }
    const invocation = ['function_call', 'custom_tool_call'].includes(p.type)
      && typeof p.name === 'string' && typeof p.call_id === 'string';
    if (!state.pendingInput && (p.type === 'reasoning' || invocation)) {
      return { ...state, status: 'working', observedAt: time, workedAt: time, detail: 'Working (recent local activity)' };
    }
  }
  return state;
}

// Bound each read to 1 MiB: ordinary tool results can exceed 64 KiB between polls.
// Larger gaps still reset state; explicit item events recover after compaction.
// Unchanged files are cached and partial records are retried next time.
const transcriptReadLimit = 1024 * 1024;
export class TranscriptActivity {
  private cache = new Map<string, { size: number; modified: number; offset: number; device: number; inode: number; state: TranscriptState }>();
  async read(filename: string, now = Date.now()): Promise<ActivitySnapshot> {
    try {
      const info = await stat(filename), cached = this.cache.get(filename);
      const sameFile = cached && cached.device === info.dev && cached.inode === info.ino;
      if (sameFile && cached.size === info.size && cached.modified === info.mtimeMs) return this.fresh(cached.state, info.mtimeMs, now);
      const continuing = sameFile && info.size > cached.size && info.size - cached.offset <= transcriptReadLimit;
      let start = continuing ? cached.offset : Math.max(0, info.size - transcriptReadLimit);
      const file = await open(filename, 'r');
      let bytes: Buffer;
      try {
        const buffer = Buffer.alloc(Math.min(transcriptReadLimit, info.size - start));
        const result = await file.read(buffer, 0, buffer.length, start); bytes = buffer.subarray(0, result.bytesRead);
      } finally { await file.close(); }
      let state = continuing ? cached.state : unknown();
      // Locate boundaries in bytes: a tail starting inside UTF-8 must not shift
      // the next read's offset. Never carry state across an unread gap.
      if (start > 0 && !continuing) { const first = bytes.indexOf(10); if (first < 0) return unknown(); start += first + 1; bytes = bytes.subarray(first + 1); }
      const end = bytes.lastIndexOf(10) + 1;
      for (const line of bytes.subarray(0, end).toString('utf8').split('\n')) { try { state = reduceActivity(state, JSON.parse(line), now); } catch { /* partial/unknown schema */ } }
      this.cache.set(filename, { size: info.size, modified: info.mtimeMs, offset: start + end, device: info.dev, inode: info.ino, state });
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
    || transcript.turnId === hook.turnId && hook.status === 'idle' && transcript.status === 'ready') ? transcript : hook;
  if (result.status === 'ready' && (result.completedAt || 0) <= seenAt) result = { ...result, status: 'idle', detail: undefined };
  return result;
}

// Log transitions, not polling heartbeats or conversation contents. Keep memory
// bounded even when the visible history changes throughout a long-running window.
export class ActivityDiagnostics {
  private previous = new Map<string, string>();
  constructor(private report: (record: object) => void) {}
  record(id: string, hook: ActivitySnapshot, transcript: ActivitySnapshot, runtime: ActivitySnapshot | undefined, selected: ActivitySnapshot) {
    const summary = (value: ActivitySnapshot | undefined) => value && ({ status: value.status, turnId: value.turnId });
    const states = { hook: summary(hook), transcript: summary(transcript), runtime: summary(runtime), selected: summary(selected) };
    const signature = JSON.stringify(states);
    if (this.previous.get(id) === signature) return;
    this.previous.delete(id); this.previous.set(id, signature);
    if (this.previous.size > 200) this.previous.delete(this.previous.keys().next().value!);
    this.report({ event: 'activity-state', threadId: id, ...states,
      hookObservedAt: hook.observedAt, transcriptObservedAt: transcript.observedAt, runtimeCompletedAt: runtime?.completedAt });
  }
}
