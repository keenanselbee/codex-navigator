import { mkdir, open, opendir, rename, unlink, writeFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sameRoot } from './model';
import { exactGitRoots } from './report-scope';
import { codexHome, SessionIndex } from './scope-store';
import { RoutingProfile, containsPath, readProfiles, saveProfile, selectProfile, validateProfile, validateFallbackNames } from './routing-config';

export interface RoutingSnapshot {
  version: 1 | 2;
  pid: number;
  main: string;
  chats: Record<string, string[]>;
  profile?: RoutingProfile;
}

// Each extension host owns its own file. Conflicting windows never silently win.
export class RoutingPublisher {
  private filename: string;
  private previous = '';
  private pending = Promise.resolve();
  constructor(private home: string) {
    this.filename = path.join(home, 'repo-companion', 'routing', randomUUID() + '.json');
  }
  publish(snapshot?: RoutingSnapshot): Promise<void> {
    this.pending = this.pending.catch(() => {}).then(() => this.writeSnapshot(snapshot));
    return this.pending;
  }
  private async writeSnapshot(snapshot?: RoutingSnapshot): Promise<void> {
    const next = snapshot ? JSON.stringify(snapshot) : '';
    if (snapshot?.profile) { await saveProfile(this.home, snapshot.profile); }
    if (next === this.previous) { return; }
    if (!snapshot) {
      await unlink(this.filename).catch(error => { if (error.code !== 'ENOENT') { throw error; } });
      this.previous = '';
      return;
    }
    if (Buffer.byteLength(next) > 2 * 1024 * 1024) { throw new Error('Instruction routing metadata is too large.'); }
    await mkdir(path.dirname(this.filename), { recursive: true });
    const temporary = this.filename + '.pending';
    try {
      await writeFile(temporary, next);
      await rename(temporary, this.filename);
      this.previous = next;
    } finally { await unlink(temporary).catch(() => {}); }
  }
  async dispose(): Promise<void> {
    await this.pending.catch(() => {});
    await unlink(this.filename).catch(() => {});
  }
}

function absolute(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && path.isAbsolute(value) && !/[\x00-\x1f]/.test(value);
}

