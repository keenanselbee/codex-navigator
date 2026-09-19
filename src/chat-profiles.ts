import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

type Data = Record<string, any>;
export interface ChatProfile { id: string; name: string; data: Data }
export interface SavedState { get<T>(key: string, fallback?: T): T | undefined; update(key: string, value: any): Thenable<void> | Promise<void> }
export const profileKeys = ['repositoryAssignments.v1', 'manualLabelTimes.v1', 'customLabels.v1', 'starredChats.v1',
  'chatColours.v1', 'customLabelColours.v1', 'repositoryModes.v1', 'customRouting.v1', 'discussionScopes.v1',
  'customLabelColourMigration.v1', 'pinnedChats.v1', 'hiddenChats.v1', 'chatNames.v1', 'profileSelection.v1', 'profileView.v1'];
const globalKeys = new Set(['pinnedChats.v1', 'hiddenChats.v1', 'chatNames.v1']);
const object = (value: any): value is Data => !!value && typeof value === 'object' && !Array.isArray(value);
const equal = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const clone = <T>(value: T): T => value === undefined ? value : structuredClone(value);

// Apply only the caller's edits, preserving unrelated changes from another window.
export function mergeEdits(current: any, before: any, after: any): any {
  if (!object(after)) return clone(after);
  before = object(before) ? before : {};
  const merged = object(current) ? clone(current) : {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (equal(before[key], after[key])) continue;
    if (Object.hasOwn(after, key)) Object.defineProperty(merged, key, { value: clone(after[key]), enumerable: true, configurable: true, writable: true });
    else delete merged[key];
  }
  return merged;
}

