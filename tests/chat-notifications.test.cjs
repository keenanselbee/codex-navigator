'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { ChatNotifications } = require('../dist/chat-notifications');

function fixture(t) {
  const scratch = path.join(__dirname, '..', '.codex-temp'); fs.mkdirSync(scratch, { recursive: true });
  const directory = fs.mkdtempSync(path.join(scratch, 'notifications-'));
  const windows = [], dead = new Set();
  const create = (focused = false, pid = 1, home = 'home') => {
    const instance = new ChatNotifications(directory, home, focused, id => !dead.has(id), pid);
    windows.push(instance); return instance;
  };
  t.after(() => { windows.forEach(w => w.dispose()); fs.rmSync(directory, { recursive: true, force: true }); });
  return { create, dead };
}
const chat = (status, extra = {}) => [{ id: 'chat-a', title: 'Build Navigator', activity: { status, workedAt: 0, turnId: 'turn-a', ...extra } }];
const policy = (enabled = true, suppress = true) => {
  const mode = !enabled ? 'off' : suppress ? 'whenUnfocused' : 'always';
  return { finished: { sound: mode, desktop: mode }, input: { sound: mode, desktop: mode } };
};
const observe = (window, rows, time = 10000, enabled = true, suppress = true) => window.observe(rows, time, policy(enabled, suppress));

test('event-specific channels use shared focus and never replay a suppressed channel', t => {
  const f = fixture(t), a = f.create(), b = f.create(true, 2);
  const rules = { finished: { sound: 'always', desktop: 'whenUnfocused' }, input: { sound: 'whenFocused', desktop: 'always' } };
  a.observe(chat('working'),10000,rules); b.observe(chat('working'),10000,rules);
  const finished = chat('ready',{completedAt:11000});
  const alerts = a.observe(finished,12000,rules);
  assert.equal(alerts[0].chatId,'chat-a','notification retains the originating chat identity');
  assert.deepEqual(alerts.map(({kind,sound,desktop}) => ({kind,sound,desktop})), [{kind:'finished',sound:true,desktop:false}]);
  assert.deepEqual(b.observe(finished,12000,rules), []);
  b.setFocused(false);
  assert.deepEqual(a.observe(finished,13000,rules), [], 'desktop is not replayed after focus changes');
  const prompt=chat('working',{asyncQuestion:{id:'q',askedAt:14000}});
  assert.deepEqual(a.observe(prompt,15000,rules).map(({kind,sound,desktop}) => ({kind,sound,desktop})), [{kind:'input',sound:false,desktop:true}]);
  b.setFocused(true); assert.deepEqual(b.observe(prompt,16000,rules), [], 'sound is not replayed in a second window');
});

test('switching a disabled policy on does not replay an already observed event', t => {
  const a=fixture(t).create(), off=policy(false), on=policy(true,false);
  a.observe(chat('working'),10000,off);
  const question=chat('waiting',{inputId:'q'});
  assert.deepEqual(a.observe(question,11000,off),[]);
  assert.deepEqual(a.observe(question,12000,on),[]);
});

test('async question alerts once across windows while working and preserves a separate completion', t => {
  const f = fixture(t), a = f.create(), b = f.create();
  observe(a, chat('working')); observe(b, chat('working'));
  const asyncQuestion = { id: 'async-q1', askedAt: 11000 };
  const prompt = chat('working', { asyncQuestion });
  assert.match(observe(a, prompt, 12000)[0].message, /has a question/);
  assert.deepEqual(observe(b, prompt, 13000), []);
  assert.deepEqual(observe(a, prompt, 14000), []);
  const ready = chat('ready', { asyncQuestion, completedAt: 15000 });
  assert.match(observe(a, ready, 16000)[0].message, /finished/);
  assert.deepEqual(observe(b, ready, 17000), []);
  assert.match(observe(a, chat('working', { asyncQuestion: { id: 'async-q2', askedAt: 18000 } }), 19000)[0].message, /has a question/);
});

test('async questions seen with completion still alert, but old, initial and suppressed prompts do not replay', t => {
  const f = fixture(t), a = f.create();
  const prompt = chat('working', { asyncQuestion: { id: 'q1', askedAt: 11000 } });
  assert.deepEqual(observe(a, prompt, 12000), []);
  a.reset(); observe(a, chat('working'), 13000);
  a.setFocused(true); assert.deepEqual(observe(a, prompt, 14000), []);
  a.setFocused(false); assert.deepEqual(observe(a, prompt, 15000), []);
  const ready = chat('ready', { asyncQuestion: { id: 'q2', askedAt: 16000 }, completedAt: 17000 });
  assert.deepEqual(observe(a, ready, 18000).map(alert => alert.message), ['Codex has a question for you.', 'Codex finished a response.']);
  assert.deepEqual(observe(a, chat('working', { asyncQuestion: { id: 'old', askedAt: 10000 } }), 90000), []);
});

test('a completed turn alerts once across windows and repeated refreshes', t => {
  const f = fixture(t), a = f.create(), b = f.create();
  observe(a, chat('working')); observe(b, chat('working'));
  const finished = chat('ready', { completedAt: 11000 });
  assert.equal(observe(a, finished, 12000).length, 1);
  assert.equal(observe(b, finished, 12000).length, 0);
  assert.equal(observe(a, finished, 17000).length, 0);
});

