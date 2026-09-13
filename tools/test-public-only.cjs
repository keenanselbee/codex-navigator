'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {publicFiles}=require('./public-source.cjs');
const root=path.resolve(__dirname,'..'),scratch=path.join(root,'.codex-temp');
fs.mkdirSync(scratch,{recursive:true});
const snapshot=fs.mkdtempSync(path.join(scratch,'public-only-'));
fs.mkdirSync(path.join(snapshot,'.codex-temp'));
for(const relative of publicFiles(root)) {
  const destination=path.join(snapshot,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.copyFileSync(path.join(root,relative),destination);
}
// Share only the installed public toolchain, never the private checkout or build output.
fs.symlinkSync(path.join(root,'node_modules'),path.join(snapshot,'node_modules'),'junction');
function run(args) {
  const result=spawnSync(process.execPath,args,{cwd:snapshot,windowsHide:true,encoding:'utf8'});
  fs.appendFileSync(path.join(snapshot,'checks.log'),(result.stdout||'')+(result.stderr||''));
  return result;
}
const compiled=run(['tools/compile.cjs']);
if(compiled.error||compiled.status!==0) throw new Error('Public-only compilation failed: '+snapshot);
const tested=run(['--test','tests/*.test.cjs']);
if(tested.error||tested.status!==0) throw new Error('Public-only tests failed: '+snapshot);
const full=run(['tools/build.cjs']);
if(full.status===0||!full.stderr.includes('private Codex Navigator checkout is required')) throw new Error('Missing-private build guard failed: '+snapshot);
console.log(JSON.stringify({snapshot,publicTests:'passed',missingPrivateBuild:'rejected',privateSourceIncluded:false},null,2));
