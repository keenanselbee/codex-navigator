'use strict';
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function until(check, description) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error('Timed out: ' + description);
}

exports.run = async function (context, fixtureVscode) {
  const root = process.env.REPO_COMPANION_TEST_ROOT;
  let companion, companionProvider, companionContext, probeResolve, fixture, selected, fixtureLoaded = false;
  const stateLog=[];
  let hooksReady = process.env.REPO_COMPANION_TEST_PHASE === 'restart';
  const id = i => '00000000-0000-0000-0000-' + String(i).padStart(12, '0');
  try {
    fs.writeFileSync(path.join(process.env.CODEX_HOME, 'session_index.jsonl'), Array.from({ length: 12 }, (_, i) => JSON.stringify({
      id: id(i + 1), thread_name: i === 11 ? '<script>Fixture twelve with a longer title</script>' : 'Fixture chat ' + (i + 1),
      updated_at: new Date(Date.UTC(2026, 8, 12, 12, i)).toISOString(),
    })).join('\n'));
    const activityTranscript=path.join(process.env.CODEX_HOME,'sessions','2026','09','12','rollout-'+id(12)+'.jsonl');
    fs.mkdirSync(path.dirname(activityTranscript),{recursive:true});
    fs.writeFileSync(activityTranscript,JSON.stringify({type:'session_meta',payload:{id:id(12),cwd:root,source:'vscode'}})+'\n');
    // Add test probes to our own view, never to the shipped payload or Codex files.
    const { ChatSidebar } = require('../dist/chat-sidebar');
    const { ChatGoals } = require('../dist/chat-goals');
    const { readRecentConversations } = require('../dist/history');
    let nativeRecent = await readRecentConversations(process.env.CODEX_HOME);
    let releaseMetadata;
    const metadataGate=new Promise(resolve=>{releaseMetadata=resolve;});
    ChatGoals.prototype.readRecency = async function() { await metadataGate; return nativeRecent; };
    const { RuntimeActivity } = require('../dist/activity-runtime');
    let fixtureGoal = { status: 'paused', objective: 'Fixture goal <safe text>', tokensUsed: 42, tokenBudget: 100 };
    let goalReads=0, goalWrites=0;
    ChatGoals.prototype.read = async function(ids) { goalReads++; return ids.includes(id(12)) ? { [id(12)]: fixtureGoal } : {}; };
    RuntimeActivity.prototype.changeGoal = async function(threadId, expected) {
      goalWrites++;
      assert.equal(threadId, id(12)); assert.equal(expected.status, fixtureGoal.status);
      fixtureGoal = { ...fixtureGoal, status: expected.status === 'active' ? 'paused' : 'active' }; return fixtureGoal;
    };
    const original = ChatSidebar.prototype.resolveWebviewView;
    ChatSidebar.prototype.resolveWebviewView = function (view) {
      this.activityReady = async () => ({ready:hooksReady,message:'Open Hook Review and trust all Navigator hooks.'});
      original.call(this, view); companionProvider = this; companion = view; companionContext = this.context;
      const post=view.webview.postMessage.bind(view.webview);view.webview.postMessage=message=>{if(message.type==='state'){stateLog.push({welcome:message.welcome,rows:message.rows.length,setupMessage:message.setupMessage});}return post(message);};
      view.webview.onDidReceiveMessage(message => { if (message.type === 'fixture:probe') probeResolve?.(message); if (message.type === 'fixture:loaded') fixtureLoaded = true; });
      const nonce = /nonce="([a-f0-9]+)"/.exec(view.webview.html)[1];
      view.webview.html = view.webview.html.replace('</body>', `<script nonce="${nonce}">
        let menuContext;
        document.addEventListener('contextmenu', event => {
          const row=event.target.closest('.chat, .repository');
          if(row){menuContext=JSON.parse(row.dataset.vscodeContext);event.preventDefault();}
        },true);
        window.addEventListener('message', event => {
          const m=event.data;
          if(m.type==='fixture:probe') api.postMessage({type:'fixture:probe', licenseVisible:!el('licensePage').hidden,licenseText:el('licenseStatus').textContent, welcome:!el('welcomePage').hidden,setupMessage:el('setupMessage').textContent,skipPresent:!!el('continueWithoutSetup')||!!el('dismissActivityPrompt'),rows:document.querySelectorAll('.chat').length,
            ids:[...document.querySelectorAll('.chat')].map(n=>JSON.parse(n.dataset.vscodeContext).navigatorChatId),pinOrder:[...(document.querySelector('.label-row')?.children || [])].map(n=>n.className),text:document.getElementById('chats').textContent, label:document.querySelector('.label')?.textContent,repositoryPageHidden:document.getElementById('repositoryPage').hidden,repositoryRoots:[...document.querySelectorAll('.repository')].map(n=>n.dataset.root),customMenuPresent:!!document.getElementById('contextMenu'),
            colour:document.querySelector('.label')?getComputedStyle(document.querySelector('.label')).color:null,
            starColour:document.querySelector('.star')?getComputedStyle(document.querySelector('.star')).color:null,
            selectionTimes:Object.fromEntries(selectedChats),selectionDelays:Object.fromEntries([...document.querySelectorAll('.chat.selected')].map(n=>[JSON.parse(n.dataset.vscodeContext).navigatorChatId,getComputedStyle(n).animationDelay])),
            selectedCount:document.querySelectorAll('.chat.selected').length,selectedDuration:document.querySelector('.chat.selected')?getComputedStyle(document.querySelector('.chat.selected')).animationDuration:null,
            starCount:document.querySelectorAll('.star[aria-pressed=true]').length,
            starParent:document.querySelector('.star')?.parentElement.className,
            starOpacity:document.querySelector('.star')?getComputedStyle(document.querySelector('.star')).opacity:null,
            pinOpacity:document.querySelector('.pin')?getComputedStyle(document.querySelector('.pin')).opacity:null,
            controlHeights:[...document.querySelectorAll('.chat:first-child .star,.chat:first-child .pin')].map(n=>n.getBoundingClientRect().height),
            spinnerStroke:document.querySelector('.spinner')?getComputedStyle(document.querySelector('.spinner')).borderTopWidth:null,readyDots:document.querySelectorAll('.activity-dot.ready').length,
            pickerHidden:document.getElementById('colourPage').hidden,pickerHex:document.getElementById('colour-hex')?.value,
            pickerNative:document.getElementById('colour-native')?.value,pickerDisabled:document.getElementById('colour-apply')?.disabled,
            pickerNoColour:el('colour-native')?.classList.contains('no-colour'),pickerPreview:el('colour-preview')?.style.color,
            paletteCount:document.querySelectorAll('.colour-swatch').length,paletteFooterGap:document.querySelector('.colour-footer')?.getBoundingClientRect().top-el('colour-palette')?.getBoundingClientRect().bottom,pickerTarget:el('colour-target')?.textContent,
            starSize:document.querySelector('.star')?parseFloat(getComputedStyle(document.querySelector('.star')).fontSize):0,
            actions:document.querySelectorAll('.actions').length,spinners:document.querySelectorAll('.spinner').length,
            nameOrder:[...document.querySelector('.name')?.querySelectorAll('.open,.star,.goal,.spinner')||[]].map(item=>item.className),
            goalStatus:document.querySelector('.goal')?.dataset.status,goalTitle:document.querySelector('.goal')?.title,
            spinnerWidth:document.querySelector('.spinner')?parseFloat(getComputedStyle(document.querySelector('.spinner')).width):0,
            iconCentres:[...document.querySelector('.indicators')?.children||[]].map(item=>{const r=item.getBoundingClientRect();return r.top+r.height/2;}),
            separators:[...document.querySelectorAll('.separator-right')].map(item=>({width:getComputedStyle(item,'::after').width,pointer:getComputedStyle(item,'::after').pointerEvents})),
            ids:[...document.querySelectorAll('.chat')].map(item=>JSON.parse(item.dataset.vscodeContext).navigatorChatId),
            fits:[...document.querySelectorAll('.chat')].every(item=>{const r=item.getBoundingClientRect(),v=document.getElementById('viewport').getBoundingClientRect();return r.bottom<=v.bottom+0.5&&r.right<=v.right+0.5&&r.left>=v.left-0.5;}),
            scrollHeight:document.getElementById('viewport').scrollHeight,viewportHeight:document.getElementById('viewport').clientHeight,
            overflow:getComputedStyle(document.getElementById('viewport')).overflowY,more:!!document.getElementById('more'),
            titleHeight:document.querySelector('.title')?.getBoundingClientRect().height,titleLineHeight:parseFloat(getComputedStyle(document.querySelector('.title')||document.body).lineHeight),
            titleOverflow: getComputedStyle(document.querySelector('.title')||document.body).textOverflow,
            titleTruncated: document.querySelector('.title')?.scrollWidth > document.querySelector('.title')?.clientWidth,
            positions:[...document.querySelectorAll('.chat')].map(item=>{const r=item.getBoundingClientRect();return {left:r.left,top:r.top};}),
            message:document.getElementById('message').textContent,dots:document.querySelectorAll('.activity-dot').length, stars:document.querySelector('.star')?.textContent,
            layout:document.body.dataset.layout, columns:getComputedStyle(document.getElementById('chats')).gridTemplateColumns.split(' ').length,
            focus:document.activeElement?.dataset.focus, searchHidden:document.getElementById('searchBox').hidden,menuContext});
          if(m.type==='fixture:labelSize') {
            const row=document.querySelector('.chat'),label=row.querySelector('.label');
            const before=row.getBoundingClientRect().height,original=label.textContent,hover=label.title;
            label.textContent='Context Suite - Context Suite - Private repository with a very long label';
            const after=row.getBoundingClientRect().height,style=getComputedStyle(label),bounds=row.getBoundingClientRect();
            const controls=[...row.querySelectorAll('.star,.pin')].every(n=>n.getBoundingClientRect().right<=bounds.right);
            api.postMessage({type:'fixture:probe',before,after,controls,hoverMatches:hover===original,nowrap:style.whiteSpace,ellipsis:style.textOverflow,truncated:label.scrollWidth>label.clientWidth});
            label.textContent=original;
          }
          if(m.type==='fixture:orderEnter') document.body.dispatchEvent(new Event('pointerenter'));
          if(m.type==='fixture:orderProbe') {
            const original=rows; const before=[...document.querySelectorAll('.chat')].map(item=>JSON.parse(item.dataset.vscodeContext).navigatorChatId);
            document.activeElement?.blur();document.body.dispatchEvent(new Event('pointerleave'));
            document.body.dispatchEvent(new Event('pointerenter'));
            rows=[...rows].reverse();render();
            const ids=()=>[...document.querySelectorAll('.chat')].map(item=>JSON.parse(item.dataset.vscodeContext).navigatorChatId);
            const inside=ids();
            document.getElementById('chats').dispatchEvent(new Event('pointerleave'));
            window.dispatchEvent(new Event('blur'));render();
            const padding=ids();
            document.body.dispatchEvent(new Event('pointerleave'));
            const outside=ids();rows=original;render();
            api.postMessage({type:'fixture:probe',before,inside,padding,outside});
          }
          if(m.type==='fixture:input'){const input=document.querySelector(m.selector);input.value=m.value;input.dispatchEvent(new Event('input'));}
          if(m.type==='fixture:click') document.querySelector(m.selector)?.click();
          if(m.type==='fixture:menu') document.querySelector(m.selector)?.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
          if(m.type==='fixture:key') document.querySelector(m.selector)?.dispatchEvent(new KeyboardEvent('keydown',{key:m.key,shiftKey:!!m.shiftKey,bubbles:true,cancelable:true}));
          if(m.type==='fixture:size'){document.body.style.width=m.width+'px';document.body.style.height=m.height+'px';resize();}
          if(m.type==='fixture:font') document.body.style.fontSize=m.size+'px';
          if(m.type==='fixture:focus') document.querySelector(m.selector)?.focus({focusVisible:true});
          if(m.type==='fixture:mouseFocus') document.querySelector(m.selector)?.focus({focusVisible:false});
          if(m.type==='fixture:mouseClick') document.querySelector(m.selector)?.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
          if(m.type==='fixture:leave'){document.activeElement?.blur();document.body.dispatchEvent(new Event('pointerleave'));}
          if(m.type==='fixture:search'){document.getElementById('search').value=m.value;document.getElementById('search').dispatchEvent(new Event('input'));}
        });api.postMessage({type:'fixture:loaded'});</script></body>`);
    };
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('codexNavigator.testSidebar', {
      resolveWebviewView(view) { fixture = view; view.webview.html = '<html><body>Unpatched conversation fixture</body></html>'; },
    }), fixtureVscode.window.registerUriHandler({
      async handleUri(uri) {
        selected = uri;
        await vscode.commands.executeCommand('codexNavigator.testSidebar.focus');
        fixture.webview.html = '<html><body>Selected ' + uri.path + '</body></html>';
      },
    }));
    await vscode.workspace.getConfiguration('extensions').update('confirmedUriHandlerExtensionIds', ['openai.chatgpt'], vscode.ConfigurationTarget.Global);
    const git = (await vscode.extensions.getExtension('vscode.git').activate()).getAPI(1);
    await git.openRepository(vscode.Uri.file(path.join(root,'parent')));
    await git.openRepository(vscode.Uri.file(path.join(root,'parent','private')));
    await until(()=>git.repositories.length===2,'multi-repo workspace');
    const extension = vscode.extensions.getExtension('keenanselbee.codex-navigator');
    await extension.activate();
    const migratedHighlights = vscode.workspace.getConfiguration('codexNavigator');
    assert.equal(migratedHighlights.inspect('highlightOnlyLastViewedChat').workspaceValue, undefined, 'old workspace highlight switch removed');
    assert.equal(migratedHighlights.inspect('highlightMode').workspaceValue, 'recent', 'workspace highlight choice migrated');
    await vscode.commands.executeCommand('codexNavigator.chats.focus');
    await until(() => companion?.visible && fixtureLoaded, 'owned sidebar visible and test script loaded');
    assert.equal((await vscode.commands.getCommands(true)).includes('codexNavigator.bridge.setAssignments'), false, 'no Codex patch bridge');
    const probe = async () => {
      const result = new Promise(resolve => { probeResolve = resolve; });
      await companion.webview.postMessage({ type: 'fixture:probe' });
      return Promise.race([result, new Promise((_, reject) => setTimeout(() => reject(new Error('Probe timeout')), 2000))]);
    };
    if (process.env.REPO_COMPANION_TEST_PHASE === 'restart') {
      const expected = JSON.parse(fs.readFileSync(path.join(root, 'trial-persistence.json'), 'utf8'));
      const persisted = JSON.parse(await companionContext.secrets.get('license.production.v1'));
      assert.equal(persisted.installationId, expected.installationId, 'restart retains the installation identity');
      assert.equal(persisted.trialStartedAt, expected.trialStartedAt, 'restart does not start another trial');
      await until(async()=>{const p=await probe();return !p.licenseVisible&&p.rows>0;}, 'restart immediately restores admitted chat view');
      const { createLicenseService } = require('../dist/license-service');
      const service = createLicenseService({ directory: companionContext.globalStorageUri.fsPath, secrets: companionContext.secrets });
      await assert.rejects(service.manager.startTrial(), 'repeated start cannot replace the protected record');
      assert.equal((await service.manager.status()).endsAt, expected.trialStartedAt + 7*86400000);
      releaseMetadata();
      const secondary = path.join(root, 'test-secondary.code-workspace');
      fs.copyFileSync(path.join(root, 'test.code-workspace'), secondary);
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(secondary), { forceNewWindow: true });
      const windowMarker = name => path.join(root, 'license-window-' + name + '.json');
      const windowReached = name => {
        if (fs.existsSync(windowMarker('failed'))) throw new Error(fs.readFileSync(windowMarker('failed'), 'utf8'));
        return fs.existsSync(windowMarker(name));
      };
      await until(() => windowReached('ready'), 'second real VS Code window shares the installation');
      const originalRecord = await companionContext.secrets.get('license.production.v1');
      const expiredRecord = { ...JSON.parse(originalRecord), trialStartedAt: Date.now()-8*86400000, observedAt: Date.now() };
      await companionContext.secrets.store('license.production.v1', JSON.stringify(expiredRecord));
      await until(() => windowReached('expired'), 'expiry propagates through SecretStorage to both windows');
      await companionContext.secrets.store('license.production.v1', originalRecord);
      await until(() => windowReached('passed'), 'access restoration propagates to the second window');
      fs.writeFileSync(path.join(root, 'result-restart.json'), JSON.stringify({ phase:'restart', passed:true, vscode:vscode.version,
        verified:['protected record survives real VS Code process restart', 'same installation and original trial deadline', 'no second trial', 'startup chat view restored before live metadata', 'second real window shares installation and observes expiry and restoration'],
        scope:'Same isolated local profile after full host exit. No uninstall/reinstall or paid provider requests.' }, null, 2));
      return;
    }
    await until(async()=>(await probe()).licenseVisible,'first-use license screen requires explicit trial start');
    assert.equal((await probe()).rows,0,'no chats before trial admission');
    await vscode.commands.executeCommand('codexNavigator.searchChats');
    assert.equal((await probe()).licenseVisible,true,'feature command remains gated');
    await companion.webview.postMessage({type:'fixture:click',selector:'#licenseTrial'});
    await until(async()=>(await probe()).welcome&&!(await probe()).licenseVisible,'explicit trial start opens first-use welcome screen');
    await companion.webview.postMessage({type:'fixture:size',width:320,height:100});
    assert.equal((await probe()).skipPresent,false,'setup has no bypass or dismiss control');
    assert.equal((await probe()).rows,0,'missing hooks hide saved chats');
    await companionContext.globalState.update('navigatorWelcome.v1',true);
    await companionContext.globalState.update('activityPrompt.dismissed',true);
    await companionProvider.refresh();
    assert.equal((await probe()).welcome,true,'old dismissals do not admit chats');
    hooksReady=true; await companionProvider.refresh();
    await until(async()=>!(await probe()).welcome,'verified hooks expose chats');
    try { await until(async () => {const p=await probe();return p.rows>0&&p.rows<8&&p.fits;}, 'only complete chats in a small view'); }
    catch(error) { throw new Error(error.message+' '+JSON.stringify({probe:await probe(),storedWelcome:companionContext.globalState.get('navigatorWelcome.v1'),stateLog:stateLog.slice(-15)})); }
    assert.ok((await probe()).text.includes('Fixture'),'local chat index renders before metadata or any Codex chat is opened');
    releaseMetadata();
    assert.equal((await probe()).more,false,'no Show more control');
    assert.equal((await probe()).overflow,'clip','no scroll container');
    await companion.webview.postMessage({type:'fixture:size',width:780,height:400});
    await until(async () => (await probe()).layout === 'list', 'tall list');
    await companion.webview.postMessage({type:'fixture:focus',selector:'.chat .open'});
    const firstFocus=(await probe()).focus;
    await companion.webview.postMessage({type:'fixture:size',width:780,height:240});
    await until(async () => {const p=await probe();return p.layout==='columns'&&p.columns===3;}, 'medium height columns');
    assert.equal((await probe()).focus,firstFocus,'resize preserves keyboard target');
    await companion.webview.postMessage({type:'fixture:size',width:780,height:100});
    await until(async () => {const p=await probe();return p.layout==='compact'&&p.columns===4;}, 'short compact grid');
    await companion.webview.postMessage({type:'fixture:size',width:700,height:185});
    await until(async () => {const p=await probe();return p.columns===3&&p.rows>=9&&p.fits;}, 'three columns near threshold with complete entries');
    const restoredRowCount=(await probe()).rows;
    fixtureLoaded=false;
    companion.webview.html += '\n<!-- reload layout persistence fixture -->';
    await until(()=>fixtureLoaded,'webview reload preserves its saved state');
    await companion.webview.postMessage({type:'fixture:size',width:700,height:500});
    await companion.webview.postMessage({type:'fixture:size',width:700,height:185});
    await until(async () => {const p=await probe();return p.columns===3&&p.rows===restoredRowCount&&p.fits;}, 'column and fitted row counts restored after webview reload');
    await companion.webview.postMessage({type:'fixture:size',width:320,height:100});
    await until(async () => (await probe()).columns===1,'narrow width prevents squeezed columns');
    for(const width of [210,280,350]) {
      await companion.webview.postMessage({type:'fixture:size',width,height:180});
      await until(async () => (await probe()).fits,'single-line entries fit at '+width);
      const p=await probe(); assert.ok(p.scrollHeight<=p.viewportHeight+1,'no clipped lower row');
      assert.ok(p.titleHeight>0&&p.titleHeight<=p.titleLineHeight+1,'title stays on one line at '+width);
      assert.equal(p.titleOverflow,'ellipsis','overflowing titles use an ellipsis');
      if(width===210) assert.ok(p.titleTruncated,'long title is truncated in a narrow view');
    }
    await companion.webview.postMessage({type:'fixture:font',size:24});
    await until(async () => {const p=await probe();return p.fits&&p.rows>0&&p.scrollHeight<=p.viewportHeight+1;},'large text refits without scrolling');
    await companion.webview.postMessage({type:'fixture:font',size:13});
    await companion.webview.postMessage({type:'fixture:size',width:1100,height:600});
    await until(async () => (await probe()).rows===12,'more than eight chats when space permits');
    const positions=(await probe()).positions;
    assert.equal(positions[0].top,positions[1].top,'first two chats share top row');
    assert.ok(positions[1].left>positions[0].left&&positions[2].top>positions[1].top,'left to right then down');
    await vscode.commands.executeCommand('codexNavigator.searchChats');
    await until(async () => !(await probe()).searchHidden,'native title search command');
    await companion.webview.postMessage({type:'fixture:click',selector:'#closeSearch'});
    assert.ok((await probe()).text.includes('<script>Fixture twelve with a longer title</script>'), 'titles render as text');
    const {repositoryColourKey}=require('../dist/colours');
    await until(()=>Object.keys(companionContext.globalState.get('automaticRepositoryColours.v1',{})).length===2,'automatic colours assigned to both repositories');
    const automatic=companionContext.globalState.get('automaticRepositoryColours.v1',{});
    assert.equal(new Set(Object.values(automatic)).size,2,'distinct automatic colours');
    const defaultTarget=vscode.Uri.from({scheme:'openai-codex',authority:'route',path:'/local/'+id(11)});
    await vscode.commands.executeCommand('codexNavigator.assignRepository',defaultTarget,vscode.Uri.file(path.join(root,'parent')));
    assert.equal(companionContext.workspaceState.get('repositoryModes.v1')['local/'+id(11)],'auto','multi-repo selections default to Auto');
    assert.deepEqual(companionContext.globalState.get('automaticRepositoryColours.v1'),automatic,'assigning a chat does not reshuffle colours');
    const noColourPick=companionProvider.pickColour({title:'Repository fixture',resetLabel:'Automatic',allowNone:true,initialNone:true,recent:[],repositories:Object.values(automatic)});
    await until(async()=>(await probe()).pickerHidden===false,'repository colour picker');
    await companion.webview.postMessage({type:'fixture:click',selector:'#colour-none'});
    await companion.webview.postMessage({type:'fixture:click',selector:'#colour-apply'});
    assert.equal(await noColourPick,'none','No colour is explicit, distinct from Automatic');
    const autoPick=companionProvider.pickColour({title:'Repository fixture',resetLabel:'Automatic',allowNone:true,initialNone:true,recent:[],repositories:[]});
    await until(async()=>(await probe()).pickerHidden===false,'reset repository colour picker');
    await companion.webview.postMessage({type:'fixture:click',selector:'#colour-reset'});
    assert.equal((await probe()).pickerNoColour,true,'automatic without a repository does not display the blue input fallback');
    assert.equal((await probe()).pickerPreview,'','automatic without a repository previews the default text colour');
    await companion.webview.postMessage({type:'fixture:click',selector:'#colour-apply'});
    assert.equal(await autoPick,null,'Automatic clears the override');
    const orderResult=new Promise(resolve=>{probeResolve=resolve;});
    await companion.webview.postMessage({type:'fixture:orderProbe'});
    const order=await orderResult;
    assert.deepEqual(order.inside,order.before,'updates do not reorder while inside Navigator');
    assert.deepEqual(order.padding,order.before,'leaving the chat grid or losing focus does not release the panel hold');
    assert.notDeepEqual(order.outside,order.before,'leaving Navigator releases the latest order');
    const target = vscode.Uri.from({ scheme: 'openai-codex', authority: 'route', path: '/local/' + id(12) });
    await vscode.commands.executeCommand('codexNavigator.setCustomLabel', target, 'Coloured project');
    await vscode.workspace.getConfiguration('codexNavigator').update('repositoryColours', { [path.join(root, 'parent')]: '#FF0000' }, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('codexNavigator.assignRepository', target, vscode.Uri.file(path.join(root, 'parent')));
    await until(async () => (await probe()).colour === 'rgb(255, 0, 0)', 'coloured label text without a patch');
    assert.equal((await probe()).dots, 0);
    assert.equal((await probe()).actions, 0, 'no ellipsis button');
    assert.equal((await probe()).starCount,0,'unstarred chats have no filled star');
    assert.equal((await probe()).starParent,'label-row','star follows the repository label');
    assert.equal((await vscode.commands.getCommands(true)).includes('codexNavigator.sidebar.star'),false,'sidebar context star removed');
    await companion.webview.postMessage({type:'fixture:focus',selector:'.chat .star'});
    await until(async ()=>(await probe()).starOpacity==='1','keyboard focus reveals outline');
    assert.equal((await probe()).stars,'\u2606','unstarred outline');
    await companion.webview.postMessage({type:'fixture:click',selector:'.chat .star'});
    await until(async () => (await probe()).starCount===1,'inline outline stars a chat');
    assert.equal((await probe()).starColour, 'rgb(255, 0, 0)', 'star inherits chat colour');
    assert.equal((await probe()).starSize, 20, 'larger star');
    assert.deepEqual((await probe()).controlHeights,[18,18],'star and pin hit areas have equal height');
    await companion.webview.postMessage({ type: 'fixture:click', selector: '.chat .star' });
    await until(async () => (await probe()).starCount === 0, 'unstar restores outline');
    await companion.webview.postMessage({type:'fixture:click',selector:'.chat .star'});
    await until(async () => (await probe()).starCount === 1, 'star restored inline');
    await companion.webview.postMessage({type:'fixture:mouseFocus',selector:'.chat .star'});
    await companion.webview.postMessage({type:'fixture:mouseClick',selector:'.chat .star'});
    await until(async()=>(await probe()).starCount===0,'mouse click updates star');
    await until(async()=>(await probe()).pinOpacity==='0','mouse focus does not leave the empty pin visible');
    await companion.webview.postMessage({type:'fixture:click',selector:'.chat .star'});
    await until(async()=>(await probe()).starCount===1,'restore star after mouse-focus check');
    await companion.webview.postMessage({type:'fixture:menu',selector:'.chat:nth-child(2) .title'});
    const clickedContext=(await probe()).menuContext;
    assert.equal(clickedContext.navigatorChatId,id(11),'right-click resolves nested title to its own row');
    assert.equal(clickedContext.preventDefaultContextMenuItems,true);
    const navigatorUi=require.cache[require.resolve('../dist/chat-sidebar')].require('vscode');
    const renameInput=navigatorUi.window.showInputBox, nameNotice=navigatorUi.window.showInformationMessage;
    let originalNameShown;
    try {
      navigatorUi.window.showInputBox=async options=>{assert.match(options.prompt,/Fixture chat 11/);return 'My named chat';};
      navigatorUi.window.showInformationMessage=async text=>{originalNameShown=text;};
      await vscode.commands.executeCommand('codexNavigator.sidebar.rename',clickedContext);
      await until(async()=>(await probe()).text.includes('My named chat'),'Navigator displays custom chat name');
      await vscode.commands.executeCommand('codexNavigator.sidebar.originalName',clickedContext);
      assert.equal(originalNameShown,'Fixture chat 11','native action displays unchanged Codex title');
      await companion.webview.postMessage({type:'fixture:search',value:'Fixture chat 11'});
      await until(async()=>{const p=await probe();return p.rows===1&&p.text.includes('My named chat');},'original title remains searchable');
      await companion.webview.postMessage({type:'fixture:search',value:''});
      await vscode.commands.executeCommand('codexNavigator.sidebar.resetName',clickedContext);
      await until(async()=>{const p=await probe();return !p.text.includes('My named chat')&&p.rows>2;},'reset restores Codex title');
    } finally {navigatorUi.window.showInputBox=renameInput;navigatorUi.window.showInformationMessage=nameNotice;}

    await companion.webview.postMessage({type:'fixture:click',selector:'.chat:nth-child(2) .star'});
    assert.equal((await probe()).stars,'\u2605','background menu action preserves first row star');
    await companion.webview.postMessage({type:'fixture:key',selector:'.chat:nth-child(3) .open',key:'F10',shiftKey:true});
    assert.equal((await probe()).menuContext.navigatorChatId,id(10),'Shift+F10 targets focused row');
    await companion.webview.postMessage({type:'fixture:key',selector:'.chat:nth-child(4) .open',key:'ContextMenu'});
    assert.equal((await probe()).menuContext.navigatorChatId,id(9),'Menu key targets focused row');
    for (const height of [100,240,400]) {
      await companion.webview.postMessage({type:'fixture:size',width:2600,height});
      await until(async () => {const p=await probe();return p.columns>4&&p.fits;},'wide columns beyond four at height '+height);
    }
    for(const height of [140,240,400]) {
      await companion.webview.postMessage({type:'fixture:size',width:780,height});
      await until(async()=>(await probe()).rows>0,'rows ready for label measurement');
      const measured=new Promise(resolve=>{probeResolve=resolve;});
      await companion.webview.postMessage({type:'fixture:labelSize'});
      const result=await measured;
      assert.equal(result.after,result.before,'long labels never increase row height');
      assert.equal(result.nowrap,'nowrap');assert.equal(result.ellipsis,'ellipsis');
      assert.equal(result.truncated,true);assert.equal(result.controls,true);assert.equal(result.hoverMatches,true);
    }
    await companion.webview.postMessage({type:'fixture:size',width:780,height:140});
    const colourChoice=vscode.commands.executeCommand('codexNavigator.setChatColour',target);
    await until(async () => !(await probe()).pickerHidden,'colour options replace Navigator contents');
    assert.ok((await probe()).paletteCount>=32,'expanded palette plus presets');
    assert.ok(!(await probe()).pickerTarget.includes('local/'),'picker heading uses a chat title rather than an internal ID');
    await companion.webview.postMessage({type:'fixture:input',selector:'#colour-hex',value:'#abc'});
    await until(async () => (await probe()).pickerNative==='#aabbcc','hex synchronises picker');
    await companion.webview.postMessage({type:'fixture:input',selector:'#colour-hex',value:'invalid'});
    await until(async () => (await probe()).pickerDisabled,'invalid hex cannot be applied');
    await companion.webview.postMessage({type:'fixture:click',selector:'#colour-custom'});
    await companion.webview.postMessage({type:'fixture:input',selector:'#colour-hue',value:'120'});
    await until(async () => !(await probe()).pickerDisabled,'spectrum controls select valid colour');
    await companion.webview.postMessage({type:'fixture:input',selector:'#colour-hex',value:'#abc'});
    await companion.webview.postMessage({type:'fixture:click',selector:'#colour-apply'});
    await colourChoice;
    await until(async () => (await probe()).pickerHidden&&(await probe()).colour==='rgb(170, 187, 204)','apply returns to coloured chats');
    const cancelChoice=vscode.commands.executeCommand('codexNavigator.setChatColour',target);
    await until(async () => !(await probe()).pickerHidden,'reopen in-panel picker');
    await companion.webview.postMessage({type:'fixture:input',selector:'#colour-hex',value:'#f00'});
    await companion.webview.postMessage({type:'fixture:click',selector:'#colour-cancel'});await cancelChoice;
    await until(async () => (await probe()).pickerHidden&&(await probe()).colour==='rgb(170, 187, 204)','cancel preserves saved colour');
    await companion.webview.postMessage({type:'fixture:size',width:1100,height:600});
    await companion.webview.postMessage({type:'fixture:click',selector:'.goal'});
    await until(async () => (await probe()).goalStatus==='active'&&(await probe()).spinners===1,'running goal animates without activity hooks');
    assert.deepEqual((await probe()).nameOrder,['open','goal','spinner'],'goal-only spinner follows goal icon');
    assert.ok((await probe()).titleHeight <= (await probe()).titleLineHeight + 0.5,'goal and activity condense the title to one line');
    await companion.webview.postMessage({type:'fixture:click',selector:'.goal'});
    await until(async () => (await probe()).goalStatus==='paused'&&(await probe()).spinners===0,'pausing an idle goal removes its spinner');
    await companion.webview.postMessage({type:'fixture:click',selector:'.goal'});
    await until(async () => (await probe()).goalStatus==='active'&&(await probe()).spinners===1,'resuming restores goal animation');
    await companionContext.globalState.update('activityHooks.enabled',true);
    const { recordEvent } = require('../tools/chat-activity.cjs');
    await recordEvent(process.env.CODEX_HOME,{session_id:id(12),turn_id:'fixture-a',hook_event_name:'UserPromptSubmit'});
    await until(async () => (await probe()).spinners===1,'hook record starts spinner via watcher');
    await until(async () => (await probe()).goalStatus==='active','active goal appears');
    assert.equal((await probe()).spinnerWidth,10,'smaller spinner');
    const centres=(await probe()).iconCentres;assert.ok(Math.max(...centres)-Math.min(...centres)<0.5,'indicators share a centre');
    assert.ok((await probe()).separators.every(x=>x.width==='1px'&&x.pointer==='none'),'themed separators do not intercept clicks');
    await companion.webview.postMessage({type:'fixture:click',selector:'.goal'});
    await until(async () => (await probe()).goalStatus==='paused'&&(await probe()).spinners===1,'working turn retains its spinner when goal is paused');
    assert.ok((await probe()).goalTitle.includes('resume'));
    await companion.webview.postMessage({type:'fixture:click',selector:'.goal'});
    await until(async () => (await probe()).goalStatus==='active','resume goal');
    assert.deepEqual((await probe()).nameOrder,['open','goal','spinner'],'name, goal, spinner order');
    await recordEvent(process.env.CODEX_HOME,{session_id:id(11),turn_id:'fixture-b',hook_event_name:'UserPromptSubmit'});
    await until(async () => (await probe()).spinners===2,'simultaneous chat activity');
    fs.appendFileSync(activityTranscript,JSON.stringify({timestamp:new Date().toISOString(),type:'event_msg',payload:{type:'task_complete',turn_id:'fixture-a'}})+'\n');
    await recordEvent(process.env.CODEX_HOME,{session_id:id(12),turn_id:'fixture-a',hook_event_name:'Stop'});
    await until(async () => (await probe()).spinners===2&&(await probe()).readyDots===1,'active goal keeps spinning after turn completion');
    await companion.webview.postMessage({type:'fixture:click',selector:'.goal'});
    await until(async () => (await probe()).goalStatus==='paused'&&(await probe()).spinners===1,'pause clears only the goal spinner');
    await companion.webview.postMessage({ type:'fixture:click',selector:'.chat .open' });
    await until(async () => (await probe()).readyDots===0,'opening completed chat clears ready dot');
    await recordEvent(process.env.CODEX_HOME,{session_id:id(11),turn_id:'fixture-b',hook_event_name:'Interrupt'});
    await until(async () => (await probe()).spinners===0,'interruption clears spinner');
    await companion.webview.postMessage({type:'fixture:leave'});
    assert.equal((await probe()).ids[0],id(12),'background completion and interruption do not change native order');
    nativeRecent=[nativeRecent.find(row=>row.id===id(11)),...nativeRecent.filter(row=>row.id!==id(11))];
    await companionProvider.refresh();
    await until(async () => (await probe()).ids[0]===id(11),'native recency change updates Navigator');
    nativeRecent=undefined;
    await companionProvider.refresh();
    assert.equal((await probe()).ids[0],id(11),'native read failure preserves last order');
    await companion.webview.postMessage({ type: 'fixture:search', value: 'chat 3' });
    await until(async () => (await probe()).rows === 1, 'search older chats');
    await companion.webview.postMessage({ type: 'fixture:click', selector: '.chat .open' });
    try { await until(() => selected?.path === '/local/' + id(3), 'VS Code dispatches selection through extension URI handler'); } catch (error) { throw new Error(error.message + ' ' + JSON.stringify(await probe()) + ' selected=' + selected?.toString()); }
    assert.equal(selected.authority, 'openai.chatgpt');
    await until(async()=>(await probe()).selectedCount===1,'successful navigation highlights one chat');
    assert.equal((await probe()).selectedDuration,'180s');
    const olderVisit=Date.now()-90000;
    await companion.webview.postMessage({type:'selectedChat',id:id(3),at:olderVisit});
    await companion.webview.postMessage({type:'fixture:search',value:''});
    await until(async()=>(await probe()).rows>1,'show visited chats together');
    await companion.webview.postMessage({type:'fixture:click',selector:'.open[data-focus="'+id(4)+':open"]'});
    await until(async()=>Number.isFinite((await probe()).selectionTimes[id(4)]),'second chat receives its own timer');
    let visits=await probe();assert.equal(visits.selectionTimes[id(3)],olderVisit,'new visit preserves older timer');
    assert.ok(parseFloat(visits.selectionDelays[id(3)])<=-90,'rerender continues older fade');
    const fourthVisit=visits.selectionTimes[id(4)];
    await companion.webview.postMessage({type:'fixture:click',selector:'.open[data-focus="'+id(3)+':open"]'});
    await until(async()=>(await probe()).selectionTimes[id(3)]>olderVisit,'revisiting refreshes its timer');
    visits=await probe();assert.equal(visits.selectionTimes[id(4)],fourthVisit,'revisit preserves other timer');
    const highlightConfig=vscode.workspace.getConfiguration('codexNavigator');
    await highlightConfig.update('highlightMode','last',vscode.ConfigurationTarget.Workspace);
    await until(async()=>(await probe()).selectedCount===1,'last-only mode applies without reload');
    assert.ok(Object.hasOwn((await probe()).selectionDelays,id(3)),'only latest visit highlighted');
    await highlightConfig.update('highlightMode','off',vscode.ConfigurationTarget.Workspace);
    await until(async()=>(await probe()).selectedCount===0,'master switch disables highlights');
    await highlightConfig.update('highlightMode','recent',vscode.ConfigurationTarget.Workspace);
    await until(async()=>(await probe()).selectedCount>=2,'all recent visits restored');
    assert.equal((await probe()).selectionTimes[id(4)],fourthVisit,'changing display settings preserves timers');

    await highlightConfig.update('highlightDurationSeconds',600,vscode.ConfigurationTarget.Workspace);
    await until(async()=>(await probe()).selectedDuration==='600s','configured duration applies without reload');
    const fiveMinutesAgo=Date.now()-300000;
    await companion.webview.postMessage({type:'selectedChat',id:id(4),at:fiveMinutesAgo});
    await until(async()=>(await probe()).selectionTimes[id(4)]===fiveMinutesAgo,'longer duration retains a visit beyond three minutes');
    await highlightConfig.update('highlightDurationSeconds',60,vscode.ConfigurationTarget.Workspace);
    await until(async()=>(await probe()).selectionTimes[id(4)]===undefined,'shorter duration expires older visits without restarting timers');
    await highlightConfig.update('highlightDurationSeconds',180,vscode.ConfigurationTarget.Workspace);
    await until(async()=>(await probe()).selectedDuration==='180s','default duration restored');

    await companion.webview.postMessage({type:'selectedChat',id:id(4),at:Date.now()-180001});
    await until(async()=>(await probe()).selectionTimes[id(4)]===undefined,'expired visit is removed');
    assert.equal(fixture.visible, true, 'conversation appears in sidebar');
    assert.equal(companion.visible, true, 'Navigator stays visible in same sidebar container');
    await companion.webview.postMessage({type:'fixture:search',value:''});
    await until(async()=>(await probe()).ids.includes(id(4)),'pin target visible');
    const pinnedPosition=(await probe()).ids.indexOf(id(4));
    await companion.webview.postMessage({type:'fixture:click',selector:'.pin[data-focus="'+id(4)+':pin"]'});
    await until(()=>companionContext.globalState.get('pinnedChats.v1',{})[id(4)],'pin persisted');
    assert.deepEqual((await probe()).pinOrder,['label','star','pin'],'pin follows star');
    await companion.webview.postMessage({type:'fixture:leave'});
    nativeRecent=(await readRecentConversations(process.env.CODEX_HOME)).filter(row=>row.id!==id(4)).reverse();
    await companionProvider.refresh();
    await until(async()=>(await probe()).ids.indexOf(id(4))===pinnedPosition,'missing old pinned chat keeps its slot');
    nativeRecent.push({id:id(4),title:'Old pinned chat',updatedAt:'2026-01-01T00:00:00Z',recencyAt:Date.now()-172800000});
    const seen=companionContext.globalState.get('activitySeen.v1',{});delete seen[id(4)];await companionContext.globalState.update('activitySeen.v1',seen);
    await companionProvider.refresh();
    await until(async()=>(await probe()).text.includes('Old pinned chat'),'pin bypasses 24-hour filter');
    await companion.webview.postMessage({type:'fixture:click',selector:'.pin[data-focus="'+id(4)+':pin"]'});
    await until(async()=>!(await probe()).ids.includes(id(4)),'unpin restores age filtering');
    await companion.webview.postMessage({type:'fixture:menu',selector:'.chat .title'});
    const repoMenu=await probe();assert.equal(repoMenu.customMenuPresent,false,'menu is owned by VS Code, outside the webview');
    const selectedId=repoMenu.menuContext.navigatorChatId;
    const originalPicker=vscode.window.showQuickPick;let offered;
    try {
      vscode.window.showQuickPick=async items=>{offered=await items;return offered[1];};
      await vscode.commands.executeCommand('codexNavigator.sidebar.repositories',repoMenu.menuContext);
    } finally { vscode.window.showQuickPick=originalPicker; }
    assert.equal(offered.length,2,'repository picker includes both workspace Git roots');
    await until(()=>companionContext.workspaceState.get('repositoryAssignments.v1',{})['local/'+selectedId]?.root===offered[1].assignment.root,'native repository command preserves clicked chat identity');
    await vscode.commands.executeCommand('codexNavigator.showRepositoryColours');
    await until(async()=>!(await probe()).repositoryPageHidden&&(await probe()).repositoryRoots.length===2,'repository colours replaces chat contents');
    const colourRoot=(await probe()).repositoryRoots[0];
    await companion.webview.postMessage({type:'fixture:menu',selector:'.repository'});
    const colourContext=(await probe()).menuContext;
    assert.equal(colourContext.webviewSection,'navigatorRepository');assert.equal(colourContext.navigatorRepositoryRoot,colourRoot);
    const colourCommand=vscode.commands.executeCommand('codexNavigator.sidebar.repositoryColour',colourContext);
    await until(async()=>!(await probe()).pickerHidden,'repository picker opens in panel');
    await companion.webview.postMessage({type:'fixture:input',selector:'#colour-hex',value:'#B56ADD'});
    await companion.webview.postMessage({type:'fixture:click',selector:'#colour-apply'});
    await colourCommand;
    await until(async()=>(await probe()).pickerHidden&&!(await probe()).repositoryPageHidden,'apply returns to repository list');
    await until(()=>vscode.workspace.getConfiguration('codexNavigator').get('repositoryColours',{})[repositoryColourKey(colourRoot)]==='#B56ADD','chosen repository colour saved');
    const repeatedColour=vscode.commands.executeCommand('codexNavigator.sidebar.repositoryColour',colourContext);
    await until(async()=>!(await probe()).pickerHidden,'reopen repository palette');
    assert.ok((await probe()).paletteFooterGap<=12,'controls stay beside the palette without a stretched gap');
    const red='.colour-swatch[data-colour="#E45B65"]';
    await companion.webview.postMessage({type:'fixture:click',selector:red});
    await until(async()=>(await probe()).pickerNative==='#e45b65','first swatch click previews');
    assert.equal((await probe()).pickerHidden,false);
    assert.equal(vscode.workspace.getConfiguration('codexNavigator').get('repositoryColours',{})[repositoryColourKey(colourRoot)],'#B56ADD','preview does not save');
    await companion.webview.postMessage({type:'fixture:click',selector:'.colour-swatch[data-colour="#E58C42"]'});
    await companion.webview.postMessage({type:'fixture:click',selector:red});
    assert.equal((await probe()).pickerHidden,false,'changing swatches resets confirmation');
    await companion.webview.postMessage({type:'fixture:click',selector:red});await repeatedColour;
    await until(async()=>(await probe()).pickerHidden&&!(await probe()).repositoryPageHidden,'second click applies and returns to repositories');
    assert.equal(vscode.workspace.getConfiguration('codexNavigator').get('repositoryColours',{})[repositoryColourKey(colourRoot)],'#E45B65');
    const alreadySelected=vscode.commands.executeCommand('codexNavigator.sidebar.repositoryColour',colourContext);
    await until(async()=>!(await probe()).pickerHidden,'reopening resets click confirmation');
    await companion.webview.postMessage({type:'fixture:click',selector:red});
    assert.equal((await probe()).pickerHidden,false,'initially selected colour still takes two clicks');
    await companion.webview.postMessage({type:'fixture:click',selector:'#colour-cancel'});await alreadySelected;
    await companion.webview.postMessage({type:'fixture:click',selector:'#repositoryBack'});
    await until(async()=>(await probe()).repositoryPageHidden&&(await probe()).rows>0,'back restores chats');
    const setupChecks = await require('./setup-integration.cjs').run(companionContext, vscode, until);
    const {hookReadiness,hookSetupStatus}=require('../dist/hook-setup');
    companionProvider.activityReady=async()=>hookReadiness(await hookSetupStatus(companionContext,process.env.CODEX_HOME,true));
    await companionProvider.refresh();
    await until(async()=>{const p=await probe();return p.welcome&&p.rows===0;},'removed hooks replace chats with setup');
    assert.match((await probe()).setupMessage,/Setup needs attention.*Install Navigator hooks/);
    companionProvider.activityReady=async()=>({ready:true,message:'Fixture hooks verified'});
    await companionProvider.refresh();
    await until(async()=>!(await probe()).welcome,'verified readiness restores preserved chats');

    // Only the disposable profile's real SecretStorage is altered by this test.
    // There is no shipping clock override or access bypass.
    const protectedKey='license.production.v1';
    const originalLicense=await companionContext.secrets.get(protectedKey);
    assert.ok(originalLicense,'trial persisted in VS Code SecretStorage');
    const trialRecord=JSON.parse(originalLicense);
    fs.writeFileSync(path.join(root,'trial-persistence.json'),JSON.stringify({installationId:trialRecord.installationId,trialStartedAt:trialRecord.trialStartedAt}));
    const expired=JSON.parse(originalLicense);
    expired.trialStartedAt=Date.now()-8*86400000; expired.observedAt=Date.now();
    fixtureGoal={...fixtureGoal,status:'active'};
    const savedStars=JSON.stringify(companionContext.workspaceState.get('starredChats.v1'));
    const savedLabels=JSON.stringify(companionContext.workspaceState.get('customLabels.v1'));
    const savedAssignments=JSON.stringify(companionContext.workspaceState.get('repositoryAssignments.v1'));
    const inputBox=vscode.window.showInputBox, quickPick=vscode.window.showQuickPick;
    let finishLabel, finishRepository;
    vscode.window.showInputBox=async()=>new Promise(resolve=>{finishLabel=()=>resolve('Must not apply after expiry');});
    vscode.window.showQuickPick=async items=>{const choices=await items;return new Promise(resolve=>{finishRepository=()=>resolve(choices[0]);});};
    const chatUri=vscode.Uri.parse('openai-codex://route/local/'+id(12));
    const pendingLabel=vscode.commands.executeCommand('codexNavigator.setCustomLabel',chatUri);
    const pendingRepository=vscode.commands.executeCommand('codexNavigator.assignRepository',chatUri);
    await until(()=>finishLabel&&finishRepository,'label and repository pickers opened before expiry');
    const writesBeforeExpiry=goalWrites;
    await companionContext.secrets.store(protectedKey,JSON.stringify(expired));
    await until(async()=>{const p=await probe();return p.licenseVisible&&p.rows===0&&p.licenseText.includes('trial has ended');},'expired trial replaces the entire Navigator view');
    try {
      finishLabel();finishRepository();
      await Promise.all([pendingLabel,pendingRepository]);
    } finally {vscode.window.showInputBox=inputBox;vscode.window.showQuickPick=quickPick;}
    assert.equal(JSON.stringify(companionContext.workspaceState.get('customLabels.v1')),savedLabels,'pending label input cannot apply after expiry');
    assert.equal(JSON.stringify(companionContext.workspaceState.get('repositoryAssignments.v1')),savedAssignments,'pending repository choice cannot apply after expiry');
    const readsAfterExpiry=goalReads;
    await companion.webview.postMessage({type:'action',id:id(12),action:'star'});
    await companion.webview.postMessage({type:'goal',id:id(12),goal:fixtureGoal});
    await vscode.commands.executeCommand('codexNavigator.toggleStar',vscode.Uri.parse('openai-codex://route/local/'+id(12)));
    await new Promise(resolve=>setTimeout(resolve,5200));
    assert.equal(goalReads,readsAfterExpiry,'expired Navigator stops goal metadata polling');
    assert.equal(goalWrites,writesBeforeExpiry,'expiry and stale controls never pause a Codex goal');
    assert.equal(fixtureGoal.status,'active');
    assert.equal(JSON.stringify(companionContext.workspaceState.get('starredChats.v1')),savedStars,'host command and stale webview actions cannot change saved stars');
    await companionContext.secrets.store(protectedKey,originalLicense);
    await until(async()=>(await probe()).licenseText.includes('trial is active'),'restoring the fixture entitlement refreshes the license screen');
    await companion.webview.postMessage({type:'fixture:click',selector:'#licenseBack'});
    await until(async()=>!(await probe()).licenseVisible&&(await probe()).rows>0,'regaining access restores unchanged chats');
    const result = { phase: 'initial', passed: true, vscode: vscode.version,
      verified: [...setupChecks, 'mandatory setup despite old dismissal flags', 'hook readiness controls chat admission', 'Navigator rename and original-title lookup/search/reset', 'natural visible count below and above eight', 'complete rows without scroll or Show more',
        'native recency order independent of activity', 'recency outage preserves order', 'whole-panel pointer ordering hold', 'safe title text', 'coloured label text', 'automatic distinct repository colours', 'multi-repo Auto default', 'Automatic versus No colour picker', 'star control', 'search',
        'height-driven layouts', 'width-dependent columns', 'resize preserves focus', 'column and fitted row counts survive webview reload', 'native header search',
        'native extension URI dispatch', 'both sidebar views visible', 'no patch bridge',
        'row context command dispatch', 'right-click/keyboard menu events', 'coloured stars beside repository labels',
        'no ellipsis control', 'outline stars on keyboard focus', 'more than four columns', 'in-panel colour palette and spectrum', 'hex validation and cancel', 'ready dot and acknowledgement', 'hook status watcher', 'spinner order', 'aligned goal controls and 10px spinner', 'goal pause/resume fixture', 'themed separators', 'single-line repository labels keep row heights and control space', 'pins preserve position and survive age/history filtering', 'simultaneous activity and stop/interrupt'],
      scope: 'Real isolated VS Code; fixture URI handler and synthetic hook events. Native-menu context data and command dispatch exercised with synthetic mouse/keyboard events; picker choices supplied by fixture. Native overlay appearance is not inspected. No authenticated Codex conversation.' };
    result.verified.push('explicit trial admission', 'protected trial record', 'expiry blocks host and webview actions', 'pending label and repository pickers cannot apply after expiry', 'expiry stops polling without pausing goals', 'saved data survives expiry');
    fs.writeFileSync(path.join(root, 'result-initial.json'), JSON.stringify(result, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(root, 'failure.txt'), error.stack || String(error)); throw error;
  }
};
