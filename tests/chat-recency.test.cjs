const {test}=require('node:test'),assert=require('node:assert/strict');
const {ChatRecency,parseRecency}=require('../dist/chat-recency');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const row=n=>({id:id(n),title:'Chat '+n,updatedAt:new Date(n*1000).toISOString()});
test('native order wins over timestamps; outage preserves order and excludes stale index entries',()=>{
 const cache=new ChatRecency();
 assert.deepEqual(cache.update([row(1),row(2)],[row(2),row(1)]).map(r=>r.id),[id(1),id(2)]);
 assert.deepEqual(cache.update(undefined,[row(3),{...row(2),title:'Renamed',updatedAt:new Date().toISOString()},row(1)]).map(r=>r.id),[id(1),id(2)]);
 assert.equal(cache.update(undefined,[])[1].title,'Renamed');
 assert.deepEqual(cache.update([], [row(3)]),[]);
 assert.deepEqual(cache.update(undefined,[row(3)]),[]);
});
test('cold fallback preserves saved order and only appends previously unknown chats',()=>{
 const cache=new ChatRecency([id(1),id(2),'invalid',id(1)]);
 assert.deepEqual(cache.update(undefined,[row(2),row(3),row(1)]).map(r=>r.id),[id(1),id(2),id(3)]);
 assert.deepEqual(cache.update(undefined,[row(3),row(1),row(2)]).map(r=>r.id),[id(1),id(2),id(3)]);
});
test('metadata parsing rejects bad responses and preserves server ties without reading previews',()=>{
 for(const input of [undefined,{}, {data:[{id:'invalid'}]}, {data:[{id:id(1)},{id:id(1)}]}]) assert.equal(parseRecency(input),undefined);
 assert.deepEqual(parseRecency({data:[]}),[]);
 const rows=parseRecency({data:[{id:id(2),name:'Two',updatedAt:2,recencyAt:1,preview:'private text'},{id:id(1),recencyAt:1}]});
 assert.deepEqual(rows.map(r=>r.id),[id(2),id(1)]);assert.equal(rows[0].preview,undefined);
});

test('saved native order survives reload, including an intentionally empty list',()=>{
 const previous=new ChatRecency();previous.update([row(1),row(2)],[row(3)]);
 const reloaded=new ChatRecency(previous.snapshot);
 assert.deepEqual(reloaded.update(undefined,[row(3),row(2),row(1)]).map(r=>r.id),[id(1),id(2)]);
 previous.update([],[]);
 assert.deepEqual(new ChatRecency(previous.snapshot).update(undefined,[row(3)]),[]);
});

test('startup restores bounded chat metadata without an index or native connection',()=>{
 const before=new ChatRecency();before.update([{...row(2),recencyAt:1234},row(1)],[]);
 const restored=new ChatRecency(before.snapshot);
 assert.deepEqual(restored.update(undefined,[]),[{...row(2),recencyAt:1234},row(1)]);
 const untrusted={...before.snapshot,rows:[{...row(2),title:'Two\nlines',activity:'working',goal:{status:'active'},preview:'private text'}, {id:id(1),title:'Bad',updatedAt:'invalid'}]};
 const safe=new ChatRecency(untrusted).update(undefined,[]);
 assert.deepEqual(safe,[{...row(2),title:'Two lines'}]);
 restored.update([],[]);assert.deepEqual(new ChatRecency(restored.snapshot).update(undefined,[row(1)]),[]);
});
