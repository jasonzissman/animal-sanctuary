import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

import vm from 'node:vm';
import fs from 'node:fs';

// Objects built inside the vm context have a different Object.prototype; compare as plain JSON.
const plain = (o) => JSON.parse(JSON.stringify(o));
const KEY = 'santuario_save_v1';
const CORRUPT = 'santuario_save_v1_corrupt';
const KIT = ['camara', 'cepillo', 'esponja', 'venda'].map((id) => ({ id, count: 1 }));

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
    version: 6, stars: 0, unlockedAnimals: [], placedProps: [],
    rounds: { completed: 0, streak: 0 },
    settings: { muted: false, english: false, scaffold: 1 }, stats: { unlocks: {} },
    inventory: { items: KIT, equipped: null },
  });
  assert.equal('introSeen' in s, false, 'the retired intro flag is not written for new saves');
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
  assert.equal(JSON.parse(storage.getItem(KEY)).version, 6);
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
  assert.equal(s.version, 6);
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

test('v1 save migrates to v2: stats.unlocks added, everything else kept', () => {
  const old = { version: 1, stars: 7, unlockedAnimals: ['conejo'], placedProps: [{ id: 'x' }], rounds: { completed: 5, streak: 2 },
    settings: { muted: true, english: true, scaffold: 2 }, stats: { parts: { orejas: { taps: 3, misses: 1 } } }, extra: 'keep' };
  const storage = fakeStorage({ [KEY]: JSON.stringify(old) });
  const s = plain(setup({ storage }).save.load());
  assert.equal(s.version, 6);
  assert.deepEqual(s.stats, { parts: { orejas: { taps: 3, misses: 1 } }, unlocks: {} });
  assert.deepEqual(s.inventory, { items: KIT, equipped: null });
  const { inventory, ...rest } = s;
  assert.deepEqual({ ...rest, version: 1, stats: old.stats }, old);
  assert.equal(storage.getItem(CORRUPT), null);
});

test('introSeen (retired, AS-0213): saves that have it load unchanged, older saves do not gain it, junk is dropped, a bad read is never wiped', () => {
  const kept = plain(setup({ storage: fakeStorage({ [KEY]: JSON.stringify({ version: 4, stars: 3, introSeen: true }) }) }).save.load());
  assert.equal(kept.introSeen, true);
  assert.equal(kept.stars, 3);
  const falseToo = plain(setup({ storage: fakeStorage({ [KEY]: JSON.stringify({ version: 4, introSeen: false }) }) }).save.load());
  assert.equal(falseToo.introSeen, false);
  const v3 = plain(setup({ storage: fakeStorage({ [KEY]: JSON.stringify({ version: 3, stars: 5 }) }) }).save.load());
  assert.equal(v3.version, 6);
  assert.equal(v3.stars, 5);
  assert.equal('introSeen' in v3, false);
  const junk = plain(setup({ storage: fakeStorage({ [KEY]: JSON.stringify({ version: 4, introSeen: 'yes', stars: 2 }) }) }).save.load());
  assert.equal('introSeen' in junk, false);
  assert.equal(junk.stars, 2);
  const bad = fakeStorage({ [KEY]: '{nope' });
  assert.equal(setup({ storage: bad }).save.load().stars, 0);
  assert.equal(bad.getItem(CORRUPT), '{nope', 'an unreadable save is copied aside, not wiped');
  // A fresh save still has la cámara.
  assert.ok(plain(setup().save.load()).inventory.items.some((i) => i.id === 'camara'));
});

test('stats.unlocks keeps valid counts, drops junk, and survives a reload', () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify({ version: 2, stats: { unlocks: { 'tree|bosque|4': 2, bad: -1, odd: 'x', zero: 0 } } }) });
  const a = setup({ storage });
  assert.deepEqual(plain(a.save.load().stats.unlocks), { 'tree|bosque|4': 2 });
  a.save.update({ stats: { unlocks: { 'tree|bosque|9': 1 } } });
  assert.ok(a.save.flush());
  const b = setup({ storage });
  assert.deepEqual(plain(b.save.load().stats.unlocks), { 'tree|bosque|4': 2, 'tree|bosque|9': 1 });
  const c = setup({ storage: fakeStorage({ [KEY]: JSON.stringify({ version: 2, stats: { unlocks: [1, 2] } }) }) });
  assert.deepEqual(plain(c.save.load().stats.unlocks), {});
});

test('stats.unlockTimes keeps finite numbers and drops junk; non-objects load as {}', () => {
  // 1e999 parses to Infinity; null/strings/booleans/objects are non-numeric.
  const raw = '{"version":2,"stars":7,"stats":{"unlocks":{"a|b|1":2},"unlockTimes":{"ok":1700000000000,"zero":0,"neg":-5,"inf":1e999,"nul":null,"str":"12","bool":true,"obj":{},"arr":[1]}}}';
  const a = setup({ storage: fakeStorage({ [KEY]: raw }) });
  const s = a.save.load();
  assert.deepEqual(plain(s.stats.unlockTimes), { ok: 1700000000000, zero: 0, neg: -5 });
  assert.equal(s.stars, 7);
  assert.deepEqual(plain(s.stats.unlocks), { 'a|b|1': 2 });
  for (const bad of ['null', '[1,2]', '"x"', '5', 'true']) {
    const b = setup({ storage: fakeStorage({ [KEY]: `{"version":2,"stars":3,"stats":{"unlocks":{"a|b|1":1},"unlockTimes":${bad}}}` }) });
    const t = b.save.load();
    assert.deepEqual(plain(t.stats.unlockTimes), {}, bad);
    assert.equal(t.stars, 3);
    assert.deepEqual(plain(t.stats.unlocks), { 'a|b|1': 1 });
  }
  // Absent stays absent (no new default field).
  const c = setup({ storage: fakeStorage({ [KEY]: '{"version":2,"stats":{"unlocks":{}}}' }) });
  assert.equal('unlockTimes' in c.save.load().stats, false);
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
