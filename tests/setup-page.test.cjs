const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(canUse){
 const writes=[],messages=[],values=new Map();let receive,closed,changed;
 const choices={main:'',scopes:[],fallbackNames:[],enabled:false};
 let activity={enabled:false,installed:false,nodeAvailable:true,trusted:undefined,label:'Not installed',home:'C:/test-home',detail:''};
 const uri=p=>({fsPath:p,scheme:'file',toString:()=>p});const disposable=()=>({dispose(){}});
 const panel={visible:true,reveal(){},dispose(){closed();},onDidDispose(fn){closed=fn;},webview:{cspSource:'test:',asWebviewUri:uri=>uri.toString(),postMessage:async m=>messages.push(m),onDidReceiveMessage(fn){receive=fn;return disposable();}}};
 const api={env:{},ViewColumn:{Active:1},ConfigurationTarget:{Workspace:2,Global:1},Uri:{joinPath:(base,...parts)=>uri(path.join(base.fsPath,...parts))},
 window:{createWebviewPanel:()=>panel,showOpenDialog:async()=>undefined},extensions:{getExtension:()=>undefined},
 workspace:{isTrusted:true,workspaceFolders:[{name:'Fixture',uri:uri('C:/project')}],getConfiguration:()=>({get:(_k,d)=>d,update:async(...args)=>writes.push(args)}),onDidChangeWorkspaceFolders:()=>disposable(),onDidChangeConfiguration:fn=>{changed=fn;return disposable();}},commands:{executeCommand:async(...args)=>writes.push(args)}};
 const exports={};vm.runInNewContext(fs.readFileSync(require.resolve('../dist/setup-page'),'utf8'),{exports,setInterval:()=>0,clearInterval(){},require:name=>{
  if(name==='vscode')return api;
  if(name==='./scope-store')return {codexHome:()=> 'C:/test-home'};
  if(name==='./agent-helper')return {prepareAgentHelper:()=>({instructions:'C:/AGENTS.md'}),labelHelperStatus:()=>({installed:false}),prepareLabelHelper:(home,enabled)=>({home,enabled}),installAgentHelper:plan=>writes.push(['labels',plan.home,plan.enabled])};
  if(name==='./routing-setup')return {routingChoices:()=>({...choices}),saveRoutingChoices:async()=>writes.push(['routing'])};
  if(name==='./routing-status')return {routingStatus:async()=>({label:'Ready',detail:'Ready'})};
  if(name==='./hook-setup')return {hookSetupStatus:async()=>activity,openHookReview:home=>writes.push(['review',home])};
  if(name==='./chat-activity')return {configureActivityHooks:async(...args)=>writes.push(['hooks',...args])};
  return name.startsWith('./')?require('../dist/'+name.slice(2)):require(name);
 }});
 const context={extensionPath:path.resolve(__dirname,'..'),extensionUri:uri(path.resolve(__dirname,'..')),subscriptions:[],globalState:{get:(k,d)=>values.get(k)??d,update:async(k,v)=>values.set(k,v)}};
 return {writes,messages,choices,api,values,panel,setActivity:value=>activity=value,open:()=>exports.openSetupPage(context,canUse),send:m=>receive(m),changed:()=>changed({affectsConfiguration:()=>true})};
}
test('expired access blocks enabling features but preserves hook and guidance removal',async()=>{
 const f=fixture(async()=>false);await f.open();await f.send({type:'ready'});
 for(const type of ['installHooks','enableAutomaticLabels','saveRouting'])await f.send({type,revision:1});
 assert.equal(f.writes.length,0,'no enabling side effects without access');
 assert.equal(f.messages.filter(m=>m.type==='error'&&m.text.includes('Start your trial')).length,3);
 await f.send({type:'disableHooks'});await f.send({type:'disableAutomaticLabels'});
 const revision=f.messages.filter(m=>m.type==='state').at(-1).revision;
 await f.send({type:'disableRouting',revision});
 assert.ok(f.writes.some(m=>m[0]==='hooks'&&m.at(-1)===false));
 assert.ok(f.writes.some(m=>m[0]==='labels'&&m.at(-1)===false));
 assert.ok(f.writes.some(m=>m[0]==='instructionRouting'&&m[1]===false));
});
test('setup renders hook steps under CSP without changing files or accepting removed patch actions',async()=>{
 const f=fixture();await f.open();await f.send({type:'ready'});
 assert.ok(f.panel.webview.html.includes("default-src 'none'"));assert.ok(!f.panel.webview.html.includes('{{'));
 assert.ok(f.panel.webview.html.includes('Install Hooks'));assert.ok(!f.panel.webview.html.includes('Enable Chat Labels'));
 for(const type of ['enableLabels','restoreLabels','restoreCodex','anything'])await f.send({type});
 assert.equal(f.writes.length,0);
});
test('explicit hook actions use only the configured home, record install time, and preserve routing',async()=>{
 const f=fixture();await f.open();await f.send({type:'ready'});await f.send({type:'installHooks',home:'C:/attacker'});
 assert.deepEqual(f.writes[0].slice(2),['C:/test-home',true]);assert.equal(f.values.get('activityHooks.enabled'),true);assert.ok(f.values.get('activityHooks.installedAt')>0);
 await f.send({type:'reviewHooks'});assert.deepEqual(f.writes.at(-1),['review','C:/test-home']);
 await f.send({type:'disableHooks'});assert.equal(f.values.get('activityHooks.enabled'),false);assert.equal(f.writes.filter(w=>w[0]==='routing').length,0);
});
test('status refresh never replaces drafts, while stale routing or loss of trust blocks saves',async()=>{
 const f=fixture();await f.open();await f.send({type:'ready'});const states=f.messages.filter(m=>m.type==='state').length;
 await f.send({type:'verifyHooks'});assert.equal(f.messages.filter(m=>m.type==='state').length,states);
 f.choices.main='Changed';f.changed();await f.send({type:'saveRouting',revision:1});assert.equal(f.writes.length,0);
 f.api.workspace.isTrusted=false;await f.send({type:'installHooks'});assert.equal(f.writes.length,0);
});
test('setup opens the owned view and optional focus setting without enabling either hooks or routing',async()=>{
 const f=fixture();await f.open();await f.send({type:'ready'});await f.send({type:'showNavigator'});await f.send({type:'focusSettings'});
 assert.deepEqual(f.writes,[['codexNavigator.chats.focus'],['workbench.action.openSettings','codexNavigator.detectChatFocus']]);
});
test('renderer updates activity without overwriting unsaved routing fields',()=>{
 const nodes=new Map();let receive;const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,textContent:'',addEventListener(){},replaceChildren(){},append(){},classList:{toggle(){}}});return nodes.get(id);};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../media/setup.js'),'utf8'),{acquireVsCodeApi:()=>({postMessage(){}}),document:{getElementById:node,querySelectorAll:()=>[],createElement:()=>node('item'),body:{setAttribute(){}}},window:{addEventListener:(_e,fn)=>receive=m=>fn({data:m})}});
 receive({type:'state',replaceChoices:true,choices:{main:'Saved',scopes:[],fallbackNames:[],enabled:false},routing:{label:'Ready',detail:''},repositories:[],activity:{nodeAvailable:true,label:'Not installed',home:'Home'}});
 node('main').value='Unsaved';receive({type:'stale'});receive({type:'activity',activity:{installed:true,enabled:true,nodeAvailable:true,trusted:false,label:'Review needed',home:'Home'}});
 assert.equal(node('main').value,'Unsaved');assert.equal(node('stale').hidden,false);assert.equal(node('activity-status').textContent,'Review needed');assert.equal(node('review-hooks').disabled,false);
});

test('automatic label setup changes only its guidance and global label preference',async()=>{
 const f=fixture();await f.open();await f.send({type:'ready'});
 await f.send({type:'enableAutomaticLabels',home:'C:/attacker'});
 assert.deepEqual(f.writes,[['labels','C:/test-home',true],['agentRepositoryLabels',true,1]]);
 assert.equal(f.messages.filter(m=>m.type==='state').length,1);assert.ok(f.messages.some(m=>m.type==='labels'));
 await f.send({type:'disableAutomaticLabels'});
 assert.deepEqual(f.writes.slice(-2),[['labels','C:/test-home',false],['agentRepositoryLabels',false,1]]);
 assert.equal(f.values.has('activityHooks.enabled'),false);
});
