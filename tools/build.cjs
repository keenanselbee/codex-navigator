'use strict';
const fs = require('node:fs'), path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { compilePublic } = require('./compile.cjs');

function verifyPrivate(root) {
  const directory = path.join(root,'proprietary');
  const manifest = path.join(directory,'commercial.json');
  if (!fs.existsSync(manifest) || !fs.existsSync(path.join(directory,'.git'))) {
    throw new Error('The private Codex Navigator checkout is required at proprietary/. Public checks are available with npm test.');
  }
  const config = JSON.parse(fs.readFileSync(manifest,'utf8'));
  if (config.contractVersion !== 1 || config.entry !== 'src/service.ts' || !fs.existsSync(path.join(directory,config.entry))) {
    throw new Error('The private checkout does not implement licensing contract version 1.');
  }
  const tracked = execFileSync('git',['-C',root,'ls-files','--','proprietary'],{encoding:'utf8',windowsHide:true}).trim();
  if (tracked) throw new Error('Private paths are tracked by the public repository. Remove them from public staging before building.');
  let privateRoot;
  try { privateRoot = execFileSync('git',['-C',directory,'rev-parse','--show-toplevel'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim(); }
  catch { throw new Error('proprietary/ must be an independent private Git checkout.'); }
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (normalize(privateRoot) !== normalize(directory)) {
    throw new Error('proprietary/ must be an independent private Git checkout.');
  }
  return directory;
}

function build(root) {
  const directory = verifyPrivate(root); // Fail before accepting stale compiled commercial output.
  compilePublic(root);
  const result = spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'-p',path.join(directory,'tsconfig.json')],
    {cwd:root,windowsHide:true,stdio:'inherit'});
  if (result.error || result.status !== 0) throw new Error('Commercial compilation failed.');
  const destination = path.join(root,'dist','commercial');
  fs.mkdirSync(destination,{recursive:true});
  const sources = fs.readdirSync(path.join(directory,'src')).filter(name=>name.endsWith('.ts'));
  const expected = new Set(sources.map(name=>name.replace(/\.ts$/,'.js')));
  for (const entry of fs.readdirSync(destination,{withFileTypes:true})) {
    if (entry.isFile() && !expected.has(entry.name)) fs.unlinkSync(path.join(destination,entry.name));
  }
  for (const name of expected) fs.copyFileSync(path.join(directory,'dist',name),path.join(destination,name));
  console.log('Built one extension from the public and private checkouts.');
}
module.exports = { build, verifyPrivate };
if (require.main === module) {
  try { build(path.resolve(__dirname,'..')); }
  catch(error) { console.error(error.message); process.exitCode=1; }
}
