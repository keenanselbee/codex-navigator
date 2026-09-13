import { open } from 'node:fs/promises';
import * as path from 'node:path';
import { ScopeReport } from './scope-store';

export interface ProjectName { root: string; names: string[] }
const normalize = (value: string) => value.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// One insertion, deletion, substitution, or adjacent transposition. Short names
// require exact spelling, and ties across roots are always left unresolved.
function near(left: string, right: string): boolean {
  if (left === right) { return true; }
  if (Math.min(left.length, right.length) < 5 || Math.abs(left.length - right.length) > 1) { return false; }
  let at = 0;
  while (left[at] === right[at] && at < Math.min(left.length, right.length)) { at++; }
  if (left.length > right.length) { return left.slice(at + 1) === right.slice(at); }
  if (right.length > left.length) { return left.slice(at) === right.slice(at + 1); }
  return left.slice(at + 1) === right.slice(at + 1)
    || left[at] === right[at + 1] && left[at + 1] === right[at] && left.slice(at + 2) === right.slice(at + 2);
}

export function userRequest(text: string): string {
  // IDE attachments and instruction injections must not become discussion scope.
  const marker = /^## My request:\s*$/m.exec(text);
  if (marker) { text = text.slice(marker.index + marker[0].length); }
  else if (/^\s*(?:<(?:environment_context|INSTRUCTIONS|recommended_plugins|send_user_message)|# (?:AGENTS\.md instructions|Context from my IDE setup))/i.test(text)) { return ''; }
  return text.replace(/```[\s\S]*?(?:```|$)/g, '').replace(/"[^"\n]*(?:\n[^"\n]*)*"|\u201c[^\u201d]*\u201d/g, quote => /\n|\b(?:focus|switch|talk about|work on|review)\b/i.test(quote) ? '' : quote).split('\n').filter(line => !/^\s*>/.test(line)).join('\n').trim();
}

export function detectDiscussion(text: string, projects: ProjectName[]): string[] | undefined {
  const request = userRequest(text);
  if (!request || request.length > 32768) { return; }
  // Explicit write restrictions also cover inferred metadata updates.
  if (/\b(?:AUDIT|DNE|read[ -]only)\b/i.test(request)
    || /\b(?:do not|don['\u2019]t|never)\s+(?:\w+\s+){0,3}(?:write|edit|modify|change|update|save|touch)\b/i.test(request)
    || /\bno\s+(?:writes|edits|changes)\b/i.test(request)) return;
  const prefix = /^(?:(?:ok(?:ay)?|yes)[, ]+)?(?:(?:now|instead|next)[, ]+)?(?:(?:let['\u2019]?s|lelts|ltes|let us|please|can we|could we|can you|could you|i want to|we should)\s+)?(?:(?:focus|focsu|foucs|focs)\s+(?:on|back on)|(?:switch|swich|swtich|move|return)\s+(?:to|back to)|(?:work|working|continue working)\s+on|(?:discuss|revisit|review)|look\s+at|talk\s+about|(?:back|continue)\s+(?:to|with))\s+/i;
  let latest: string[] | undefined;
  for (const sentence of request.split(/\n|[.!?]\s+/)) {
    const value = sentence.trim();
    const cue = prefix.exec(value);
    if (!cue) { continue; }
    let rest = value.slice(cue[0].length, cue[0].length + 512).replace(/^the\s+/i, '').replace(/^(?:project|repo(?:sitory)?)\s+/i, '').trim();
    const roots: string[] = [];
    let ambiguous = false;
    for (let member = 0; member < 16; member++) {
      const matches: { root: string; length: number; exact: boolean }[] = [];
      for (const project of projects) {
        for (const name of project.names) {
          const normalized = normalize(name);
          if (!normalized) { continue; }
          const words = normalized.split(' ').length;
          const tokens = [...rest.matchAll(/[\p{L}\p{N}]+/gu)].slice(0, words);
          const last = tokens.at(-1);
          const clean = last && tokens.length === words ? rest.slice(0, last.index! + last[0].length) : '';
          if (near(normalize(clean), normalized)) { matches.push({ root: project.root, length: clean.length, exact: normalize(clean) === normalized }); }
        }
      }
      const exact = matches.filter(item => item.exact);
      const ranked = (exact.length ? exact : matches).sort((a, b) => b.length - a.length);
      const best = ranked[0];
      if (!best || new Set(ranked.filter(item => item.length === best.length).map(item => item.root)).size !== 1) { ambiguous = true; break; }
      if (!roots.includes(best.root)) { roots.push(best.root); }
      rest = rest.slice(best.length).replace(/^\s+(?:repo(?:sitory)?|project)\b/i, '').trim();
      const connector = /^(?:,\s*(?:and\s+)?|and\s+|&\s*)/i.exec(rest);
      if (!connector) { break; }
      rest = rest.slice(connector[0].length).trim();
    }
    if (!ambiguous && roots.length) { latest = roots; }
  }
  return latest;
}

interface Cursor { offset: number; size: number; modified: number; catalog: string; latest?: ScopeReport }
const maxRead = 1024 * 1024;

export class DiscussionReader {
  private cursors = new Map<string, Cursor>();

  async read(filename: string, id: string, projects: ProjectName[]): Promise<ScopeReport | undefined> {
    const file = await open(filename, 'r');
    try {
      const stat = await file.stat();
      const catalog = JSON.stringify(projects);
      let cursor = this.cursors.get(id);
      if (cursor && cursor.catalog === catalog && stat.size === cursor.size && stat.mtimeMs === cursor.modified) { return cursor.latest; }
      if (!cursor || cursor.catalog !== catalog || stat.size < cursor.size || stat.size === cursor.size) {
        cursor = { offset: 0, size: 0, modified: 0, catalog };
      }
      const start = Math.max(cursor.offset, stat.size - maxRead);
      const buffer = Buffer.alloc(Math.min(maxRead, stat.size - start));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, start);
      const bytes = buffer.subarray(0, bytesRead);
      const lastNewline = bytes.lastIndexOf(10);
      let complete = lastNewline < 0 ? '' : bytes.subarray(0, lastNewline).toString('utf8');
      if (start > cursor.offset) { complete = complete.slice(complete.indexOf('\n') + 1); }
      for (const line of complete.split('\n')) {
        if (line.length > 262144) { continue; }
        let record;
        try { record = JSON.parse(line); } catch { continue; }
        const payload = record.payload;
        if (record.type !== 'response_item' || payload?.type !== 'message' || payload.role !== 'user' || !Array.isArray(payload.content)) { continue; }
        const timestamp = Date.parse(record.timestamp);
        if (!Number.isFinite(timestamp) || timestamp > Date.now() + 300000 || timestamp < (cursor.latest?.reportedAt ?? 0)) { continue; }
        for (const item of payload.content) {
          if (item?.type !== 'input_text' || typeof item.text !== 'string') { continue; }
          const roots = detectDiscussion(item.text, projects);
          if (roots) { cursor.latest = { version: 1, threadId: id, roots, reportedAt: timestamp }; }
        }
      }
      cursor.offset = lastNewline >= 0 ? start + lastNewline + 1 : start;
      cursor.size = stat.size;
      cursor.modified = stat.mtimeMs;
      this.cursors.delete(id);
      this.cursors.set(id, cursor);
      if (this.cursors.size > 64) { this.cursors.delete(this.cursors.keys().next().value!); }
      return cursor.latest;
    } finally { await file.close(); }
  }
}

export function projectNames(roots: string[], folders: { fsPath: string; name: string }[]): ProjectName[] {
  return roots.slice(0, 500).map(root => ({ root, names: [...new Set([path.basename(root), ...folders.filter(folder => path.resolve(folder.fsPath).toLowerCase() === path.resolve(root).toLowerCase()).map(folder => folder.name)])] }));
}
