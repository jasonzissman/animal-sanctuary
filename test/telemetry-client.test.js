import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';
import { validEvent } from '../src/events.js';

const KEY = 'santuario_telemetry_q_v1';

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

/** Loads game/telemetry.js with fakes. Returns the SAT client plus the fakes. */
function setup({ storage = fakeStorage(), fetchImpl, extra = {} } = {}) {
  const listeners = {};
  const calls = [];
  const intervals = [];
  const globals = {
    localStorage: storage,
    addEventListener: (n, f) => (listeners[n] = f),
    setInterval: (f, ms) => (intervals.push({ f, ms }), intervals.length),
    fetch: fetchImpl ?? (async (url, opts) => {
      const batch = JSON.parse(opts.body);
      calls.push({ url, opts, batch });
      return { ok: true, json: async () => ({ accepted: batch.map((e) => e.id), rejected: 0 }) };
    }),
    ...extra,
  };
  const SA = loadGame(['game/sa.js', 'game/telemetry.js'], globals);
  let now = Date.parse('2026-01-01T00:00:00Z');
  SA.telemetry._setClock(() => now);
  return { SAT: SA.telemetry, storage, listeners, calls, intervals, advance: (ms) => (now += ms), globals };
}

const stored = (storage) => JSON.parse(storage.getItem(KEY) ?? '[]');

test('track queues valid, contract-shaped events in localStorage', () => {
  const { SAT, storage } = setup();
  const ev = SAT.track('part.tap', { part: 'orejas', correct: true, id: 'evil', sid: 'evil', type: 'x' });
  assert.ok(validEvent(ev), 'matches the receiver validation');
  assert.equal(ev.part, 'orejas');
  assert.equal(ev.correct, true);
  assert.notEqual(ev.id, 'evil');
  assert.equal(ev.sid, SAT.sid());
  assert.equal(ev.type, 'part.tap');
  assert.equal(stored(storage).length, 1);
  assert.equal(SAT.track('Bad Type!'), null);
  assert.equal(SAT.track(42), null);
  assert.equal(SAT.queued().length, 1);
});

test('queue is restored from storage and ignores unreadable data', () => {
  const a = setup({ storage: fakeStorage({ [KEY]: JSON.stringify([{ id: 'abcdef123', type: 'x.y', ts: '2026-01-01T00:00:00Z' }, null, 5]) }) });
  assert.equal(a.SAT.queued().length, 1);
  const b = setup({ storage: fakeStorage({ [KEY]: '{not json' }) });
  assert.equal(b.SAT.queued().length, 0);
  const c = setup({ storage: fakeStorage({ [KEY]: '{"a":1}' }) });
  assert.equal(c.SAT.queued().length, 0);
});

test('queue is capped at 2000, dropping the oldest', () => {
  const { SAT, storage } = setup();
  for (let i = 0; i < 2005; i++) SAT.track('test.n', { n: i });
  const q = SAT.queued();
  assert.equal(q.length, 2000);
  assert.equal(q[0].n, 5);
  assert.equal(q[1999].n, 2004);
  assert.equal(stored(storage).length, 2000);
});

test('flush POSTs to the local receiver and removes only acknowledged ids', async () => {
  const seen = [];
  const { SAT, storage } = setup({
    fetchImpl: async (url, opts) => {
      const batch = JSON.parse(opts.body);
      seen.push({ url, batch });
      return { ok: true, json: async () => ({ accepted: batch.slice(0, 2).map((e) => e.id) }) };
    },
  });
  for (let i = 0; i < 3; i++) SAT.track('test.n', { n: i });
  assert.equal(await SAT.flush(), true);
  assert.equal(seen[0].url, 'http://127.0.0.1:5100/api/events');
  assert.equal(seen[0].batch.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(SAT.queued().map((e) => e.n))), [2]);
  assert.deepEqual(stored(storage).map((e) => e.n), [2]);
});

