import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { ActivitySnapshot } from './activity-events';

export interface NotificationChat { id: string; title: string; activity: ActivitySnapshot }
export interface ChatAlert { title: string; message: string }

// Window focus is published on VS Code events. Chat detection uses only the
// existing visible-sidebar refresh. SQLite claims prevent cross-window races.
export class ChatNotifications {
  private db: DatabaseSync;
  private windowId = randomUUID();
  private namespace: string;
  private previous = new Map<string, ActivitySnapshot>();
  private closed = false;
  constructor(directory: string, home: string, focused: boolean,
    private alive: (pid: number) => boolean = pid => {
      try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
    }, private pid = process.pid) {
    mkdirSync(directory, { recursive: true });
    this.namespace = createHash('sha256').update(process.platform === 'win32' ? path.resolve(home).toLowerCase() : path.resolve(home)).digest('hex');
    this.db = new DatabaseSync(path.join(directory, 'chat-notifications.sqlite'));
    this.db.exec(`PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS windows (id TEXT PRIMARY KEY, pid INTEGER NOT NULL, focused INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, time INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS samples (id TEXT PRIMARY KEY, status TEXT NOT NULL, episode INTEGER NOT NULL, time INTEGER NOT NULL, input_id TEXT);`);
    this.setFocused(focused);
  }

  setFocused(focused: boolean): void {
    if (this.closed) return;
    this.db.prepare('INSERT OR REPLACE INTO windows VALUES (?, ?, ?)').run(this.windowId, this.pid, focused ? 1 : 0);
  }

  anyFocused(): boolean {
    if (this.closed) return true;
    let focused = false;
    for (const row of this.db.prepare('SELECT * FROM windows').all()) {
      if (!this.alive(Number(row.pid))) this.db.prepare('DELETE FROM windows WHERE id = ?').run(String(row.id));
      else if (row.focused) focused = true;
    }
    return focused;
  }

  reset(): void { this.previous.clear(); }

  observe(chats: NotificationChat[], sampledAt: number, enabled: boolean, suppressWhenFocused: boolean, now = sampledAt): ChatAlert[] {
    if (this.closed) return [];
    const alerts: ChatAlert[] = [], next = new Map<string, ActivitySnapshot>();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const quiet = !enabled || suppressWhenFocused && this.anyFocused();
      for (const chat of chats.slice(0, 200)) {
        const current = chat.activity, previous = this.previous.get(chat.id);
        if (current.status === 'unknown') { if (previous) next.set(chat.id, previous); continue; }
        next.set(chat.id, current);
        const thread = this.namespace + '/' + chat.id;
        const sample = this.db.prepare('SELECT * FROM samples WHERE id = ?').get(thread);
        // A slower window must not roll another window's newer observation back.
        if (sample && Number(sample.time) > sampledAt) {
          // Retain this observer's last state so its next fresh read can still
          // claim an event that another window only baselined on opening.
          if (previous) next.set(chat.id, previous);
          continue;
        }
        const newRequest = current.status === 'waiting' && (sample?.status !== 'waiting'
          || current.inputId && sample.input_id && current.inputId !== sample.input_id);
        const episode = Number(sample?.episode || 0) + (newRequest ? 1 : 0);
        const inputId = current.status === 'waiting' ? current.inputId || (sample?.status === 'waiting' ? String(sample.input_id || '') : '') : '';
        this.db.prepare('INSERT OR REPLACE INTO samples VALUES (?, ?, ?, ?, ?)').run(thread, current.status, episode, sampledAt, inputId);
        // Unknown signals do not prove a new event. Reopening the view creates
        // a baseline, never a backlog of notifications from hidden activity.
        if (!previous) continue;
        let event: string | undefined;
        if (current.status === 'ready' && current.completedAt && current.completedAt >= now - 60000
          && current.completedAt <= now + 5000
          && (previous.status !== 'ready' || previous.turnId !== current.turnId || previous.completedAt !== current.completedAt)) {
          event = 'complete/' + (current.turnId || current.completedAt);
        } else if (current.status === 'waiting' && (previous.status !== 'waiting'
          || current.inputId && current.inputId !== previous.inputId)) {
          // One shared episode also covers a runtime-only request acquiring its
          // transcript call ID later, without alerting again in another window.
          event = 'input/' + episode;
        }
        if (!event) continue;
        const claimed = this.db.prepare('INSERT OR IGNORE INTO events VALUES (?, ?)').run(thread + '/' + event, sampledAt);
        if (claimed.changes && !quiet) alerts.push({ title: chat.title || 'Untitled chat',
          message: current.status === 'ready' ? 'Codex finished a response.' : current.detail?.includes('approval') ? 'Codex needs your approval.' : 'Codex needs your answer.' });
      }
      this.db.prepare('DELETE FROM events WHERE time < ?').run(sampledAt - 7 * 86400000);
      this.db.prepare('DELETE FROM samples WHERE time < ?').run(sampledAt - 7 * 86400000);
      this.db.exec('COMMIT');
      this.previous = next;
      return alerts;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  dispose(): void {
    if (this.closed) return;
    this.db.prepare('DELETE FROM windows WHERE id = ?').run(this.windowId);
    this.db.close(); this.closed = true; this.previous.clear();
  }
}
