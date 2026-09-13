'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function hostFixture() {
  let receive, close, options, disposed = false;
  const sent = [];
  const panel = { webview: { cspSource: 'vscode-webview:', asWebviewUri: value => value.fsPath,
    postMessage: value => sent.push(value), onDidReceiveMessage: callback => { receive = callback; return { dispose() {} }; } },
    onDidDispose: callback => { close = callback; }, dispose() { disposed = true; close(); } };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/colour-picker'), 'utf8'), { exports,
    require: name => name === 'vscode' ? { ViewColumn: { Active: 1 }, Uri: { joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath, ...parts) }) },
      window: { createWebviewPanel: (_id, _title, _column, value) => { options = value; return panel; } } }
      : name === './colours' ? require('../dist/colours') : require(name) });
  const root = path.join(__dirname, '..');
  const result = exports.chooseColour({ extensionPath: root, extensionUri: { fsPath: root }, subscriptions: [] }, '<Chat name>', '#123', '#ABCDEF', 'Automatic (from repositories)');
  return { result, panel, sent, send: message => receive(message), get disposed() { return disposed; }, options };
}

test('picker sends target as data, validates host messages and normalises accepted colours', async () => {
  const f = hostFixture();
  assert.match(f.panel.webview.html, /default-src 'none'/);
  assert.ok(!f.panel.webview.html.includes('<Chat name>'));
  f.send({ type: 'ready' }); assert.equal(f.sent[0].initial, '#112233');
  f.send({ type: 'apply', colour: 'red;display:none' }); assert.equal(f.disposed, false);
  f.send({ type: 'apply', colour: '#aBc' }); assert.equal(await f.result, '#AABBCC');
});

test('picker distinguishes reset from cancel and closing the tab', async () => {
  const reset = hostFixture(); reset.send({ type: 'apply', colour: null }); assert.equal(await reset.result, null);
  const cancel = hostFixture(); cancel.send({ type: 'cancel' }); assert.equal(await cancel.result, undefined);
  const close = hostFixture(); close.panel.dispose(); assert.equal(await close.result, undefined);
});

test('eight presets, picker and hex stay synced; invalid input blocks apply and reset remains explicit', () => {
  const nodes = new Map(), sent = [];
  const node = () => ({ children: [], dataset: {}, value: '', attributes: {}, events: {},
    addEventListener(name, fn) { this.events[name] = fn; }, setAttribute(name, value) { this.attributes[name] = value; },
    append(item) { this.children.push(item); }, focus() {} });
  const el = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  let receive;
  vm.runInNewContext(fs.readFileSync(require.resolve('../media/colour.js'), 'utf8'), {
    acquireVsCodeApi: () => ({ postMessage: value => sent.push(value) }),
    document: { getElementById: el, createElement: node, addEventListener() {} },
    window: { addEventListener: (_event, fn) => { receive = fn; } },
  });
  receive({ data: { title: 'Chat A', initial: null, inherited: '#FF0000', resetLabel: 'Automatic (from repositories)' } });
  assert.equal(el('presets').children.length, 8);
  assert.equal(el('picker').value, '#FF0000');
  el('presets').children[5].events.click(); assert.equal(el('hex').value, '#6B8AFD');
  el('hex').value = '#abc'; el('hex').events.input(); assert.equal(el('picker').value, '#AABBCC');
  el('picker').value = '#123456'; el('picker').events.input(); assert.equal(el('hex').value, '#123456');
  el('hex').value = '#GGG'; el('hex').events.input(); assert.equal(el('apply').disabled, true);
  el('apply').events.click(); assert.equal(sent.length, 1);
  el('reset').events.click(); assert.equal(el('apply').disabled, false); assert.equal(sent.length, 1);
  el('apply').events.click(); assert.equal(sent.at(-1).colour, null);
});
