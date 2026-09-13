import { open, opendir, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { threadIdPattern } from './history';

export const codexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
export interface ScopeReport { version: 1; threadId: string; roots: string[]; reportedAt: number }
export interface SessionMetadata { id: string; cwd: string; source: string }

export function parseScopeReport(value: unknown, id: string): ScopeReport | undefined {
  if (!value || typeof value !== 'object' || !threadIdPattern.test(id)) { return; }
  const report = value as ScopeReport;
  if (report.version !== 1 || report.threadId !== id || !Array.isArray(report.roots) || report.roots.length > 16
    || !report.roots.every(root => typeof root === 'string' && root.length <= 4096 && path.isAbsolute(root) && !/[\r\n\0]/.test(root))
    || !Number.isSafeInteger(report.reportedAt) || report.reportedAt < 0 || report.reportedAt > Date.now() + 300000) { return; }
  return { version: 1, threadId: id, roots: [...report.roots], reportedAt: report.reportedAt };
}

export async function readScopeReport(home: string, id: string, kind: 'reports' | 'corrections' = 'reports'): Promise<ScopeReport | undefined> {
  if (!threadIdPattern.test(id)) { return; }
  try {
    const file = await open(path.join(home, 'codex-navigator', kind, id + '.json'), 'r');
    try {
      if ((await file.stat()).size > 65536) { return; }
      return parseScopeReport(JSON.parse(await file.readFile('utf8')), id);
    } finally { await file.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) { return; }
    throw error;
  }
}

export async function writeScopeReport(home: string, id: string, roots: string[], kind: 'reports' | 'corrections' = 'reports'): Promise<boolean> {
  const previous = await readScopeReport(home, id, kind);
  const correction = kind === 'reports' ? await readScopeReport(home, id, 'corrections') : undefined;
  if (previous && JSON.stringify(previous.roots) === JSON.stringify(roots)
    && (!correction || previous.reportedAt >= correction.reportedAt)) { return false; }
  const record = parseScopeReport({ version: 1, threadId: id, roots, reportedAt: Date.now() }, id);
  if (!record) { throw new Error('Invalid scope report.'); }
  const directory = path.join(home, 'codex-navigator', kind);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, id + '.' + randomUUID() + '.pending');
  await writeFile(temporary, JSON.stringify(record), { flag: 'wx' });
  try {
    // A Windows reader or scanner can briefly hold the old report. Retry the
    // atomic replacement, never delete the destination or publish partial JSON.
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, path.join(directory, id + '.json')); break; }
      catch (error) {
        if (attempt >= 3 || !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) { throw error; }
        await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
  }
  finally { await unlink(temporary).catch(() => {}); }
  return true;
}

// Index only standard session directory names; never parse conversation bodies.
// Limit traversal so a malformed or unusually large store cannot monopolize the host.
export class SessionIndex {
  private files = new Map<string, string>();
  private metadata = new Map<string, SessionMetadata>();
  private indexedAt = 0;
  constructor(private home: string) {}

  invalidate() { this.indexedAt = 0; }

  async fileFor(id: string): Promise<string | undefined> {
    return await this.get(id) ? this.files.get(id) : undefined;
  }

  async get(id: string): Promise<SessionMetadata | undefined> {
    if (!threadIdPattern.test(id)) { return; }
    if (this.metadata.has(id)) { return this.metadata.get(id); }
    if (!this.indexedAt || Date.now() - this.indexedAt > 30000) {
      this.indexedAt = Date.now();
      let remaining = 20000;
      const visit = async (directory: string, depth: number): Promise<void> => {
        let entries;
        try { entries = await opendir(directory); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return; } throw error; }
        for await (const entry of entries) {
          if (--remaining < 0) { break; }
          if (entry.isDirectory() && depth < 3 && /^\d{2,4}$/.test(entry.name)) {
            await visit(path.join(directory, entry.name), depth + 1);
          } else if (entry.isFile()) {
            const match = /([0-9a-f-]{36})\.jsonl$/i.exec(entry.name);
            if (match && threadIdPattern.test(match[1])) { this.files.set(match[1], path.join(directory, entry.name)); }
          }
        }
      };
      await visit(path.join(this.home, 'sessions'), 0);
    }
    const filename = this.files.get(id);
    if (!filename) { return; }
    let file;
    try { file = await open(filename, 'r'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return; } throw error; }
    try {
      const buffer = Buffer.alloc(256 * 1024);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      const firstLine = buffer.subarray(0, bytesRead).toString('utf8').split('\n', 1)[0];
      const record = JSON.parse(firstLine);
      const value = record.payload;
      if (record.type !== 'session_meta' || value?.id !== id || typeof value.cwd !== 'string' || !path.isAbsolute(value.cwd)
        || value.source !== 'vscode') { return; }
      const metadata = { id, cwd: value.cwd as string, source: 'vscode' };
      this.metadata.set(id, metadata);
      return metadata;
    } catch (error) { if (error instanceof SyntaxError) { return; } throw error; }
    finally { await file.close(); }
  }
}

export async function reportedThreadIds(home: string, kind: 'reports' | 'corrections' = 'reports'): Promise<string[]> {
  const ids: string[] = [];
  try {
    const directory = await opendir(path.join(home, 'codex-navigator', kind));
    for await (const entry of directory) {
      if (ids.length >= 2000) { break; }
      const id = entry.name.replace(/\.json$/, '');
      if (entry.isFile() && entry.name.endsWith('.json') && threadIdPattern.test(id)) { ids.push(id); }
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } }
  return ids;
}
