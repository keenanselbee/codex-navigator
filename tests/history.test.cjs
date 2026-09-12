'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseRecentConversations, readRecentConversations } = require('../dist/history');
const { conversationKey, isNewPanel } = require('../dist/model');
const a = '00000000-0000-0000-0000-000000000001';
const b = '00000000-0000-0000-0000-000000000002';

test('a completed conversation can still occupy a generic new panel without a usable thread ID', () => {
  const uri = { scheme: 'openai-codex', authority: 'route', path: '/extension/panel/new' };
  assert.ok(isNewPanel(uri));
  assert.equal(conversationKey(uri), undefined, 'never store different chats under one generic key');
  assert.equal(isNewPanel({ ...uri, scheme: 'file' }), false);
});

test('recent chat picker deduplicates updates, tolerates partial records, and preserves duplicate titles', () => {
  const result = parseRecentConversations([
    'incomplete line',
    JSON.stringify({ id: a, thread_name: 'Old title', updated_at: '2026-09-11T10:00:00Z' }),
    JSON.stringify({ id: a, thread_name: 'Test chat', updated_at: '2026-09-11T12:00:00Z' }),
    JSON.stringify({ id: b, thread_name: 'Test chat', updated_at: '2026-09-11T11:00:00Z' }),
    JSON.stringify({ id: 'invalid', thread_name: 'Bad', updated_at: '2026-09-11T13:00:00Z' }),
    JSON.stringify({ id: [a], thread_name: 'Invalid array ID', updated_at: '2026-09-11T13:00:00Z' }),
    '{"id":',
  ].join('\n'));
  assert.deepEqual(result.map(record => [record.id, record.title]), [[a, 'Test chat'], [b, 'Test chat']]);
});

test('index reads are bounded and read no conversation transcripts', async () => {
  const scratch = path.resolve('.codex-temp');
  await fs.mkdir(scratch, { recursive: true });
  const home = await fs.mkdtemp(path.join(scratch, 'history-'));
  const file = path.join(home, 'session_index.jsonl');
  const content = 'x'.repeat(1024 * 1024 + 32) + '\n' + JSON.stringify({ id: a, thread_name: 'Recent', updated_at: '2026-09-11T12:00:00Z' }) + '\n';
  await fs.writeFile(file, content);
  const result = await readRecentConversations(home);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, a);
  assert.equal(await fs.readFile(file, 'utf8'), content, 'index remains unchanged');
  await fs.unlink(file);
  await fs.rmdir(home);
});
