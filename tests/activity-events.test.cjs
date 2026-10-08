const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path');
const { reduceActivity, TranscriptActivity, combineActivity, ActivityDiagnostics } = require('../dist/activity-events');
const now = Date.now(), initial = { status: 'unknown', workedAt: 0 };
const event = (type, id = 'a', time = now) => ({ timestamp: new Date(time).toISOString(), type: 'event_msg', payload: { type, turn_id: id } });

test('structured async replies retain only matching IDs and times across completion and new turns', () => {
 const text='<send_user_message_question_reply>\n'+JSON.stringify([{questionItemId:JSON.stringify(['request_user_input_async','q',0]),answer:'private answer'}])+'\n</send_user_message_question_reply>';
 for(const record of [
   {type:'event_msg',payload:{type:'user_message',message:text}},
   {type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text}]}}
 ]) {
   let state=reduceActivity(initial,event('task_complete'),now);
   state=reduceActivity(state,{...record,timestamp:new Date(now+1).toISOString()},now+1);
   assert.equal(state.status,'ready','answer does not change completion');
   assert.deepEqual(state.questionReplies,[{id:'q',answeredAt:now+1}]);
   assert.equal(JSON.stringify(state).includes('private answer'),false);
   state=reduceActivity(state,event('task_started','b',now+2),now+2);
   state=reduceActivity(state,{type:'turn_context',payload:{turn_id:'c'},timestamp:new Date(now+3).toISOString()},now+3);
   assert.deepEqual(combineActivity({status:'working',turnId:'c',workedAt:now+4},state).questionReplies,[{id:'q',answeredAt:now+1}]);
 }
 for(const bad of ['ordinary answer',text.replace('request_user_input_async','unknown'),text.replace('questionItemId','other'),text.replace('[{','{'), 'quoted '+text]) {
   assert.equal(reduceActivity(initial,{timestamp:new Date(now).toISOString(),type:'event_msg',payload:{type:'user_message',message:bad}},now).questionReplies,undefined);
 }
 assert.equal(reduceActivity(initial,{timestamp:new Date(now).toISOString(),type:'response_item',payload:{type:'message',role:'assistant',content:[{type:'input_text',text}]}},now).questionReplies,undefined);
});
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

test('accepted async prompts survive tool acknowledgement, ongoing work and completion without waiting', () => {
 for (const name of ['request_user_input_async', 'functions.request_user_input_async']) {
   const item=(payload,time=now)=>({timestamp:new Date(time).toISOString(),type:'response_item',payload});
   let s=reduceActivity(initial,event('task_started'),now);
   s=reduceActivity(s,item({type:'function_call',name,call_id:'q'}),now);
   assert.equal(s.status,'working'); assert.equal(s.asyncQuestion,undefined);
   s=reduceActivity(s,item({type:'function_call_output',call_id:'q',output:'{"accepted":true}'},now+1),now+1);
   assert.deepEqual(s.asyncQuestion,{id:'q',askedAt:now}); assert.equal(s.pendingInput,undefined);
   s=reduceActivity(s,item({type:'function_call',name:'sleep',call_id:'sleep'},now+2),now+2);
   assert.equal(s.status,'working'); assert.equal(s.asyncQuestion.id,'q');
   const hook={status:'idle',turnId:'a',observedAt:now+3,workedAt:now+3};
   assert.equal(combineActivity(hook,s).asyncQuestion.id,'q');
   assert.equal(combineActivity({...hook,turnId:'new'},s).asyncQuestion,undefined);
   s=reduceActivity(s,event('task_complete','a',now+4),now+4);
   assert.equal(s.status,'ready'); assert.equal(s.asyncQuestion.id,'q');
   assert.equal(reduceActivity(s,event('task_started','new',now+5),now+5).asyncQuestion,undefined);
 }
});

