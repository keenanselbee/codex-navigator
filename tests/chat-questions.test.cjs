const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reduceQuestions, unansweredQuestions, pendingQuestionIndices, questionLifetime } = require('../dist/chat-questions');

const start = 1700000000000;
const item = (payload, time = start) => ({ timestamp: new Date(time).toISOString(), type: 'response_item', payload });
const call = (id, count = 1, time = start, name = 'request_user_input_async') => item({
  type: 'function_call', name, call_id: id,
  arguments: JSON.stringify({ questions: Array.from({ length: count }, (_, index) => ({ title: `Private question ${index}` })) }),
}, time);
const ack = (id, output = '{"accepted":true}', time = start + 1) => item({ type: 'function_call_output', call_id: id, output }, time);
const replyText = entries => `<send_user_message_question_reply>\n${JSON.stringify(entries)}\n</send_user_message_question_reply>`;
const answer = (id, index, value = 'Private answer') => ({
  questionItemId: JSON.stringify(['request_user_input_async', id, index]), question: 'Private question', answer: value,
});
const reply = (entries, time = start + 2, source = 'event_msg') => source === 'event_msg'
  ? { timestamp: new Date(time).toISOString(), type: source, payload: { type: 'user_message', message: replyText(entries) } }
  : item({ type: 'message', role: 'user', content: [{ type: 'input_text', text: replyText(entries) }] }, time);
const apply = (state, record) => reduceQuestions(state, record, Date.parse(record.timestamp));

test('structured replies require all three string fields without retaining content or rejecting extra fields', () => {
  const initial = apply(apply(undefined, call('a')), ack('a'));
  for (const source of ['event_msg', 'response_item']) {
    for (const field of ['questionItemId', 'question', 'answer']) {
      for (const value of [undefined, null, 1, {}, []]) {
        const malformed = { ...answer('a', 0), [field]: value };
        assert.equal(apply(initial, reply([malformed], start + 2, source)), initial);
      }
    }
    const valid = { ...answer('a', 0, ''), question: '', extra: 'Private metadata' };
    const resolved = apply(initial, reply([valid], start + 2, source));
    assert.deepEqual(resolved.replies, [{ id: 'a', index: 0, answeredAt: start + 2 }]);
    assert.deepEqual(unansweredQuestions(resolved, start + 2), []);
    assert.equal(JSON.stringify(resolved).includes('Private'), false);
  }
});

test('request progress reuses reply snapshots and new answers replace them without mutation', () => {
  let state = apply(undefined, reply([answer('a', 0)], start));
  const replies = state.replies;
  Object.freeze(replies[0]); Object.freeze(replies);
  state = apply(state, call('b', 1, start + 1));
  state = apply(state, ack('b', '{"accepted":true}', start + 2));
  assert.equal(state.replies, replies);
  state = apply(state, reply([answer('b', 0)], start + 3));
  assert.notEqual(state.replies, replies);
  assert.equal(replies.length, 1);
  assert.equal(state.replies.length, 2);
});

test('accepted requests retain only IDs and times; partial indexed replies leave other questions pending', () => {
  for (const name of ['request_user_input_async', 'functions.request_user_input_async']) {
    let state = apply(undefined, call('a', 3, start, name));
    assert.deepEqual(unansweredQuestions(state, start + 1), []);
    state = apply(state, ack('a'));
    assert.deepEqual(pendingQuestionIndices(state.requests[0], state.replies), [0, 1, 2]);
    state = apply(state, reply([answer('a', 1)], start + 2));
    assert.deepEqual(pendingQuestionIndices(state.requests[0], state.replies), [0, 2]);
    assert.deepEqual(unansweredQuestions(state, start + 2).map(request => request.id), ['a']);
    assert.equal(JSON.stringify(state).includes('Private'), false);
    state = apply(state, reply([answer('a', 0), answer('a', 2)], start + 3, 'response_item'));
    assert.deepEqual(pendingQuestionIndices(state.requests[0], state.replies), []);
    assert.deepEqual(unansweredQuestions(state, start + 3), []);
  }
});

