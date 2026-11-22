import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ingest, resetSeen, validEvent } from '../src/events.js';
import { computeMetrics, writeHealth, METRICS, median, percentile } from '../src/health.js';
import { readJsonl } from '../src/jsonl.js';
import { createApp } from '../src/server.js';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'santuario-'));
  process.env.SANTUARIO_DATA_DIR = dir;
  resetSeen();
});

const now = new Date('2026-11-21T12:00:00Z');
const ts = '2026-11-20T12:00:00Z';
let n = 0;
const ev = (type, fields = {}) => ({ id: `ev${String(++n).padStart(6, '0')}`, ts, type, ...fields });

test('validEvent requires id, type and timestamp', () => {
  assert.equal(validEvent(ev('session.tick')), true);
  assert.equal(validEvent({ id: 'x', type: 'a', ts }), false);
  assert.equal(validEvent({ id: 'abcdefg', type: 'Bad Type', ts }), false);
  assert.equal(validEvent({ id: 'abcdefg', type: 'ok', ts: 'never' }), false);
  assert.equal(validEvent(null), false);
});

test('ingest is idempotent and fans errors and feedback into the contract files', () => {
  const batch = [ev('error', { message: 'boom' }), ev('feedback', { text: 'el zorro es lento', kind: 'idea', context: { biome: 'bosque' } }), ev('feedback', { text: '  ' }), { bad: true }];
  const r = ingest(batch);
  assert.deepEqual([r.ok, r.accepted.length, r.rejected, r.stored], [true, 3, 1, 3]);
  assert.equal(ingest(batch).stored, 0, 'duplicates are acknowledged but not stored twice');
  assert.equal(readJsonl(path.join(dir, 'events.jsonl')).length, 3);
  const [err] = readJsonl(path.join(dir, 'telemetry.jsonl'));
  assert.deepEqual([err.level, err.event, err.message], ['error', 'game.error', 'boom']);
  const fb = readJsonl(path.join(dir, 'feedback.jsonl'));
  assert.equal(fb.length, 1);
  assert.deepEqual([fb[0].kind, fb[0].context.biome], ['idea', 'bosque']);
  assert.equal(ingest({}).ok, false);
  assert.equal(ingest(Array.from({ length: 1001 }, () => ev('x'))).ok, false);
});

test('oversized events are truncated', () => {
  ingest([ev('round.complete', { blob: 'x'.repeat(9000), sid: 's1' })]);
  assert.equal(readJsonl(path.join(dir, 'events.jsonl'))[0].truncated, true);
});

test('metrics: sessions, rounds, stuck time, accuracy, fps, errors', () => {
  const events = [
    ev('session.tick', { sid: 'a', seconds: 300 }), ev('session.end', { sid: 'a', seconds: 600 }),
    ev('round.complete', { sid: 'a', seconds: 8 }), ev('round.complete', { sid: 'a', seconds: 20 }),
    ev('session.end', { sid: 'b', seconds: 120 }), ev('round.complete', { sid: 'b', seconds: 12 }),
    ev('session.end', { sid: 'short', seconds: 5 }),
    ev('part.tap', { correct: true }), ev('part.tap', { correct: true }), ev('part.tap', { correct: false }), ev('part.tap', { correct: 'x' }),
    ev('perf.fps', { fps: 60 }), ev('perf.fps', { fps: 20, hidden: true }), ev('perf.fps', { fps: 40 }),
    ev('error', { message: 'x' }),
    { ...ev('error'), ts: '2026-10-01T00:00:00Z' },
  ];
  const m = computeMetrics(events, now);
  assert.deepEqual(m, {
    client_errors_7d: 1,
    fps_p10_7d: 40,
    median_session_minutes_7d: 6,
    rounds_per_session_7d: 1.5,
    median_round_seconds_7d: 12,
    tap_accuracy_7d: 0.667,
  });
  assert.deepEqual(Object.keys(m), [...METRICS]);
});

test('metrics are null with no data, and health.json is written', () => {
  const h = writeHealth(now);
  assert.equal(h.metrics.client_errors_7d, 0);
  for (const k of METRICS.filter((k) => k !== 'client_errors_7d')) assert.equal(h.metrics[k], null, k);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'health.json'), 'utf8')).metrics, h.metrics);
  assert.equal(median([]), null);
  assert.equal(median([1, 3]), 2);
  assert.equal(percentile([], 10), null);
});

test('server: CORS preflight, events, health, 404 and bad input', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const pre = await fetch(`${base}/api/events`, { method: 'OPTIONS' });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), '*');
    const post = await fetch(`${base}/api/events`, { method: 'POST', body: JSON.stringify([ev('session.end', { sid: 'z', seconds: 60 })]) });
    assert.equal((await post.json()).accepted.length, 1);
    assert.equal((await fetch(`${base}/api/events`)).status, 405);
    assert.equal((await fetch(`${base}/api/events`, { method: 'POST', body: '{nope' })).status, 400);
    assert.equal((await fetch(`${base}/api/events`, { method: 'POST', body: '{}' })).status, 400);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  } finally {
    server.close();
  }
});
