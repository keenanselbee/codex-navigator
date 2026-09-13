import * as vscode from 'vscode';
import { openSetupPage } from './setup-page';

export async function setUpNavigator(context: vscode.ExtensionContext, canUse?: () => Promise<boolean>): Promise<void> {
  if (vscode.env.remoteName || !vscode.workspace.isTrusted || !vscode.workspace.workspaceFolders?.length) {
    throw new Error('Open a trusted local project folder to set up Codex Navigator.');
  }
  await context.globalState.update('navigatorWelcome.v1', true);
  await openSetupPage(context, canUse);
}

export const setUpAgentHelper = setUpNavigator;
