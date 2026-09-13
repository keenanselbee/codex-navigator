import * as vscode from 'vscode';
import * as path from 'node:path';
import { open, readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { ChatGoals } from './chat-goals';

export const hookEvents = ['UserPromptSubmit', 'Stop', 'Interrupt', 'SessionEnd'];
const samePath = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
export function activityCommand(home: string) { return `node "${path.join(home, 'codex-navigator', 'chat-activity.cjs')}" --home "${home}"`; }

export function parseHookTrust(value: any, home: string, cwds: string[]) {
  if (!Array.isArray(value?.data) || !value.data.length || value.data.length > 100) return undefined;
  const expected = hookEvents.map(event => event[0].toLowerCase() + event.slice(1));
  const perWorkspace = [];
  for (const cwd of cwds) {
    const entry = value.data.find((item: any) => typeof item?.cwd === 'string' && samePath(item.cwd, cwd));
    if (!entry || !Array.isArray(entry.hooks) || !Array.isArray(entry.errors) || entry.errors.length || !Array.isArray(entry.warnings) || entry.warnings.length) return undefined;
    perWorkspace.push(expected.every(event => entry.hooks.some((hook: any) => hook?.eventName === event
      && hook.handlerType === 'command' && hook.command === activityCommand(home)
      && typeof hook.sourcePath === 'string' && samePath(hook.sourcePath, path.join(home, 'hooks.json'))
      && hook.enabled === true && ['trusted', 'managed'].includes(hook.trustStatus))));
  }
  return perWorkspace.length ? perWorkspace.every(Boolean) : undefined;
}

export async function lastHookEvent(home: string, since: number): Promise<string | undefined> {
  try {
    const file = await open(path.join(home, 'codex-navigator', 'activity-diagnostics.jsonl'), 'r');
    try {
      const size = (await file.stat()).size, start = Math.max(0, size - 65536), buffer = Buffer.alloc(size - start);
      await file.read(buffer, 0, buffer.length, start);
      let text = buffer.toString('utf8'); if (start) text = text.slice(text.indexOf('\n') + 1);
      for (const line of text.split('\n').reverse()) {
        try { const record = JSON.parse(line), time = Date.parse(record.time);
          if (record.outcome === 'recorded' && hookEvents.includes(record.event) && Number.isFinite(time) && time >= since && time <= Date.now() + 5000) return record.time;
        } catch { /* Ignore partial diagnostics. */ }
      }
    } finally { await file.close(); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

export async function hookSetupStatus(context: vscode.ExtensionContext, home: string) {
  const enabled = context.globalState.get('activityHooks.enabled', false);
  const cwds = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath).slice(0, 100);
  const installedAt = context.globalState.get<number>('activityHooks.installedAt', 0);
  let since = Number.isFinite(installedAt) && installedAt > 0 ? installedAt : 0;
  let installed = false, detail = '';
  try {
    const raw = await readFile(path.join(home, 'hooks.json'), 'utf8');
    if (raw.length > 1024 * 1024) throw new Error('hooks.json is too large to inspect.');
    const config = JSON.parse(raw);
    const command = activityCommand(home);
    installed = hookEvents.every(event => Array.isArray(config?.hooks?.[event]) && config.hooks[event].some((group: any) =>
      !group.matcher && Array.isArray(group.hooks) && group.hooks.some((hook: any) => hook?.type === 'command' && hook.command === command && hook.timeout === 1 && !hook.async)));
    if (installed) {
      const helper = path.join(home, 'codex-navigator', 'chat-activity.cjs');
      installed = (await readFile(helper)).equals(await readFile(path.join(context.extensionPath, 'tools', 'chat-activity.cjs')));
      // A lost memento must not move the event cutoff forward on every check.
      if (!since) since = Math.max((await stat(helper)).mtimeMs, (await stat(path.join(home, 'hooks.json'))).mtimeMs);
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') detail = error instanceof Error ? error.message : String(error); }
  const nodeAvailable = await new Promise<boolean>(resolve => execFile('node', ['--version'], { windowsHide: true, timeout: 3000 }, error => resolve(!error)));
  let trusted: boolean | undefined;
  const codex = vscode.extensions.getExtension('openai.chatgpt');
  if (installed && codex && cwds.length) {
    const reader = new ChatGoals(path.join(codex.extensionPath, 'bin', 'windows-x86_64', 'codex.exe'), home, () => {});
    try { trusted = parseHookTrust(await reader.readHooks(cwds), home, cwds); } finally { reader.dispose(); }
  }
  const observed = installed && enabled ? await lastHookEvent(home, since) : undefined;
  const nextStep = !nodeAvailable ? 'Install Node.js and restart VS Code.' : detail ? 'Resolve the setup problem shown above, then check again.'
    : !installed || !enabled ? 'Install Navigator hooks first.'
    : trusted === false ? 'Open Hook Review, type /hooks, and trust all Navigator hooks.'
    : trusted === undefined ? 'Trust could not be verified. Open Hook Review and check Navigator hooks in /hooks.'
    : observed ? 'Hook delivery is verified. No further setup is needed.'
    : 'All Navigator hooks are trusted, but no recorded hook event was found since installation. Reload Window, send a new message in Codex, then check again.';
  return { enabled, installed, nodeAvailable, trusted, observed, home, detail, nextStep, checkedAt: Date.now(),
    label: !nodeAvailable ? 'Node.js needed' : detail ? 'Needs attention' : !installed || !enabled ? 'Not installed' : trusted === false ? 'Review needed' : trusted === undefined ? 'Trust not verified' : observed ? 'Event received' : 'Waiting for a chat turn' };
}

export function openHookReview(home: string): void {
  const codex = vscode.extensions.getExtension('openai.chatgpt');
  if (!codex) throw new Error('Install and enable the Codex extension first.');
  const terminal = vscode.window.createTerminal({ name: 'Codex hook review', shellPath: path.join(codex.extensionPath, 'bin', 'windows-x86_64', 'codex.exe'),
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, env: { CODEX_HOME: home } });
  terminal.show();
}
