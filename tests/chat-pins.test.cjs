const {test}=require('node:test'),assert=require('node:assert/strict');
const {chatPins,placePinnedChats}=require('../dist/chat-pins');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const row=n=>({id:id(n),title:'Chat '+n,updatedAt:'2026-01-01T00:00:00Z'});
test('pins preserve list slots across recency changes and unpin restores normal order',()=>{
 const pins=chatPins({[id(2)]:{position:1,chat:row(2)},[id(4)]:{position:3,chat:row(4)}});
 assert.deepEqual(placePinnedChats([5,4,3,2,1].map(row),pins).map(x=>x.id),[5,2,3,4,1].map(id));
 assert.deepEqual(placePinnedChats([4,5,2,1,3].map(row),pins).map(x=>x.id),[5,2,1,4,3].map(id));
 assert.deepEqual(placePinnedChats([5,4,3,2,1].map(row),{}).map(x=>x.id),[5,4,3,2,1].map(id));
});
test('pins validate saved identities and positions and compact when fewer chats exist',()=>{
 assert.deepEqual(chatPins({bad:{position:0,chat:row(1)},[id(1)]:{position:-1,chat:row(1)},[id(2)]:{position:200,chat:row(2)},[id(3)]:{position:1,chat:row(4)}}),{});
 const pins=chatPins({[id(2)]:{position:5,chat:row(2)},[id(4)]:{position:5,chat:row(4)}});
 assert.deepEqual(placePinnedChats([4,2,1].map(row),pins).map(x=>x.id),[1,2,4].map(id));
});
