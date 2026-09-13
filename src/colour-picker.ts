import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import { normaliseColour } from './colours';

export interface ColourOptions {
  title: string; initial?: string; inherited?: string; resetLabel: string;
  recent: string[]; repositories: string[]; allowNone?: boolean; initialNone?: boolean;
}
export interface ColourHost { pickColour(options: ColourOptions): Promise<string | null | undefined> }

export function chooseColour(context: vscode.ExtensionContext, title: string, initial: string | undefined,
  inherited: string | undefined, resetLabel: string, host?: ColourHost, options?: Pick<ColourOptions, 'allowNone' | 'initialNone' | 'repositories'>): Promise<string | null | undefined> {
  if (host) {
    const recent = context.globalState.get<string[]>('recentColours.v1', []).filter(value => normaliseColour(value)).slice(0, 16);
    const repositories = Object.values(vscode.workspace.getConfiguration('codexNavigator').get<Record<string, string>>('repositoryColours', {}))
      .filter(value => normaliseColour(value));
    return host.pickColour({ title, initial, inherited, resetLabel, recent, repositories, ...options }).then(async colour => {
      if (normaliseColour(colour)) await context.globalState.update('recentColours.v1', [colour, ...recent.filter(value => value !== colour)].slice(0, 16));
      return colour;
    });
  }
  const media = vscode.Uri.joinPath(context.extensionUri, 'media');
  const panel = vscode.window.createWebviewPanel('codexNavigator.colour', 'Choose Colour', vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [media] });
  const asset = (name: string) => panel.webview.asWebviewUri(vscode.Uri.joinPath(media, name)).toString();
  panel.webview.html = readFileSync(path.join(context.extensionPath, 'media', 'colour.html'), 'utf8')
    .replaceAll('{{csp}}', panel.webview.cspSource).replaceAll('{{nonce}}', randomBytes(24).toString('hex'))
    .replace('{{style}}', asset('setup.css')).replace('{{script}}', asset('colour.js'));
  return new Promise(resolve => {
    let finished = false;
    const receive = panel.webview.onDidReceiveMessage(message => {
      if (finished || !message || typeof message !== 'object') { return; }
      if (message.type === 'ready') {
        void panel.webview.postMessage({ title, initial: normaliseColour(initial) ?? null,
          inherited: normaliseColour(inherited) ?? null, resetLabel });
      } else if (message.type === 'cancel') { panel.dispose(); }
      else if (message.type === 'apply' && (message.colour === null || normaliseColour(message.colour))) {
        finished = true;
        resolve(message.colour === null ? null : normaliseColour(message.colour));
        panel.dispose();
      }
    });
    panel.onDidDispose(() => { receive.dispose(); if (!finished) { finished = true; resolve(undefined); } });
    context.subscriptions.push(panel);
  });
}
