const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const id='00000000-0000-0000-0000-000000000001';
function fixture(moduleName,handler){
 const calls=[],children=[],exports={};
 function spawn(binary,args){
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};child.stderr={resume(){}};child.kill=()=>{child.killed=true;};
  child.stdin={write(line,callback){const m=JSON.parse(line);calls.push(m);if(m.id){const result=handler(m);queueMicrotask(()=>child.stdout.emit('data',JSON.stringify({id:m.id,...result})+'\n'));}callback?.();}};
  children.push({child,args});return child;
 }
 vm.runInNewContext(fs.readFileSync(require.resolve('../dist/'+moduleName),'utf8'),{exports,require:name=>name==='node:child_process'?{spawn}:name.startsWith('./')?require('../dist/'+name.slice(2)):require(name),process,setTimeout,clearTimeout});
 return {exports,calls,children};
}
const goal=status=>({threadId:id,status,objective:'Keep usage intact',tokensUsed:42,tokenBudget:100});
test('goal reader requests only visible valid IDs and never loads or mutates a thread',async()=>{
 const f=fixture('chat-goals',m=>({result:m.method==='thread/goal/get'?{goal:goal('active')}:{}}));
 const reader=new f.exports.ChatGoals('fixture','fixture',()=>{});
 const result=await reader.read([id,id,'invalid']);assert.equal(result[id].status,'active');
 assert.equal(f.calls.filter(m=>m.method==='thread/goal/get').length,1);
 assert.ok(f.calls.every(m=>['initialize','initialized','thread/goal/get'].includes(m.method)));
 assert.deepEqual(Array.from(f.children[0].args),['app-server','--stdio']);
 reader.stop();assert.equal(f.children[0].child.killed,true);
 reader.dispose();await reader.read([id]);assert.equal(f.children.length,1);
});
test('goal reader clears missing/error results and rejects unrelated or invalid state',async()=>{
 let value=goal('paused');const f=fixture('chat-goals',m=>({result:m.method==='thread/goal/get'?{goal:value}:{}}));
 const reader=new f.exports.ChatGoals('fixture','fixture',()=>{});
 assert.equal((await reader.read([id]))[id].status,'paused');
 for(const invalid of [null,{...value,threadId:'other'},{...value,status:'future'},{...value,objective:'x'.repeat(4001)}]){
  value=invalid;assert.equal(Object.keys(await reader.read([id])).length,0);
 }
 reader.dispose();
});
test('goal controls use the owning runtime, send status only, and preserve budget and objective',async()=>{
 let current=goal('active'),loaded=[id];
 const f=fixture('activity-runtime',m=>{
  if(m.method==='thread/loaded/list')return {result:{data:loaded}};
  if(m.method==='thread/goal/get')return {result:{goal:current}};
  if(m.method==='thread/goal/set'){current={...current,status:m.params.status};return {result:{goal:current}};}
  return {result:{}};
 });
 const runtime=new f.exports.RuntimeActivity('fixture','fixture',()=>{});
 assert.equal((await runtime.changeGoal(id,current)).status,'paused');
 assert.equal((await runtime.changeGoal(id,current)).status,'active');
 const writes=f.calls.filter(m=>m.method==='thread/goal/set');
 assert.deepEqual(writes.map(m=>m.params),[{threadId:id,status:'paused'},{threadId:id,status:'active'}]);
 assert.equal(current.tokensUsed,42);assert.equal(current.tokenBudget,100);
 loaded=[];await assert.rejects(runtime.changeGoal(id,current),/does not own/);
 loaded=[id];await assert.rejects(runtime.changeGoal(id,{...current,status:'paused'}),/goal changed/);
 assert.equal(f.calls.filter(m=>m.method==='thread/goal/set').length,2);
 assert.ok(f.calls.every(m=>['initialize','initialized','thread/loaded/list','thread/goal/get','thread/goal/set'].includes(m.method)));
 runtime.dispose();
});

test('recency uses persisted native ordering without loading threads, and errors retain fallback eligibility',async()=>{
 let fail=false;
 const f=fixture('chat-goals',m=>m.method==='thread/list'?(fail?{error:{message:'unsupported'}}:{result:{data:[{id,name:'One',updatedAt:1}]}}):{result:{}});
 const reader=new f.exports.ChatGoals('fixture','fixture',()=>{});
 assert.equal((await reader.readRecency())[0].id,id);
 const call=f.calls.find(m=>m.method==='thread/list');
 assert.deepEqual(call.params,{limit:200,sortKey:'recency_at',sortDirection:'desc',sourceKinds:['vscode'],archived:false,useStateDbOnly:true});
 assert.ok(f.calls.every(m=>['initialize','initialized','thread/list'].includes(m.method)));
 fail=true;assert.equal(await reader.readRecency(),undefined);
 const count=f.calls.length;await reader.readRecency();assert.equal(f.calls.length,count);
 reader.dispose();
});

test('recency follows capped pages in server order and rejects repeated records',async()=>{
 const second='00000000-0000-0000-0000-000000000002';let duplicate=false;
 const f=fixture('chat-goals',m=>({result:m.method==='thread/list'?(m.params.cursor?{data:[{id:duplicate?id:second}],nextCursor:null}:{data:[{id}],nextCursor:'next'}):{}}));
 const reader=new f.exports.ChatGoals('fixture','fixture',()=>{});
 assert.deepEqual(Array.from(await reader.readRecency(),r=>r.id),[id,second]);
 const calls=f.calls.filter(m=>m.method==='thread/list');assert.equal(calls[1].params.limit,199);assert.equal(calls[1].params.cursor,'next');
 duplicate=true;assert.equal(await reader.readRecency(),undefined);reader.dispose();
});

test('hook setup metadata only lists definitions and never grants trust or starts a turn',async()=>{
 const f=fixture('chat-goals',m=>({result:m.method==='hooks/list'?{data:[]}:{}}));
 const reader=new f.exports.ChatGoals('fixture','fixture',()=>{});await reader.readHooks(['C:/fixture']);
 assert.deepEqual(f.calls.map(m=>m.method),['initialize','initialized','hooks/list']);
 assert.deepEqual(f.calls.at(-1).params,{cwds:['C:/fixture']});reader.dispose();
});
