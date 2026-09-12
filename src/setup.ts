import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { prepareAgentHelper } from './agent-helper';
import { openSetupPage } from './setup-page';

// Keep the original key so upgrades preserve dismissals and the two-invitation budget.
const invitationKey = 'routingInvitation.v1';
interface Invitation { shown: number; handled: boolean }
let invitationRunning = false;

export async function offerRoutingSetup(context: vscode.ExtensionContext): Promise<void> {
  if (invitationRunning || vscode.env.remoteName || !vscode.workspace.isTrusted
    || !vscode.workspace.workspaceFolders?.length || !vscode.window.state.focused) { return; }
  invitationRunning = true;
  try {
    const state = context.globalState.get<Invitation>(invitationKey, { shown: 0, handled: false });
    if (state.handled || state.shown >= 2) { return; }
    const config = vscode.workspace.getConfiguration('codexRepoCompanion');
    const enabled = config.inspect<boolean>('instructionRouting');
    const explicit = enabled?.workspaceValue ?? enabled?.globalValue;
    // Respect an existing off choice and avoid onboarding users who already set it up.
    if (explicit === false) { return; }
    if (config.get('instructionRouting', false)) {
      try {
        const plan = prepareAgentHelper();
        if (plan.before.includes('<!-- codex-repo-companion:start -->') && existsSync(plan.helper)
          && existsSync(path.join(plan.destination, 'routing.js'))) { return; }
      } catch { /* The setup page explains instruction-file problems without blocking chat setup. */ }
    }
    const shown = state.shown + 1;
    await context.globalState.update(invitationKey, { shown, handled: shown >= 2 });
    const choice = await vscode.window.showInformationMessage(
      'Set up Codex Repo Companion?', 'Set Up', shown === 1 ? 'Not Now' : "Don't Ask Again");
    if (choice === 'Set Up') {
      await context.globalState.update(invitationKey, { shown, handled: true });
      await vscode.commands.executeCommand('codexRepoCompanion.setUp');
    }
  } finally { invitationRunning = false; }
}


export async function setUpCompanion(context: vscode.ExtensionContext): Promise<void> {
  if (vscode.env.remoteName || !vscode.workspace.isTrusted || !vscode.workspace.workspaceFolders?.length) {
    throw new Error('Open a trusted local project folder to set up Repo Companion.');
  }
  await context.globalState.update(invitationKey, { shown: 2, handled: true });
  await openSetupPage(context);
}

export const setUpAgentHelper = setUpCompanion;
