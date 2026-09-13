'use strict';
const fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');

function compilePublic(root) {
  const output = path.join(root,'dist');
  if (fs.existsSync(output)) for (const entry of fs.readdirSync(output,{withFileTypes:true})) {
    if (!entry.isFile() || !/\.(js|js\.map|d\.ts)$/.test(entry.name)) continue;
    const stem = entry.name.replace(/\.(js|js\.map|d\.ts)$/,'');
    if (!fs.existsSync(path.join(root,'src',stem+'.ts'))) fs.unlinkSync(path.join(output,entry.name));
  }
  const result = spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'-p',path.join(root,'tsconfig.json')],
    {cwd:root,windowsHide:true,stdio:'inherit'});
  if (result.error || result.status !== 0) throw new Error('Public compilation failed.');
}
module.exports = { compilePublic };
if (require.main === module) {
  try { compilePublic(path.resolve(__dirname,'..')); }
  catch(error) { console.error(error.message); process.exitCode=1; }
}
