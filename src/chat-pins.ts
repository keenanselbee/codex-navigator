import { RecentConversation, threadIdPattern } from './history';

export interface ChatPin { position: number; chat: RecentConversation }
export function chatPins(value: unknown): Record<string, ChatPin> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, pin]) => threadIdPattern.test(id)
    && pin && Number.isInteger(pin.position) && pin.position >= 0 && pin.position < 200
    && pin.chat?.id === id && typeof pin.chat.title === 'string' && pin.chat.title.length <= 200
    && typeof pin.chat.updatedAt === 'string' && Number.isFinite(Date.parse(pin.chat.updatedAt))).slice(0, 200));
}

export function placePinnedChats<T extends RecentConversation>(rows: T[], pins: Record<string, ChatPin>): T[] {
  const pinned = rows.filter(row => pins[row.id]).sort((a, b) => pins[a.id].position - pins[b.id].position || a.id.localeCompare(b.id));
  const result = rows.filter(row => !pins[row.id]);
  let previous = -1;
  for (const row of pinned) {
    const position = Math.min(result.length, Math.max(previous + 1, pins[row.id].position));
    result.splice(position, 0, row); previous = position;
  }
  return result;
}
