'use strict';

// Loaded only by the explicitly patched Codex extension. No thread/history writes.
const panels = new Map();
const surfaces = new Map();
let assignments = Object.create(null);
let repositories = [];
let tooltips = Object.create(null);
let customLabels = Object.create(null);
let starred = [];
let pinManualLabels = true;
let installed = false;
let activeId = null;
let revision = 0;
let nextId = 1;
let subscribed = false;
let followingId = null;

function snapshot() {
  return { protocol: 2, revision, activeId, surfaces: [...surfaces.values()].map(surface => ({
    id: surface.id, kind: surface.kind, key: surface.key, uri: surface.uri,
    visible: surface.container?.visible !== false, routeKnown: surface.routeKnown,
  })) };
}

function changed() {
  revision++;
  if (subscribed) {
    // Notification failure must never interfere with Codex's own message handler.
    Promise.resolve(require('vscode').commands.executeCommand('codexRepoCompanion.surfaceChanged', snapshot())).catch(() => {});
  }
}

function setActive(surface) {
  const id = surface?.id ?? null;
  if (followingId !== id) { followingId = null; }
  if (activeId !== id) { activeId = id; changed(); }
}

function ensureSurface(webview, kind) {
  let surface = surfaces.get(webview);
  if (!surface) {
    surface = { id: String(nextId++), kind, key: null, uri: null, routeKnown: false, container: null, watching: false };
    surfaces.set(webview, surface);
  }
  return surface;
}

function observeSurface(webview, kind, onDispose, container) {
  const surface = ensureSurface(webview, kind);
  surface.container = container;
  if (surface.watching) { return; }
  surface.watching = true;
  const subscriptions = [];
  if (container?.onDidChangeVisibility) {
    subscriptions.push(container.onDidChangeVisibility(() => {
      if (container.visible === false && activeId === surface.id && followingId !== surface.id) { setActive(null); }
    }));
  }
  subscriptions.push(onDispose(() => {
    surfaces.delete(webview);
    if (activeId === surface.id) { activeId = null; }
    subscriptions.forEach(item => item.dispose());
    changed();
  }));
  changed();
}

function observeMessage(webview, message) {
  const surface = surfaces.get(webview);
  if (message?.type === 'repo-companion-menu-action') {
    const { key, action, root, label } = message;
    if (!surface || typeof key !== 'string' || !/^local\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key)) { return true; }
    if (action === 'newChat') {
      Promise.resolve(require('vscode').commands.executeCommand('chatgpt.newChat')).catch(() => {});
      return true;
    }
    const command = { custom: 'customHistoryLabel', assign: 'chooseHistoryRepository', auto: 'autoHistoryScope', clear: 'clearHistoryLabels', star: 'starHistoryChat', starred: 'openStarredChats' }[action];
    if (!command || !['assign', 'auto', 'clear', 'custom', 'star', 'starred'].includes(action)) { return true; }
    if (action === 'assign' && !repositories.some(repo => repo.root === root)) { return true; }
    if (action === 'custom' && label !== undefined && (typeof label !== 'string' || !label.trim() || label.length > 100 || /[\x00-\x1f\x7f\[\]]/.test(label))) { return true; }
    const vscode = require('vscode');
    const context = { webviewSection: 'repoCompanionChat', repoCompanionConversationKey: key };
    Promise.resolve(vscode.commands.executeCommand('codexRepoCompanion.' + command, context,
      action === 'assign' ? vscode.Uri.parse(root) : action === 'custom' ? label : undefined)).catch(() => {});
    return true;
  }
  if (message?.type === 'repo-companion-route') {
    if (!surface) { return true; }
    const path = typeof message.path === 'string' && message.path.length <= 2048 ? message.path : '';
    // Remote execution hosts can reuse thread IDs; do not bind them to local repos.
    const match = message.hostId === 'local' ? /^\/(local|remote)\/([a-zA-Z0-9_-]+)\/?$/.exec(path) : null;
    const key = match ? `${match[1]}/${match[2]}` : null;
    const difference = surface.key !== key || !surface.routeKnown;
    surface.key = key;
    surface.routeKnown = true;
    if (message.focused === true && surface.container?.visible !== false) { setActive(surface); }
    panels.get(surface.container)?.render();
    sendLabel(webview, surface, true);
    if (difference) { changed(); }
    return true;
  }
  if (message?.type === 'view-focused' && surface && surface.container?.visible !== false) { setActive(surface); }
  return false;
}

function sendLabel(webview, surface, force = false) {
  if (!webview.postMessage) { return; }
  const label = surface.key ? assignments[surface.key] ?? '' : '';
  const identity = JSON.stringify([surface.key, label, assignments, repositories, tooltips, pinManualLabels, customLabels, starred]);
  if (!force && surface.sentLabel === identity) { return; }
  surface.sentLabel = identity;
  Promise.resolve(webview.postMessage({ type: 'repo-companion-label', key: surface.key, label, assignments, repositories, tooltips, pinManualLabels, customLabels, starred })).catch(() => {});
}

function keyFor(uri) {
  if (uri.scheme !== 'openai-codex' || uri.authority !== 'route') { return undefined; }
  const match = /^\/(local|remote)\/([^/]+)\/?$/.exec(uri.path);
  return match ? `${match[1]}/${match[2]}` : undefined;
}