test('multiple requests and replies are independent, including a reply observed before its request', () => {
  let state = apply(undefined, reply([answer('later', 0)], start));
  state = apply(state, call('first', 2, start + 1));
  state = apply(state, ack('first', '{"accepted":true}', start + 2));
  state = apply(state, call('later', 2, start + 3));
  state = apply(state, ack('later', '{"accepted":true}', start + 4));
  assert.deepEqual(unansweredQuestions(state, start + 4).map(request => request.id), ['first', 'later']);
  assert.deepEqual(pendingQuestionIndices(state.requests[1], state.replies), [1]);
  state = apply(state, reply([answer('first', 0)], start + 5));
  assert.deepEqual(pendingQuestionIndices(state.requests[0], state.replies), [1]);
  assert.deepEqual(pendingQuestionIndices(state.requests[1], state.replies), [1]);
});

test('only a matching accepted acknowledgement exposes a request', () => {
  const called = apply(undefined, call('a'));
  assert.equal(apply(called, ack('other')).requests[0].accepted, false);
  for (const output of ['{"accepted":false}', '{}', 'error', '{"accepted":"true"}']) {
    const state = apply(called, ack('a', output));
    assert.deepEqual(unansweredQuestions(state, start + 2), []);
    assert.deepEqual(state.requests, []);
  }
  let state = apply(called, ack('a'));
  const acceptedAt = state.requests[0].askedAt;
  state = apply(state, call('a', 3, start + 3));
  state = apply(state, ack('a', '{"accepted":false}', start + 4));
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].askedAt, acceptedAt);
  assert.equal(state.requests[0].accepted, true);
});

test('malformed or unrelated messages never resolve questions', () => {
  let state = apply(apply(undefined, call('a', 2)), ack('a'));
  const bad = [
    { ...answer('a', 0), questionItemId: 'broken' },
    { ...answer('a', 0), questionItemId: JSON.stringify(['wrong', 'a', 0]) },
    { ...answer('a', 0), questionItemId: JSON.stringify(['request_user_input_async', 'a', -1]) },
    { ...answer('a', 0), questionItemId: JSON.stringify(['request_user_input_async', 'a', 32]) },
    { ...answer('a', 0), answer: null },
  ];
  state = apply(state, reply(bad, start + 2));
  state = apply(state, { ...reply([answer('a', 0)], start + 3), payload: { type: 'user_message', message: `quoted ${replyText([answer('a', 0)])}` } });
  state = apply(state, item({ type: 'message', role: 'assistant', content: [{ type: 'input_text', text: replyText([answer('a', 0)]) }] }, start + 4));
  assert.deepEqual(pendingQuestionIndices(state.requests[0], state.replies), [0, 1]);
  state = apply(state, reply([answer('a', 0)], start + 5));
  assert.deepEqual(pendingQuestionIndices(state.requests[0], state.replies), [1]);
});

test('turn transitions do not imply resolution and expiry is anchored to the original request', () => {
  let state = apply(apply(undefined, call('a')), ack('a'));
  for (const [offset, type] of [[100, 'task_complete'], [200, 'task_started'], [300, 'turn_aborted']]) {
    state = apply(state, { timestamp: new Date(start + offset).toISOString(), type: 'event_msg', payload: { type, turn_id: 'turn' } });
    assert.deepEqual(unansweredQuestions(state, start + offset).map(request => request.id), ['a']);
  }
  state = apply(state, item({ type: 'reasoning' }, start + questionLifetime));
  assert.deepEqual(unansweredQuestions(state, start + questionLifetime).map(request => request.id), ['a']);
  assert.deepEqual(unansweredQuestions(state, start + questionLifetime + 1), []);
  assert.equal(state.requests[0].askedAt, start);
  assert.equal(unansweredQuestions(state, start - 5001).length, 0);
});

test('invalid calls and stale records cannot create or renew questions; request count is bounded', () => {
  const invalid = [0, 33].map(count => call('bad', count));
  invalid.push(item({ type: 'function_call', name: 'request_user_input_async', call_id: 'bad', arguments: 'broken' }));
  invalid.push(call('bad', 1, start, 'request_user_input'));
  for (const record of invalid) assert.equal(apply(undefined, record), undefined);
  let state = apply(undefined, call('max', 32));
  state = apply(state, ack('max'));
  assert.equal(pendingQuestionIndices(state.requests[0]).length, 32);
  const old = apply(state, call('late', 1, start - 1));
  assert.equal(old, state);
  const future = reduceQuestions(state, call('future', 1, start + 6000), start);
  assert.equal(future, state);
  assert.equal(JSON.stringify(state).includes('Private question'), false);
});
