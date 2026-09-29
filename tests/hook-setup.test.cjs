const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const vscodeFixture={workspace:{workspaceFolders:[]},extensions:{getExtension:()=>undefined}};
const exportsFixture={};
vm.runInNewContext(fs.readFileSync(require.resolve('../dist/hook-setup'),'utf8'),{exports:exportsFixture,require:name=>name==='vscode'?vscodeFixture:name.startsWith('./')?require('../dist/'+name.slice(2)):require(name),Date,Buffer});
const {parseHookTrust,activityCommand,lastHookEvent}=exportsFixture;
const home=path.resolve('.codex-temp/hooks-trust-home'),cwd=path.resolve('.codex-temp/project');
const events=['userPromptSubmit','stop','interrupt','sessionEnd'];

test('Node probe reports bounded actionable failures without exposing process output', async () => {
 for (const [error,stdout,expected] of [
  [undefined,'v22.20.0\n',''],
  [{code:'ENOENT'},'',/not found on VS Code's PATH/],
  [{code:'EACCES'},'',/permission/],
  [{code:'EPERM'},'',/permission/],
  [{killed:true},'',/three seconds/],
  [{code:1},'private diagnostic',/could not be verified/],
  [undefined,'not a Node version',/could not be verified/],
 ]) {
  const exports={};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/hook-setup'),'utf8'),{exports,require:name=>
   name==='vscode'?vscodeFixture:name==='node:child_process'?{execFile(binary,args,options,done){
    assert.equal(binary,'node');assert.equal(args.join(' '),'--version');assert.equal(options.timeout,3000);assert.equal(options.maxBuffer,1024);
    done(error,stdout);
   }}:name.startsWith('./')?require('../dist/'+name.slice(2)):require(name)});
  const issue=await exports.nodeRuntimeIssue();
  if(expected==='')assert.equal(issue,'');else {assert.match(issue,expected);assert.match(issue,/fully quit and reopen/);}
  assert.ok(!issue.includes('private diagnostic'));
 }
});
test('chat admission requires all readiness checks and retains delivery evidence during idle time',()=>{
 const valid={enabled:true,installed:true,nodeAvailable:true,trusted:true,observed:'2026-01-01T00:00:00Z',detail:'',nextStep:'Verified'};
 assert.equal(exportsFixture.hookReadiness(valid).ready,true,'old successful evidence is valid while idle');
 assert.equal(exportsFixture.hookReadiness({...valid,observed:undefined}).ready,true,'no event is needed to browse');
 assert.equal(exportsFixture.hookReadiness({...valid,observed:undefined,deliveryDetail:'Write failed'}).ready,true,'delivery diagnostics never block chats');
 for(const change of [{enabled:false},{installed:false},{nodeAvailable:false},{trusted:false},{trusted:undefined},{detail:'Cannot read hooks'}]){
  const result=exportsFixture.hookReadiness({...valid,...change,nextStep:'Repair this issue'});
  assert.equal(result.ready,false);assert.equal(result.message,'Repair this issue');
 }
});
function response(){return {data:[{cwd,errors:[],warnings:[],hooks:events.map(eventName=>({eventName,handlerType:'command',command:activityCommand(home),sourcePath:path.join(home,'hooks.json'),enabled:true,trustStatus:'trusted'}))}]};}
test('trust requires all exact Navigator definitions enabled in every requested workspace',()=>{
 const value=response();assert.equal(parseHookTrust(value,home,[cwd]),true);
 for(const change of [{enabled:false},{trustStatus:'modified'},{trustStatus:'untrusted'},{command:'unrelated'},{sourcePath:path.join(cwd,'hooks.json')}]){
  const value=response();Object.assign(value.data[0].hooks[0],change);assert.equal(parseHookTrust(value,home,[cwd]),false);
 }
 assert.equal(parseHookTrust(response(),home,[cwd,path.resolve('missing')]),undefined);
});
test('unsupported metadata and missing events cannot claim trust; warnings retain exact enabled trust',()=>{
 for(const value of [undefined,{}, {data:[]}])assert.equal(parseHookTrust(value,home,[cwd]),undefined);
 const missing=response();missing.data[0].hooks.pop();assert.equal(parseHookTrust(missing,home,[cwd]),false);
 const warning=response();warning.data[0].warnings=['Unrelated hook warning'];assert.equal(parseHookTrust(warning,home,[cwd]),true);
 warning.data[0].hooks[0].enabled=false;assert.equal(parseHookTrust(warning,home,[cwd]),false);
 const error=response();error.data[0].errors=['Cannot load hook configuration'];assert.equal(parseHookTrust(error,home,[cwd]),undefined);
});

