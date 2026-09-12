import * as path from 'node:path';
import { Assignment, repositoryLabel, sameRoot } from './model';

export type ScopeMode = 'auto' | 'pinned' | 'none';
export const modeKey = 'repositoryModes.v1';
export function readModes(value: unknown): Record<string, ScopeMode> {
  const result: Record<string, ScopeMode> = Object.create(null);
  if (!value || typeof value !== 'object') { return result; }
  for (const [key, mode] of Object.entries(value)) {
    if (/^(local|remote)\/[^/]+$/.test(key) && ['auto', 'pinned', 'none'].includes(mode)) { result[key] = mode; }
  }
  return result;
}

export function effectiveMode(mode: ScopeMode | undefined, assignment: Assignment | undefined): ScopeMode {
  return mode ?? (assignment && !assignment.source ? 'pinned' : 'auto');
}

export function scopeAssignment(roots: { root: string; fsPath: string }[], source: NonNullable<Assignment['source']>,
  folders: { fsPath: string; name: string }[]): Assignment | undefined {
  const unique = roots.filter((root, index) => roots.findIndex(item => sameRoot(item.root, root.root)) === index);
  if (!unique.length) { return; }
  const members = unique.map(item => ({ root: item.root, label: repositoryLabel(item.fsPath, folders) }));
  // Disambiguate directory-name duplicates even outside the workspace folder list.
  for (let index = 0; index < members.length; index++) {
    if (members.some((item, other) => other !== index && item.label === repositoryLabel(unique[index].fsPath, folders))) {
      members[index].label = path.basename(path.dirname(unique[index].fsPath)) + '/' + path.basename(unique[index].fsPath);
    }
  }
  const displayed = members.slice(0, members.length > 3 ? 2 : 3).map(item => item.label.slice(0, 30));
  if (members.length > 3) { displayed.push(`+${members.length - 2}`); }
  return { root: members[0].root, label: displayed.join(' \u00b7 '), members, source };
}
