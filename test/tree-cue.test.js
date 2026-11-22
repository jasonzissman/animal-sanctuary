import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/save.js', 'game/unlocks.js', 'game/tree-cue.js'];
const KEY = 'santuario_save_v1';

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

// One "visit": fresh game scripts over the same storage, like a page reload.
function visit(storage) {
  const SA = loadGame(FILES, storage ? { localStorage: storage } : {});
  SA.save.load();
  const shown = [];
  const tracker = SA.unlocks.create({ track: () => {}, onUnlock: (a) => shown.push(a.id) });
  return { SA, tracker, shown };
}

test('treeCue: sparkles only from the 3rd tap, with a short gentle pose that ends', () => {
  const { SA } = visit(fakeStorage());
  const c = SA.treeCue;
  assert.equal(c.AFTER_TAPS, 3);
  assert.deepEqual([0, 1, 2, 3, 4, 99].map(c.shouldSparkle), [false, false, false, true, true, true]);
  assert.equal(c.shouldSparkle(undefined), false);
  assert.equal(c.shouldSparkle('3'), false);
  for (let i = 0; i < c.COUNT; i++) {
    const mid = c.pose(i, c.DURATION / 2);
    assert.ok(mid.opacity > 0 && mid.opacity <= 1 && mid.scale > 0 && mid.scale < 0.5, 'small and subtle');
    assert.ok(c.pose(i, 0).opacity < 0.01, 'fades in');
    assert.equal(c.pose(i, c.DURATION), null);
    assert.equal(c.pose(i, -1), null);
  }
  assert.equal(c.pose(0, NaN), null);
});

test('tap progress is counted per tree, saved in stats.unlocks and restored after a reload', () => {
  const storage = fakeStorage();
  const a = visit(storage);
  assert.equal(a.tracker.tapCount('tree', 7, 'bosque'), 0);
  a.tracker.tap('tree', 7, 'bosque');
  a.tracker.tap('tree', 7, 'bosque');
  a.tracker.tap('tree', 8, 'bosque');
  assert.equal(a.tracker.tapCount('tree', 7, 'bosque'), 2);
  assert.equal(a.tracker.tapCount('tree', 8, 'bosque'), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(a.SA.save.get().stats.unlocks)), { 'tree|bosque|7': 2, 'tree|bosque|8': 1 });
  a.SA.save.flush();

  const b = visit(storage);
  assert.equal(b.tracker.tapCount('tree', 7, 'bosque'), 2, 'restored');
  assert.equal(b.tracker.facts().taps.tree.bosque, 2);
  assert.equal(b.tracker.facts().taps.tree['*'], 2);
  b.tracker.tap('tree', 7, 'bosque');
  assert.equal(b.SA.treeCue.shouldSparkle(b.tracker.tapCount('tree', 7, 'bosque')), true, '3rd tap overall sparkles');
  assert.equal(b.SA.treeCue.shouldSparkle(b.tracker.tapCount('tree', 8, 'bosque')), false);
});

test('restored taps still count toward the hidden creature unlock', () => {
  const storage = fakeStorage();
  const a = visit(storage);
  a.SA.save.update({ stars: 50 });
  for (let i = 0; i < 4; i++) a.tracker.tap('tree', 3, 'bosque');
  assert.deepEqual(a.shown, []);
  a.SA.save.flush();
  const b = visit(storage);
  b.tracker.tap('tree', 3, 'bosque');
  assert.deepEqual(b.shown, ['raton']);
});

test('an old v1 save keeps its data and tap progress starts at zero', () => {
  const old = { version: 1, stars: 9, unlockedAnimals: ['conejo'], rounds: { completed: 2, streak: 1 } };
  const v = visit(fakeStorage({ [KEY]: JSON.stringify(old) }));
  assert.equal(v.SA.save.get().stars, 9);
  assert.deepEqual(JSON.parse(JSON.stringify(v.SA.save.get().unlockedAnimals)), ['conejo']);
  assert.equal(v.tracker.tapCount('tree', 1, 'bosque'), 0);
  v.tracker.tap('tree', 1, 'bosque');
  assert.equal(v.tracker.tapCount('tree', 1, 'bosque'), 1);
});

test('works with no localStorage: counts live in memory', () => {
  const v = visit(null);
  assert.equal(v.SA.save.isPersistent(), false);
  v.tracker.tap('tree', 5, 'selva');
  v.tracker.tap('tree', 5, 'selva');
  v.tracker.tap('tree', 5, 'selva');
  assert.equal(v.tracker.tapCount('tree', 5, 'selva'), 3);
  assert.equal(v.SA.treeCue.shouldSparkle(v.tracker.tapCount('tree', 5, 'selva')), true);
});

test('index.html and the bundle manifest load tree-cue.js after unlocks.js, before main.js', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('game/unlocks.js') < html.indexOf('game/tree-cue.js'));
  assert.ok(html.indexOf('game/tree-cue.js') < html.indexOf('game/main.js'));
  const man = fs.readFileSync(new URL('../game/manifest.js', import.meta.url), 'utf8');
  assert.ok(man.indexOf("'game/tree-cue.js'") > man.indexOf("'game/unlocks.js'"));
});