async function readSnapshot(filename: string): Promise<RoutingSnapshot | undefined> {
  const file = await open(filename, 'r');
  try {
    if ((await file.stat()).size > 2 * 1024 * 1024) { return; }
    const value = JSON.parse(await file.readFile('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![1, 2].includes(value.version) || !Number.isSafeInteger(value.pid) || value.pid <= 0
      || !(value.main === '' || absolute(value.main)) || !value.chats || typeof value.chats !== 'object' || Array.isArray(value.chats)) { return; }
    try { process.kill(value.pid, 0); } catch { return; }
    if (value.version === 2 || value.profile !== undefined) { validateProfile(value.profile); }
    return value;
  } finally { await file.close(); }
}

// Paths only: the agent reads the files and follows the configured main file's
// routing rules. Never interpret arbitrary Markdown links as automatic includes.
export async function instructionPaths(main: string, roots: string[], files: string[] = [], fallbackNames: string[] = []): Promise<string[]> {
  validateFallbackNames(fallbackNames);
  const result: string[] = [];
  const visited = new Set<string>();
  async function add(filename: string, required = false): Promise<boolean> {
    try {
      const metadata = await stat(filename);
      if (!metadata.isFile() || metadata.size === 0) {
        if (required) { throw new Error('Main instructions file is empty or is not a file.'); }
        return false;
      }
      if (!result.some(item => sameRoot(item, filename))) { result.push(filename); }
      return true;
    } catch (error) {
      if (!required && (error as NodeJS.ErrnoException).code === 'ENOENT') { return false; }
      throw error;
    }
  }
  if (main) {
    if (!absolute(main)) { throw new Error('Main instructions file must be an absolute path.'); }
    await add(main, true);
  }
  async function walk(directory: string) {
    const chain: string[] = [];
    for (let current = path.resolve(directory); ; current = path.dirname(current)) {
      chain.unshift(current);
      if (path.dirname(current) === current) { break; }
    }
    for (const current of chain) {
      const key = process.platform === 'win32' ? current.toLowerCase() : current;
      if (visited.has(key)) { continue; }
      visited.add(key);
      for (const name of [...new Set(['AGENTS.override.md', 'AGENTS.md', ...fallbackNames])]) {
        if (await add(path.join(current, name))) { break; }
      }
    }
  }
  for (const root of roots) { await walk(root); }
  if (files.length > 32) { throw new Error('Pass at most 32 target file paths.'); }
  for (const file of files) {
    if (!absolute(file) || !roots.some(root => {
      const relative = path.relative(root, file);
      return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
    })) { throw new Error('Target file paths must be inside a resolved repository.'); }
    await walk(path.dirname(file));
  }
  return result;
}

export async function resolveRouting(args: string[], home = codexHome(), id = process.env.CODEX_THREAD_ID) {
  if (!id || !await new SessionIndex(home).get(id)) { throw new Error('No verified local VS Code conversation identity.'); }
  let target: string | undefined;
  const files: string[] = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--target' && !target && args[index + 1]) { target = args[++index]; }
    else if (args[index] === '--file' && args[index + 1]) { files.push(args[++index]); }
    else { throw new Error('Use --target <explicit Git root> and optional --file <absolute file path>.'); }
  }
  const candidates: { main: string; roots: string[]; profile?: RoutingProfile }[] = [];
  const live: RoutingProfile[] = [];
  let directory;
  try { directory = await opendir(path.join(home, 'repo-companion', 'routing')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } }
  if (directory) {
    let count = 0;
    for await (const entry of directory) {
      if (++count > 256) { throw new Error('Too many routing records; routing was not inferred.'); }
      if (!entry.isFile() || !entry.name.endsWith('.json')) { continue; }
      try {
        const record = await readSnapshot(path.join(home, 'repo-companion', 'routing', entry.name));
        if (record?.profile) { live.push(record.profile); }
        const roots = record?.chats['local/' + id];
        if (record && Array.isArray(roots) && roots.length <= 16 && roots.every(absolute)) { candidates.push({ main: record.main, roots: target ? exactGitRoots([target]) : roots, profile: record.profile }); }
      } catch (error) {
        if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
      }
    }
  }
  const saved = await readProfiles(home);
  if (target || candidates.length && candidates.every(item => item.profile)) {
    const roots = target ? exactGitRoots([target]) : candidates[0].roots.length ? exactGitRoots(candidates[0].roots) : [];
    if (!target && candidates.some(item => item.roots.length !== roots.length || item.roots.some((root, index) => !sameRoot(root, roots[index])))) {
      throw new Error('Open windows disagree about this chat routing. Supply the explicit target repository.');
    }
    const routes = roots.map(root => ({ root, profile: selectProfile(root, saved, live) }));
    // Keep the legacy live-window path during upgrades where no scoped profile exists yet.
    if (routes.some(route => route.profile) || candidates.some(item => item.profile) || !candidates.length) {
      const disabled = routes.some(route => route.profile?.enabled === false);
      if (disabled) { return { enabled: false, status: 'disabled', roots, reason: 'Routing is explicitly disabled for a matching scope. Do not apply Companion fallback; resolve mixed batches one target at a time.' }; }
      if (!routes.length || routes.some(route => !route.profile)) {
        return { enabled: false, status: 'unavailable', roots, reason: 'No saved routing scope matches the explicit target, or no repository association exists. Use ordinary project instruction discovery.' };
      }
      if (files.length > 32 || files.some(file => !absolute(file) || !roots.some(root => containsPath(root, file)))) {
        throw new Error('Pass at most 32 absolute target file paths inside a resolved repository.');
      }
      const instructions: string[] = [];
      for (const { root, profile } of routes) {
        const applicable = files.filter(file => containsPath(root, file));
        for (const instruction of await instructionPaths(profile!.main, [root], applicable, profile!.fallbackNames)) {
          if (!instructions.some(item => sameRoot(item, instruction))) { instructions.push(instruction); }
        }
      }
      return { enabled: true, status: 'enabled', roots, instructions,
        guidance: 'Read each applicable main file first, then its scoped project and nested instructions. Explicit targets override labels. Paths found do not prove files were read. No cwd or permissions were changed.' };
    }
  }
  if (!candidates.length) { return { enabled: false, status: 'unavailable', reason: 'No routing-enabled window has this chat registered. Supply --target for saved scoped routing.' }; }
  const chosen = candidates[0];
  if (candidates.some(item => !sameRoot(item.main, chosen.main) || item.roots.length !== chosen.roots.length || item.roots.some((root, i) => !sameRoot(root, chosen.roots[i])))) {
    throw new Error('Open windows disagree about this chat routing. Resolve the label or main-file settings first.');
  }
  const roots = chosen.roots.length ? exactGitRoots(chosen.roots) : [];
  return { enabled: true, roots, instructions: await instructionPaths(chosen.main, roots, files),
    guidance: 'Read the main file first, then applicable project files. Follow their routing and configured fallback filenames. Explicit user focus overrides labels. Paths found do not prove instructions were read. No cwd or permissions were changed.',
    ...(roots.length ? {} : { reason: 'No repository association. Custom text alone does not identify a project.' }) };
}

if (require.main === module) {
  resolveRouting(process.argv.slice(2)).then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n'))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
