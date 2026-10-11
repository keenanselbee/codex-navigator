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
const chat = (status, extra = {}) => {
  const { asyncQuestion, questionReplies, ...activity } = extra;
  const questions = activity.questions || {
    requests: asyncQuestion ? [{ ...asyncQuestion, count: 1, accepted: true }] : [],
    replies: (questionReplies || []).map(reply => ({ index: 0, ...reply })), observedAt: 0,
  };
  return [{ id: 'chat-a', title: 'Build Navigator', activity: { status, workedAt: 0, turnId: 'turn-a', ...activity, questions } }];
};
const policy = (enabled = true, suppress = true) => {
  const mode = !enabled ? 'off' : suppress ? 'whenUnfocused' : 'always';
  return { finished: { sound: mode, desktop: mode }, input: { sound: mode, desktop: mode } };
};
const observe = (window, rows, time = 10000, enabled = true, suppress = true) => window.observe(rows, time, policy(enabled, suppress));

const repliesSnapshot = (...entries) => Object.freeze(entries.map(entry => Object.freeze(entry)));
const answerAlert = (chatId = 'chat-a', index = 0) => ({ kind: 'input', chatId, questionId: 'q', questionIndices: [index] });
function countAnswerWrites(window) {
  const run = window.answerInsert.run.bind(window.answerInsert);
  let count = 0;
  window.answerInsert.run = (...args) => { count++; return run(...args); };
  return () => count;
}
function writeSnapshot(window, via, replies, time = 10000, chatId = 'chat-a') {
  if (via === 'delivery') window.recordAnswers(chatId, replies, time);
  else window.observe([{ id: chatId, title: 'Test', activity: {
    status: 'working', workedAt: 0, questions: { requests: [], replies, observedAt: time },
  } }], time, policy());
}

test('unchanged full reply snapshots perform no repeat inserts in refresh or delivery', t => {
  const a = fixture(t).create(), writes = countAnswerWrites(a);
  const replies = repliesSnapshot(...Array.from({ length: 1024 }, (_, n) => ({ id: 'q' + n, index: 0, answeredAt: 9000 })));
  writeSnapshot(a, 'refresh', replies);
  assert.equal(writes(), 1024);
  writeSnapshot(a, 'refresh', replies, 11000);
  writeSnapshot(a, 'delivery', replies, 12000);
  assert.equal(writes(), 1024);
  const changed = repliesSnapshot(...replies.slice(1), { id: 'new', index: 0, answeredAt: 12000 });
  writeSnapshot(a, 'delivery', changed, 13000);
  writeSnapshot(a, 'refresh', changed, 14000);
  assert.equal(writes(), 2048, 'changed snapshots are committed once across both paths');
});

for (const via of ['refresh', 'delivery']) {
  for (const failure of ['insert', 'commit']) {
    test(`${via} retries the identical snapshot after ${failure} failure rolls back answers`, t => {
      const a = fixture(t).create();
      const replies = repliesSnapshot({ id: 'q', index: 0, answeredAt: 9000 }, { id: 'q', index: 1, answeredAt: 9000 });
      const target = failure === 'insert' ? a.answerInsert : a.db;
      const method = failure === 'insert' ? 'run' : 'exec';
      const original = target[method].bind(target);
      let inserts = 0, failed = false;
      target[method] = (...args) => {
        const fail = failure === 'insert' ? ++inserts === 2 : args[0] === 'COMMIT';
        if (!failed && fail) { failed = true; throw Error('Injected transaction failure'); }
        return original(...args);
      };
      assert.throws(() => writeSnapshot(a, via, replies), /Injected transaction failure/);
      assert.equal(a.canDeliver(answerAlert()), true, 'the first insert was rolled back');
      assert.equal(a.canDeliver(answerAlert('chat-a', 1)), true);
      writeSnapshot(a, via, replies);
      assert.equal(a.canDeliver(answerAlert()), false, 'the identical snapshot was retried');
      assert.equal(a.canDeliver(answerAlert('chat-a', 1)), false);
    });
  }
}

