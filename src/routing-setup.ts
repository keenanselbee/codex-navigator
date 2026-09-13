import * as vscode from 'vscode';
import { existsSync, realpathSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { prepareAgentHelper, installAgentHelper } from './agent-helper';
import { sameRoot } from './model';
import { absolutePath, validateFallbackNames } from './routing-config';

export function routingChoices() {
  const config = vscode.workspace.getConfiguration('codexNavigator');
  return { main: config.get('mainInstructionsFile', ''), scopes: config.get<string[]>('instructionScope', []),
    fallbackNames: config.get<string[]>('instructionFallbackNames', []), enabled: config.get('instructionRouting', false) };
}

export async function saveRoutingChoices(input: unknown, previous: ReturnType<typeof routingChoices>, plan: ReturnType<typeof prepareAgentHelper>): Promise<void> {
  if (vscode.env.remoteName || !vscode.workspace.isTrusted || !vscode.workspace.workspaceFolders?.length) {
    throw new Error('Open a trusted local workspace before enabling project instructions.');
  }
  const value = input as ReturnType<typeof routingChoices>;
  if (!value || !(value.main === '' || absolutePath(value.main)) || !Array.isArray(value.scopes)
    || value.scopes.length > 64 || !value.scopes.every(absolutePath)) { throw new Error('Choose a valid rules file and project folders.'); }
  validateFallbackNames(value.fallbackNames);
  if (value.main) {
    if (!existsSync(value.main) || !statSync(value.main).isFile() || !statSync(value.main).size) {
      throw new Error('Choose an existing rules file that is not empty.');
    }
    const globalPath = existsSync(plan.instructions) ? realpathSync(plan.instructions) : path.resolve(plan.instructions);
    if (sameRoot(realpathSync(value.main), globalPath)) { throw new Error('Choose a separate shared rules file. Codex already reads your global instructions.'); }
  }
  if (!value.scopes.every(scope => existsSync(scope) && statSync(scope).isDirectory())) { throw new Error('Choose existing project folders.'); }
  if (JSON.stringify(routingChoices()) !== JSON.stringify(previous)) { throw new Error('Settings changed elsewhere. Refresh this page before saving.'); }
  installAgentHelper(plan);
  const config = vscode.workspace.getConfiguration('codexNavigator');
  await config.update('mainInstructionsFile', value.main, vscode.ConfigurationTarget.Workspace);
  await config.update('instructionScope', value.scopes, vscode.ConfigurationTarget.Workspace);
  await config.update('instructionFallbackNames', value.fallbackNames, vscode.ConfigurationTarget.Workspace);
  await config.update('instructionRouting', true, vscode.ConfigurationTarget.Workspace);
}
