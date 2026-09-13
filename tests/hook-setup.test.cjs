const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const vscodeFixture={workspace:{workspaceFolders:[]},extensions:{getExtension:()=>undefined}};
const exportsFixture={};
vm.runInNewContext(fs.readFileSync(require.resolve('../dist/hook-setup'),'utf8'),{exports:exportsFixture,require:name=>name==='vscode'?vscodeFixture:name.startsWith('./')?require('../dist/'+name.slice(2)):require(name),Date,Buffer});
const {parseHookTrust,activityCommand,lastHookEvent}=exportsFixture;
const home=path.resolve('.codex-temp/hooks-trust-home'),cwd=path.resolve('.codex-temp/project');
const events=['userPromptSubmit','stop','interrupt','sessionEnd'];
function response(){return {data:[{cwd,errors:[],warnings:[],hooks:events.map(eventName=>({eventName,handlerType:'command',command:activityCommand(home),sourcePath:path.join(home,'hooks.json'),enabled:true,trustStatus:'trusted'}))}]};}
test('trust requires all exact Navigator definitions enabled in every requested workspace',()=>{
 const value=response();assert.equal(parseHookTrust(value,home,[cwd]),true);
 for(const change of [{enabled:false},{trustStatus:'modified'},{trustStatus:'untrusted'},{command:'unrelated'},{sourcePath:path.join(cwd,'hooks.json')}]){
  const value=response();Object.assign(value.data[0].hooks[0],change);assert.equal(parseHookTrust(value,home,[cwd]),false);
 }
 assert.equal(parseHookTrust(response(),home,[cwd,path.resolve('missing')]),undefined);
});
test('unsupported metadata, missing events and configuration warnings cannot claim trust',()=>{
 for(const value of [undefined,{}, {data:[]}])assert.equal(parseHookTrust(value,home,[cwd]),undefined);
 const missing=response();missing.data[0].hooks.pop();assert.equal(parseHookTrust(missing,home,[cwd]),false);
 const warning=response();warning.data[0].warnings=['hooks disabled'];assert.equal(parseHookTrust(warning,home,[cwd]),undefined);
});
test('event verification ignores old, invalid and failed records and does not invent a test event',async()=>{
 const directory=fs.mkdtempSync(path.resolve('.codex-temp/hook-verification-'));fs.mkdirSync(path.join(directory,'codex-navigator'));
 const file=path.join(directory,'codex-navigator/activity-diagnostics.jsonl'),now=Date.now();
 const record=(outcome,event,time)=>JSON.stringify({outcome,event,time:new Date(time).toISOString()})+'\n';
 fs.writeFileSync(file,record('recorded','Stop',now-10000)+record('write-failed','Stop',now)+record('recorded','unknown',now));
 assert.equal(await lastHookEvent(directory,now-1000),undefined);
 fs.appendFileSync(file,record('recorded','UserPromptSubmit',now)+'{partial');
 assert.equal(await lastHookEvent(directory,now-1000),new Date(now).toISOString());
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
 state.set('activityHooks.installedAt',Date.now());
 assert.equal((await exportsFixture.hookSetupStatus(context,directory)).observed,undefined,'reinstallation excludes earlier events');
});