test('flush sends batches of at most 100 and keepalive on unload', async () => {
  const { SAT, calls } = setup();
  for (let i = 0; i < 250; i++) SAT.track('test.n', { n: i });
  await SAT.flush();
  assert.equal(calls[0].batch.length, 100);
  assert.equal(calls[0].opts.keepalive, false);
  assert.equal(SAT.queued().length, 150);
  await SAT.flush({ unloading: true });
  assert.equal(calls[1].batch.length, 40);
  assert.equal(calls[1].opts.keepalive, true);
});

test('receiver down: events stay queued, flush backs off, nothing throws', async () => {
  let attempts = 0;
  const { SAT, advance } = setup({ fetchImpl: async () => { attempts++; throw new TypeError('Failed to fetch'); } });
  SAT.track('test.n');
  assert.equal(await SAT.flush(), false);
  assert.equal(attempts, 1);
  assert.equal(await SAT.flush(), false); // backing off: no new request
  assert.equal(attempts, 1);
  advance(60_000);
  assert.equal(await SAT.flush(), false);
  assert.equal(attempts, 2);
  assert.equal(SAT.queued().length, 1);
});

test('non-ok responses and malformed bodies keep events queued; recovery drains', async () => {
  let mode = 'http500';
  const { SAT, advance } = setup({
    fetchImpl: async (u, opts) => {
      if (mode === 'http500') return { ok: false, status: 500 };
      if (mode === 'nobody') return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ accepted: JSON.parse(opts.body).map((e) => e.id) }) };
    },
  });
  SAT.track('test.n');
  assert.equal(await SAT.flush(), false);
  advance(600_000);
  mode = 'nobody';
  assert.equal(await SAT.flush(), true);
  assert.equal(SAT.queued().length, 1, 'no accepted ids -> nothing dropped');
  mode = 'ok';
  assert.equal(await SAT.flush(), true);
  assert.equal(SAT.queued().length, 0);
});

test('concurrent flushes do not double-send; empty queue sends nothing', async () => {
  const { SAT, calls } = setup();
  assert.equal(await SAT.flush(), false);
  SAT.track('test.n');
  const [a, b] = await Promise.all([SAT.flush(), SAT.flush()]);
  assert.equal(a, true);
  assert.equal(b, false);
  assert.equal(calls.length, 1);
});

test('works with no localStorage and no fetch: memory queue, no errors', async () => {
  const { SAT } = setup({ storage: null, extra: { fetch: undefined } });
  SAT.track('test.n');
  SAT.startSession();
  SAT.frame(0.5);
  assert.equal(SAT.queued().length, 2);
  assert.equal(await SAT.flush(), false);
});

test('throwing localStorage (denied/quota) falls back to memory', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  const { SAT } = setup({ storage: bad });
  SAT.track('test.n');
  assert.equal(SAT.queued().length, 1);
  const { SAT: SAT2 } = setup({ extra: { localStorage: undefined } });
  SAT2.track('test.n');
  assert.equal(SAT2.queued().length, 1);
});

test('session.tick / session.end carry {sid, seconds}; timers are registered once', async () => {
  const { SAT, intervals, listeners, advance, calls } = setup();
  SAT.startSession();
  SAT.startSession();
  assert.equal(intervals.length, 2);
  assert.deepEqual(intervals.map((i) => i.ms), [15000, 10000]);
  advance(15_000);
  intervals[0].f();
  advance(5_400);
  listeners.pagehide();
  listeners.pagehide(); // only one session.end
  const ev = SAT.queued();
  const tick = ev.find((e) => e.type === 'session.tick');
  const end = ev.filter((e) => e.type === 'session.end');
  assert.equal(tick.seconds, 15);
  assert.equal(tick.sid, SAT.sid());
  assert.equal(end.length, 1);
  assert.equal(end[0].seconds, 20);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 1, 'pagehide flushes');
  assert.equal(calls[0].opts.keepalive, true);
  intervals[1].f(); // periodic flush runs without error
});

