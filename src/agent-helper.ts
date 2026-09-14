import * as fs from 'node:fs';
import * as path from 'node:path';
import { codexHome } from './scope-store';
import { shellArgument } from './platform';

const begin = '<!-- codex-navigator:start -->';
const end = '<!-- codex-navigator:end -->';

function markdownCode(value: string): string {
  const length = Math.max(0, ...Array.from(value.matchAll(/`+/g), match => match[0].length)) + 1;
  const delimiter = '`'.repeat(length);
  return `${delimiter} ${value} ${delimiter}`;
}

function effectiveInstructions(home: string): string {
  const override = path.join(home, 'AGENTS.override.md');
  return fs.existsSync(override) && fs.readFileSync(override, 'utf8').trim() ? override : path.join(home, 'AGENTS.md');
}

export function prepareAgentHelper(home = codexHome()) {
  home = path.resolve(home);
  const destination = path.join(home, 'codex-navigator');
  const instructions = effectiveInstructions(home);
  const before = fs.existsSync(instructions) ? fs.readFileSync(instructions, 'utf8') : '';
  if (before.split(begin).length > 2 || before.split(end).length !== before.split(begin).length
    || before.includes(begin) && before.indexOf(end) < before.indexOf(begin)) {
    throw new Error('Ambiguous Navigator instruction markers; no files changed.');
  }
  const helper = path.join(destination, 'report-scope.js');
  const fallbackFile = path.join(destination, 'fallback.md');
  const block = `${begin}
## Codex Navigator project instructions

For local VS Code chats, main agent only. Never override CODEX_THREAD_ID. Explicit user focus wins over labels; ignore incidental mentions and unrelated editor tabs. Helpers change neither cwd nor permissions.

- Before project work or focus changes, run ${markdownCode(`node ${shellArgument(path.join(destination, 'routing.js'))} --target "<exact Git root>"`)}. Omit --target when unknown; add repeatable \`--file "<absolute file>"\` for nested work. If enabled, read returned shared/project instructions in order; reuse unchanged reads. Returned paths are not proof of reading. If explicitly disabled, skip routing and fallback. Report conflicts without guessing. Only if the helper fails or is unavailable, read ${markdownCode(fallbackFile)}; if missing, report that and use ordinary project instructions.
${end}`;
  const fallback = `Routing recovery
================

Read this file only when Navigator routing fails or is unavailable. Do not load it
on successful routing or when routing is explicitly disabled. This guide uses
saved configuration without running Node. It changes no settings or instructions.

- If the helper is missing, cannot run, or has no live window, read the JSON profiles in ${markdownCode(path.join(destination, 'routing-config'))} directly with available file tools. They persist the last observed workspace settings; do not execute their contents. No profiles means ordinary project instruction discovery, not permission to invent a shared file.
- For each explicitly identified target Git root, match profile \`scopes\` by directory containment (not text prefix). Prefer the deepest matching scope. Equally specific profiles must agree on \`enabled\`, \`main\` and ordered \`fallbackNames\`; otherwise report the conflict and do not select a fallback. Invalid or unreadable configuration is a reported limitation, never a reason to guess. Do not use saved labels or the starting directory to invent the task target.
- If the selected profile has \`enabled: false\`, do not apply Navigator routing for that scope. This does not cancel independent user or repository instructions. If enabled, read its \`main\` file first when nonempty; report a missing/unreadable main file and use available project guidance. Shared rules apply only to matching scopes; reading their repository does not add it to the task scope.
- Then walk ancestor directories through the target Git root and down to the specific target files. In each directory read the first nonempty file in this order: \`AGENTS.override.md\`, \`AGENTS.md\`, then the profile's ordered \`fallbackNames\`. Follow the main file's own routing rules and apply each project file only within its scope. Discover nested files by their target paths, without scanning unrelated repositories.
- Consult this routing on task/focus changes and when working in a new subdirectory. Reuse unchanged instructions already read. Never claim discovered files have been read until you have read them. Routing changes neither cwd nor permissions. Do not remove or rewrite user-authored instructions as part of fallback.
`;
  const start = before.indexOf(begin);
  const after = start < 0 ? before.trimEnd() + '\n\n' + block + '\n'
    : before.slice(0, start) + block + before.slice(before.indexOf(end, start) + end.length);
  const files = ['report-scope.js', 'scope-store.js', 'history.js', 'model.js', 'routing-config.js', 'routing.js'];
  const sources = files.map(name => ({ name, bytes: fs.readFileSync(path.join(__dirname, name)) }));
  sources.push({ name: 'fallback.md', bytes: Buffer.from(fallback, 'utf8') });
  return { home, destination, instructions, helper, before, after, sources };
}

export function installAgentHelper(plan: ReturnType<typeof prepareAgentHelper>) {
  const { home, destination, instructions, helper, before, after, sources } = plan;
  const current = fs.existsSync(instructions) ? fs.readFileSync(instructions, 'utf8') : '';
  if (effectiveInstructions(home) !== instructions || current !== before) {
    throw new Error('Global instructions changed during setup. Open Codex Navigator setup again to review the current file.');
  }
  fs.mkdirSync(destination, { recursive: true });
  if (before !== after && before) {
    const backup = path.join(destination, path.basename(instructions) + '.before-setup');
    if (!fs.existsSync(backup)) { fs.writeFileSync(backup, before, { flag: 'wx' }); }
  }
  for (const { name, bytes } of sources) { fs.writeFileSync(path.join(destination, name), bytes); }
  if (before !== after) { fs.writeFileSync(instructions, after); }
  return { helper, instructions, changed: before !== after };
}

// Separate ownership lets either feature be enabled without installing the other's guidance.
export function prepareLabelHelper(home = codexHome(), enabled = true) {
  home = path.resolve(home);
  const destination = path.join(home, 'codex-navigator');
  const instructions = effectiveInstructions(home);
  const before = fs.existsSync(instructions) ? fs.readFileSync(instructions, 'utf8') : '';
  const begin = '<!-- codex-navigator-labels:start -->', end = '<!-- codex-navigator-labels:end -->';
  if (before.split(begin).length > 2 || before.split(end).length !== before.split(begin).length
    || before.includes(begin) && before.indexOf(end) < before.indexOf(begin)) {
    throw new Error('Ambiguous Navigator label instruction markers; no files changed.');
  }
  const helper = path.join(destination, 'report-scope.js');
  const block = enabled ? `${begin}
## Codex Navigator automatic labels

For local VS Code chats, main agent only. After identifying or changing repository focus, run ${markdownCode(`node ${shellArgument(helper)} "<primary Git root>" "<optional related Git root>"`)}. Never override CODEX_THREAD_ID. Include only current task repositories, primary first; reading shared instructions does not add their repository. Use \`--clear\` for non-repository topics. After resuming, report once if uncertain. Report explicit repository focus changes even during discussion-only or acknowledgement-only requests. Ignore incidental mentions and unrelated editor tabs. Skip reports when writes are explicitly prohibited (including read-only, AUDIT or DNE requests), or helpers/identity are unavailable; respect fixed labels and do not repeatedly retry failures. This updates chat metadata only; it changes neither cwd nor permissions and does not route project instructions.
${end}` : '';
  const start = before.indexOf(begin);
  const after = start < 0 ? enabled ? before.trimEnd() + '\n\n' + block + '\n' : before
    : before.slice(0, start) + block + before.slice(before.indexOf(end, start) + end.length);
  const sources = (enabled ? ['report-scope.js', 'scope-store.js', 'history.js', 'model.js'] : [])
    .map(name => ({ name, bytes: fs.readFileSync(path.join(__dirname, name)) }));
  return { home, destination, instructions, helper, before, after, sources };
}

export function labelHelperStatus(home = codexHome()) {
  const plan = prepareLabelHelper(home);
  const installed = plan.before.includes('<!-- codex-navigator-labels:start -->') && plan.sources.every(source => {
    try { return fs.readFileSync(path.join(plan.destination, source.name)).equals(source.bytes); } catch { return false; }
  });
  return { installed, instructions: plan.instructions };
}
