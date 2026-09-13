'use strict';
const api = acquireVsCodeApi(), el = id => document.getElementById(id);
const colourPanel = createNavigatorColour(api);
const saved = api.getState() || {};
const chooseLayout = createNavigatorLayout(saved.layout);
let rows = [], mode = saved.mode === 'starred' ? 'starred' : 'recent', signature = '', layout, sizeSignature = '';
const selectedChats = new Map(Object.entries(saved.selectedChats || {}).filter(([id, at]) =>
  /^[0-9a-f-]{36}$/i.test(id) && Number.isFinite(at) && at <= Date.now() && Date.now() - at < 3600000).slice(0, 200));
// Keep restored visits until the first state message supplies the configured duration.
let highlightDurationMs = 3600000;
let emptyMessage = 'No saved local chats yet.';
let highlightRecentlyViewedChats = true, highlightOnlyLastViewedChat = false;
let repositories = [], repositoryPageActive = false, welcome = false;
let licenseVisible = false;
let heldOrder = null, pointerInside = false, visibleSignature = '';
const goals = new Map(), pendingGoals = new Set();
const send = (type, extra = {}) => api.postMessage({ type, ...extra });
el('search').value = typeof saved.search === 'string' ? saved.search : '';
if (el('search').value) { el('searchBox').hidden = false; }
function button(text, title, click) {
  const result = document.createElement('button'); result.type = 'button'; result.textContent = text; result.title = title;
  result.setAttribute('aria-label', title); result.addEventListener('click', click); return result;
}
function showMenu(anchor) {
  const rect = anchor.getBoundingClientRect();
  anchor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
    clientX: rect.left, clientY: rect.bottom }));
}
function render() {
  for (const [id, at] of selectedChats) if (Date.now() - at >= highlightDurationMs) selectedChats.delete(id);
  const lastViewedChat = [...selectedChats.keys()].at(-1);
  const query = el('search').value.trim().toLocaleLowerCase();
  const matches = rows.filter(row => (mode !== 'starred' || row.starred) && (row.title + ' ' + (row.originalTitle || '') + ' ' + row.label).toLocaleLowerCase().includes(query));
  if (heldOrder) for (const row of rows) if (!heldOrder.has(row.id)) heldOrder.set(row.id, heldOrder.size);
  if (heldOrder) matches.sort((left, right) => (heldOrder.get(left.id) ?? Infinity) - (heldOrder.get(right.id) ?? Infinity));
  const focus = document.activeElement?.matches(':focus-visible') ? document.activeElement.dataset?.focus : undefined;
  el('chats').replaceChildren();
  el('message').textContent = !rows.length ? emptyMessage : !matches.length ? 'No matching chats.' : '';
  el('filter').hidden = mode !== 'starred';
  const limit = Math.min(200, Math.floor(el('viewport').clientHeight / (layout?.rowHeight || 28)) * (layout?.columns || 1));
  for (const row of matches.slice(0, limit)) {
    const item = document.createElement('div'); item.className = 'chat';
    if (highlightRecentlyViewedChats && selectedChats.has(row.id) && (!highlightOnlyLastViewedChat || row.id === lastViewedChat)) {
      const age = Math.max(0, Date.now() - selectedChats.get(row.id));
      if (age < highlightDurationMs) { item.classList.add('selected'); item.style.animationDuration = highlightDurationMs + 'ms'; item.style.animationDelay = '-' + age + 'ms'; }
    }
    item.dataset.vscodeContext = JSON.stringify({ webviewSection: 'navigatorChat', navigatorChatId: row.id,
      preventDefaultContextMenuItems: true, navigatorHasCustomLabel: !!row.hasCustomLabel, navigatorHasCustomName: !!row.hasCustomName });
    if (/^#[0-9a-f]{6}$/i.test(row.colour ?? '')) item.style.setProperty('--chat-colour', row.colour);
    const activityText = row.activityDetail || ({ working: 'Working', ready: 'Finished since last viewed', waiting: 'Waiting for your input', error: 'Turn failed', unknown: 'Activity status unavailable' }[row.activity] || '');
    item.title = [row.tooltip || row.title, activityText, item.classList.contains('selected') ? 'Recently viewed through Navigator' : ''].filter(Boolean).join('\n');
    item.addEventListener('click', event => { if (!event.target.closest('button')) send('open', { id: row.id }); });
    const open = button('', item.title, () => send('open', { id: row.id })); open.className = 'open'; open.dataset.focus = row.id + ':open';
    open.setAttribute('aria-label', ['Open ' + row.title, row.label, activityText].filter(Boolean).join(', '));
    const label = document.createElement('span'); label.className = 'label'; label.textContent = row.label || 'Chat'; label.title = label.textContent;
    const title = document.createElement('span'); title.className = 'title'; title.textContent = row.title || 'Untitled chat'; open.append(title);
    const name = document.createElement('div'); name.className = 'name';
    const star = button('', row.starred ? 'Unstar chat' : 'Star chat', event => { if (event.detail > 0) star.blur(); send('action', { id: row.id, action: 'star' }); }); star.className = 'star'; star.dataset.focus = row.id + ':star'; star.setAttribute('aria-pressed', String(row.starred));
    const starGlyph = document.createElement('span'); starGlyph.textContent = row.starred ? '★' : '☆'; starGlyph.setAttribute('aria-hidden', 'true'); star.append(starGlyph);
    name.append(open);
    const indicators = document.createElement('span'); indicators.className = 'indicators';
    const labelRow = document.createElement('div'); labelRow.className = 'label-row';
    const pin = button('', row.pinned ? 'Unpin chat' : 'Pin chat here; keep it visible regardless of age', event => {
      if (event.detail > 0) pin.blur();
      const ordered = [...rows];
      if (heldOrder) ordered.sort((a, b) => (heldOrder.get(a.id) ?? Infinity) - (heldOrder.get(b.id) ?? Infinity));
      send('action', { id: row.id, action: 'pin', position: ordered.findIndex(item => item.id === row.id) });
    });
    pin.className = 'pin'; pin.dataset.focus = row.id + ':pin'; pin.setAttribute('aria-pressed', String(!!row.pinned));
    const pinSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pinSvg.setAttribute('viewBox', '0 0 16 16'); pinSvg.setAttribute('aria-hidden', 'true');
    const pinPath = document.createElementNS(pinSvg.namespaceURI, 'path');
    pinPath.setAttribute('d', 'M5 2h6M6 2v4l-2 3v1h8V9l-2-3V2M8 10v4');
    pinSvg.append(pinPath); pin.append(pinSvg);
    if (row.pinned && !row.starred) labelRow.append(label, pin, star);
    else labelRow.append(label, star, pin);
    const goal = goals.get(row.id);
    if (goal && goal.status !== 'complete') {
      const running = goal.status === 'active', paused = goal.status === 'paused';
      const state = ({ active: 'running', paused: 'paused', blocked: 'blocked', usageLimited: 'usage limited', budgetLimited: 'budget limited' })[goal.status];
      const tooltip = ['Goal ' + state + (running ? ' — pause' : paused ? ' — resume' : ' — open in Codex'), goal.objective,
        goal.tokenBudget != null ? goal.tokensUsed + ' / ' + goal.tokenBudget + ' tokens' : ''].filter(Boolean).join('\n');
      const control = button('', tooltip, () => {
        if (!running && !paused) { send('open', { id: row.id }); return; }
        pendingGoals.add(row.id); control.disabled = true;
        send('goal', { id: row.id, goal: { status: goal.status, objective: goal.objective, createdAt: goal.createdAt } });
      });
      control.className = 'goal'; control.dataset.focus = row.id + ':goal'; control.dataset.status = goal.status;
      control.disabled = pendingGoals.has(row.id);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('aria-hidden', 'true');
      const circle = document.createElementNS(svg.namespaceURI, 'circle');
      circle.setAttribute('cx', '8'); circle.setAttribute('cy', '8'); circle.setAttribute('r', '6.5');
      const symbol = document.createElementNS(svg.namespaceURI, 'path');
      symbol.setAttribute('d', running ? 'M6 5.5v5M10 5.5v5' : paused ? 'M6.5 5l4.5 3-4.5 3z' : 'M5 8h6');
      if (paused) symbol.setAttribute('fill', 'currentColor');
      svg.append(circle, symbol); control.append(svg); indicators.append(control);
    }
    if (row.activity === 'working' || goal?.status === 'active') {
      const spinner = document.createElement('span'); spinner.className = 'spinner';
      const spinnerText = row.activity === 'working' ? activityText : 'Goal running';
      spinner.setAttribute('role', 'img'); spinner.setAttribute('aria-label', spinnerText); spinner.title = spinnerText;
      indicators.append(spinner);
    }
    if (['ready', 'waiting', 'error'].includes(row.activity)) {
      const dot = document.createElement('span'); dot.className = 'activity-dot ' + row.activity;
      dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', activityText); dot.title = activityText; indicators.append(dot);
    }
    if (goal && indicators.childElementCount > 1) item.classList.add('condensed-title');
    if (indicators.childElementCount) name.append(indicators);
    item.append(labelRow, name); el('chats').append(item);
  }
  // Measure at the actual column width. Keep a prefix of complete entries, including
  // a partial final grid row when fewer cells let its wrapped text fit naturally.
  const chats = el('chats'), bottom = el('viewport').getBoundingClientRect().bottom;
  const items = [...chats.children];
  const overflow = items.findIndex(item => item.getBoundingClientRect().bottom > bottom + 0.5);
  if (overflow !== -1) {
    const end = Math.min(items.length, overflow + (layout?.columns || 1));
    for (const item of items.slice(end)) item.remove();
    while (chats.lastElementChild && chats.lastElementChild.getBoundingClientRect().bottom > bottom + 0.5) {
      chats.lastElementChild.remove();
    }
  }
  const fitted = [...chats.children], columns = layout?.columns || 1;
  fitted.forEach((item, index) => {
    item.classList.toggle('separator-right', index % columns !== columns - 1 && index + 1 < fitted.length);
    item.classList.toggle('separator-bottom', index + columns < fitted.length);
  });
  const visibleIds = fitted.map(item => JSON.parse(item.dataset.vscodeContext).navigatorChatId);
  const nextVisible = JSON.stringify(visibleIds);
  if (nextVisible !== visibleSignature) { visibleSignature = nextVisible; send('visibleChats', { ids: visibleIds }); }
  if (focus) {
    const buttons = [...chats.querySelectorAll('button')];
    const target = buttons.find(item => item.dataset.focus === focus)
      || buttons.filter(item => item.dataset.focus?.endsWith(focus.endsWith(':star') ? ':star' : focus.endsWith(':pin') ? ':pin' : ':open')).at(-1);
    (target || el('viewport')).focus({ preventScroll: true });
  }
  api.setState({ mode, search: el('search').value, selectedChats: Object.fromEntries(selectedChats), layout: layout || saved.layout });
}
function resize() {
  if (licenseVisible || colourPanel.active || repositoryPageActive || !el('welcomePage').hidden) return;
  if (el('viewport').clientWidth <= 0 || el('viewport').clientHeight <= 0 || document.body.clientHeight <= 0) return;
  const style = getComputedStyle(document.body), fontSize = parseFloat(style.fontSize) || 13;
  const size = [el('viewport').clientWidth, el('viewport').clientHeight, document.body.clientHeight,
    fontSize, style.fontFamily, style.lineHeight, style.letterSpacing, style.backgroundColor].join(':');
  if (size === sizeSignature) return;
  sizeSignature = size;
  const rgb = style.backgroundColor.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
  if (rgb) send('theme', { background: '#' + rgb.slice(1).map(value => Number(value).toString(16).padStart(2, '0')).join('') });
  const next = chooseLayout(el('viewport').clientWidth, document.body.clientHeight, fontSize);
  layout = next; document.body.dataset.layout = layout.mode;
  document.body.style.setProperty('--columns', layout.columns);
  document.body.style.setProperty('--row-height', layout.rowHeight + 'px');
  render();
}
function search() { el('searchBox').hidden = false; el('search').focus(); render(); }
function closeSearch() { el('searchBox').hidden = true; el('search').value = ''; render(); }
window.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'license') {
    const state = message.license;
    const wasVisible = licenseVisible;
    licenseVisible = !!state.visible;
    el('licensePage').hidden = !licenseVisible;
    el('licenseStatus').textContent = state.message;
    el('licenseNotice').textContent = state.notice || (!state.configured ? 'Purchases are not configured in this development build.' : '');
    el('licenseSandbox').hidden = !state.sandbox;
    el('licenseEnds').textContent = state.endsAt ? (state.state === 'trial' ? 'Trial ends ' : 'Saved access expires ') + new Date(state.endsAt).toLocaleString() : '';
    el('licenseTrial').hidden = !state.canStartTrial;
    el('licenseBuy').hidden = !state.canBuy || ['active', 'offline'].includes(state.state);
    el('licenseActivate').hidden = !state.canActivate;
    el('licenseValidate').hidden = !state.canDeactivate;
    el('licenseBack').hidden = !state.allowed;
    el('licensePortal').hidden = !state.canPortal;
    el('licenseDeactivate').hidden = !state.canDeactivate;
    el('licenseRecover').hidden = !['recovery', 'unavailable'].includes(state.state);
    for (const control of document.querySelectorAll('[data-license]')) control.disabled = !!state.busy;
    if (licenseVisible) {
      if (colourPanel.active) colourPanel.close('licensePage');
      repositoryPageActive = false;
      for (const id of ['chatPage', 'welcomePage', 'repositoryPage', 'colourPage']) el(id).hidden = true;
      if (!state.allowed) { rows = []; signature = ''; el('chats').replaceChildren(); goals.clear(); visibleSignature = ''; }
    } else if (wasVisible) { el('welcomePage').hidden = !welcome; el('chatPage').hidden = welcome; sizeSignature = ''; resize(); }
    return;
  }
  if (licenseVisible) return;
  if (message.type === 'selectedChat') {
    if (typeof message.id !== 'string' || !Number.isFinite(message.at)) return;
    selectedChats.delete(message.id); selectedChats.set(message.id, message.at);
    if (selectedChats.size > 200) selectedChats.delete(selectedChats.keys().next().value);
    render(); return;
  }
  if (message.type === 'goals') {
    const before = JSON.stringify([...goals]);
    for (const id of message.ids || []) {
      if (message.goals[id]) goals.set(id, message.goals[id]); else goals.delete(id);
    }
    if (before !== JSON.stringify([...goals])) render();
    return;
  }
  if (message.type === 'goalSettled') { pendingGoals.delete(message.id); render(); return; }
  if (message.type === 'colour') { if (welcome) return; el('welcomePage').hidden = true; el('repositoryPage').hidden = true; colourPanel.open(message); return; }
  if (message.type === 'colourClosed') { colourPanel.close(repositoryPageActive ? 'repositoryPage' : welcome ? 'welcomePage' : 'chatPage'); sizeSignature = ''; resize(); return; }
  if (message.type === 'repositoryPage') { if (colourPanel.active || welcome) return; repositoryPageActive = true; renderRepositories(); el('chatPage').hidden = true; el('repositoryPage').hidden = false; el('repositoryBack').focus(); return; }
  if ((colourPanel.active || repositoryPageActive || welcome) && ['search', 'filter'].includes(message.type)) return;
  if (message.type === 'search') { search(); return; }
  if (message.type === 'filter') { mode = mode === 'starred' ? 'recent' : 'starred'; render(); return; }
  if (message.type === 'error') { el('message').textContent = message.message; return; }
  if (message.type !== 'state') return;
  welcome = !!message.welcome;
  if (welcome) {
    if (colourPanel.active) colourPanel.close('welcomePage');
    repositoryPageActive = false; el('repositoryPage').hidden = true;
    rows = []; el('chats').replaceChildren(); goals.clear(); visibleSignature = '';
  }
  el('welcomePage').hidden = !welcome || colourPanel.active || repositoryPageActive;
  el('setupMessage').textContent = message.setupMessage || 'Install and verify Navigator hooks to show your chats.';
  if (!colourPanel.active && !repositoryPageActive) el('chatPage').hidden = !!message.welcome;
  const nextRepositories = message.repositories || [];
  if (JSON.stringify(nextRepositories) !== JSON.stringify(repositories)) { repositories = nextRepositories; renderRepositories(); }
  emptyMessage = message.emptyMessage || 'No saved local chats yet.';
  highlightRecentlyViewedChats = message.highlightRecentlyViewedChats !== false;
  highlightOnlyLastViewedChat = message.highlightOnlyLastViewedChat === true;
  highlightDurationMs = (Number.isInteger(message.highlightDurationSeconds) ? Math.max(1, Math.min(3600, message.highlightDurationSeconds)) : 180) * 1000;
  const next = JSON.stringify([message.rows, emptyMessage, highlightRecentlyViewedChats, highlightOnlyLastViewedChat, highlightDurationMs, message.welcome]);
  if (next === signature) return;
  signature = next; rows = message.rows;
  sizeSignature = ''; resize();
  for (const id of goals.keys()) if (!rows.some(row => row.id === id)) goals.delete(id);
  render();
});
el('welcomeSetup').addEventListener('click', () => send('welcomeSetup'));
for (const control of document.querySelectorAll('[data-license]')) control.addEventListener('click', () => send('license', { action: control.dataset.license }));
el('filter').addEventListener('click', () => { mode = 'recent'; render(); });
el('closeSearch').addEventListener('click', closeSearch);
el('search').addEventListener('input', render);

