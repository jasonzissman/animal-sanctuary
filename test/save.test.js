import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

import vm from 'node:vm';
import fs from 'node:fs';

// Objects built inside the vm context have a different Object.prototype; compare as plain JSON.
const plain = (o) => JSON.parse(JSON.stringify(o));
const KEY = 'santuario_save_v1';
const CORRUPT = 'santuario_save_v1_corrupt';

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

/** Loads game/save.js with a fake storage and manual timers/pagehide. Pass storage: null for "no localStorage". */
function setup({ storage = fakeStorage() } = {}) {
  const listeners = {};
  const timers = [];
  const globals = {
    addEventListener: (n, f) => (listeners[n] = f),
    setTimeout: (f, ms) => (timers.push({ f, ms, live: true }), timers.length),
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
  };
  if (storage) globals.localStorage = storage;
  const SA = loadGame(['game/sa.js', 'game/save.js'], globals);
  const fire = () => timers.filter((t) => t.live).forEach((t) => { t.live = false; t.f(); });
  return { SA, save: SA.save, storage, listeners, timers, fire };
}

test('first load returns defaults and writes nothing', () => {
  const { save, storage } = setup();
  const s = save.load();
  assert.deepEqual(plain(s), {
    version: 1, stars: 0, unlockedAnimals: [], placedProps: [],
    rounds: { completed: 0, streak: 0 },
    settings: { muted: false, english: false, scaffold: 1 }, stats: {},
  });
  assert.equal(storage._m.size, 0);
});

test('get() returns a copy; mutating it does not change the save', () => {
  const { save } = setup();
  save.get().stars = 99;
  assert.equal(save.get().stars, 0);
});

test('update() is debounced ~500ms, deep-merges, and survives a reload', () => {
  const { save, storage, timers, fire } = setup();
  save.update({ stars: 3, settings: { muted: true } });
  save.update({ rounds: { completed: 2 }, unlockedAnimals: ['gato'] });
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 500);
  assert.equal(storage.getItem(KEY), null);
  fire();
  const saved = JSON.parse(storage.getItem(KEY));
  assert.equal(saved.stars, 3);
  assert.deepEqual(plain(saved.settings), { muted: true, english: false, scaffold: 1 });
  assert.deepEqual(plain(saved.rounds), { completed: 2, streak: 0 });

  const again = setup({ storage });
  const s = again.save.load();
  assert.equal(s.stars, 3);
  assert.equal(s.settings.muted, true);
  assert.deepEqual(plain(s.unlockedAnimals), ['gato']);
});

test('pagehide flushes pending writes immediately', () => {
  const { save, storage, listeners } = setup();
  save.update({ stars: 7 });
  assert.equal(storage.getItem(KEY), null);
  listeners.pagehide();
  assert.equal(JSON.parse(storage.getItem(KEY)).stars, 7);
});

test('update() sanitises bad values and ignores non-objects / prototype keys', () => {
  const { save } = setup();
  save.update({ stars: -5, settings: { muted: 'yes', scaffold: 'x' } });
  assert.equal(save.get().stars, 0);
  assert.equal(save.get().settings.muted, false);
  assert.equal(save.get().settings.scaffold, 1);
  save.update(null);
  save.update(JSON.parse('{"__proto__":{"polluted":true}}'));
  assert.equal({}.polluted, undefined);
  save.update({ stars: 2.9 });
  assert.equal(save.get().stars, 2);
});

test('corrupt JSON is preserved under the _corrupt key and defaults are used', () => {
  const storage = fakeStorage({ [KEY]: '{not json' });
  const { save, fire } = setup({ storage });
  const s = save.load();
  assert.equal(s.stars, 0);
  assert.equal(storage.getItem(CORRUPT), '{not json');
  fire();
  assert.equal(storage.getItem(CORRUPT), '{not json');
  assert.equal(JSON.parse(storage.getItem(KEY)).version, 1);
});

test('non-object, unknown or future versions are kept as corrupt copies', () => {
  const raws = ['[1,2]', '"hi"', '42', 'null', JSON.stringify({ version: 99, stars: 5 }),
    JSON.stringify({ version: 'x' }), JSON.stringify({ version: -1 })];
  for (const raw of raws) {
    const storage = fakeStorage({ [KEY]: raw });
    const { save } = setup({ storage });
    assert.equal(save.load().stars, 0, raw);
    assert.equal(storage.getItem(CORRUPT), raw);
  }
});

test('unversioned legacy save is migrated, keeping data and filling defaults', () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify({ stars: 4, extra: 'keep', rounds: { completed: 3 } }) });
  const { save } = setup({ storage });
  const s = save.load();
  assert.equal(s.version, 1);
  assert.equal(s.stars, 4);
  assert.equal(s.extra, 'keep');
  assert.deepEqual(plain(s.rounds), { completed: 3, streak: 0 });
  assert.deepEqual(plain(s.settings), { muted: false, english: false, scaffold: 1 });
  assert.equal(storage.getItem(CORRUPT), null);
});

test('migrate() chains hooks keyed by version and refuses gaps', () => {
  const { save } = setup();
  assert.equal(save.migrate({ version: 1, stars: 2 }).stars, 2);
  assert.equal(save.migrate(null), null);
  const calls = [];
  save.migrations[0] = (o) => { calls.push(0); o.stars = (o.stars || 0) + 10; return o; };
  assert.equal(save.migrate({ stars: 1 }).stars, 11);
  assert.deepEqual(calls, [0]);
  delete save.migrations[0];
  assert.equal(save.migrate({}), null);
  save.migrations[0] = () => 'bad';
  assert.equal(save.migrate({}), null);
});

test('reset() restores defaults and persists immediately, keeping the corrupt backup', () => {
  const storage = fakeStorage({ [KEY]: 'garbage' });
  const { save } = setup({ storage });
  save.update({ stars: 9 });
  save.reset();
  assert.equal(JSON.parse(storage.getItem(KEY)).stars, 0);
  assert.equal(save.get().stars, 0);
  assert.equal(storage.getItem(CORRUPT), 'garbage');
});

test('works with localStorage missing (in-memory fallback)', () => {
  const { save, fire } = setup({ storage: null });
  assert.equal(save.load().stars, 0);
  save.update({ stars: 5 });
  fire();
  assert.equal(save.get().stars, 5);
  assert.equal(save.flush(), true); // nothing pending after the timer fired
  save.update({ stars: 6 });
  assert.equal(save.flush(), false); // cannot persist, but state is kept in memory
  assert.equal(save.get().stars, 6);
  assert.equal(save.isPersistent(), false);
});

test('works when getItem and setItem throw', () => {
  const boom = () => { throw new Error('denied'); };
  const g = setup({ storage: { getItem: boom, setItem: boom } });
  assert.equal(g.save.load().stars, 0);
  g.save.update({ stars: 2 });
  g.fire();
  assert.equal(g.save.get().stars, 2);

  const w = setup({ storage: { getItem: () => null, setItem: boom } });
  w.save.update({ stars: 1 });
  assert.equal(w.save.flush(), false);
  assert.equal(w.save.get().stars, 1);
});

test('throwing localStorage getter does not crash', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  Object.defineProperty(ctx, 'localStorage', { get() { throw new Error('SecurityError'); } });
  for (const f of ['game/sa.js', 'game/save.js']) {
    vm.runInContext(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), ctx);
  }
  const SA = ctx.window.SA;
  assert.equal(SA.save.load().stars, 0);
  SA.save.update({ stars: 1 });
  assert.equal(SA.save.flush(), false);
  assert.equal(SA.save.get().stars, 1);
  assert.equal(SA.save.isPersistent(), false);
});
