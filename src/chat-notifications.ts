import { QuestionReply, unansweredQuestions, pendingQuestionIndices } from './chat-questions';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { ActivitySnapshot } from './activity-events';
import { notificationChannels, NotificationKind, NotificationPolicy } from './notification-settings';

export interface NotificationChat { id: string; title: string; activity: ActivitySnapshot }
export interface ChatAlert { chatId: string; title: string; message: string; kind: NotificationKind; sound: boolean; desktop: boolean; questionId?: string; questionIndices?: number[]; inputEpisode?: number }

// Window focus is published on VS Code events. Chat detection uses only the
// existing visible-sidebar refresh. SQLite claims prevent cross-window races.
export class ChatNotifications {
  private db: DatabaseSync;
  private answerInsert: StatementSync;
  private recordedReplies = new Map<string, readonly QuestionReply[]>();
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
      CREATE TABLE IF NOT EXISTS samples (id TEXT PRIMARY KEY, status TEXT NOT NULL, episode INTEGER NOT NULL, time INTEGER NOT NULL, input_id TEXT);
      CREATE TABLE IF NOT EXISTS question_answers (id TEXT PRIMARY KEY, time INTEGER NOT NULL);`);
    this.answerInsert = this.db.prepare('INSERT OR IGNORE INTO question_answers VALUES (?, ?)');
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

  reset(): void { this.previous.clear(); this.recordedReplies.clear(); }

  recordAnswers(chatId: string, replies: readonly QuestionReply[] | undefined, now = Date.now()): void {
    if (this.closed || !replies?.length || this.recordedReplies.get(chatId) === replies) return;
    const recorded = new Map<string, readonly QuestionReply[]>();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.writeAnswers(chatId, replies, now, recorded);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    this.rememberAnswers(recorded);
  }

  // The parser replaces reply arrays on change. Only remember snapshots after
  // their owning transaction commits, so any failed batch remains retryable.
  private writeAnswers(chatId: string, replies: readonly QuestionReply[] | undefined, now: number,
    recorded: Map<string, readonly QuestionReply[]>): void {
    if (!replies?.length || this.recordedReplies.get(chatId) === replies) return;
    let deferred = false;
    for (const reply of replies) {
      if (reply.answeredAt > now + 5000) { deferred = true; continue; }
      if (reply.answeredAt < now - 7 * 86400000) continue;
      this.answerInsert.run(this.namespace + '/' + chatId + '/' + JSON.stringify([reply.id, reply.index]), reply.answeredAt);
    }
    if (!deferred) recorded.set(chatId, replies);
  }

  private rememberAnswers(recorded: Map<string, readonly QuestionReply[]>): void {
    for (const [chatId, replies] of recorded) {
      this.recordedReplies.delete(chatId);
      this.recordedReplies.set(chatId, replies);
      if (this.recordedReplies.size > 200) this.recordedReplies.delete(this.recordedReplies.keys().next().value!);
    }
  }

  canDeliver(alert: ChatAlert): boolean {
    if (this.closed) return false;
    if (alert.kind !== 'input') return true;
    const thread = this.namespace + '/' + alert.chatId;
    if (alert.questionId) return (alert.questionIndices || []).some(index =>
      !this.db.prepare('SELECT 1 FROM question_answers WHERE id = ?').get(thread + '/' + JSON.stringify([alert.questionId, index])));
    const sample = this.db.prepare('SELECT status, episode FROM samples WHERE id = ?').get(thread);
    return sample?.status === 'waiting' && Number(sample.episode) === alert.inputEpisode;
  }

  observe(chats: NotificationChat[], sampledAt: number, policy: NotificationPolicy, now = sampledAt): ChatAlert[] {
    if (this.closed) return [];
    const alerts: ChatAlert[] = [], next = new Map<string, ActivitySnapshot>();
    const recorded = new Map<string, readonly QuestionReply[]>();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const focused = this.anyFocused();
      for (const chat of chats.slice(0, 200)) {
        const current = chat.activity, previous = this.previous.get(chat.id);
        this.writeAnswers(chat.id, current.questions?.replies, now, recorded);
        if (current.status === 'unknown' && !unansweredQuestions(current.questions, now).length) {
          if (previous) next.set(chat.id, previous); continue;
        }
        next.set(chat.id, current);
        const thread = this.namespace + '/' + chat.id;
        const claim = (event: string, kind: NotificationKind, message: string, identity: Pick<ChatAlert, 'questionId' | 'questionIndices' | 'inputEpisode'> = {}) => {
          const claimed = this.db.prepare('INSERT OR IGNORE INTO events VALUES (?, ?)').run(thread + '/' + event, sampledAt);
          const channels = notificationChannels(policy, kind, focused);
          const alert = { chatId: chat.id, title: chat.title || 'Untitled chat', message, kind, ...channels, ...identity };
          if (claimed.changes && (channels.sound || channels.desktop) && this.canDeliver(alert)) alerts.push(alert);
        };
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
        if (current.status !== 'unknown') this.db.prepare('INSERT OR REPLACE INTO samples VALUES (?, ?, ?, ?, ?)').run(thread, current.status, episode, sampledAt, inputId);
        // Unknown signals do not prove a new event. Reopening the view creates
        // a baseline, never a backlog of notifications from hidden activity.
        if (!previous) continue;
        for (const question of unansweredQuestions(current.questions, now)) {
          if (previous.questions?.requests.some(request => request.id === question.id && request.accepted) || question.askedAt < now - 60000) continue;
          claim('async-input/' + question.id, 'input', 'Codex has a question for you.',
            { questionId: question.id, questionIndices: pendingQuestionIndices(question, current.questions?.replies) });
        }
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
        claim(event, current.status === 'ready' ? 'finished' : 'input',
          current.status === 'ready' ? 'Codex finished a response.' : current.detail?.includes('approval') ? 'Codex needs your approval.' : 'Codex needs your answer.',
          current.status === 'waiting' ? { inputEpisode: episode } : {});
      }
      this.db.prepare('DELETE FROM events WHERE time < ?').run(sampledAt - 7 * 86400000);
      this.db.prepare('DELETE FROM samples WHERE time < ?').run(sampledAt - 7 * 86400000);
      this.db.prepare('DELETE FROM question_answers WHERE time < ?').run(sampledAt - 7 * 86400000);
      this.db.exec('COMMIT');
      this.rememberAnswers(recorded);
      this.previous = next;
      return alerts;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  dispose(): void {
    if (this.closed) return;
    this.db.prepare('DELETE FROM windows WHERE id = ?').run(this.windowId);
    this.db.close(); this.closed = true; this.reset();
  }
}