function install(context) {
  if (installed) { return; }
  installed = true;
  const vscode = require('vscode');
  context.subscriptions.push(vscode.commands.registerCommand('codexRepoCompanion.bridge.getState', () => {
    subscribed = true;
    return snapshot();
  }));
  context.subscriptions.push(vscode.commands.registerCommand('codexRepoCompanion.bridge.editorActivated', uri => {
    setActive([...surfaces.values()].find(surface => surface.kind === 'panel' && surface.uri === uri));
    return snapshot();
  }));
  context.subscriptions.push(vscode.commands.registerCommand('codexRepoCompanion.bridge.focusSurface', async expected => {
    const surface = [...surfaces.values()].find(item => item.id === expected?.id);
    if (!surface || activeId !== surface.id || surface.key !== expected.key) { return false; }
    if (surface.kind === 'panel' && surface.container?.active === false) { return false; }
    if (surface.kind === 'sidebar') {
      if (surface.container?.visible === false && surface.container.onDidChangeVisibility) {
        await new Promise(resolve => {
          const timer = setTimeout(finish, 2000);
          const listener = surface.container.onDidChangeVisibility(() => { if (surface.container.visible) { finish(); } });
          function finish() { clearTimeout(timer); listener.dispose(); resolve(); }
          surface.container.show(false);
        });
      } else { surface.container?.show(false); }
    }
    else { surface.container?.reveal(undefined, false); }
    return true;
  }));
  context.subscriptions.push(vscode.commands.registerCommand('codexRepoCompanion.bridge.beginNavigation', expected => {
    const surface = [...surfaces.values()].find(item => item.id === expected?.id);
    if (surface && activeId === surface.id && surface.key === expected.key) { followingId = surface.id; }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('codexRepoCompanion.bridge.endNavigation', id => {
    if (followingId !== id) { return; }
    followingId = null;
    const surface = [...surfaces.values()].find(item => item.id === id);
    if (surface?.container?.visible === false && activeId === id) { setActive(null); }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('codexRepoCompanion.bridge.setAssignments', (value, catalog, pin = true, custom = {}, stars = []) => {
    starred = Array.isArray(stars) ? [...new Set(stars.filter(key => typeof key === 'string' && /^local\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key)))].slice(0, 2000) : [];
    customLabels = Object.create(null);
    if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
      for (const [key, label] of Object.entries(custom)) {
        if (/^local\/[0-9a-f-]{36}$/i.test(key) && typeof label === 'string' && label.length <= 100 && !/[\x00-\x1f\x7f\[\]]/.test(label)) { customLabels[key] = label; }
      }
    }
    pinManualLabels = pin !== false;
    tooltips = Object.create(null);
    repositories = Array.isArray(catalog) ? catalog.filter(repo => repo && typeof repo.root === 'string' && repo.root.startsWith('file:') && repo.root.length <= 4096 && typeof repo.label === 'string' && repo.label.length <= 100 && typeof repo.description === 'string' && repo.description.length <= 4096).map(repo => ({ root: repo.root, label: repo.label, description: repo.description })) : [];
    const next = Object.create(null);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, item] of Object.entries(value)) {
        if (/^(local|remote)\/[^/]+$/.test(key) && item && typeof item.label === 'string') {
          const label = item.label.replace(/[\r\n\[\]]/g, ' ').trim().slice(0, 100);
          if (label) { next[key] = label; }
          if (typeof item.tooltip === 'string' && item.tooltip.length <= 16000) { tooltips[key] = item.tooltip; }
        }
      }
    }
    assignments = next;
    for (const state of panels.values()) { state.render(); }
    for (const [webview, surface] of surfaces) { sendLabel(webview, surface); }
    return { protocol: 2, panels: panels.size };
  }));
  context.subscriptions.push({ dispose() {
    for (const state of panels.values()) { state.restore(); }
    panels.clear();
    surfaces.clear();
    activeId = null;
    followingId = null;
    subscribed = false;
    assignments = Object.create(null);
    repositories = [];
    tooltips = Object.create(null);
    pinManualLabels = true;
    customLabels = Object.create(null);
    starred = [];
    installed = false;
  } });
}

function attach(uri, panel) {
  const key = keyFor(uri);
  if (panels.has(panel)) { return; }
  const surface = ensureSurface(panel.webview ?? panel, 'panel');
  surface.key = key ?? null;
  surface.uri = uri.toString();
  surface.container = panel;
  let owner = panel;
  let descriptor;
  while (owner && !(descriptor = Object.getOwnPropertyDescriptor(owner, 'title'))) { owner = Object.getPrototypeOf(owner); }
  if (!descriptor?.get || !descriptor?.set || (owner === panel && !descriptor.configurable)) {
    // Fail closed if VS Code changes the WebviewPanel implementation.
    require('vscode').window.showWarningMessage('Codex Repo Companion: this VS Code version cannot apply tab prefixes.');
    return;
  }
  const originalOwn = Object.getOwnPropertyDescriptor(panel, 'title');
  let baseTitle = descriptor.get.call(panel);
  const render = () => {
    const label = surface.key ? assignments[surface.key] : null;
    const title = label ? `[${label}] ${baseTitle}` : baseTitle;
    if (descriptor.get.call(panel) !== title) { descriptor.set.call(panel, title); }
  };
  Object.defineProperty(panel, 'title', {
    configurable: true, enumerable: descriptor.enumerable,
    get() { return baseTitle; },
    set(value) { baseTitle = value; render(); },
  });
  const disposeSubscription = panel.onDidDispose(() => { panels.delete(panel); disposeSubscription.dispose(); });
  panels.set(panel, {
    render,
    restore() {
      disposeSubscription.dispose();
      if (originalOwn) { Object.defineProperty(panel, 'title', originalOwn); } else { delete panel.title; }
      descriptor.set.call(panel, baseTitle);
    },
  });
  render();
}

module.exports = { install, attach, observeSurface, observeMessage };