test('rejected, malformed and unmatched async acknowledgements do not announce a question', () => {
 const item=payload=>({timestamp:new Date(now).toISOString(),type:'response_item',payload});
 const called=reduceActivity(initial,item({type:'function_call',name:'request_user_input_async',call_id:'q'}),now);
 for (const output of ['{"accepted":false}','error','{}']) {
   assert.equal(reduceActivity(called,item({type:'function_call_output',call_id:'q',output}),now).asyncQuestion,undefined);
 }
 assert.equal(reduceActivity(called,item({type:'function_call_output',call_id:'other',output:'{"accepted":true}'}),now).asyncQuestion,undefined);
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

test('newer stop and interrupt hooks beat old work, but same-turn completion supplies ready', () => {
 const working=reduceActivity(initial,event('task_started'),now);
 const hook={status:'idle',turnId:'a',observedAt:now+2,workedAt:now+2};
 assert.equal(combineActivity(hook,working).status,'idle');
 assert.equal(combineActivity(hook,{...working,status:'waiting'}).status,'idle');
 const completed=reduceActivity(working,event('task_complete','a',now+1),now+1);
 assert.equal(combineActivity(hook,completed).status,'ready');
 assert.equal(combineActivity(hook,completed,now+3).status,'idle');
 assert.equal(combineActivity({...hook,turnId:'b'},completed).status,'idle');
 const resumed=reduceActivity(working,{timestamp:new Date(now+3).toISOString(),type:'response_item',payload:{type:'reasoning'}},now+3);
 assert.equal(combineActivity(hook,resumed).status,'working');
});

test('fresh lifecycle records keep the spinner when the filesystem modification time lags', async () => {
 const folder=await fs.mkdtemp(path.resolve('.codex-temp/activity-mtime-')),file=path.join(folder,'chat.jsonl');
 const old=now-20*60000, reader=new TranscriptActivity();
 const hook={status:'working',turnId:'a',observedAt:now,workedAt:now};
 try {
   await fs.writeFile(file,JSON.stringify(event('task_started','a',now))+'\n');
   await fs.utimes(file,old/1000,old/1000);
   assert.equal((await reader.read(file,now)).status,'working');
   const recent=now+1000;
   await fs.appendFile(file,JSON.stringify({timestamp:new Date(recent).toISOString(),type:'response_item',
     payload:{type:'custom_tool_call',name:'exec',call_id:'tool'}})+'\n');
   await fs.utimes(file,old/1000,old/1000);
   for(const current of [reader,new TranscriptActivity()]) {
     const snapshot=await current.read(file,recent);
     assert.equal(snapshot.status,'working');
     assert.equal(combineActivity(hook,snapshot).status,'working');
     assert.equal((await current.read(file,recent+16*60000)).status,'unknown','abandoned work still expires');
   }
 } finally { await fs.rm(folder,{recursive:true,force:true}); }
});

test('inconclusive same-turn transcripts preserve a working hook but explicit interruption stops it', () => {
 const hook={status:'working',turnId:'a',observedAt:now,workedAt:now};
 const inconclusive={status:'unknown',turnId:'a',observedAt:now+1,workedAt:now+1};
 assert.equal(combineActivity(hook,inconclusive).status,'working');
 const interrupted=reduceActivity(initial,event('turn_aborted','a',now+1),now+1);
 assert.equal(combineActivity(hook,interrupted).status,'unknown');
 assert.equal(combineActivity(hook,{...inconclusive,turnId:'b'}).status,'unknown','do not carry work into a different turn');
 assert.equal(combineActivity({...hook,status:'unknown'},inconclusive).status,'unknown','expired hooks stay expired');
});

test('context identifies a turn without starting it; fresh calls recover activity without reviving a terminal turn', () => {
 const record=(type,payload,time=now)=>({timestamp:new Date(time).toISOString(),type,payload});
 let state=reduceActivity(initial,record('turn_context',{turn_id:'a'}),now);
 assert.equal(state.status,'unknown'); assert.equal(state.turnId,'a'); assert.equal(state.observedAt,undefined);
 state=reduceActivity(state,event('context_compacted'),now);
 assert.equal(state.status,'unknown');
 const call=record('response_item',{type:'custom_tool_call',name:'exec',call_id:'c'});
 state=reduceActivity(state,call,now);assert.equal(state.status,'working');assert.equal(state.turnId,'a');
 state=reduceActivity(state,record('response_item',{type:'function_call',name:'request_user_input',call_id:'q'}),now);
 assert.equal(state.status,'waiting');assert.equal(reduceActivity(state,call,now).status,'waiting');
 for(const terminal of ['task_complete','turn_aborted']) {
   const ended=reduceActivity(state,event(terminal),now);
   const sameContext=reduceActivity(ended,record('turn_context',{turn_id:'a'},now+1),now+1);
   assert.equal(reduceActivity(sameContext,{...call,timestamp:new Date(now+2).toISOString()},now+2).status,ended.status);
   const next=reduceActivity(sameContext,record('turn_context',{turn_id:'b'},now+2),now+2);
   assert.equal(next.status,'unknown');assert.equal(reduceActivity(next,{...call,timestamp:new Date(now+3).toISOString()},now+3).status,'working');
 }
 assert.equal(reduceActivity(state,record('turn_context',{turn_id:'old'},now-1),now).turnId,'a');
});

test('large compaction recovers on new work with expired hooks, survives reload, and terminates', async () => {
 const folder=await fs.mkdtemp(path.resolve('.codex-temp/activity-compaction-')),file=path.join(folder,'chat.jsonl');
 const line=(type,payload,time=now)=>JSON.stringify({timestamp:new Date(time).toISOString(),type,payload})+'\n';
 try {
   const reader=new TranscriptActivity();
   await fs.writeFile(file,JSON.stringify(event('task_started','a',now-20*60000))+'\n');
   assert.equal((await reader.read(file,now)).status,'working');
   const compact=line('compacted',{message:'x'.repeat(8*1024*1024)})
     +line('turn_context',{turn_id:'a'})+line('event_msg',{type:'context_compacted'});
   await fs.appendFile(file,compact);
   const gap=await reader.read(file,now);assert.equal(gap.status,'unknown');
   assert.equal(combineActivity({status:'working',turnId:'a',observedAt:now-1000,workedAt:now-1000},gap).status,'working','fresh hook bridges compaction');
   assert.equal(combineActivity(initial,gap).status,'unknown','missing hook cannot turn compaction into proof of work');
   await fs.appendFile(file,line('response_item',{type:'custom_tool_call',name:'exec',call_id:'c'},now+1));
   const recovered=await reader.read(file,now+1);
   assert.equal(recovered.status,'working');assert.equal(recovered.turnId,'a');
   assert.equal(combineActivity({...initial,turnId:'a',observedAt:now-20*60000},recovered).status,'working');
   assert.equal((await new TranscriptActivity().read(file,now+1)).status,'working','cold reader recovers from the bounded tail');
   await fs.appendFile(file,JSON.stringify(event('task_complete','a',now+2))+'\n');
   assert.equal((await reader.read(file,now+2)).status,'ready');
   await fs.appendFile(file,JSON.stringify(event('task_started','b',now+3))+'\n'+JSON.stringify(event('turn_aborted','b',now+4))+'\n');
   assert.equal((await reader.read(file,now+4)).status,'unknown');
   assert.equal((await reader.read(file,now+3600000)).status,'unknown');
 } finally { await fs.rm(folder,{recursive:true,force:true}); }
});

test('unread gaps and replaced files cannot inherit working state; UTF-8 tails keep exact byte offsets', async () => {
 const folder=await fs.mkdtemp(path.resolve('.codex-temp/activity-boundaries-')),file=path.join(folder,'chat.jsonl');
 try {
   const reader=new TranscriptActivity(),start=JSON.stringify(event('task_started'))+'\n';
   await fs.writeFile(file,start);assert.equal((await reader.read(file,now)).status,'working');
   await fs.appendFile(file,JSON.stringify(event('task_complete'))+'\n'+JSON.stringify({type:'ignored',payload:'x'.repeat(1024*1024+100)})+'\n');
   assert.equal((await reader.read(file,now)).status,'unknown','completion may be in the skipped gap');
   await fs.writeFile(file,start);await reader.read(file,now);
   const replacement=path.join(folder,'replacement.jsonl');await fs.writeFile(replacement,' '.repeat(start.length+10)+'\n');
   await fs.rename(replacement,file);assert.equal((await reader.read(file,now)).status,'unknown');
   let data=Buffer.from(JSON.stringify({payload:'\u00e9'.repeat(600000)})+'\n'+start);
   if(data[data.length-1024*1024]!==0xa9) data=Buffer.concat([Buffer.from(' '),data.subarray(0,data.length-1),Buffer.from(' \n')]);
   assert.equal(data[data.length-1024*1024],0xa9,'fixture tail begins inside a UTF-8 character');
   await fs.writeFile(file,data);assert.equal((await reader.read(file,now)).status,'working');
   const stop=JSON.stringify(event('task_complete','a',now+1))+'\n';
   await fs.appendFile(file,stop.slice(0,20));assert.equal((await reader.read(file,now+1)).status,'working');
   await fs.appendFile(file,stop.slice(20));assert.equal((await reader.read(file,now+1)).status,'ready','completion after a partial UTF-8 tail is not skipped');
 } finally {await fs.rm(folder,{recursive:true,force:true});}
});

test('activity diagnostics report transitions only, omit content, and bound remembered chats', () => {
 const records=[],log=new ActivityDiagnostics(record=>records.push(record));
 const hook={status:'working',turnId:'a',observedAt:now,workedAt:now,detail:'private content'};
 log.record('chat',hook,initial,undefined,hook);
 log.record('chat',{...hook,observedAt:now+1},initial,undefined,hook);
 assert.equal(records.length,1);assert.equal(JSON.stringify(records).includes('private content'),false);
 log.record('chat',hook,initial,{status:'idle',workedAt:0},{status:'idle',workedAt:0});
 assert.equal(records.length,2);assert.equal(records[1].selected.status,'idle');
 for(let i=0;i<201;i++)log.record('other-'+i,initial,initial,undefined,initial);
 log.record('chat',hook,initial,undefined,hook);
 assert.equal(records.length,204,'evicted chat is reported on reappearance');
});

test('live item events recover the turn after compaction without reviving ended or waiting turns', () => {
 const item=(kind='ContextCompaction',id='a',time=now)=>({
   timestamp:new Date(time).toISOString(),type:'event_msg',
   payload:{type:'item_completed',turn_id:id,item:{type:kind,id:'item'}}
 });
 for(const kind of ['ContextCompaction','Reasoning','CommandExecution']) {
   const state=reduceActivity(initial,item(kind),now);
   assert.equal(state.status,'working');assert.equal(state.turnId,'a');
   for(const terminal of ['task_complete','turn_aborted']) {
     const ended=reduceActivity(state,event(terminal),now);
     assert.equal(reduceActivity(ended,item(kind,'a',now+1),now+1).status,ended.status);
   }
   assert.equal(reduceActivity({...state,status:'waiting',pendingInput:'q'},item(kind),now).status,'waiting');
   assert.equal(reduceActivity({...state,turnId:'b'},item(kind),now).turnId,'b');
   assert.equal(reduceActivity(initial,item(kind,'',now),now).status,'unknown');
   assert.equal(reduceActivity(initial,item(kind,'a',now+10000),now).status,'unknown');
   assert.equal(combineActivity({status:'idle',turnId:'a',observedAt:now+1,workedAt:now+1},state).status,'idle');
 }
 for(const kind of ['AgentMessage','UserMessage','Unknown']) assert.equal(reduceActivity(initial,item(kind),now).status,'unknown');
 const call={timestamp:new Date(now).toISOString(),type:'response_item',payload:{type:'custom_tool_call',name:'exec',call_id:'c'}};
 assert.equal(reduceActivity(initial,call,now).status,'working','fresh tool invocation recovers without context');
});

test('compaction completion and large tool results keep activity through cold and incremental reads', async () => {
 const folder=await fs.mkdtemp(path.resolve('.codex-temp/activity-items-')),file=path.join(folder,'chat.jsonl');
 const line=(type,payload,time=now)=>JSON.stringify({timestamp:new Date(time).toISOString(),type,payload})+'\n';
 try {
   const reader=new TranscriptActivity();
   await fs.writeFile(file,JSON.stringify(event('task_started'))+'\n');
   assert.equal((await reader.read(file,now)).status,'working');
   await fs.appendFile(file,line('compacted',{replacement_history:['x'.repeat(12*1024*1024)]})
     +line('turn_context',{turn_id:'a'})
     +line('event_msg',{type:'item_completed',turn_id:'a',item:{type:'ContextCompaction',id:'compact'}}));
   for(const current of [reader,new TranscriptActivity()]) {
     const snapshot=await current.read(file,now);
     assert.equal(snapshot.status,'working');assert.equal(snapshot.turnId,'a');
   }
   const output=line('event_msg',{type:'item_completed',turn_id:'a',item:{type:'CommandExecution',output:'x'.repeat(180000)}})
     +line('response_item',{type:'custom_tool_call_output',call_id:'tool',output:'x'.repeat(80000)});
   await fs.appendFile(file,output);
   assert.equal((await reader.read(file,now)).status,'working','ordinary large result does not reset state');
   assert.equal((await new TranscriptActivity().read(file,now)).status,'working');
   await fs.appendFile(file,JSON.stringify(event('task_complete','a',now+1))+'\n'+line('event_msg',{
     type:'item_completed',turn_id:'a',item:{type:'Reasoning',id:'late'}
   },now+2));
   assert.equal((await reader.read(file,now+2)).status,'ready','late item cannot restart completed turn');
   assert.equal((await new TranscriptActivity().read(file,now+2)).status,'ready');
   await fs.writeFile(file,line('event_msg',{type:'item_completed',turn_id:'a',item:{type:'ContextCompaction'}}));
   assert.equal((await new TranscriptActivity().read(file,now+3600000)).status,'unknown','abandoned activity still expires');
 } finally { await fs.rm(folder,{recursive:true,force:true}); }
});
