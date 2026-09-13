import { mkdir, open, opendir, rename, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { sameRoot } from './model';

export interface RoutingProfile {
  version: 1;
  workspace: string;
  enabled: boolean;
  scopes: string[];
  main: string;
  fallbackNames: string[];
}

export function absolutePath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && path.isAbsolute(value) && !/[\x00-\x1f]/.test(value);
}

export function containsPath(scope: string, target: string): boolean {
  const relative = path.relative(scope, target);
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
}

export function validateFallbackNames(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length > 16 || !value.every(name => typeof name === 'string'
    && name.length > 0 && name.length <= 255 && !/[\\/:<>"|?*\x00-\x1f]/.test(name)
    && name !== '.' && name !== '..' && !/[. ]$/.test(name))) {
    throw new Error('Instruction fallback names must be up to 16 plain filenames, without directory paths.');
  }
}

export function validateProfile(value: unknown): asserts value is RoutingProfile {
  if (value && typeof value === 'object' && 'error' in value) {
    throw new Error('A workspace has invalid saved routing settings. Reopen that workspace and correct its instruction routing settings.');
  }
  const profile = value as RoutingProfile;
  if (!profile || profile.version !== 1 || !absolutePath(profile.workspace) || typeof profile.enabled !== 'boolean'
    || !Array.isArray(profile.scopes) || profile.scopes.length > 64 || !profile.scopes.every(absolutePath)
    || !(profile.main === '' || absolutePath(profile.main))) {
    throw new Error('Invalid saved routing configuration. Check the workspace, scope directories and main instructions path.');
  }
  validateFallbackNames(profile.fallbackNames);
}

// The workspace key is stable across restarts. No chat text or label history is saved here.
export function profileFilename(home: string, workspace: string): string {
  const normalized = path.resolve(workspace);
  const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  return path.join(home, 'codex-navigator', 'routing-config', createHash('sha256').update(key).digest('hex') + '.json');
}

export async function saveProfile(home: string, profile: RoutingProfile): Promise<void> {
  if (!absolutePath(profile.workspace)) { throw new Error('Routing requires an absolute workspace identity.'); }
  let invalid: Error | undefined;
  try { validateProfile(profile); } catch (error) { invalid = error as Error; }
  const filename = profileFilename(home, profile.workspace);
  // Persist invalidation too, so a rejected edit cannot silently retain old enabled rules.
  const contents = JSON.stringify(invalid ? { version: 1, workspace: profile.workspace, error: invalid.message } : profile, null, 2) + '\n';
  try {
    const file = await open(filename, 'r');
    try {
      if ((await file.stat()).size <= 1024 * 1024 && await file.readFile('utf8') === contents) {
        if (invalid) { throw invalid; }
        return;
      }
    }
    finally { await file.close(); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } }
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = filename + '.' + randomUUID() + '.pending';
  try {
    await writeFile(temporary, contents, { flag: 'wx' });
    await rename(temporary, filename);
  } finally { await unlink(temporary).catch(() => {}); }
  if (invalid) { throw invalid; }
}

export async function readProfiles(home: string): Promise<RoutingProfile[]> {
  let directory;
  try { directory = await opendir(path.join(home, 'codex-navigator', 'routing-config')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return []; } throw error; }
  const profiles: RoutingProfile[] = [];
  let count = 0;
  for await (const entry of directory) {
    if (++count > 256) { throw new Error('Too many saved routing records; routing was not inferred.'); }
    if (!entry.isFile() || !entry.name.endsWith('.json')) { continue; }
    const filename = path.join(home, 'codex-navigator', 'routing-config', entry.name);
    const file = await open(filename, 'r');
    try {
      if ((await file.stat()).size > 1024 * 1024) { throw new Error('Saved routing configuration is too large.'); }
      const value: unknown = JSON.parse(await file.readFile('utf8'));
      validateProfile(value);
      if (!sameRoot(filename, profileFilename(home, value.workspace))) { throw new Error('Saved routing workspace does not match its record.'); }
      profiles.push(value);
    } finally { await file.close(); }
  }
  return profiles;
}

export function selectProfile(target: string, saved: RoutingProfile[], live: RoutingProfile[] = []): RoutingProfile | undefined {
  // A live window supersedes its own saved record, never another workspace's policy.
  const profiles = [...saved.filter(profile => !live.some(item => sameRoot(item.workspace, profile.workspace))), ...live];
  const matching = profiles.flatMap(profile => profile.scopes.filter(scope => containsPath(scope, target))
    .map(scope => ({ profile, depth: path.resolve(scope).split(path.sep).filter(Boolean).length })));
  const depth = Math.max(...matching.map(item => item.depth));
  const best = matching.filter(item => item.depth === depth).map(item => item.profile);
  const chosen = best[0];
  if (!chosen) { return; }
  if (best.some(item => item.enabled !== chosen.enabled || !sameRoot(item.main, chosen.main)
    || JSON.stringify(item.fallbackNames) !== JSON.stringify(chosen.fallbackNames))) {
    throw new Error('Matching workspaces disagree about routing. Resolve their scope, enablement or instruction settings; no fallback was selected.');
  }
  return chosen;
}