test('pagehide without a started session emits nothing', () => {
  const { SAT, listeners } = setup();
  listeners.pagehide();
  assert.equal(SAT.queued().length, 0);
});

test('perf.fps is emitted every ~10s of frame time with {fps, hidden}', () => {
  const doc = { hidden: false };
  const { SAT } = setup({ extra: { document: doc } });
  SAT.frame(-1);
  SAT.frame(NaN);
  for (let i = 0; i < 39; i++) SAT.frame(0.25);
  assert.equal(SAT.queued().length, 0);
  SAT.frame(0.25);
  let [e] = SAT.queued();
  assert.equal(e.type, 'perf.fps');
  assert.equal(e.fps, 4);
  assert.equal(e.hidden, false);
  doc.hidden = true;
  SAT.frame(5);
  doc.hidden = false;
  SAT.frame(5);
  e = SAT.queued()[1];
  assert.equal(e.hidden, true);
  assert.equal(e.fps, 0.2);
});

test('window.onerror and unhandledrejection become type "error" events', () => {
  const prevCalls = [];
  const { SAT, listeners, globals } = setup({ extra: { onerror: (...a) => prevCalls.push(a) } });
  // The vm context is the window: onerror is reassigned on it, reachable via the globals' fresh context only
  // through the listener-free path, so exercise unhandledrejection and the chained onerror via a second load.
  listeners.unhandledrejection({ reason: new Error('boom') });
  listeners.unhandledrejection({ reason: 'plain string' });
  listeners.unhandledrejection({});
  const q = SAT.queued();
  assert.equal(q[0].type, 'error');
  assert.equal(q[0].message, 'boom');
  assert.equal(q[0].source, 'unhandledrejection');
  assert.match(q[0].stack, /boom/);
  assert.equal(q[1].message, 'plain string');
  assert.equal(q[2].message, 'unknown');
  for (const e of q) assert.ok(validEvent(e));
  assert.ok(globals);
});

test('onerror handler records message/source/line/stack, chains the previous handler and is rate-limited', async () => {
  const vm = await import('node:vm');
  const fs = await import('node:fs');
  const ctx = vm.createContext({ console, localStorage: fakeStorage() });
  ctx.window = ctx;
  const prev = [];
  ctx.onerror = (...a) => { prev.push(a); return true; };
  vm.runInContext(fs.readFileSync('game/telemetry.js', 'utf8'), ctx);
  const ret = ctx.onerror('Oops', 'game/x.js', 12, 3, { stack: 'Error: Oops\n at x' });
  assert.equal(ret, true);
  assert.equal(prev.length, 1);
  const [e] = ctx.SAT.queued();
  assert.deepEqual([e.type, e.message, e.source, e.line, e.stack], ['error', 'Oops', 'game/x.js', 12, 'Error: Oops\n at x']);
  for (let i = 0; i < 40; i++) ctx.onerror('again', 's', 1, 1, null);
  assert.equal(ctx.SAT.queued().filter((x) => x.type === 'error').length, 20);
});

test('onerror without a previous handler returns false', async () => {
  const vm = await import('node:vm');
  const fs = await import('node:fs');
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync('game/telemetry.js', 'utf8'), ctx);
  assert.equal(ctx.onerror('m', 's', 1, 1, undefined), false);
});

test('feedback queues {text, kind, context} (validated kind) and flushes', async () => {
  const { SAT, calls } = setup();
  assert.equal(SAT.feedback('   '), null);
  const ev = SAT.feedback('The cat is too small', 'bug', { screen: 'care', animal: 'gato' });
  assert.ok(validEvent(ev));
  assert.equal(ev.type, 'feedback');
  assert.equal(ev.kind, 'bug');
  assert.deepEqual(JSON.parse(JSON.stringify(ev.context)), { screen: 'care', animal: 'gato' });
  assert.equal(SAT.feedback('hi', 'weird').kind, 'feedback');
  await new Promise((r) => setImmediate(r));
  assert.ok(calls.length >= 1);
});