test('equal timestamps, late replies and shared arrays across chats do not hide partial answers', t => {
  const a = fixture(t).create();
  const first = repliesSnapshot({ id: 'q', index: 0, answeredAt: 9000 });
  writeSnapshot(a, 'refresh', first);
  assert.equal(a.canDeliver(answerAlert('chat-a', 1)), true);
  const equal = repliesSnapshot(...first, { id: 'q', index: 1, answeredAt: 9000 });
  writeSnapshot(a, 'delivery', equal);
  const late = repliesSnapshot(...equal, { id: 'q', index: 2, answeredAt: 8000 });
  writeSnapshot(a, 'refresh', late);
  for (const index of [0, 1, 2]) assert.equal(a.canDeliver(answerAlert('chat-a', index)), false);
  assert.equal(a.canDeliver(answerAlert('chat-b')), true);
  writeSnapshot(a, 'delivery', late, 10000, 'chat-b');
  assert.equal(a.canDeliver(answerAlert('chat-b')), false);
});

test('future replies are reconsidered when time catches up, in either transaction path', t => {
  for (const via of ['refresh', 'delivery']) {
    const a = fixture(t).create();
    const replies = repliesSnapshot({ id: 'q', index: 0, answeredAt: 9000 }, { id: 'q', index: 1, answeredAt: 20000 });
    writeSnapshot(a, via, replies);
    assert.equal(a.canDeliver(answerAlert()), false);
    assert.equal(a.canDeliver(answerAlert('chat-a', 1)), true);
    writeSnapshot(a, via, replies, 15000);
    assert.equal(a.canDeliver(answerAlert('chat-a', 1)), false);
  }
});

test('answer cache stays bounded and reset, eviction and disposal preserve database authority', t => {
  const f = fixture(t), a = f.create(), b = f.create(), writes = countAnswerWrites(a);
  const replies = repliesSnapshot({ id: 'q', index: 0, answeredAt: 9000 });
  for (let n = 0; n < 201; n++) writeSnapshot(a, 'delivery', replies, 10000, 'chat-' + n);
  assert.equal(a.recordedReplies.size, 200);
  assert.equal(writes(), 201);
  writeSnapshot(a, 'delivery', replies, 10000, 'chat-200');
  assert.equal(writes(), 201);
  writeSnapshot(a, 'delivery', replies, 10000, 'chat-0');
  assert.equal(writes(), 202, 'an evicted snapshot can be recorded again');
  a.reset();
  assert.equal(a.recordedReplies.size, 0);
  assert.equal(b.canDeliver(answerAlert('chat-0')), false, 'reset does not erase shared answers');
  writeSnapshot(a, 'delivery', replies, 10000, 'chat-0');
  assert.equal(writes(), 203);
  a.dispose();
  assert.equal(a.recordedReplies.size, 0);
  a.recordAnswers('chat-0', replies, 10000);
  assert.equal(writes(), 203);
  assert.equal(b.canDeliver(answerAlert('chat-0')), false);
});

test('answer cancels a queued async alert across windows without cancelling completion or a different question', t => {
 const f=fixture(t), a=f.create(), b=f.create();
 observe(a,chat('working')); observe(b,chat('working'));
 const asyncQuestion={id:'q1',askedAt:11000};
 const [alert]=observe(a,chat('working',{asyncQuestion}),12000);
 assert.equal(a.canDeliver(alert),true);
 observe(b,chat('unknown',{questionReplies:[{id:'q1',answeredAt:13000}]}),14000);
 assert.equal(a.canDeliver(alert),false,'a different window can cancel even during an unknown activity gap');
 observe(a,chat('working',{asyncQuestion}),12500);
 assert.equal(a.canDeliver(alert),false,'a stale sample cannot resurrect the alert');
 const [finished]=observe(a,chat('ready',{asyncQuestion,completedAt:15000}),16000);
 assert.equal(finished.kind,'finished'); assert.equal(a.canDeliver(finished),true);
 const [next]=observe(a,chat('working',{asyncQuestion:{id:'q2',askedAt:17000}}),18000);
 assert.equal(a.canDeliver(next),true);
 const other=f.create(false,3,'different-home');
 other.recordAnswers('chat-a',[{id:'q2',index:0,answeredAt:18000}],18000);
 assert.equal(a.canDeliver(next),true);
});

