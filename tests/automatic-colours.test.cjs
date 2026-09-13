const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {assignAutomaticColours,readableColour,contrastRatio,resolvedRepositoryColours}=require('../dist/automatic-colours');
const {repositoryColourKey,readColours}=require('../dist/colours');
const roots=Array.from({length:24},(_,i)=>path.resolve('repo-'+String(i).padStart(2,'0')));
test('automatic colours are distinct, readable and independent of repository enumeration order',()=>{
 for(const background of ['#181818','#F3F3F3','#777777']){
  const assigned=assignAutomaticColours(roots,{}, {},background);
  assert.equal(Object.keys(assigned).length,24);
  if(background!=='#777777')assert.equal(new Set(Object.values(assigned)).size,24);
  for(const value of Object.values(assigned))assert.ok(contrastRatio(value,background)>=4.5);
  assert.deepEqual(assignAutomaticColours([...roots].reverse(),{}, {},background),assigned);
 }
});
test('adding or removing repositories and theme changes preserve assigned identities and manual overrides',()=>{
 const custom=readColours({[roots[0]]:'#123456',[roots[1]]:'none'},'repository');
 const first=assignAutomaticColours(roots.slice(0,8),{},custom,'#181818');
 const next=assignAutomaticColours(roots,first,custom,'#181818');
 for(const [key,value] of Object.entries(first))assert.equal(next[key],value);
 assert.deepEqual(assignAutomaticColours(roots.slice(0,4),next,custom,'#FFFFFF'),next);
 const resolved=resolvedRepositoryColours(next,custom,'#FFFFFF');
 assert.equal(resolved[repositoryColourKey(roots[0])],'#123456');
 assert.equal(resolved[repositoryColourKey(roots[1])],undefined);
 for(const [key,value] of Object.entries(next))assert.ok(contrastRatio(resolved[key],'#FFFFFF')>=4.5);
 assert.equal(readableColour('#FFFFFF','#181818'),'#FFFFFF');
 assert.deepEqual(assignAutomaticColours([roots[0]],{},{},'#181818'),{});
});
test('No colour stays explicit, while Automatic allows assignment again',()=>{
 const key=repositoryColourKey(roots[0]);
 assert.equal(assignAutomaticColours(roots.slice(0,2),{},{[key]:'none'},'#181818')[key],undefined);
 assert.ok(assignAutomaticColours(roots.slice(0,2),{},{},'#181818')[key]);
});