function holdOrder() {
  heldOrder ??= new Map(rows.map((row, index) => [row.id, index]));
}
function releaseOrder() {
  if (!pointerInside && !(document.hasFocus() && el('chats').contains(document.activeElement)) && heldOrder) {
    heldOrder = null; render();
  }
}
function enterPanel() {
  if (!pointerInside) { pointerInside = true; holdOrder(); }
}
document.body.addEventListener('pointerenter', enterPanel);
document.body.addEventListener('pointermove', enterPanel);
document.body.addEventListener('pointerleave', () => { pointerInside = false; releaseOrder(); });
el('chats').addEventListener('focusin', holdOrder);
el('chats').addEventListener('focusout', () => queueMicrotask(releaseOrder));
window.addEventListener('blur', releaseOrder);
document.addEventListener('keydown', event => {
  if (colourPanel.active) return;
  if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && event.target.closest('.chat, .repository')) {
    event.preventDefault(); event.stopPropagation(); showMenu(event.target); return;
  }
  if (event.key === 'Escape') {
    if (repositoryPageActive) { el('repositoryBack').click(); return; }
    if (!el('searchBox').hidden) closeSearch();
  }
  if (!repositoryPageActive && (event.ctrlKey || event.metaKey) && event.key === 'f') { event.preventDefault(); search(); }
});
function renderRepositories() {
  const focusRoot = document.activeElement?.dataset?.root;
  el('repositoryList').replaceChildren();
  for (const repo of repositories) {
    const entry = button(repo.label, repo.root, () => send('repositoryColour', { root: repo.root }));
    entry.className = 'repository'; entry.dataset.root = repo.root;
    entry.dataset.vscodeContext = JSON.stringify({ webviewSection: 'navigatorRepository', navigatorRepositoryRoot: repo.root, preventDefaultContextMenuItems: true });
    if (/^#[0-9a-f]{6}$/i.test(repo.colour || '')) entry.style.color = repo.colour;
    el('repositoryList').append(entry);
    if (focusRoot === repo.root && repositoryPageActive && !colourPanel.active) entry.focus();
  }
  if (!repositories.length) el('repositoryList').textContent = 'No local Git repositories are open in this workspace.';
}
el('repositoryBack').addEventListener('click', () => { repositoryPageActive = false; el('repositoryPage').hidden = true; el('chatPage').hidden = false; sizeSignature = ''; resize(); el('viewport').focus(); });
const observer = new ResizeObserver(resize);
observer.observe(document.body); observer.observe(el('viewport'));
const fontObserver = new MutationObserver(resize);
fontObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
fontObserver.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
document.fonts.addEventListener('loadingdone', () => { sizeSignature = ''; resize(); });
resize(); send('ready');
