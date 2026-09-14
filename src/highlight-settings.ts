import type * as vscode from 'vscode';

type Mode = 'off' | 'recent' | 'last';
const oldKeys = ['highlightRecentlyViewedChats', 'highlightOnlyLastViewedChat'] as const;
const fields = ['globalValue', 'workspaceValue', 'workspaceFolderValue'] as const;

export function highlightMode(config: Pick<vscode.WorkspaceConfiguration, 'inspect'>): Mode {
  const selected = config.inspect<string>('highlightMode');
  const previous = oldKeys.map(key => config.inspect<boolean>(key));
  let enabled = true, last = false, mode: Mode = 'recent';
  for (const field of fields) {
    enabled = previous[0]?.[field] ?? enabled;
    last = previous[1]?.[field] ?? last;
    // Keep unmigrated higher-scope choices if a settings write failed partway.
    if (previous.some(value => typeof value?.[field] === 'boolean')) mode = !enabled ? 'off' : last ? 'last' : 'recent';
    const explicit = selected?.[field];
    if (explicit === 'off' || explicit === 'recent' || explicit === 'last') mode = explicit;
  }
  return mode;
}

export async function migrateHighlightSettings(workspace: Pick<typeof vscode.workspace, 'getConfiguration' | 'workspaceFolders'>): Promise<void> {
  const base = workspace.getConfiguration('codexNavigator');
  const scopes = [base, base, ...(workspace.workspaceFolders ?? []).map(folder => workspace.getConfiguration('codexNavigator', folder.uri))];
  // Snapshot all scopes before removing old keys so inherited choices survive.
  const plans = scopes.map((config, index) => {
    const level = Math.min(index, 2), field = fields[level];
    const previous = oldKeys.map(key => config.inspect<boolean>(key));
    const hasOld = previous.some(value => typeof value?.[field] === 'boolean');
    let enabled = true, last = false;
    for (const current of fields.slice(0, level + 1)) {
      enabled = previous[0]?.[current] ?? enabled;
      last = previous[1]?.[current] ?? last;
    }
    return { config, target: level + 1, hasOld, existing: config.inspect<string>('highlightMode')?.[field],
      mode: !enabled ? 'off' : last ? 'last' : 'recent' };
  });
  for (const plan of plans) {
    if (!plan.hasOld) continue;
    if (plan.existing === undefined) await plan.config.update('highlightMode', plan.mode, plan.target);
  }
  // Finish all replacements before removing anything, retaining inherited choices
  // if a later workspace or folder write fails.
  for (const plan of plans) {
    if (!plan.hasOld) continue;
    for (const key of oldKeys) await plan.config.update(key, undefined, plan.target);
  }
}
