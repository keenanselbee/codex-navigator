import * as path from 'node:path';

export const conversationViewType = 'chatgpt.conversationEditor';
export const assignmentKey = 'repositoryAssignments.v1';

export function readStarredChats(value: unknown): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) { return result; }
  for (const [key, title] of Object.entries(value).slice(0, 2000)) {
    if (/^local\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key) && typeof title === 'string') {
      result[key] = title.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 500) || 'Saved chat';
    }
  }
  return result;
}

export interface Assignment {
  root: string;
  label: string;
  members?: { root: string; label: string }[];
  source?: 'agent' | 'directory' | 'correction' | 'discussion';
}

export type Assignments = Record<string, Assignment>;

export function conversationKey(uri: { scheme: string; authority: string; path: string }): string | undefined {
  if (uri.scheme !== 'openai-codex' || uri.authority !== 'route') { return undefined; }
  const match = /^\/(local|remote)\/([^/]+)\/?$/.exec(uri.path);
  return match ? `${match[1]}/${match[2]}` : undefined;
}

/** Context is supplied by the clicked history row, never inferred from focus. */
export function historyContextKey(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { return undefined; }
  const { webviewSection, repoCompanionConversationKey: key } = value as Record<string, unknown>;
  return webviewSection === 'repoCompanionChat' && typeof key === 'string'
    && /^local\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key) ? key : undefined;
}

export function isNewPanel(uri: { scheme: string; authority: string; path: string }): boolean {
  return uri.scheme === 'openai-codex' && uri.authority === 'route' && uri.path === '/extension/panel/new';
}

export function readAssignments(value: unknown): Assignments {
  const result: Assignments = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) { return result; }
  for (const [key, assignment] of Object.entries(value)) {
    if (!/^(local|remote)\/[^/]+$/.test(key) || !assignment || typeof assignment !== 'object') { continue; }
    const { root, label } = assignment;
    if (typeof root === 'string' && root.startsWith('file:') && typeof label === 'string' && label.trim()) {
      const record: Assignment = { root, label: label.replace(/[\r\n\[\]]/g, ' ').trim().slice(0, 100) };
      const candidate = assignment as Assignment;
      if (candidate.source === 'agent' || candidate.source === 'directory' || candidate.source === 'correction' || candidate.source === 'discussion') { record.source = candidate.source; }
      if (Array.isArray(candidate.members)) {
        record.members = candidate.members.filter(item => typeof item?.root === 'string' && item.root.startsWith('file:') && typeof item.label === 'string')
          .slice(0, 16).map(item => ({ root: item.root, label: item.label.replace(/[\r\n\[\]]/g, ' ').trim().slice(0, 100) }));
      }
      result[key] = record;
    }
  }
  return result;
}

export function sameRoot(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export function hideRedundantLabel(roots: string[], repositories: string[], automatic: boolean, enabled: boolean): boolean {
  const unique = repositories.filter((root, index) => repositories.findIndex(other => sameRoot(other, root)) === index);
  return enabled && automatic && unique.length === 1 && roots.length === 1 && sameRoot(roots[0], unique[0]);
}

export function repositoryLabel(root: string, workspaceFolders: { fsPath: string; name: string }[]): string {
  const exact = workspaceFolders.find(folder => sameRoot(path.resolve(folder.fsPath), path.resolve(root)));
  return (exact?.name ?? path.basename(root)).replace(/[\r\n\[\]]/g, ' ').trim().slice(0, 100) || 'Repository';
}


export function customLabelError(value: string): string | undefined {
  if (!value.trim()) { return 'Enter a label, or use Clear Labels to remove it.'; }
  if (value.trim().length > 100) { return 'Use at most 100 characters.'; }
  if (/[\x00-\x1f\x7f\[\]]/.test(value)) { return 'Use one line without square brackets or control characters.'; }
  return undefined;
}

export function readCustomLabels(value: unknown): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) { return result; }
  for (const [key, label] of Object.entries(value)) {
    if (/^(local|remote)\/[^/]+$/.test(key) && typeof label === 'string' && !customLabelError(label)) {
      result[key] = label.trim();
    }
  }
  return result;
}


export function readRepositoryAliases(value: unknown): { fsPath: string; name: string }[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { return []; }
  return Object.entries(value).filter(([root, name]) => path.isAbsolute(root) && !/[\x00-\x1f]/.test(root)
    && typeof name === 'string' && !customLabelError(name))
    .map(([root, name]) => ({ fsPath: path.resolve(root), name: (name as string).trim() }));
}

export function readManualTimes(value: unknown): Record<string, number> {
  const result: Record<string, number> = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) { return result; }
  for (const [key, time] of Object.entries(value)) {
    if (/^(local|remote)\/[^/]+$/.test(key) && Number.isSafeInteger(time) && time > 0) { result[key] = time; }
  }
  return result;
}
