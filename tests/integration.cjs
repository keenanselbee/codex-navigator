'use strict';
const vscode = require('vscode');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const bridge = require('../bridge/codex-repo-companion-bridge.cjs');
const rendererHook = fs.readFileSync(path.join(__dirname, '..', 'bridge', 'renderer-route-hook.txt'), 'utf8');
const menuComponent = fs.readFileSync(path.join(__dirname, '..', 'bridge', 'renderer-menu.txt'), 'utf8');
const titleComponent = fs.readFileSync(path.join(__dirname, '..', 'bridge', 'renderer-title-component.txt'), 'utf8');

function fixtureHtml(route) {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-fixture'"></head>
    <body><button id="back">Back</button><span id="title"></span><div id="history"></div><input id="composer" value="preserved draft"><script nonce="fixture">
    const api=acquireVsCodeApi();let r=${JSON.stringify(route)},i='',cleanup;
    const J9={useEffect(callback){cleanup=callback();}};
    const vd={dispatchMessage(type,data){api.postMessage({type,...data});}};
    const E=()=>({pathname:r,search:i}),Ln={useSyncExternalStore(subscribe,snapshot){return snapshot();}},$={Fragment:'fragment',jsxs(type,props){return $.jsx(type,props);},jsx(type,props){if(typeof type==='function')return type(props);const node=document.createElement(type);if(props.style)Object.assign(node.style,props.style);if(props.role)node.setAttribute('role',props.role);if(props['aria-label'])node.setAttribute('aria-label',props['aria-label']);if(props.title)node.title=props.title;if(props['data-vscode-context'])node.setAttribute('data-vscode-context',props['data-vscode-context']);for(const child of [props.children].flat()){if(child!=null)node.append(child);}return node;}};
    ${menuComponent}
    ${titleComponent}
    function renderHeader(){document.getElementById('title').replaceChildren(RepoCompanionTitle({title:'Review fixture'}));document.getElementById('history').replaceChildren(RepoCompanionHistoryRow({component:RepoCompanionRowPrefix,repoCompanionKey:'local/00000000-0000-0000-0000-000000000001',conversationKey:'local/00000000-0000-0000-0000-000000000001',hostId:'local'}));}
    window.addEventListener('repo-companion-label-changed',renderHeader);
    function render(){cleanup?.();${rendererHook}renderHeader();}
    document.getElementById('back').onclick=()=>{r='/';render();};
    window.addEventListener('message',event=>{
      if(event.data.type==='fixture:back'){document.getElementById('back').focus();document.getElementById('back').click();}
      if(event.data.type==='fixture:navigate'){r=event.data.path;document.getElementById('composer').focus();render();}
      if(event.data.type==='fixture:menu'){document.getElementById(event.data.target).firstElementChild.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:50,clientY:50}));}
      if(event.data.type==='fixture:catalog'){window.__codexRepoCompanionRepositories=event.data.repos;}
      if(event.data.type==='fixture:enter'){document.querySelector('#repo-companion-menu input')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));}
      if(event.data.type==='fixture:filter'){const input=document.querySelector('#repo-companion-menu input');input.value=event.data.value;input.dispatchEvent(new Event('input',{bubbles:true}));}
      if(event.data.type==='fixture:pick'){Array.from(document.querySelectorAll('#repo-companion-menu button')).find(item=>event.data.root?item.dataset.root===event.data.root:item.dataset.action===event.data.action)?.click();}
      if(event.data.type==='fixture:escape'){document.querySelector('#repo-companion-menu input')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));}
      if(event.data.type==='fixture:probe'){api.postMessage({type:'fixture:probe',focused:document.hasFocus(),element:document.activeElement.id,draft:document.getElementById('composer').value,title:document.getElementById('title').textContent,history:document.getElementById('history').textContent,titleColour:document.querySelector('#title [role=img]')?.style.backgroundColor,titleStarColour:document.querySelector('#title [role=img]')?.style.color,titleMarkers:document.querySelectorAll('#title [role=img]').length,titleTooltip:document.getElementById('title').firstElementChild?.title,historyTooltip:document.getElementById('history').firstElementChild?.title,menu:Array.from(document.querySelectorAll('#repo-companion-menu button')).map(item=>({label:item.textContent,root:item.dataset.root,action:item.dataset.action})),menuInput:document.querySelector('#repo-companion-menu input')?.value,menuOpen:!!document.getElementById('repo-companion-menu'),historyContext:JSON.parse(document.querySelector('#history [data-vscode-context]').getAttribute('data-vscode-context'))});}
    });
    render();document.getElementById('composer').focus();
    </script></body></html>`;
}

async function until(predicate, description) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await predicate()) { return; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${description}`);
}

