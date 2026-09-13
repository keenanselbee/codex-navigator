'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { activityStatus, activitySnapshot, recordEvent, staleMs } = require('../tools/chat-activity.cjs');
const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
const event = (n, turn, name) => ({ session_id: id(n), turn_id: turn, hook_event_name: name, prompt: 'private input', last_assistant_message: 'private output' });

function scratch(t) {
  fs.mkdirSync('.codex-temp', { recursive: true });
  const home = fs.mkdtempSync(path.resolve('.codex-temp/activity-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function setupModule() {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/chat-activity'), 'utf8'), {
    exports, require: name => name === 'vscode' ? {} : name === '../tools/chat-activity.cjs' ? require('../tools/chat-activity.cjs') : require(name),
  });
  return exports;
}

test('activity is isolated per chat and old turn completion cannot stop a newer turn', async t => {
  const home = scratch(t), now = Date.now();
  await recordEvent(home, event(1, 'a', 'UserPromptSubmit'), now);
  await recordEvent(home, event(2, 'x', 'UserPromptSubmit'), now);
  await recordEvent(home, event(1, 'b', 'UserPromptSubmit'), now + 1);
  await recordEvent(home, event(1, 'a', 'Stop'), now + 2);
  assert.equal(await activityStatus(home, id(1), now + 3), 'working');
  await recordEvent(home, event(1, 'b', 'Stop'), now + 3);
  await recordEvent(home, event(1, 'b', 'UserPromptSubmit'), now + 4);
  assert.equal(await activityStatus(home, id(1), now + 5), 'idle');
  assert.equal(await activityStatus(home, id(2), now + 5), 'working');
  await recordEvent(home, event(2, 'x', 'Interrupt'), now + 5);
  assert.equal(await activityStatus(home, id(2), now + 6), 'idle');
  assert.equal((await activitySnapshot(home, id(2), now + 6)).workedAt, now + 5);
  await recordEvent(home, event(2, '', 'SessionEnd'), now + 7);
  assert.equal((await activitySnapshot(home, id(2), now + 8)).workedAt, now + 5, 'closing a session does not bump work order');
  const text = fs.readFileSync(path.join(home, 'codex-navigator/activity', id(1) + '.json'), 'utf8');
  assert.ok(!text.includes('private'));
});

test('missing, malformed, expired and ended activity is unknown; invalid identity does not write', async t => {
  const home = scratch(t), now = Date.now();
  assert.equal(await activityStatus(home, id(1), now), 'unknown');
  assert.equal(await recordEvent(home, { ...event(1, 'a', 'Stop'), session_id: '../escape' }), false);
  assert.equal(await recordEvent(home, event(1, 'a', 'SubagentStop')), false);
  assert.equal(fs.existsSync(path.join(home, 'codex-navigator')), false);
  await recordEvent(home, event(1, 'a', 'UserPromptSubmit'), now);
  assert.equal(await activityStatus(home, id(1), now + staleMs + 1), 'unknown');
  await recordEvent(home, event(1, '', 'SessionEnd'), now + 1);
  assert.equal(await activityStatus(home, id(1), now + 2), 'unknown');
  fs.writeFileSync(path.join(home, 'codex-navigator/activity', id(1) + '.json'), '{broken');
  assert.equal(await activityStatus(home, id(1), now + 2), 'unknown');
});

test('hook executable writes only status and returns empty JSON without steering output', t => {
  const home = scratch(t);
  for (const input of [JSON.stringify(event(1, 'a', 'UserPromptSubmit')), '{invalid']) {
    const result = spawnSync(process.execPath, [path.resolve('tools/chat-activity.cjs'), '--home', home], { input, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0); assert.equal(result.stdout, '{}'); assert.equal(result.stderr, '');
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'codex-navigator/activity', id(1) + '.json'))).status, 'working');
});

test('setup preserves other hooks, is idempotent, backs up changes and removes only its own hooks', async t => {
  const home = scratch(t), { configureActivityHooks } = setupModule();
  const file = path.join(home, 'hooks.json');
  const other = { description: 'My hooks', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo existing' }] }] } };
  const original = JSON.stringify(other);
  fs.writeFileSync(file, original);
  await configureActivityHooks(path.resolve('.'), home, true);
  const first = fs.readFileSync(file, 'utf8');
  assert.equal(JSON.parse(first).hooks.Stop.length, 2);
  await configureActivityHooks(path.resolve('.'), home, true);
  assert.equal(fs.readFileSync(file, 'utf8'), first);
  await configureActivityHooks(path.resolve('.'), home, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), other);
  assert.ok(fs.readdirSync(path.join(home, 'codex-navigator')).some(name => name.startsWith('hooks-backup-')));
  fs.writeFileSync(file, '{invalid');
  await assert.rejects(configureActivityHooks(path.resolve('.'), home, true));
  assert.equal(fs.readFileSync(file, 'utf8'), '{invalid');
});
