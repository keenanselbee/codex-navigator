import * as path from 'node:path';
import { readFile, writeFile, mkdir, rename, unlink, copyFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { activityCommand } from './platform';

export type ChatActivity = 'working' | 'idle' | 'unknown' | 'ready' | 'waiting' | 'error';
const collector = require('../tools/chat-activity.cjs') as {
  activitySnapshot(home: string, id: string): Promise<{ status: ChatActivity; workedAt: number; observedAt?: number; turnId?: string }>;
  events: string[];
};
export const readChatActivity = collector.activitySnapshot;

export async function configureActivityHooks(extensionPath: string, home: string, enable: boolean): Promise<void> {
  if (!path.isAbsolute(home)) throw new Error('Codex home must be absolute.');
  const directory = path.join(home, 'codex-navigator');
  const helper = path.join(directory, 'chat-activity.cjs');
  const command = activityCommand(home);
  const file = path.join(home, 'hooks.json');
  let original: string | undefined;
  try { original = await readFile(file, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (original && original.length > 1024 * 1024) throw new Error('hooks.json is too large to update safely.');
  const config = original === undefined ? {} : JSON.parse(original);
  if (!config || typeof config !== 'object' || Array.isArray(config)
      || config.hooks && (typeof config.hooks !== 'object' || Array.isArray(config.hooks))) {
    throw new Error('hooks.json must contain a JSON object with a hooks object.');
  }
  const hooks = config.hooks ?? {};
  for (const event of collector.events) {
    if (hooks[event] !== undefined && !Array.isArray(hooks[event])) throw new Error(`Invalid ${event} hooks; existing configuration was not changed.`);
    const groups = (hooks[event] ?? []).filter((group: any) => !(Array.isArray(group?.hooks)
      && group.hooks.length === 1 && group.hooks[0]?.type === 'command' && group.hooks[0]?.command === command));
    if (enable) groups.push({ hooks: [{ type: 'command', command, timeout: 1 }] });
    if (groups.length) hooks[event] = groups; else delete hooks[event];
  }
  if (Object.keys(hooks).length) config.hooks = hooks; else delete config.hooks;
  const next = JSON.stringify(config, null, 2) + '\n';
  if (!enable && original === undefined) return;
  await mkdir(directory, { recursive: true });
  if (enable) await copyFile(path.join(extensionPath, 'tools', 'chat-activity.cjs'), helper);
  if (next === original) return;
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temporary, next, { flag: 'wx' });
    const current = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return undefined; throw error; });
    if (current !== original) throw new Error('hooks.json changed during setup. Run setup again.');
    if (original !== undefined) await writeFile(path.join(directory, 'hooks-backup-' + randomUUID() + '.json'), original, { flag: 'wx' });
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(() => {}); }
}