test('question answered before the first poll stays quiet and blocking replies cancel only their episode', t => {
 const a=fixture(t).create(); observe(a,chat('working'));
 assert.deepEqual(observe(a,chat('working',{asyncQuestion:{id:'q',askedAt:11000},questionReplies:[{id:'q',answeredAt:11500}]}),12000),[]);
 const [blocking]=observe(a,chat('waiting',{inputId:'blocking'}),13000);
 assert.equal(a.canDeliver(blocking),true);
 observe(a,chat('working'),14000); assert.equal(a.canDeliver(blocking),false);
 const [next]=observe(a,chat('waiting',{inputId:'next'}),15000);
 assert.equal(a.canDeliver(blocking),false); assert.equal(a.canDeliver(next),true);
});

test('delivery skips answered popup and sound and rechecks the answer between channels', async t => {
 const { NotificationDelivery }=require('../dist/notification-delivery');
 const a=fixture(t).create(), calls=[]; observe(a,chat('working'));
 const [alert]=observe(a,chat('working',{asyncQuestion:{id:'q',askedAt:11000}}),12000);
 const delivery=new NotificationDelivery({extensionPath:path.join(__dirname,'..'),platform:'win32',report:()=>{},
   run:async()=>{calls.push('popup');a.recordAnswers('chat-a',[{id:'q',index:0,answeredAt:13000}],13000);return true;}});
 await delivery.deliver({...alert,canDeliver:()=>a.canDeliver(alert)});
 assert.deepEqual(calls,['popup'],'answer after popup suppresses the pending sound');
 calls.length=0;
 await delivery.deliver({...alert,canDeliver:()=>a.canDeliver(alert)});
 assert.deepEqual(calls,[],'answer before dispatch suppresses both channels');
});

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

test('multiple requests alert independently and partial replies retain the remaining question across windows', t => {
 const f=fixture(t), a=f.create(), b=f.create();
 observe(a,chat('working')); observe(b,chat('working'));
 const questions={requests:[{id:'q1',askedAt:11000,count:2,accepted:true},{id:'q2',askedAt:11000,count:1,accepted:true}],replies:[],observedAt:11000};
 const alerts=observe(a,chat('working',{questions}),12000);
 assert.deepEqual(alerts.map(alert=>alert.questionId),['q1','q2']);
 observe(b,chat('working',{questions:{...questions,replies:[{id:'q1',index:0,answeredAt:13000}]}}),14000);
 assert.equal(a.canDeliver(alerts[0]),true,'the second question is still outstanding');
 observe(b,chat('working',{questions:{...questions,replies:[{id:'q1',index:1,answeredAt:15000}]}}),16000);
 assert.equal(a.canDeliver(alerts[0]),false,'all replies are shared across windows');
 assert.equal(a.canDeliver(alerts[1]),true,'another request remains outstanding');
 observe(a,chat('working',{questions}),12500);
 assert.equal(a.canDeliver(alerts[0]),false,'older state cannot undo resolution');
});

test('an accepted async question still alerts when the turn is interrupted before refresh', t => {
 const a=fixture(t).create(); observe(a,chat('working'));
 const prompt=chat('unknown',{asyncQuestion:{id:'q',askedAt:11000}});
 assert.equal(observe(a,prompt,12000).length,1);
 assert.deepEqual(observe(a,prompt,13000),[]);
 const b=fixture(t).create();
 assert.deepEqual(observe(b,prompt,12000),[],'reopening on an existing question is a quiet baseline');
});