test('focus in any Navigator window suppresses alerts and never replays them on blur', t => {
  const f = fixture(t), a = f.create(), b = f.create(true, 2, 'another-home');
  observe(a, chat('working'));
  const finished = chat('ready', { completedAt: 11000 });
  assert.deepEqual(observe(a, finished, 12000), []);
  b.setFocused(false);
  assert.deepEqual(observe(a, finished, 17000), []);
  observe(a, chat('working', { turnId: 'turn-b' }), 18000);
  assert.equal(observe(a, chat('ready', { turnId: 'turn-b', completedAt: 19000 }), 20000).length, 1);
});

test('startup and reopening establish a quiet baseline, including old questions', t => {
  const f = fixture(t), a = f.create();
  assert.deepEqual(observe(a, chat('ready', { completedAt: 9000 })), []);
  observe(a, chat('working'), 12000); a.reset();
  assert.deepEqual(observe(a, chat('waiting', { inputId: 'q1' }), 13000), []);
  assert.deepEqual(observe(a, chat('waiting', { inputId: 'q1' }), 18000), []);
  assert.equal(observe(a, chat('waiting', { inputId: 'q2' }), 23000).length, 1);
});

test('new question IDs and runtime-only approval episodes alert once each', t => {
  const f = fixture(t), a = f.create(), b = f.create();
  observe(a, chat('working')); observe(b, chat('working'));
  const waiting = chat('waiting', { detail: 'Waiting for approval' });
  assert.match(observe(a, waiting, 11000)[0].message, /approval/);
  assert.deepEqual(observe(b, waiting, 12000), []);
  observe(a, chat('working'), 13000); observe(b, chat('working'), 13000);
  assert.equal(observe(b, waiting, 14000).length, 1);
  assert.deepEqual(observe(a, waiting, 15000), []);
});

test('another window opening on the new state cannot consume an existing observer alert', t => {
  const f = fixture(t), a = f.create(), b = f.create();
  observe(a, chat('working'));
  const finished = chat('ready', { completedAt: 11000 });
  assert.deepEqual(observe(b, finished, 12000), []);
  assert.equal(observe(a, finished, 13000).length, 1);
});

test('stale samples, unknown signal gaps, disabled alerts and old completions stay quiet', t => {
  const f = fixture(t), a = f.create(), b = f.create();
  observe(a, chat('working')); observe(b, chat('working'));
  const waiting = chat('waiting');
  assert.equal(observe(a, waiting, 12000).length, 1);
  observe(b, chat('working'), 11000);
  assert.deepEqual(observe(b, waiting, 13000), []);
  observe(a, chat('unknown'), 14000);
  assert.deepEqual(observe(a, waiting, 15000), []);
  observe(a, chat('working'), 16000);
  assert.deepEqual(observe(a, chat('ready', { completedAt: 17000 }), 18000, false), []);
  assert.deepEqual(observe(a, chat('ready', { completedAt: 17000 }), 19000), []);
  observe(a, chat('working', { turnId: 'old' }), 90000);
  assert.deepEqual(observe(a, chat('ready', { turnId: 'old', completedAt: 19000 }), 91000), []);
});

test('dead windows do not suppress alerts, and users can opt into focused alerts', t => {
  const f = fixture(t), a = f.create(), b = f.create(true, 2);
  f.dead.add(2); assert.equal(a.anyFocused(), false);
  a.setFocused(true); observe(a, chat('working'));
  assert.equal(observe(a, chat('waiting', { inputId: 'q1' }), 11000, true, false).length, 1);
});

test('runtime request enrichment shares one episode across observers and new IDs still alert', t => {
  const f = fixture(t), a = f.create(), b = f.create();
  observe(a, chat('working')); observe(b, chat('working'));
  assert.equal(observe(a, chat('waiting'), 11000).length, 1);
  assert.deepEqual(observe(b, chat('waiting', { inputId: 'q1' }), 12000), []);
  assert.deepEqual(observe(a, chat('waiting', { inputId: 'q1' }), 13000), []);
  assert.equal(observe(a, chat('waiting', { inputId: 'q2' }), 14000).length, 1);
  assert.deepEqual(observe(b, chat('waiting', { inputId: 'q2' }), 15000), []);
});

test('initial unknown signals do not turn recovery into a historical input alert', t => {
  const f = fixture(t), a = f.create();
  observe(a, chat('unknown'));
  assert.deepEqual(observe(a, chat('waiting', { inputId: 'old' }), 15000), []);
  a.reset(); observe(a, chat('unknown'), 20000);
  assert.deepEqual(observe(a, chat('ready', { completedAt: 18000 }), 25000), []);
});

test('a completion during a slow read uses delivery time for freshness', t => {
  const f = fixture(t), a = f.create(); observe(a, chat('working'));
  assert.equal(a.observe(chat('ready', { completedAt: 18000 }), 11000, policy(), 21000).length, 1);
});

test('a newer window baseline cannot permanently consume a slower observer transition', t => {
  const f = fixture(t), a = f.create(), b = f.create(); observe(a, chat('working'));
  const finished = chat('ready', { completedAt: 16000 });
  assert.deepEqual(observe(b, finished, 17000), []);
  assert.deepEqual(a.observe(finished, 15000, policy(), 18000), []);
  assert.equal(observe(a, finished, 20000).length, 1);
  assert.deepEqual(observe(b, finished, 21000), []);
});
