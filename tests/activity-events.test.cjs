const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path');
const { reduceActivity, TranscriptActivity, combineActivity } = require('../dist/activity-events');
const now = Date.now(), initial = { status: 'unknown', workedAt: 0 };
const event = (type, id = 'a', time = now) => ({ timestamp: new Date(time).toISOString(), type: 'event_msg', payload: { type, turn_id: id } });
test('explicit lifecycle completes older chats and ignores stale other-turn completions', () => {
 let s = reduceActivity(initial, event('task_started'), now);
 assert.equal(s.status,'working');
 s = reduceActivity(s,event('task_started','b',now+1),now+1);
 assert.equal(reduceActivity(s,event('task_complete','a',now+2),now+2).status,'working');
 s=reduceActivity(s,event('task_complete','b',now+3),now+3); assert.equal(s.status,'ready');
 assert.equal(combineActivity(initial,s,now+4).status,'idle');
 assert.equal(combineActivity({status:'working',workedAt:now+5,observedAt:now+5,turnId:'c'},s).status,'working');
 assert.equal(reduceActivity(s,event('task_started','c',now+99999),now).status,'ready');
});
test('only explicit blocking input calls wait; tool failures and prose never mark a chat failed', () => {
 let s=reduceActivity(initial,event('task_started'),now);
 const item=p=>({timestamp:new Date(now).toISOString(),type:'response_item',payload:p});
 assert.equal(reduceActivity(s,item({type:'function_call',name:'request_user_input_async',call_id:'x'}),now).status,'working');
 s=reduceActivity(s,item({type:'function_call',name:'request_user_input',call_id:'x'}),now);assert.equal(s.status,'waiting');
 assert.equal(reduceActivity(s,item({type:'function_call_output',call_id:'other',output:'error'}),now).status,'waiting');
 assert.equal(reduceActivity(s,item({type:'function_call_output',call_id:'x',output:'answer'}),now).status,'working');
 assert.equal(reduceActivity(s,event('turn_aborted'),now).status,'unknown');
});
test('tail reader handles partial writes, truncation and stale working signals', async () => {
 const folder=await fs.mkdtemp(path.resolve('.codex-temp/activity-reader-')), file=path.join(folder,'chat.jsonl');
 try {
 const reader=new TranscriptActivity();const line=JSON.stringify(event('task_started'))+'\n';
 await fs.writeFile(file,line);assert.equal((await reader.read(file,now)).status,'working');
 const stop=JSON.stringify(event('task_complete','a',now+1));
 await fs.appendFile(file,stop.slice(0,30));assert.equal((await reader.read(file,now+1)).status,'working');
 await fs.appendFile(file,stop.slice(30)+'\n');assert.equal((await reader.read(file,now+1)).status,'ready');
 await fs.writeFile(file,'{}\n');assert.equal((await reader.read(file,now+2)).status,'unknown');
 await fs.writeFile(file,line);assert.equal((await reader.read(file,now+3600000)).status,'unknown');
 } finally {await fs.rm(folder,{recursive:true,force:true});}
});
