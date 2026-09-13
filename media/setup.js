'use strict';
const api = acquireVsCodeApi();
const el = id => document.getElementById(id);
let state, busy = false;
function scopeText() {
  const custom = el('scope-mode').value === 'custom';
  el('custom-scopes').hidden = !custom;
  el('scope-title').textContent = custom ? 'Use custom project folders' : 'Automatically follow this workspace';
  el('scope-detail').textContent = custom
    ? 'Only the custom folders below and projects inside them use these routing rules. The workspace preview is shown for reference.'
    : 'Uses the folders in this VS Code workspace and their project instructions. This updates as you add or remove workspace folders.';
}
function list(repositories) {
  el('repo-count').textContent = `Repositories currently found (${repositories.length})`;
  el('repositories').replaceChildren();
  for (const repo of repositories) {
    const item = document.createElement('li'); item.textContent = repo.name; item.title = repo.path;
    el('repositories').append(item);
  }
  if (!repositories.length) {
    const item = document.createElement('li'); item.textContent = 'No Git repositories found yet. Workspace folders still use their project instructions.';
    el('repositories').append(item);
  }
}
function controls() {
  document.querySelectorAll('button, input, textarea, select').forEach(node => { node.disabled = busy; });
  el('install-hooks').disabled = busy || !state?.activity?.nodeAvailable;
  el('repair-hooks').disabled = busy || !state?.activity?.nodeAvailable;
  el('enable-labels').disabled = busy || !state || !!state.labels?.error;
  el('disable-labels').disabled = busy || !state || !!state.labels?.error;
  el('review-hooks').disabled = busy || !state?.activity?.installed;
  el('save-routing').disabled = busy || !state || !!state.routingError;
  document.body.setAttribute('aria-busy', String(busy));
}
function showLabels(labels) {
  labels ||= {};
  el('labels-status').textContent = labels.error ? 'Needs attention' : !labels.enabled ? 'Off' : labels.installed ? 'Enabled' : 'Needs setup';
  el('labels-detail').textContent = labels.error || (labels.enabled ? 'Start a new chat to load the reporting guidance.' : 'Optional. Custom labels are always available.');
  el('labels-file').textContent = labels.instructions || '';
  el('enable-labels').textContent = labels.enabled ? 'Repair Automatic Labels' : 'Enable Automatic Labels';
  el('enable-labels').hidden = !!(labels.enabled && labels.installed);
  el('disable-labels').hidden = !labels.enabled;
}
function showActivity(activity) {
  if (!activity) return;
  const installed = activity.installed && activity.enabled;
  const ready = installed && activity.trusted === true && !!activity.observed;
  el('install-hooks').hidden = !!installed;
  el('review-hooks').hidden = !installed || activity.trusted === true;
  el('reload-hooks').hidden = !installed || ready;
  el('verify-hooks').hidden = !installed;
  el('activity-next').textContent = !activity.nodeAvailable ? 'Install Node.js and restart VS Code to enable activity indicators.' : ready ? 'Activity is connected.' : !installed
    ? 'Install hooks, then review them in Codex.' : activity.trusted !== true
      ? 'Open Hook Review, type /hooks, and trust all Navigator hooks. Then reload and send a chat message.'
      : 'Reload this window and send a normal chat message to verify activity.';
  el('activity-status').textContent = activity.label;
  el('activity-detail').textContent = activity.detail;
  el('activity-checked').textContent = 'Last checked: ' + new Date(activity.checkedAt).toLocaleTimeString();
  el('install-detail').textContent = !activity.nodeAvailable ? 'Install Node.js and restart VS Code so Codex can run the collector.' : activity.installed && activity.enabled ? 'Navigator hooks and collector are installed.' : 'Install four small hooks for activity updates.';
  el('install-hooks').textContent = activity.installed && activity.enabled ? 'Reinstall Hooks' : 'Install Hooks';
  el('trust-detail').textContent = activity.trusted === true ? 'Codex reports all four hooks trusted and enabled for this workspace.' : activity.trusted === false ? 'One or more hooks need review or are disabled. Open /hooks in Codex.' : 'Trust has not been verified. Open /hooks in Codex and check the entries.';
  el('event-detail').textContent = activity.observed ? 'A real hook event was received at ' + new Date(activity.observed).toLocaleString() + '. This verifies event delivery, not the outcome of a task.' : activity.nextStep;
  el('hook-home').textContent = 'Codex home: ' + activity.home;
}
function notice(text, error = false) {
  el('message').textContent = text; el('message').classList.toggle('error', error);
}
function lines(id) { return el(id).value.split(/\r?\n/).map(value => value.trim()).filter(Boolean); }
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
  const type = button.dataset.action;
  if (busy) return;
  const message = { type, revision: state?.revision };
  if (type === 'saveRouting') message.choices = { main: el('main').value.trim(), scopes: el('scope-mode').value === 'workspace' ? [] : lines('scopes'), fallbackNames: lines('fallback') };
  if (type === 'saveRouting' && el('scope-mode').value === 'custom' && !message.choices.scopes.length) {
    notice('Add a custom folder, or choose to follow this workspace.', true); el('scopes').focus(); return;
  }
  if (type !== 'done') { busy = true; controls(); notice(type.startsWith('browse') ? 'Choose a file or folder in the picker.' : 'Working...'); }
  api.postMessage(message);
}));
el('clear-main').addEventListener('click', () => { el('main').value = ''; el('main').focus(); });
el('scope-mode').addEventListener('change', scopeText);
window.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'state') {
    state = message;
    if (message.replaceChoices) {
      el('main').value = message.choices.main;
      el('scopes').value = message.choices.scopes.join('\n');
      el('scope-mode').value = message.choices.scopes.length ? 'custom' : 'workspace';
      el('fallback').value = message.choices.fallbackNames.join('\n');
      el('advanced').open = !!(message.choices.scopes.length || message.choices.fallbackNames.length);
      el('stale').hidden = true;
    }
    showLabels(message.labels);
    el('global-file').textContent = message.globalFile;
    showActivity(message.activity);
    el('routing-status').textContent = message.routing.label;
    el('routing-detail').textContent = message.routing.detail;
    el('save-routing').textContent = message.choices.enabled ? 'Save Project Instructions' : 'Enable Project Instructions';
    el('disable-routing').hidden = !message.choices.enabled;
    list(message.repositories); scopeText(); controls(); notice(message.routingError || '', !!message.routingError);
  } else if (message.type === 'labels') {
    if (state) state.labels = message.labels;
    showLabels(message.labels); controls();
  } else if (message.type === 'activity') {
    if (state) { state.activity = message.activity; }
    showActivity(message.activity); controls();
  } else if (message.type === 'repositories') { list(message.repositories); }
  else if (message.type === 'stale') { el('stale').hidden = false; }
  else if (message.type === 'main') { el('main').value = message.path; }
  else if (message.type === 'scope') { el('scopes').value = [...new Set([...lines('scopes'), message.path])].join('\n'); scopeText(); }
  else if (message.type === 'error' || message.type === 'notice') { notice(message.text, message.type === 'error'); }
  else if (message.type === 'busy') {
    busy = message.busy; controls();
    if (!busy && ['Choose a file or folder in the picker.', 'Working...'].includes(el('message').textContent)) notice('');
  }
});
api.postMessage({ type: 'ready' });