test('completed setup survives outages and explicit hook problems without granting trust',()=>{
 const {HookAdmission}=require('../dist/hook-admission'), admission=new HookAdmission();
 const unknown={ready:false,transient:true,message:'Trust unavailable'};
 assert.equal(admission.update(unknown,0).welcome,true,'new installations still require verified setup');
 assert.equal(admission.update({ready:true,message:'Ready'},100).welcome,false);
 assert.equal(admission.update(unknown,1000).notice,'','short failures are quiet');
 const persistent=admission.update(unknown,31000);
 assert.equal(persistent.welcome,false);assert.match(persistent.notice,/unavailable/);
 assert.equal(unknown.ready,false,'browsing admission is not evidence of trust');
 assert.equal(admission.update({ready:true,message:'Ready'},32000).notice,'');
 assert.equal(admission.update(unknown,33000).notice,'','recovery resets the delay');
 const removed=admission.update({ready:false,message:'Install hooks'},34000);
 assert.equal(removed.welcome,false);assert.equal(removed.notice,'Install hooks');
 const restored=new HookAdmission(admission.completed);
 assert.equal(restored.update(unknown,35000).welcome,false,'completion survives extension restart');
});
test('event verification rejects recent delivery failures until a successful event arrives',async()=>{
 const directory=fs.mkdtempSync(path.resolve('.codex-temp/hook-verification-'));fs.mkdirSync(path.join(directory,'codex-navigator'));
 const file=path.join(directory,'codex-navigator/activity-diagnostics.jsonl'),now=Date.now();
 const record=(outcome,event,time)=>JSON.stringify({outcome,event,time:new Date(time).toISOString()})+'\n';
 fs.writeFileSync(file,record('recorded','Stop',now-10000)+record('write-failed','Stop',now)+record('recorded','unknown',now));
 await assert.rejects(lastHookEvent(directory,now-1000),/could not save its latest event/);
 fs.appendFileSync(file,record('recorded','UserPromptSubmit',now)+'{partial');
 assert.equal(await lastHookEvent(directory,now-1000),new Date(now).toISOString());
 fs.appendFileSync(file,'\n'+record('write-failed','Stop',now));
 await assert.rejects(lastHookEvent(directory,now-1000),/could not save its latest event/);
 assert.equal(await lastHookEvent(directory,now+1000),undefined,'old failures do not affect a new installation');
});

test('missing installation memento uses a stable file cutoff across status checks',async()=>{
 const directory=fs.mkdtempSync(path.resolve('.codex-temp/hook-status-'));
 fs.mkdirSync(path.join(directory,'codex-navigator'));
 fs.copyFileSync(path.resolve('tools/chat-activity.cjs'),path.join(directory,'codex-navigator/chat-activity.cjs'));
 const config={hooks:Object.fromEntries(exportsFixture.hookEvents.map(event=>[event,[{hooks:[{type:'command',command:activityCommand(directory),timeout:1}]}]]))};
 fs.writeFileSync(path.join(directory,'hooks.json'),JSON.stringify(config));
 const before=new Date(Date.now()-20000);
 for(const name of ['hooks.json','codex-navigator/chat-activity.cjs'])fs.utimesSync(path.join(directory,name),before,before);
 const time=new Date(Date.now()-5000).toISOString();
 fs.writeFileSync(path.join(directory,'codex-navigator/activity-diagnostics.jsonl'),JSON.stringify({time,event:'Stop',outcome:'recorded'})+'\n');
 const state=new Map([['activityHooks.enabled',true]]);
 const context={extensionPath:path.resolve('.'),globalState:{get:(key,fallback)=>state.has(key)?state.get(key):fallback}};
 for(let i=0;i<2;i++){
  const result=await exportsFixture.hookSetupStatus(context,directory);
  assert.equal(result.observed,time);assert.equal(result.installed,true);
  assert.ok(Number.isFinite(result.checkedAt));assert.equal(result.trusted,undefined);
 }
 fs.appendFileSync(path.join(directory,'codex-navigator/activity-diagnostics.jsonl'),JSON.stringify({time:new Date().toISOString(),event:'Stop',outcome:'write-failed'})+'\n');
 const failedDelivery=await exportsFixture.hookSetupStatus(context,directory);
 assert.equal(failedDelivery.detail,'Install and enable the Codex extension first.','missing runtime has an actionable setup error, separate from delivery');
 assert.match(failedDelivery.deliveryDetail,/could not save/);assert.equal(failedDelivery.observed,undefined);
 state.set('activityHooks.installedAt',Date.now());
 assert.equal((await exportsFixture.hookSetupStatus(context,directory)).observed,undefined,'reinstallation excludes earlier events');
 const cached=await exportsFixture.hookSetupStatus(context,directory,true);
 assert.equal(await exportsFixture.hookSetupStatus(context,directory,true),cached,'sidebar reuses the latest setup check');
 fs.unlinkSync(path.join(directory,'codex-navigator/chat-activity.cjs'));
 assert.equal((await exportsFixture.hookSetupStatus(context,directory)).installed,false,'definitions alone do not count as an installed collector');
 fs.writeFileSync(path.join(directory,'hooks.json'),'{}');
 assert.equal((await exportsFixture.hookSetupStatus(context,directory)).installed,false,'explicit check immediately detects removed definitions');
 assert.equal((await exportsFixture.hookSetupStatus(context,directory,true)).installed,false,'sidebar sees the explicit result');
 state.set('activityHooks.enabled',false);
 assert.equal((await exportsFixture.hookSetupStatus(context,directory,true)).enabled,false,'changed setup preference invalidates the cache');
});
