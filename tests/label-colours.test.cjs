const {test}=require('node:test'),assert=require('node:assert/strict');
const {labelColourKey,readLabelColours,migrateLabelColours}=require('../dist/label-colours');
const {inheritedColour}=require('../dist/colours');

test('custom labels share a colour regardless of outer whitespace or case',()=>{
 const colours=readLabelColours({' UBC ':'#65f','[invalid]':'#fff','Other':'bad'});
 assert.equal(colours[labelColourKey('ubc')],'#6655FF');
 assert.equal(Object.keys(colours).length,1);
 const labels={a:'UBC',b:' ubc '},chats={a:'#6655FF'};
 const migrated=migrateLabelColours(labels,chats,{},{});
 assert.equal(migrated.colours.ubc,'#6655FF');assert.equal(migrated.chats.a,undefined);
 migrated.colours.ubc='#FF0000';
 for(const key of ['a','b'])assert.equal(inheritedColour(migrated.chats[key]||migrated.colours[labelColourKey(labels[key])],[],{}),'#FF0000');
});

test('legacy conflicts retain explicit overrides and migrate deterministically',()=>{
 const labels={b:'UBC',a:'ubc',c:'Other'},chats={b:'#00FF00',a:'#6655FF'};
 const migrated=migrateLabelColours(labels,chats,{}, {a:'#000000',c:'#112233'});
 assert.equal(migrated.colours.ubc,'#6655FF');assert.equal(migrated.colours.other,'#112233');
 assert.equal(migrated.chats.b,'#00FF00');assert.equal(migrated.chats.a,undefined);
 assert.equal(chats.a,'#6655FF','migration does not mutate original persisted inputs');
 assert.deepEqual(migrateLabelColours(labels,migrated.chats,migrated.colours,{}),migrated,'safe to resume migration after an interrupted save');
});

test('custom-label colour records validate user text and resist prototype keys',()=>{
 const colours=readLabelColours(JSON.parse('{"__proto__":"#123456","constructor":"#abcdef","bad\\nlabel":"#123456"}'));
 assert.equal(Object.getPrototypeOf(colours),null);
 assert.equal(colours.__proto__,'#123456');assert.equal(colours.constructor,'#ABCDEF');
 assert.equal(colours['bad\nlabel'],undefined);
});

test('a full shared palette preserves extra legacy chat overrides',()=>{
 const saved=Object.fromEntries(Array.from({length:2000},(_,i)=>['Label '+i,'#123456']));
 const migrated=migrateLabelColours({chat:'Extra'},{chat:'#6655FF'},saved,{});
 assert.equal(Object.keys(migrated.colours).length,2000);
 assert.equal(migrated.chats.chat,'#6655FF','a bounded migration must not discard an unshared colour');
});
