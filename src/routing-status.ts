import { readFileSync, accessSync, statSync, constants } from 'node:fs';
import * as path from 'node:path';
import { Script } from 'node:vm';
import { prepareAgentHelper } from './agent-helper';
import { readProfiles, selectProfile, containsPath } from './routing-config';
import { sameRoot } from './model';

// These are file/configuration checks, independent of chat display and activity hooks.
export async function routingStatus(plan: ReturnType<typeof prepareAgentHelper> | undefined,
  choices: { enabled: boolean; main: string; scopes: string[]; fallbackNames: string[] },
  workspace: string, scopes: string[], targets: string[]) {
  const independent = 'Project instruction routing does not require the chat integration.';
  if (!choices.enabled) { return { label: 'Off', detail: 'Turn on project instructions to use routing. ' + independent }; }
  if (!plan || !plan.before.includes('<!-- codex-navigator:start -->')) {
    return { label: 'Needs setup', detail: 'Save project instructions to install routing. ' + independent };
  }
  try {
    for (const source of plan.sources) {
      const text = readFileSync(path.join(plan.destination, source.name), 'utf8');
      if (!text.trim()) { throw new Error('A routing helper file is empty.'); }
      if (source.name.endsWith('.js')) { new Script(text, { filename: source.name }); }
    }
    const sharedFiles = new Set([choices.main]);
    const saved = await readProfiles(plan.home);
    const own = saved.find(profile => sameRoot(profile.workspace, workspace));
    if (!own || !own.enabled || !sameRoot(own.main, choices.main)
      || JSON.stringify(own.scopes) !== JSON.stringify(scopes)
      || JSON.stringify(own.fallbackNames) !== JSON.stringify(choices.fallbackNames)) {
      throw new Error('Saved routing settings need to be refreshed.');
    }
    for (const target of targets.length ? targets : scopes) {
      // Custom scope choices can intentionally exclude repositories in this window.
      if (own.scopes.some(scope => containsPath(scope, target))) {
        const selected = selectProfile(target, saved);
        if (!selected?.enabled) { throw new Error('Routing is off for one of the selected projects.'); }
        sharedFiles.add(selected.main);
      }
    }
    for (const file of sharedFiles) {
      if (!file) { continue; }
      accessSync(file, constants.R_OK);
      const info = statSync(file);
      if (!info.isFile() || !info.size) { throw new Error('The shared instructions file is empty or unavailable: ' + file); }
    }
    return { label: 'Ready', detail: 'Routing files and saved settings are ready. ' + independent };
  } catch (error) {
    return { label: 'Needs attention', detail: 'Check your shared file and save project instructions, then refresh. ' + (error instanceof Error ? error.message : String(error)) };
  }
}
