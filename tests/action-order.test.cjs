'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../media/action-order.js'), 'utf8');

test('action and cancel follow the VS Code client platform in DOM order', () => {
  for (const [client, expected] of [
    ['Win32', ['Apply', 'Cancel']],
    ['MacIntel', ['Cancel', 'Apply']],
    ['Linux x86_64', ['Cancel', 'Apply']],
  ]) {
    const context = vm.createContext({ navigator: { platform: client } });
    vm.runInContext(source, context);
    const apply = { textContent: 'Apply' }, cancel = { textContent: 'Cancel' };
    context.apply = apply; context.cancel = cancel;
    const children = [apply, cancel];
    const footer = { append(...buttons) {
      for (const button of buttons) children.splice(children.indexOf(button), 1);
      children.push(...buttons);
    } };
    footer.append(...vm.runInContext('navigatorActionOrder(apply, cancel)', context));
    assert.deepEqual(children.map(button => button.textContent), expected, client);
  }
});

test('modern client platform takes precedence over legacy browser fields', () => {
  const context = vm.createContext({ navigator: { userAgentData: { platform: 'Windows' }, platform: 'Linux x86_64' } });
  vm.runInContext(source, context);
  const action = {}, cancel = {};
  context.action = action; context.cancel = cancel;
  assert.deepEqual(Array.from(vm.runInContext('navigatorActionOrder(action, cancel)', context)), [action, cancel]);
});
