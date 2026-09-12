'use strict';
const { prepareAgentHelper, installAgentHelper } = require('../dist/agent-helper');
console.log(JSON.stringify(installAgentHelper(prepareAgentHelper(process.argv[2]))));