async function run() {
  const root = process.env.REPO_COMPANION_TEST_ROOT;
  const phase = process.env.REPO_COMPANION_TEST_PHASE;
  const subscriptions = [];
  const panels = new Map();
  let sidebar;
  let newChatCalls = 0;
  subscriptions.push(vscode.commands.registerCommand('chatgpt.newChat', () => { newChatCalls++; }));
  let probeResolve;
  bridge.install({ subscriptions });
  const fileChanges = new vscode.EventEmitter();
  subscriptions.push(fileChanges, vscode.workspace.registerFileSystemProvider('openai-codex', {
    onDidChangeFile: fileChanges.event,
    watch() { return { dispose() {} }; },
    stat() { return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 }; },
    readDirectory() { return []; }, readFile() { return new Uint8Array(); },
    createDirectory() { throw vscode.FileSystemError.NoPermissions(); },
    writeFile() { throw vscode.FileSystemError.NoPermissions(); },
    delete() { throw vscode.FileSystemError.NoPermissions(); },
    rename() { throw vscode.FileSystemError.NoPermissions(); },
  }, { isReadonly: true }));
  subscriptions.push(vscode.window.registerCustomEditorProvider('chatgpt.conversationEditor', {
    openCustomDocument(uri) { return { uri, dispose() {} }; },
    resolveCustomEditor(document, panel) {
      bridge.attach(document.uri, panel);
      bridge.observeSurface(panel.webview, 'panel', panel.onDidDispose, panel);
      subscriptions.push(panel.webview.onDidReceiveMessage(message => bridge.observeMessage(panel.webview, message)));
      panel.title = `Conversation ${document.uri.path.split('/').at(-1)}`;
      panel.webview.options = { enableScripts: true };
      panel.webview.html = fixtureHtml(document.uri.path);
      panels.set(document.uri.toString(), panel);
    },
  }, { supportsMultipleEditorsPerDocument: false }));
  subscriptions.push(vscode.window.registerWebviewViewProvider('repoCompanion.testSidebar', {
    resolveWebviewView(view) {
      sidebar = view;
      bridge.observeSurface(view.webview, 'sidebar', view.onDidDispose, view);
      subscriptions.push(view.webview.onDidReceiveMessage(message => {
        bridge.observeMessage(view.webview, message);
        if (message.type === 'fixture:probe') { probeResolve?.(message); probeResolve = undefined; }
      }));
      view.webview.options = { enableScripts: true };
      view.webview.html = fixtureHtml('/');
    },
  }, { webviewOptions: { retainContextWhenHidden: true } }));
  const git = (await vscode.extensions.getExtension('vscode.git').activate()).getAPI(1);
  const parentUri = vscode.Uri.file(path.join(root, 'parent'));
  const nestedUri = vscode.Uri.file(path.join(root, 'parent', 'private'));
  await git.openRepository(parentUri);
  await git.openRepository(nestedUri);
  await until(() => git.repositories.length === 2, 'two independent Git repositories');
  const parent = git.repositories.find(repo => repo.rootUri.toString() === parentUri.toString());
  const nested = git.repositories.find(repo => repo.rootUri.toString() === nestedUri.toString());
  const selections = [];
  for (const repo of git.repositories) { subscriptions.push(repo.ui.onDidChange(() => selections.push({ time: Date.now(), root: repo.rootUri.fsPath, selected: repo.ui.selected }))); }
  const manifest = require('../package.json');
  const extension = vscode.extensions.getExtension(`${manifest.publisher}.${manifest.name}`);
  assert.ok(extension, 'development extension is available');
  await extension.activate();
  for (const name of ['setUp', 'setUpAgentHelper', 'restoreCodex']) {
    assert.ok((await vscode.commands.getCommands(true)).includes('codexRepoCompanion.' + name));
  }
  for (const key of ['instructionRouting', 'mainInstructionsFile']) {
    const setting = extension.packageJSON.contributes.configuration.properties['codexRepoCompanion.' + key];
    assert.ok(setting.markdownDescription.includes('(command:codexRepoCompanion.setUp)'));
  }
  await vscode.commands.executeCommand('codexRepoCompanion.setUp');
  await until(() => vscode.window.tabGroups.activeTabGroup.activeTab?.label === 'Set Up Repo Companion', 'setup page opens');
  await vscode.commands.executeCommand('codexRepoCompanion.setUpAgentHelper');
  const setupTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => tab.label === 'Set Up Repo Companion');
  assert.equal(setupTabs.length, 1, 'both setup commands reuse one page');
  await vscode.window.tabGroups.close(setupTabs[0]);
  const repositoryColours = { [parentUri.fsPath]: '#FF0000', [nestedUri.fsPath]: '#0000FF' };
  if (phase === 'initial') await vscode.workspace.getConfiguration('codexRepoCompanion').update('repositoryColours', repositoryColours, vscode.ConfigurationTarget.Global);
  else assert.deepEqual(vscode.workspace.getConfiguration('codexRepoCompanion').get('repositoryColours'), repositoryColours, 'repository colours survive restart');
  const aId = '00000000-0000-0000-0000-000000000001';
  const a = vscode.Uri.parse(`openai-codex://route/local/${aId}`);
  const b = vscode.Uri.parse('openai-codex://route/local/00000000-0000-0000-0000-000000000002');
  async function open(uri) {
    await vscode.commands.executeCommand('vscode.openWith', uri, 'chatgpt.conversationEditor', { preview: false });
    await until(() => vscode.window.tabGroups.activeTabGroup.activeTab?.input?.uri?.toString() === uri.toString(), 'chat is active');
  }
  async function check(uri, label) {
    await open(uri);
    await until(() => vscode.window.tabGroups.activeTabGroup.activeTab?.label.startsWith(`[${label}] `), `tab prefix ${label}`);
    assert.ok(!panels.get(uri.toString()).title.startsWith('['), 'provider title remains unchanged');
  }
  // Initialize SCM once to establish a stable user-owned selection, then observe
  // every selection event while the companion handles label operations.
  await vscode.commands.executeCommand('workbench.scm.focus');
  await new Promise(resolve => setTimeout(resolve, 1000));
  const selectedBefore = git.repositories.filter(repo => repo.ui.selected).map(repo => repo.rootUri.toString());
  selections.length = 0;
  assert.ok(!(await vscode.commands.getCommands(true)).includes('codexRepoCompanion.revealRepository'));
  assert.ok(!(await vscode.commands.getCommands(true)).includes('codexRepoCompanion.workbench.selectRepository'), 'test runs on restored VS Code');
  if (phase === 'initial') {
    assert.equal(vscode.workspace.getConfiguration('codexRepoCompanion').get('detectChatFocus'), false, 'default waits for agent reports');
    for (const uri of [a, b]) {
      await open(uri);
      await vscode.commands.executeCommand('codexRepoCompanion.useAutomaticScope', uri);
      await new Promise(resolve => setTimeout(resolve, 500));
      const pending = await vscode.commands.executeCommand('codexRepoCompanion.diagnostics');
      assert.equal(pending.assignedRoot, null, 'starting directory and SCM selection do not assign a chat');
      assert.ok(!vscode.window.tabGroups.activeTabGroup.activeTab.label.startsWith('['));
    }
    await vscode.commands.executeCommand('codexRepoCompanion.assignRepository', a, parentUri);
    await vscode.commands.executeCommand('codexRepoCompanion.assignRepository', b, nestedUri);
  }
  if (phase === 'restart') {
    await check(a,'Resume correction');
    assert.equal((await vscode.commands.executeCommand('codexRepoCompanion.diagnostics')).isStarred,true,'stars survive restart');
    await vscode.commands.executeCommand('codexRepoCompanion.toggleStar',a);
    assert.equal((await vscode.commands.executeCommand('codexRepoCompanion.diagnostics')).scopeMode,'auto','non-pinned correction survives restart');
    await vscode.commands.executeCommand('codexRepoCompanion.assignRepository',a,parentUri);
  }
  const customOnly = vscode.Uri.parse('openai-codex://route/local/00000000-0000-0000-0000-000000000003');
  if (phase === 'initial') { await vscode.commands.executeCommand('codexRepoCompanion.setCustomLabel', customOnly, 'Elden Ring modding'); }
  await check(customOnly, 'Elden Ring modding');
  const customStatus = await vscode.commands.executeCommand('codexRepoCompanion.diagnostics');
  assert.equal(customStatus.assignedRoot,null,'custom-only chat has no invented Git root');
  assert.equal(customStatus.scopeSource,'custom');
  await check(a, 'Parent');
  await check(b, 'Parent - Private');
  await check(a, 'Parent');

  const execFile = require('node:util').promisify(require('node:child_process').execFile);
  const helper = path.join(__dirname, '..', 'dist', 'report-scope.js');
  const sendScope = (uri, roots) => execFile('node', [helper, ...roots], {
    encoding: 'utf8', windowsHide: true, timeout: 10000,
    env: { ...process.env, CODEX_THREAD_ID: uri.path.split('/').at(-1) },
  });
  await sendScope(a, [parentUri.fsPath]);
  await sendScope(b, [nestedUri.fsPath, parentUri.fsPath]);
  await vscode.commands.executeCommand('codexRepoCompanion.useAutomaticScope', a);
  await vscode.commands.executeCommand('codexRepoCompanion.useAutomaticScope', b);
  await check(b, 'Parent - Private \u00b7 Parent');
  assert.equal((await vscode.commands.executeCommand('codexRepoCompanion.diagnostics')).colour, '#8C53A2', 'multi-repository colours blend');
  await check(a, 'Parent');
  // Latest scope replaces the older project instead of accumulating history.
  await sendScope(a, [nestedUri.fsPath]);
  await check(a, 'Parent - Private');
  await sendScope(a, [parentUri.fsPath]);
  await check(a, 'Parent');

  await vscode.commands.executeCommand('vscode.moveViews', { viewIds: ['repoCompanion.testSidebar'], destinationId: 'workbench.view.extension.repoCompanion.fixture' });
  await vscode.commands.executeCommand('repoCompanion.testSidebar.focus');
  await until(() => sidebar?.visible, 'sidebar visible');
  async function probe() {
    const result = new Promise(resolve => { probeResolve = resolve; });
    await sidebar.webview.postMessage({ type: 'fixture:probe' });
    return Promise.race([result, new Promise((_, reject) => setTimeout(() => reject(new Error('Probe timeout')), 2000))]);
  }
  await sidebar.webview.postMessage({ type: 'fixture:navigate', path: a.path });
  await until(async () => (await probe()).title === '[Parent] Review fixture', 'sidebar header label');
  await until(async () => (await probe()).titleColour === 'rgb(255, 0, 0)', 'repository colour dot');
  await vscode.commands.executeCommand('codexRepoCompanion.toggleStar', a);
  await until(async () => { const state = await probe(); return state.title === '\u2605[Parent] Review fixture' && state.titleStarColour === 'rgb(255, 0, 0)' && state.titleMarkers === 1 && !state.titleColour; }, 'one coloured star replaces the dot');
  await vscode.commands.executeCommand('codexRepoCompanion.toggleStar', a);
  await until(async () => (await probe()).titleColour === 'rgb(255, 0, 0)', 'unstarring restores the dot');
  await sendScope(a, [nestedUri.fsPath]);
  await until(async () => (await probe()).title === '[Parent - Private] Review fixture', 'sidebar label follows latest project');
  const state = await probe();
  assert.equal(state.draft, 'preserved draft');
  assert.equal(state.element, 'composer', 'label update preserves the composer focus target even if another window has OS focus');
  await sidebar.webview.postMessage({ type: 'fixture:back' });
  await until(async () => {
    const state = await vscode.commands.executeCommand('codexRepoCompanion.bridge.getState');
    return state.surfaces.some(item => item.kind === 'sidebar' && item.routeKnown && item.key === null);
  }, 'Back stays on history');
  await until(async () => (await probe()).history === '[Parent - Private] ', 'history label retains latest scope');

  // Exercise the exact row data delivered by VS Code's native context menu.
  // History has no active chat; choose must target its row without opening it.
  const clicked = (await probe()).historyContext;
  await vscode.commands.executeCommand('codexRepoCompanion.customHistoryLabel', clicked, 'Custom discussion');
  await until(async () => (await probe()).history === '[Custom discussion] ', 'history uses custom text');
  await sendScope(a,[nestedUri.fsPath]);
  await new Promise(resolve=>setTimeout(resolve,400));
  assert.equal((await probe()).history,'[Custom discussion] ','automatic reports cannot overwrite custom text');
  await vscode.commands.executeCommand('codexRepoCompanion.autoHistoryScope',clicked);
  await until(async () => (await probe()).history === '[Parent - Private] ', 'Auto removes custom text');
  await vscode.commands.executeCommand('codexRepoCompanion.customHistoryLabel',clicked,'Clear this');
  await until(async () => (await probe()).history === '[Clear this] ', 'custom label can be edited');
  await vscode.commands.executeCommand('codexRepoCompanion.clearHistoryLabels',clicked);
  await until(async () => (await probe()).history === '', 'Clear removes custom text');
  await vscode.commands.executeCommand('codexRepoCompanion.customHistoryLabel',clicked,'Replace with repository');

  await vscode.commands.executeCommand('codexRepoCompanion.chooseHistoryRepository', clicked, parentUri);
  await until(async () => (await probe()).history === '[Parent] ', 'history selection pins the clicked chat');
  const historyState = await vscode.commands.executeCommand('codexRepoCompanion.bridge.getState');
  assert.ok(historyState.surfaces.some(item => item.kind === 'sidebar' && item.key === null));
  await vscode.commands.executeCommand('codexRepoCompanion.autoHistoryScope', clicked);
  await until(async () => (await probe()).history === '[Parent - Private] ', 'history Auto restores latest discussion');
  await sidebar.webview.postMessage({ type: 'fixture:navigate', path: b.path });
  await until(async () => (await probe()).title === '[Parent - Private \u00b7 Parent] Review fixture', 'other chat stays active');
  await vscode.commands.executeCommand('codexRepoCompanion.clearHistoryLabels', clicked);
  await until(async () => (await probe()).history === '', 'history Clear targets the row, not the active chat');
  await sidebar.webview.postMessage({type:'fixture:menu',target:'history'});
  await until(async()=> (await probe()).menu.some(item=>item.action==='star'&&item.label==='Star Chat'),'star action on history');
  await sidebar.webview.postMessage({type:'fixture:pick',action:'star'});
  await until(async()=> (await probe()).history==='\u2605 ','star renders with no label');
  assert.equal((await probe()).title.startsWith('\u2605'),false,'starring a history row does not star active chat');
  await sidebar.webview.postMessage({type:'fixture:menu',target:'history'});
  await until(async()=> (await probe()).menu.some(item=>item.action==='star'&&item.label==='Unstar Chat'),'menu reflects saved star');
  await sidebar.webview.postMessage({type:'fixture:pick',action:'star'});
  await until(async()=> (await probe()).history==='','unstar removes marker');
  const afterMenu = await probe();
  assert.equal(afterMenu.title, '[Parent - Private \u00b7 Parent] Review fixture');
  assert.equal(afterMenu.draft, 'preserved draft');
  await vscode.commands.executeCommand('codexRepoCompanion.chooseHistoryRepository', clicked, parentUri);
  await until(async () => (await probe()).history === '[Parent] ', 'unassigned row remains assignable');

  await sidebar.webview.postMessage({type:'fixture:menu',target:'title'});
  await until(async () => (await probe()).menu.length === 10, 'header right-click lists both repositories plus Custom, Auto, Clear and New Chat');
  assert.deepEqual((await probe()).menu.filter(item=>item.root).map(item=>item.root),[parentUri.toString(),nestedUri.toString()]);
  assert.ok((await probe()).menu.some(item=>item.action==='custom' && item.label==='Custom Label...'));
  assert.ok((await probe()).menu.some(item=>item.action==='colour' && item.label==='Chat Colour...'));
  assert.ok((await probe()).menu.some(item=>item.action==='repositoryColour' && item.label==='Repository Colour...'));
  assert.ok((await probe()).menu.some(item=>item.action==='newChat' && item.label==='New Chat in Sidebar'));
  const beforeNewChat = await probe();
  const priorNewChatCalls = newChatCalls;
  await sidebar.webview.postMessage({type:'fixture:pick',action:'newChat'});
  await until(() => newChatCalls === priorNewChatCalls + 1,'New Chat invokes the Codex-owned command once');
  assert.equal((await probe()).menuOpen,false,'New Chat closes the dropdown');
  assert.equal((await probe()).history,beforeNewChat.history,'New Chat does not reassign a repository');
  assert.equal((await probe()).title,beforeNewChat.title,'menu does not navigate independently of Codex');
  await sidebar.webview.postMessage({type:'fixture:menu',target:'title'});
  await until(async () => (await probe()).menuOpen,'reopen after New Chat command');

  await sidebar.webview.postMessage({type:'fixture:filter',value:'private'});
  await until(async () => (await probe()).menu.length === 9, 'direct menu filters repositories');
  await sidebar.webview.postMessage({type:'fixture:escape'});
  await until(async () => !(await probe()).menuOpen, 'Escape dismisses the dropdown');
  await sidebar.webview.postMessage({type:'fixture:menu',target:'title'});
  await until(async () => (await probe()).menuOpen, 'title menu reopens');
  await sidebar.webview.postMessage({type:'fixture:pick',root:parentUri.toString()});
  await until(async () => (await probe()).title === '[Parent] Review fixture', 'direct title choice pins this chat without a picker');
  await sidebar.webview.postMessage({type:'fixture:menu',target:'title'});
  await until(async () => (await probe()).menuOpen, 'title menu opens for Auto');
  await sidebar.webview.postMessage({type:'fixture:pick',action:'auto'});
  await until(async () => (await probe()).title === '[Parent - Private \u00b7 Parent] Review fixture', 'direct Auto releases the title pin');
  await sidebar.webview.postMessage({type:'fixture:menu',target:'history'});
  await until(async () => (await probe()).menuOpen, 'history has the same direct menu');
  await sidebar.webview.postMessage({type:'fixture:pick',root:nestedUri.toString()});
  await until(async () => (await probe()).history === '[Parent - Private] ', 'direct history choice changes the clicked row');
  assert.equal((await probe()).title,'[Parent - Private \u00b7 Parent] Review fixture','active chat remains unchanged');
  await sidebar.webview.postMessage({type:'fixture:menu',target:'history'});
  await until(async () => (await probe()).menuOpen, 'history menu opens for Clear');
  await sidebar.webview.postMessage({type:'fixture:pick',action:'clear'});
  await until(async () => (await probe()).history === '', 'direct Clear removes the clicked label');
  await sidebar.webview.postMessage({type:'fixture:menu',target:'history'});
  await until(async () => (await probe()).menuOpen, 'unassigned row retains the direct menu');
  await sidebar.webview.postMessage({type:'fixture:back'});
  await until(async () => !(await probe()).menuOpen, 'route changes dismiss a stale menu');
  assert.equal((await probe()).draft,'preserved draft');



  await vscode.commands.executeCommand('codexRepoCompanion.assignRepository', a, parentUri);
  await sendScope(a, [nestedUri.fsPath]);
  await check(a, 'Parent');
  await vscode.commands.executeCommand('codexRepoCompanion.useAutomaticScope', a);
  await check(a, 'Parent - Private');
  await sendScope(a, ['--clear']);
  await until(() => !vscode.window.tabGroups.activeTabGroup.activeTab.label.startsWith('['), 'non-project discussion clears label');
  await vscode.commands.executeCommand('codexRepoCompanion.clearRepository', a);
  await sendScope(a, [parentUri.fsPath]);
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.ok(!vscode.window.tabGroups.activeTabGroup.activeTab.label.startsWith('['), 'clear pauses automatic labels');
  await vscode.commands.executeCommand('codexRepoCompanion.useAutomaticScope', a);
  await check(a, 'Parent');
  const config = vscode.workspace.getConfiguration('codexRepoCompanion');
  await config.update('showTabPrefix', false, vscode.ConfigurationTarget.Workspace);
  await until(() => !vscode.window.tabGroups.activeTabGroup.activeTab.label.startsWith('['), 'prefix setting clears labels');
  await config.update('showTabPrefix', true, vscode.ConfigurationTarget.Workspace);
  await check(a, 'Parent');
  const sessionFile = path.join(process.env.CODEX_HOME, 'sessions', '2026', '09', '11', `rollout-${aId}.jsonl`);
  const message = text => JSON.stringify({ type: 'response_item', timestamp: new Date().toISOString(), payload: {
    type: 'message', role: 'user', content: [{ type: 'input_text', text }],
  } });
  fs.appendFileSync(sessionFile, message('Lets focus on Parent - Private') + '\n');
  await config.update('detectChatFocus', false, vscode.ConfigurationTarget.Workspace);
  await new Promise(resolve => setTimeout(resolve, 1500));
  await check(a, 'Parent');
  assert.equal((await vscode.commands.executeCommand('codexRepoCompanion.diagnostics')).scopeSource, 'agent', 'phrase detection cannot replace the agent by default');
  await config.update('detectChatFocus', true, vscode.ConfigurationTarget.Workspace);
  await check(a, 'Parent - Private');
  assert.equal((await vscode.commands.executeCommand('codexRepoCompanion.diagnostics')).scopeSource, 'discussion', 'user focus changes labels without a helper report');
  fs.appendFileSync(sessionFile, message('# Context from my IDE setup:\nActive file: Parent\n## My request:\nThanks') + '\n');
  await new Promise(resolve => setTimeout(resolve, 1500));
  await check(a, 'Parent - Private');
  await config.update('detectChatFocus', false, vscode.ConfigurationTarget.Workspace);
  await check(a, 'Parent');
  await config.update('detectChatFocus', true, vscode.ConfigurationTarget.Workspace);
  await check(a, 'Parent - Private');
  const partial = message('Now switch to Parent');
  fs.appendFileSync(sessionFile, partial.slice(0, 40));
  await new Promise(resolve => setTimeout(resolve, 1500));
  await check(a, 'Parent - Private');
  fs.appendFileSync(sessionFile, partial.slice(40) + '\n');
  await check(a, 'Parent');
  await vscode.commands.executeCommand('codexRepoCompanion.assignRepository', a, parentUri);
  fs.appendFileSync(sessionFile, message('Focus on Parent - Private') + '\n');
  await new Promise(resolve => setTimeout(resolve, 1500));
  await check(a, 'Parent');
  await vscode.commands.executeCommand('codexRepoCompanion.assignRepository', b, nestedUri);
  await config.update('pinManualLabels',false,vscode.ConfigurationTarget.Workspace);
  fs.appendFileSync(sessionFile,message('Focus on Parent - Private')+'\n');
  await new Promise(resolve=>setTimeout(resolve,1200));
  await check(a,'Parent'); // Existing pins are not released by changing a preference.
  await vscode.commands.executeCommand('codexRepoCompanion.assignRepository',a,parentUri);
  await new Promise(resolve=>setTimeout(resolve,1200));
  await check(a,'Parent'); // Old discussion must not immediately undo a manual correction.
  assert.match((await vscode.commands.executeCommand('codexRepoCompanion.diagnostics')).labelExplanation,/Manual correction/);
  await sendScope(a,[nestedUri.fsPath]);
  await check(a,'Parent - Private');
  await vscode.commands.executeCommand('codexRepoCompanion.setCustomLabel',a,'Temporary note');
  await check(a,'Temporary note');
  await new Promise(resolve=>setTimeout(resolve,400));
  await check(a,'Temporary note');
  fs.appendFileSync(sessionFile,message('Focus on Parent')+'\n');
  await check(a,'Parent');

  await config.update('repositoryAliases',{[nestedUri.fsPath]:'Private Project'},vscode.ConfigurationTarget.Workspace);
  fs.appendFileSync(sessionFile,message('Work on Private Project')+'\n');
  await check(a,'Private Project');
  await vscode.commands.executeCommand('repoCompanion.testSidebar.focus');
  await sidebar.webview.postMessage({type:'fixture:navigate',path:a.path});
  await until(async()=> (await probe()).title==='[Private Project] Review fixture','alias renders in sidebar');
  const aliased=await probe();
  assert.match(aliased.titleTooltip,/detected from your chat message/);
  assert.ok(aliased.titleTooltip.includes(nestedUri.fsPath));
  assert.ok(aliased.historyTooltip.includes(nestedUri.fsPath));
  await sidebar.webview.postMessage({type:'fixture:menu',target:'title'});
  await until(async()=> (await probe()).menu.some(item=>item.label==='Private Project'),'alias appears in repository dropdown');
  await sidebar.webview.postMessage({type:'fixture:escape'});
  await config.update('pinManualLabels',true,vscode.ConfigurationTarget.Workspace);
  await vscode.commands.executeCommand('codexRepoCompanion.assignRepository',a,nestedUri);
  await until(async()=> (await probe()).titleTooltip.includes('(pinned)'),'hover updates when unchanged label is pinned');
  await config.update('repositoryAliases',{},vscode.ConfigurationTarget.Workspace);
  await until(async()=> (await probe()).title==='[Parent - Private] Review fixture','removing alias refreshes existing pinned labels');
  // Exercise real webview DOM with single/empty catalogs; commands still use real Git.
  for (const repos of [[{root:parentUri.toString(),label:'Parent',description:parentUri.fsPath}],[]]) {
    await sidebar.webview.postMessage({type:'fixture:catalog',repos});
    await sidebar.webview.postMessage({type:'fixture:menu',target:'title'});
    await until(async()=> (await probe()).menu.some(item=>item.action==='applyCustom'),'single/empty catalog offers inline custom input');
    assert.equal((await probe()).menu.some(item=>item.root),false);
    await sidebar.webview.postMessage({type:'fixture:filter',value:'[invalid]'});
    await sidebar.webview.postMessage({type:'fixture:enter'});
    assert.equal((await probe()).menuOpen,true,'invalid custom label keeps popup open');
    await sidebar.webview.postMessage({type:'fixture:filter',value:'Inline planning'});
    await sidebar.webview.postMessage({type:'fixture:enter'});
    await check(a,'Inline planning');
    await until(async()=>!(await probe()).menuOpen,'Enter applies and closes');
    await sidebar.webview.postMessage({type:'fixture:catalog',repos});
    await sidebar.webview.postMessage({type:'fixture:menu',target:'title'});
    await until(async()=> (await probe()).menuInput==='Inline planning','custom label is prefilled');
    await sidebar.webview.postMessage({type:'fixture:escape'});
  }
  const {resolveRouting}=require('../dist/routing');
  const {readProfiles}=require('../dist/routing-config');
  const mainFile=path.join(root,'shared-AGENTS.md');fs.writeFileSync(mainFile,'Shared fixture instructions');
  const fallbackFile=path.join(nestedUri.fsPath,'TEAM_GUIDE.md');fs.writeFileSync(fallbackFile,'Nested fixture rules');
  await config.update('mainInstructionsFile',mainFile,vscode.ConfigurationTarget.Workspace);
  await config.update('instructionScope',[parentUri.fsPath],vscode.ConfigurationTarget.Workspace);
  await config.update('instructionFallbackNames',['TEAM_GUIDE.md'],vscode.ConfigurationTarget.Workspace);
  await config.update('instructionRouting',true,vscode.ConfigurationTarget.Workspace);
  await vscode.commands.executeCommand('codexRepoCompanion.assignRepository',a,nestedUri);
  await until(async()=> require('../dist/model').sameRoot((await resolveRouting([],process.env.CODEX_HOME,a.path.slice(7))).roots?.[0] ?? '',nestedUri.fsPath),'routing receives labeled repository');
  const routed=await resolveRouting([],process.env.CODEX_HOME,a.path.slice(7));
  assert.equal(routed.instructions[0],mainFile);
  assert.ok(routed.instructions.some(file=>require('../dist/model').sameRoot(file,fallbackFile)),'configured fallback filename is resolved by the live helper');
  assert.ok(require('../dist/model').sameRoot((await resolveRouting(['--target',parentUri.fsPath],process.env.CODEX_HOME,a.path.slice(7))).roots[0],parentUri.fsPath),'explicit focus overrides the nested label');
  await config.update('instructionFallbackNames',['../invalid.md'],vscode.ConfigurationTarget.Workspace);
  await until(async()=> {
    try { await resolveRouting(['--target',nestedUri.fsPath],process.env.CODEX_HOME,a.path.slice(7)); return false; }
    catch(error) { return /invalid saved routing/.test(error.message); }
  },'invalid configuration blocks the old policy');
  await config.update('instructionFallbackNames',['TEAM_GUIDE.md'],vscode.ConfigurationTarget.Workspace);
  await until(async()=> {
    try { return (await resolveRouting(['--target',nestedUri.fsPath],process.env.CODEX_HOME,a.path.slice(7))).enabled; }
    catch { return false; }
  },'correcting configuration restores routing');
  await vscode.commands.executeCommand('codexRepoCompanion.setCustomLabel',a,'Unassociated custom');
  assert.deepEqual((await resolveRouting([],process.env.CODEX_HOME,a.path.slice(7))).roots,[],'custom text does not reuse stale repo routing');
  await config.update('instructionScope',[],vscode.ConfigurationTarget.Workspace);
  const addedFolder=path.join(root,'workspace-addition');fs.mkdirSync(addedFolder,{recursive:true});
  assert.ok(vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders.length,0,{uri:vscode.Uri.file(addedFolder)}));
  await until(async()=> (await readProfiles(process.env.CODEX_HOME)).some(profile=>profile.scopes.some(scope=>require('../dist/model').sameRoot(scope,addedFolder))), 'workspace addition refreshes durable scope without a Git event');
  // The persisted workspace file can update before the extension host receives its folder event.
  await until(async()=>vscode.workspace.workspaceFolders.some(folder=>require('../dist/model').sameRoot(folder.uri.fsPath,addedFolder)), 'workspace addition reaches the extension host before removal');
  const addedIndex=vscode.workspace.workspaceFolders.findIndex(folder=>require('../dist/model').sameRoot(folder.uri.fsPath,addedFolder));
  assert.ok(vscode.workspace.updateWorkspaceFolders(addedIndex,1));
  await until(async()=> (await readProfiles(process.env.CODEX_HOME)).every(profile=>!profile.scopes.some(scope=>require('../dist/model').sameRoot(scope,addedFolder))), 'workspace removal refreshes durable scope');
  await config.update('instructionScope',[parentUri.fsPath],vscode.ConfigurationTarget.Workspace);
  await config.update('instructionRouting',false,vscode.ConfigurationTarget.Workspace);
  await until(async()=>(await resolveRouting(['--target',nestedUri.fsPath],process.env.CODEX_HOME,a.path.slice(7))).status==='disabled','disabling routing publishes an explicit off state');
  const savedProfile=(await readProfiles(process.env.CODEX_HOME))[0];
  assert.equal(savedProfile.enabled,false);
  assert.deepEqual(savedProfile.scopes,[parentUri.fsPath]);
  assert.deepEqual(savedProfile.fallbackNames,['TEAM_GUIDE.md']);
  await config.update('pinManualLabels',false,vscode.ConfigurationTarget.Workspace);
  await vscode.commands.executeCommand('codexRepoCompanion.setCustomLabel',a,'Resume correction');
  await config.update('pinManualLabels',true,vscode.ConfigurationTarget.Workspace);
  await check(a,'Resume correction');
  assert.equal((await vscode.commands.executeCommand('codexRepoCompanion.diagnostics')).scopeMode,'auto','preference changes affect only future choices');
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.deepEqual(git.repositories.filter(repo => repo.ui.selected).map(repo => repo.rootUri.toString()), selectedBefore, 'SCM selection is unchanged');
  assert.equal(selections.filter(item => item.selected).length, 0, 'no intermediate SCM selection events');
  await vscode.commands.executeCommand('codexRepoCompanion.toggleStar',a);
  const result = { phase, vscode: vscode.version, passed: true,
    verified: ['star/unstar clicked chat independently of labels, real popup, marker and restart persistence', 'pin preference preserves existing overrides, non-pinned corrections wait for fresh evidence, alias detection/menu/display and hover explanations', 'custom labels without Git roots, persistence, edit, report protection, repository/Auto/Clear replacement', 'New Chat menu forwards once to Codex command without reassigning labels', 'direct dropdown on titles and history, filtering, Escape, route dismissal, exact clicked identity', 'latest project replaces previous labels', 'direct user-message detection without helper', 'partial appends and IDE context ignored', 'detection opt-out and pins', 'multiple current projects', 'sidebar header and history', 'history menu targets clicked chat with no active chat or a different active chat', 'draft and focus preservation', 'pins, Auto, Clear', 'prefix setting', 'unchanged provider titles', 'no Source Control selection events', 'no workbench patch', 'restart persistence'],
    scope: 'Real VS Code and Git with fixture conversations; no authenticated Codex conversation.' };
  fs.writeFileSync(path.join(root, `result-${phase}.json`), JSON.stringify(result, null, 2));
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  for (const subscription of subscriptions.reverse()) { subscription.dispose(); }
}

exports.run = async () => {
  try { await run(); }
  catch (error) {
    console.error(error.stack);
    fs.writeFileSync(path.join(process.env.REPO_COMPANION_TEST_ROOT, 'failure.txt'), error.stack);
    throw error;
  }
};
