'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { build, verifyPrivate } = require('../tools/build.cjs');
const root = path.resolve(__dirname,'..');

test('full build rejects a missing private checkout even with stale commercial output', t => {
  fs.mkdirSync(path.join(root,'.codex-temp'),{recursive:true});
  const fixture=fs.mkdtempSync(path.join(root,'.codex-temp','private-boundary-'));
  t.after(()=>fs.rmSync(fixture,{recursive:true,force:true}));
  fs.mkdirSync(path.join(fixture,'dist','commercial'),{recursive:true});
  fs.writeFileSync(path.join(fixture,'dist','commercial','service.js'),'throw new Error("Stale output must not be loaded");');
  assert.throws(()=>build(fixture),/private Codex Navigator checkout is required/);
});

test('public staging rejects private files and incompatible commercial contracts', t => {
  const fixture=fs.mkdtempSync(path.join(root,'.codex-temp','private-staging-'));
  t.after(()=>fs.rmSync(fixture,{recursive:true,force:true}));
  execFileSync('git',['init','--quiet',fixture],{windowsHide:true});
  const privateRoot=path.join(fixture,'proprietary'); fs.mkdirSync(path.join(privateRoot,'src'),{recursive:true});
  fs.mkdirSync(path.join(privateRoot,'.git'));
  fs.writeFileSync(path.join(privateRoot,'src','service.ts'),'// synthetic boundary fixture');
  const manifest=path.join(privateRoot,'commercial.json');
  fs.writeFileSync(manifest,JSON.stringify({contractVersion:2,entry:'src/service.ts'}));
  assert.throws(()=>verifyPrivate(fixture),/contract version 1/);
  fs.writeFileSync(manifest,JSON.stringify({contractVersion:1,entry:'src/service.ts'}));
  assert.throws(()=>verifyPrivate(fixture),/independent private Git checkout/);
  execFileSync('git',['-C',fixture,'add','--','proprietary/commercial.json'],{windowsHide:true});
  assert.throws(()=>verifyPrivate(fixture),/Private paths are tracked/);
});

test('public source has no relocated commercial implementations or implementation dependencies', () => {
  for(const name of ['license-policy','license-manager','license-provider','license-store','license-configuration']) {
    assert.equal(fs.existsSync(path.join(root,'src',name+'.ts')),false,name+' is private');
    assert.equal(fs.existsSync(path.join(root,'dist',name+'.js')),false,'stale public output is removed');
  }
  for(const name of fs.readdirSync(path.join(root,'src')).filter(name=>name.endsWith('.ts'))) {
    const source=fs.readFileSync(path.join(root,'src',name),'utf8');
    assert.ok(!/from\s+['"][^'"]*proprietary\//.test(source),name+' depends on public contracts');
  }
  const exclusions=fs.readFileSync(path.join(root,'.vscodeignore'),'utf8').split(/\r?\n/);
  for(const required of ['proprietary/**','src/**','tests/**','dist/**/*.map','dist/**/*.d.ts']) assert.ok(exclusions.includes(required),required);
});

test('public source export excludes private source, build output and scratch files', () => {
  const files=require('../tools/public-source.cjs').publicFiles(root).map(name=>name.replaceAll('\\','/'));
  assert.ok(files.includes('src/license-contracts.ts'));
  assert.ok(files.includes('src/chat-sidebar.ts'));
  assert.ok(files.every(name=>!/(^|\/)(proprietary|dist|node_modules|\.codex-temp|\.git)(\/|$)/.test(name)));
});
