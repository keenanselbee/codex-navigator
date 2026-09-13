import { RecentConversation, threadIdPattern } from './history';

// Keep the server's order, including ties. Activity and display metadata never rank chats.
export function parseRecency(value: any): RecentConversation[] | undefined {
  if (!Array.isArray(value?.data) || value.data.length > 200) return;
  const seen = new Set<string>();
  const rows: RecentConversation[] = [];
  for (const item of value.data) {
    if (typeof item?.id !== 'string' || !threadIdPattern.test(item.id) || seen.has(item.id)) return;
    seen.add(item.id);
    rows.push({ ...(typeof item.recencyAt === 'number' && Number.isFinite(item.recencyAt) && item.recencyAt > 0 ? { recencyAt: item.recencyAt * 1000 } : {}), id: item.id, title: typeof item.name === 'string' ? item.name.replace(/[\r\n]/g, ' ').slice(0, 200) : '',
      updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) && Math.abs(item.updatedAt) < 8640000000000
        ? new Date(item.updatedAt * 1000).toISOString() : new Date(0).toISOString() });
  }
  return rows;
}

export class ChatRecency {
  private rows: RecentConversation[] = [];
  private order: string[];
  private authoritative = false;
  constructor(saved: any = []) {
    this.authoritative = saved?.authoritative === true;
    const cached = Array.isArray(saved?.rows) ? saved.rows : [];
    saved = Array.isArray(saved) ? saved : saved?.ids;
    this.order = Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === 'string' && threadIdPattern.test(id)))].slice(0, 200) : [];
    for (const value of cached.slice(0, 200)) {
      if (!value || !this.order.includes(value.id) || this.rows.some(row => row.id === value.id)
        || typeof value.title !== 'string' || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) continue;
      this.rows.push({ id: value.id, title: value.title.replace(/[\r\n]/g, ' ').slice(0, 200), updatedAt: value.updatedAt,
        ...(typeof value.recencyAt === 'number' && Number.isFinite(value.recencyAt) && value.recencyAt > 0 ? { recencyAt: value.recencyAt } : {}) });
    }
  }
  update(native: RecentConversation[] | undefined, index: RecentConversation[]): RecentConversation[] {
    const titles = new Map(index.map(row => [row.id, row.title]));
    if (native !== undefined) {
      this.authoritative = true;
      this.rows = native.map(row => ({ ...row, title: row.title || titles.get(row.id) || 'Untitled chat' }));
    } else {
      const available = new Map(index.map(row => [row.id, row]));
      for (const row of this.rows) available.set(row.id, { ...row, title: titles.get(row.id) || row.title });
      // After a successful native read, the index may contain archived chats: don't revive them.
      const ids = this.authoritative ? this.order : [...new Set([...this.order, ...index.map(row => row.id)])];
      this.rows = ids.flatMap(id => available.has(id) ? [available.get(id)!] : []).slice(0, 200);
    }
    this.order = this.rows.map(row => row.id);
    return this.rows.map(row => ({ ...row }));
  }
  get snapshot() { return { ids: [...this.order], authoritative: this.authoritative, rows: this.rows.map(row => ({ ...row })) }; }
}
