'use strict';
const fs = require('node:fs'), path = require('node:path');

// Explicit source-export boundary. Git ignore rules alone are not an archive policy.
function publicFiles(root) {
  const files = [];
  const excluded = new Set(['.git','.codex-temp','node_modules','proprietary','dist','artifacts']);
  function visit(relative) {
    const absolute=path.join(root,relative), stat=fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error('Public source export does not follow links: '+relative);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute).sort()) if (!excluded.has(entry)) visit(path.join(relative,entry));
    } else if (/\.(?:ts|js|cjs|json|md|css|html|svg|png|gif|jpe?g|ps1|txt|ya?ml)$/.test(relative)) files.push(relative);
  }
  for (const directory of ['src','media','tests','tools','docs','images']) if (fs.existsSync(path.join(root,directory))) visit(directory);
  for (const name of ['AGENTS.md','README.md','LICENSE.md','PRIVACY.md','CHANGELOG.md','package.json','package-lock.json','tsconfig.json','.gitignore','.vscodeignore']) {
    if (fs.existsSync(path.join(root,name))) files.push(name);
  }
  return files.sort();
}
module.exports={publicFiles};
