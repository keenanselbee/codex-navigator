'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {RoutingPublisher,resolveRouting,instructionPaths}=require('../dist/routing');
const {hideRedundantLabel}=require('../dist/model');
const id='00000000-0000-0000-0000-000000000001';

test('only redundant automatic labels are hidden, counting nested Git roots separately',()=>{
  const a=path.resolve('A'), b=path.join(a,'private');
  assert.equal(hideRedundantLabel([a],[a],true,true),true);
  assert.equal(hideRedundantLabel([a],[a,a],true,true),true);
  for(const [roots,repos,auto,enabled] of [[[a],[a,b],true,true],[[b],[a],true,true],[[a],[a],false,true],[[a],[a],true,false],[[a,b],[a],true,true],[[a],[],true,true]]) {
    assert.equal(hideRedundantLabel(roots,repos,auto,enabled),false);
  }
});

test('routing uses verified chat identity, main first, overrides, explicit focus and bounded nested file paths',async()=>{
  const home=await fs.mkdtemp(path.join(__dirname,'..','.codex-temp','routing-'));
  const parent=path.join(home,'repo'), nested=path.join(parent,'private'), src=path.join(nested,'src');
  await fs.mkdir(src,{recursive:true});
  for(const root of [parent,nested]) execFileSync('git',['init','--quiet',root],{windowsHide:true});
  const main=path.join(home,'shared.md');await fs.writeFile(main,'Shared rules');
  const parentAgents=path.join(parent,'AGENTS.md'), nestedAgents=path.join(nested,'AGENTS.override.md'), srcAgents=path.join(src,'AGENTS.md');
  for(const file of [parentAgents,nestedAgents,srcAgents]) await fs.writeFile(file,'Rules');
  await fs.writeFile(path.join(nested,'AGENTS.md'),'Overridden');
  const sessionDir=path.join(home,'sessions','2026','09','12');await fs.mkdir(sessionDir,{recursive:true});
  const sessionFile=path.join(sessionDir,`rollout-${id}.jsonl`);
  await fs.writeFile(sessionFile,JSON.stringify({type:'session_meta',payload:{id,cwd:parent,source:'vscode'}}));
  const publisher=new RoutingPublisher(home), other=new RoutingPublisher(home);
  const snapshot={version:1,pid:process.pid,main,chats:{['local/'+id]:[nested]}};
  try {
    assert.equal((await resolveRouting([],home,id)).enabled,false);
    await Promise.all([publisher.publish({...snapshot,chats:{}}), publisher.publish(snapshot)]);
    await fs.writeFile(path.join(home,'repo-companion','routing','malformed.json'),'null');
    const result=await resolveRouting(['--file',path.join(src,'future.ts')],home,id);
    assert.deepEqual(result.roots,[nested]);
    assert.equal(result.instructions[0],main);
    assert.ok(result.instructions.indexOf(parentAgents)<result.instructions.indexOf(nestedAgents));
    assert.ok(result.instructions.includes(srcAgents));
    assert.ok(!result.instructions.includes(path.join(nested,'AGENTS.md')));
    assert.deepEqual((await resolveRouting(['--target',parent],home,id)).roots,[parent]);
    await assert.rejects(resolveRouting(['--file',path.join(home,'outside.ts')],home,id),/inside/);
    await assert.rejects(resolveRouting([],home,'bad-id'),/verified/);
    await other.publish({...snapshot,chats:{['local/'+id]:[parent]}});
    await assert.rejects(resolveRouting([],home,id),/disagree/);
    assert.deepEqual((await resolveRouting(['--target',parent],home,id)).roots,[parent]);
    await other.dispose();
    await publisher.publish({...snapshot,chats:{['local/'+id]:[]}});
    assert.deepEqual((await resolveRouting([],home,id)).roots,[]);
    await publisher.publish();
    assert.equal((await resolveRouting([],home,id)).enabled,false);
    await assert.rejects(instructionPaths(path.join(home,'missing.md'),[parent]),/ENOENT/);
    await fs.writeFile(sessionFile,JSON.stringify({type:'session_meta',payload:{id,cwd:parent,source:{subagent:{}}}}));
    await assert.rejects(resolveRouting([],home,id),/verified/);
  } finally {await publisher.dispose();await other.dispose();}
});
