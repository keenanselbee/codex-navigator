'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseBankedResets } = require('../dist/account-resets');

const now = Date.now(), future = Math.floor(now / 1000) + 86400;
const credit = (id, seconds = future, status = 'available') => ({ id, status, expires_at: new Date(seconds * 1000).toISOString() });
const raw = JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'synthetic-access', refresh_token: 'never-send-refresh',
  id_token: 'header.' + Buffer.from(JSON.stringify({ sub: 'user', email: 'user@example.invalid' })).toString('base64url') + '.signature', account_id: 'workspace' } });
function client(fetch) {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/account-resets'), 'utf8'), {
    exports, fetch, Buffer, AbortController, setTimeout, clearTimeout,
    require: name => require('../dist/' + name.slice(2)),
  });
  return exports;
}

test('direct REST credits use snake case and choose earliest unexpired available credit', () => {
  const value = { available_count: 3, credits: [credit('later', future + 100), credit('expired', Math.floor(now / 1000) - 1),
    credit('used', future - 100, 'redeemed'), credit('first'), { id: 'hidden', status: 'expired' }] };
  assert.deepEqual(parseBankedResets(value, now), [{ id: 'first', expiresAt: future }, { id: 'later', expiresAt: future + 100 }]);
  assert.deepEqual(parseBankedResets({ available_count: 0, credits: [] }), []);
  for (const expires_at of [future, future * 1000])
    assert.equal(parseBankedResets({ available_count: 1, credits: [{ ...credit('first'), expires_at }] })[0].expiresAt, future);
});

test('incomplete, duplicate or invalid available credits cannot silently change earliest selection', () => {
  for (const value of [null, { availableCount: 1, credits: [credit('a')] },
    { available_count: 2, credits: [credit('a')] },
    { available_count: 2, credits: [credit('a'), credit('a')] },
    { available_count: 1, credits: [{ ...credit('a'), expires_at: null }] },
    { available_count: 1, credits: [{ ...credit('a'), expires_at: 'invalid' }] },
    { available_count: 1, credits: [{ ...credit('a'), id: '' }] },
    { available_count: 1001, credits: Array.from({ length: 1001 }, (_, i) => credit(String(i))) },
  ]) assert.throws(() => parseBankedResets(value));
});

test('reset requests pin OpenAI endpoint and account without sending refresh tokens or following redirects', async () => {
  const calls = [];
  const api = client(async (url, options) => {
    calls.push({ url, ...options });
    return new Response(JSON.stringify(options.method === 'GET' ? { available_count: 1, credits: [credit('first')] } : { code: 'reset' }));
  });
  const credits = await api.readBankedResets(raw);
  await api.consumeBankedReset(raw, credits[0], 'confirmation-uuid');
  assert.equal(calls[0].url, 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits');
  assert.equal(calls[1].url, calls[0].url + '/consume');
  assert.deepEqual(JSON.parse(calls[1].body), { credit_id: 'first', redeem_request_id: 'confirmation-uuid' });
  for (const call of calls) {
    assert.equal(call.headers.Authorization, 'Bearer synthetic-access');
    assert.equal(call.headers['ChatGPT-Account-Id'], 'workspace');
    assert.equal(call.redirect, 'error'); assert.ok(call.signal);
    assert.doesNotMatch(JSON.stringify(call), /never-send-refresh|id_token/);
  }
});

test('expired credits, rejected codes and transport errors never produce success or retry', async () => {
  let calls = 0;
  const expired = client(async () => { calls++; throw Error('unexpected'); });
  await assert.rejects(() => expired.consumeBankedReset(raw, { id: 'credit', expiresAt: 1 }, 'uuid'), /expired/);
  assert.equal(calls, 0);
  for (const [code, message] of [['already_redeemed', /already used/], ['no_credit', /no longer available/],
    ['nothing_to_reset', /OpenAI reports.*no eligible/], ['new_code', /could not be confirmed/]]) {
    const api = client(async () => new Response(JSON.stringify({ code })));
    await assert.rejects(() => api.consumeBankedReset(raw, { id: 'credit', expiresAt: future }, 'uuid'), message);
  }
  const offline = client(async () => { calls++; throw Error('secret diagnostic'); });
  await assert.rejects(() => offline.consumeBankedReset(raw, { id: 'credit', expiresAt: future }, 'uuid'),
    error => /could not be confirmed/.test(error.message) && !/secret diagnostic/.test(error.message));
  assert.equal(calls, 1);
  const retry = client(async () => new Response(JSON.stringify({ code: 'already_redeemed' })));
  await retry.consumeBankedReset(raw, { id: 'credit', expiresAt: 1 }, 'same-uuid', true);
  for (const response of [new Response('private error', { status: 401 }), new Response('private error', { status: 403 }),
    new Response('invalid JSON'), new Response('a'.repeat(1024 * 1024 + 1))]) {
    const api = client(async () => response);
    await assert.rejects(() => api.readBankedResets(raw), error => !/private error|invalid JSON|synthetic-access/.test(error.message));
  }
});