export class ChatProfiles {
  private db: DatabaseSync;
  activeId = 'default';
  private baselines = new Map<string, any>();
  private snapshots = new WeakMap<object, any>();
  constructor(directory: string, private workspace: string, home: string) {
    mkdirSync(directory, { recursive: true });
    const normalizedHome = process.platform === 'win32' ? path.resolve(home).toLowerCase() : path.resolve(home);
    const namespace = createHash('sha256').update(normalizedHome).digest('hex').slice(0, 16);
    this.db = new DatabaseSync(path.join(directory, `chat-profiles-${namespace}.sqlite`));
    this.db.exec('PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS state (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.transaction(() => {
      if (!this.read('profiles')) this.write('profiles', [{ id: 'default', name: 'Default', data: {} }]);
    });
  }
  private read(id: string): any {
    const row = this.db.prepare('SELECT value FROM state WHERE id = ?').get(id);
    return row ? JSON.parse(String(row.value)) : undefined;
  }
  private write(id: string, value: any) {
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error('Navigator profile storage is full. Remove unused profile customisations before adding more.');
    this.db.prepare('INSERT OR REPLACE INTO state VALUES (?, ?)').run(id, text);
  }
  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  list(): ChatProfile[] { return this.read('profiles'); }
  get current(): ChatProfile { return this.list().find(item => item.id === this.activeId) ?? this.list()[0]; }
  get<T>(key: string, fallback?: T): T {
    const value = this.current.data[key] ?? fallback;
    this.baselines.set(key, clone(value));
    const result = clone(value);
    if (object(result)) this.snapshots.set(result, clone(value));
    return result;
  }
  async update(key: string, value: any): Promise<void> {
    const before = object(value) && this.snapshots.has(value) ? this.snapshots.get(value) : this.baselines.get(key);
    this.transaction(() => {
      const profiles = this.list(), profile = profiles.find(item => item.id === this.activeId);
      if (!profile) throw new Error('This chat profile was removed in another window. Select another profile.');
      profile.data[key] = mergeEdits(profile.data[key], before, value);
      this.write('profiles', profiles);
      this.baselines.set(key, clone(value));
      if (object(value)) this.snapshots.set(value, clone(value));
    });
  }
  refreshInto(key: string, target: Data, reset = false) {
    const before = this.snapshots.get(target) ?? this.baselines.get(key) ?? {};
    const remote = this.get<Data>(key, {});
    const next = reset ? remote : mergeEdits(remote, before, target);
    for (const id of Object.keys(target)) delete target[id];
    for (const [id, value] of Object.entries(next)) Object.defineProperty(target, id, { value, enumerable: true, configurable: true, writable: true });
    this.snapshots.set(target, clone(remote));
  }
  shared<T>(key: string, fallback: T): T { return this.read('shared:' + key) ?? fallback; }
  async updateShared(key: string, value: any, before?: any): Promise<void> {
    this.transaction(() => this.write('shared:' + key, mergeEdits(this.read('shared:' + key), before, value)));
  }
  migrate(workspaceState: SavedState, globalState: SavedState) {
    this.transaction(() => {
      const key = 'migration:' + this.workspace;
      if (this.read(key)) return;
      const legacy: Data = {};
      for (const field of profileKeys) {
        const value = (globalKeys.has(field) ? globalState : workspaceState).get(field);
        if (value !== undefined) legacy[field] = value;
      }
      const profiles = this.list(), defaults = profiles[0];
      const globalImported = this.read('globalImported');
      let conflict = false;
      for (const [field, value] of Object.entries(legacy)) {
        if (globalKeys.has(field) && globalImported) continue;
        if (object(value)) {
          const target = defaults.data[field] ??= {};
          for (const [id, item] of Object.entries(value)) {
            if (!Object.hasOwn(target, id)) Object.defineProperty(target, id, { value: item, enumerable: true, configurable: true, writable: true });
            else if (!equal(target[id], item)) conflict = true;
          }
        } else if (defaults.data[field] === undefined) defaults.data[field] = value;
      }
      // Keep every original snapshot. Conflicts are available through Restore Workspace Organisation.
      this.write(key, { workspace: this.workspace, data: legacy, conflict });
      this.write('profiles', profiles);
      this.write('globalImported', true);
      if (!this.read('shared:chatRecencyOrder.v1')) this.write('shared:chatRecencyOrder.v1', workspaceState.get('chatRecencyOrder.v1', []));
      if (workspaceState.get('navigatorSetup.completed.v1', false)) this.write('shared:browsingCompleted', true);
    });
  }
  select(id: string) {
    if (!this.list().some(item => item.id === id)) throw new Error('That profile no longer exists.');
    this.activeId = id; this.baselines.clear();
  }
  create(name: string, copy = false, data?: Data): string {
    name = name.trim();
    if (!name || name.length > 60 || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Use a profile name of 1 to 60 characters on one line.');
    return this.transaction(() => {
      const profiles = this.list();
      if (profiles.length >= 50) throw new Error('Remove an unused profile before creating another.');
      if (profiles.some(item => item.name.toLowerCase() === name.toLowerCase())) throw new Error('A profile already has that name.');
      const id = randomUUID();
      profiles.push({ id, name, data: data ?? (copy ? this.current.data : { 'profileSelection.v1': {} }) });
      this.write('profiles', profiles); return id;
    });
  }
  rename(name: string) {
    name = name.trim();
    if (this.activeId === 'default') throw new Error('The Default profile keeps its name.');
    if (!name || name.length > 60 || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Use a profile name of 1 to 60 characters on one line.');
    this.transaction(() => {
      const profiles = this.list();
      if (profiles.some(item => item.id !== this.activeId && item.name.toLowerCase() === name.toLowerCase())) throw new Error('A profile already has that name.');
      const profile = profiles.find(item => item.id === this.activeId);
      if (!profile) throw new Error('That profile no longer exists.');
      profile.name = name; this.write('profiles', profiles);
    });
  }
  remove() {
    if (this.activeId === 'default') throw new Error('The Default profile cannot be removed.');
    this.transaction(() => {
      const profile = this.current;
      this.write('removed:' + profile.id, profile);
      this.write('profiles', this.list().filter(item => item.id !== this.activeId));
    });
    this.select('default');
  }
  legacy(): { workspace: string; data: Data; conflict: boolean }[] {
    return this.db.prepare("SELECT value FROM state WHERE id LIKE 'migration:%'").all().map(row => JSON.parse(String(row.value)));
  }
  dispose() { this.db.close(); }
}
