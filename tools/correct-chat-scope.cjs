'use strict';
// Explicit user corrections are separate from agent self-reporting. Never set
// CODEX_THREAD_ID or manufacture an agent report for another conversation.
const { codexHome, SessionIndex, writeScopeReport } = require('../dist/scope-store');
const { exactGitRoots } = require('../dist/report-scope');

async function correctScope(id, roots, home = codexHome()) {
  if (!id || !(await new SessionIndex(home).get(id))) {
    throw new Error('Choose an existing local VS Code conversation ID.');
  }
  return writeScopeReport(home, id, exactGitRoots(roots), 'corrections');
}

module.exports = { correctScope };
if (require.main === module) {
  correctScope(process.argv[2], process.argv.slice(3)).then(changed => {
    console.log(changed ? 'User scope correction saved.' : 'User scope correction unchanged.');
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
