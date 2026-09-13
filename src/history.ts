import { open } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export const threadIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maximumBytes = 1024 * 1024;

export interface RecentConversation {
  id: string;
  title: string;
  updatedAt: string;
  recencyAt?: number;
}

export function parseRecentConversations(text: string): RecentConversation[] {
  const records = new Map<string, RecentConversation>();
  for (const line of text.split('\n')) {
    let value;
    try { value = JSON.parse(line); } catch { continue; }
    if (!value || typeof value.id !== 'string' || !threadIdPattern.test(value.id) || typeof value.thread_name !== 'string'
      || typeof value.updated_at !== 'string' || !Number.isFinite(Date.parse(value.updated_at))) { continue; }
    const record = { id: value.id as string, title: value.thread_name.replace(/[\r\n]/g, ' ').slice(0, 200), updatedAt: value.updated_at };
    const existing = records.get(record.id);
    if (!existing || Date.parse(existing.updatedAt) <= Date.parse(record.updatedAt)) { records.set(record.id, record); }
  }
  return [...records.values()].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, 200);
}

export async function readRecentConversations(home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')): Promise<RecentConversation[]> {
  const file = await open(path.join(home, 'session_index.jsonl'), 'r');
  try {
    const { size } = await file.stat();
    const length = Math.min(size, maximumBytes);
    const start = size - length;
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, start);
    let text = buffer.subarray(0, bytesRead).toString('utf8');
    // The tail may begin in the middle of a JSON record or UTF-8 character.
    if (start > 0) { text = text.slice(text.indexOf('\n') + 1); }
    return parseRecentConversations(text);
  } finally { await file.close(); }
}
