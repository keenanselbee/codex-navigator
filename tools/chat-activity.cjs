'use strict';
// Standalone local hook: never emit model context, continuation requests or chat content.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const threadPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const events = ['UserPromptSubmit', 'Stop', 'Interrupt', 'SessionEnd'];
const staleMs = 15 * 60 * 1000;

async function readRecord(file) {
  try {
    const handle = await fs.open(file, 'r');
    try { return (await handle.stat()).size <= 4096 ? JSON.parse(await handle.readFile('utf8')) : undefined; }
    finally { await handle.close(); }
  } catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return; throw error; }
}

function validRecord(record, id) {
  return record?.version === 1 && record.threadId === id && typeof record.turnId === 'string'
    && record.turnId.length <= 200 && ['working', 'idle', 'unknown'].includes(record.status)
    && Number.isSafeInteger(record.observedAt) && record.observedAt >= 0;
}

async function activitySnapshot(home, id, now = Date.now()) {
  const unknown = { status: 'unknown', workedAt: 0 };
  if (!threadPattern.test(id)) return unknown;
  try {
    const record = await readRecord(path.join(home, 'codex-navigator', 'activity', id + '.json'));
    if (!validRecord(record, id) || record.observedAt > now + 5000) return unknown;
    const workedAt = Number.isSafeInteger(record.workedAt) && record.workedAt >= 0 && record.workedAt <= now + 5000 ? record.workedAt : 0;
    return { observedAt: record.observedAt, turnId: record.turnId, status: record.status === 'working' && now - record.observedAt > staleMs ? 'unknown' : record.status, workedAt };
  } catch { return unknown; }
}

async function activityStatus(home, id, now = Date.now()) {
  return (await activitySnapshot(home, id, now)).status;
}

async function recordEvent(home, event, now = Date.now()) {
  if (!path.isAbsolute(home) || !event || !events.includes(event.hook_event_name)
      || typeof event.session_id !== 'string' || !threadPattern.test(event.session_id)) return false;
  const ending = event.hook_event_name === 'SessionEnd';
  if (!ending && (typeof event.turn_id !== 'string' || !event.turn_id.length
      || event.turn_id.length > 200 || /[\x00-\x1f]/.test(event.turn_id))) return false;
  const directory = path.join(home, 'codex-navigator', 'activity');
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, event.session_id + '.json'), lock = file + '.lock';
  let handle;
  // Serialise short writes per chat. An abandoned lock drops signals, which expire to unknown.
  for (let attempt = 0; attempt < 20; attempt++) {
    try { handle = await fs.open(lock, 'wx'); break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; await new Promise(resolve => setTimeout(resolve, 10)); }
  }
  if (!handle) return false;
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    const previous = await readRecord(file);
    const prior = validRecord(previous, event.session_id) ? previous : undefined;
    const starting = event.hook_event_name === 'UserPromptSubmit';
    if (prior && prior.observedAt > now) return false;
    // A delayed completion of another turn must not stop the latest turn's spinner.
    if (!starting && !ending && prior && prior.turnId !== event.turn_id) return false;
    if (starting && prior?.turnId === event.turn_id && prior.status === 'idle') return false;
    const record = { version: 1, threadId: event.session_id, turnId: ending ? (prior?.turnId || '') : event.turn_id,
      status: starting ? 'working' : ending ? 'unknown' : 'idle', observedAt: now,
      workedAt: ending ? (prior?.workedAt || 0) : now };
    await fs.writeFile(temporary, JSON.stringify(record) + '\n', { flag: 'wx' });
    await fs.rename(temporary, file);
    return true;
  } finally {
    await fs.unlink(temporary).catch(() => {});
    await handle.close(); await fs.unlink(lock).catch(() => {});
  }
}

async function diagnostic(home, event, outcome) {
  if (!path.isAbsolute(home)) return;
  const directory = path.join(home, 'codex-navigator');
  const file = path.join(directory, 'activity-diagnostics.jsonl');
  try {
    await fs.mkdir(directory, { recursive: true });
    const size = await fs.stat(file).then(info => info.size).catch(() => 0);
    if (size > 65536) await fs.rename(file, file + '.previous').catch(() => {});
    await fs.appendFile(file, JSON.stringify({ time: new Date().toISOString(),
      event: events.includes(event?.hook_event_name) ? event.hook_event_name : 'unknown',
      threadId: threadPattern.test(event?.session_id || '') ? event.session_id : undefined, outcome }) + '\n');
  } catch { /* Diagnostics must never block the turn. */ }
}

async function main() {
  const home = process.argv[process.argv.indexOf('--home') + 1];
  let input = '', size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) return;
    input += chunk;
  }
  if (process.argv.includes('--home')) {
    let event;
    try {
      event = JSON.parse(input);
      const saved = await recordEvent(home, event);
      await diagnostic(home, event, saved ? 'recorded' : 'ignored-invalid-or-stale');
    } catch (error) { await diagnostic(home, event, error instanceof SyntaxError ? 'invalid-json' : 'write-failed'); }
  }
}

module.exports = { activityStatus, activitySnapshot, recordEvent, staleMs, events };
if (require.main === module) {
  // Fail open: a status collector must never interrupt or steer a Codex turn.
  const timeout = setTimeout(() => process.exit(0), 800);
  main().catch(() => {}).finally(() => { clearTimeout(timeout); process.stdout.write('{}'); });
}
