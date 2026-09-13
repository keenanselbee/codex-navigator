const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const {EventEmitter}=require('node:events');
test('runtime observer only reads state, distinguishes approval/input and terminal failures', async () => {
 const calls=[],child=new EventEmitter();child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};child.stderr={resume(){}};child.kill=()=>{};
 child.stdin={write(line,callback){
  const m=JSON.parse(line);calls.push(m.method);if(!m.id)return;
  let result={};
  if(m.method==='thread/list')result={data:[
   {id:'approval',status:{type:'active',activeFlags:['waitingOnApproval']}},
   {id:'input',status:{type:'active',activeFlags:['waitingOnUserInput']}},
   {id:'failed',updatedAt:10,status:{type:'idle'}},
   {id:'complete',updatedAt:10,status:{type:'idle'}},
   {id:'unloaded',status:{type:'notLoaded'}}]};
  if(m.method==='thread/turns/list')result={data:[{id:'turn',status:m.params.threadId==='failed'?'failed':'completed',completedAt:10}]};
  queueMicrotask(()=>child.stdout.emit('data',JSON.stringify({id:m.id,result})+'\n'));callback?.();
 }};
 const exports={};vm.runInNewContext(fs.readFileSync(require.resolve('../dist/activity-runtime'),'utf8'),{exports,require:name=>name==='node:child_process'?{spawn:()=>child}:name==='./chat-goals'?require('../dist/chat-goals'):require(name),process,setTimeout,clearTimeout});
 const runtime=new exports.RuntimeActivity('fixture','fixture',()=>{});
 const result=await runtime.read(new Set(['approval','input','failed','complete','unloaded']));
 assert.equal(result.get('approval').detail,'Waiting for approval');assert.equal(result.get('input').status,'waiting');
 assert.equal(result.get('failed').status,'error');assert.equal(result.get('complete').status,'ready');
 assert.equal(result.get('complete').completedAt,10000);assert.equal(result.has('unloaded'),false);
 assert.ok(calls.every(method=>['initialize','initialized','thread/list','thread/turns/list'].includes(method)));
 runtime.dispose();
});
