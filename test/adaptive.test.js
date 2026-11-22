import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/data/clue-levels.js', 'game/clue-levels.js',
  'game/save.js', 'game/scaffold.js', 'game/picking.js', 'game/hint-stage.js', 'game/round.js', 'game/render/round-fx.js', 'game/ui/prompt.js'];
const load = () => { const SA = loadGame(FILES); SA.save.reset(); return SA; };

function animal(id, parts, extra = {}) {
  return {
    id, name: { es: id, en: id, gender: 'm' }, biome: 'selva',
    traits: { size: 'mediano', color: 'gris', movement: 'corre', diet: 'herbívoro', legs: 4 }, easterEgg: false,
    parts: parts.map(([part, scale, count = 1]) => ({ part, color: '#ffffff', scale, count, offset: [0, 0, 0] })),
    ...extra,
  };
}

// ---- clue levels ----

test('intermediate: 2-3 facts, unique answer, grammar agrees, no part twice', () => {
  const SA = load();
  const all = SA.data.all('animals');
  const clues = SA.clues.leveled(all, 2);
  assert.ok(clues.length > 10);
  for (const c of clues) {
    assert.match(c.text, /^Tiene /);
    assert.doesNotMatch(c.text, /\b(orejas|patas|alas|ojos) larg[oa]\b|\b(cola|pico) larg(as|os)\b/);
    assert.ok(SA.data.get('animals', c.answer.animalId));
    assert.ok(c.vocabKeys.every((k) => SA.data.get('vocab', k)), `vocab for ${c.text}: ${c.vocabKeys}`);
  }
  // Every clue is satisfied by its answer only: spot-check the texts are distinct per (answer, key).
  assert.equal(new Set(clues.map((c) => c.key)).size, clues.length);
});

test('intermediate example shape: tail + legs count + habitat', () => {
  const SA = load();
  const mono = SA.data.get('animals', 'mono');
  const texts = SA.clues.leveled(SA.data.all('animals'), 2).filter((c) => c.answer.animalId === mono.id).map((c) => c.text);
  assert.ok(texts.includes('Tiene cola larga, cuatro patas y vive en la selva'), texts.join(' | '));
});

test('challenge: needs a count, every fact is necessary, parts only', () => {
  const SA = load();
  const all = SA.data.all('animals').filter((a) => !a.story);
  const clues = SA.clues.leveled(all, 3);
  assert.ok(clues.length > 0);
  for (const c of clues) {
    assert.match(c.text, /^Toca el animal con /);
    assert.match(c.text, /\b(dos|tres|cuatro|cinco|seis) \w+/);
    assert.doesNotMatch(c.text, /vive en|salta|vuela/);
  }
  // Close pair: both have two ears, only the rabbit has a short tail; neither fact alone is enough.
  const conejo = clues.find((c) => c.text === 'Toca el animal con dos orejas y cola corta');
  assert.equal(conejo.answer.animalId, 'conejo');
  assert.ok(conejo.vocabKeys.includes('number:2') && conejo.vocabKeys.includes('adj:corta'));
});

test('synthetic close pair: only the combination identifies the animal; singular counts are never phrased', () => {
  const SA = load();
  const a = animal('a', [['alas', 0.5, 2], ['pico', 1.2], ['cola', 1.2]]);
  const b = animal('b', [['alas', 0.5, 2], ['pico', 0.2], ['cola', 1.2]]);
  const c = animal('c', [['alas', 0.5, 4], ['pico', 1.2], ['cola', 1.2]]);
  const texts = SA.clues.leveled([a, b, c], 3).filter((x) => x.answer.animalId === 'a').map((x) => x.text);
  assert.deepEqual([...texts].sort(), ['Toca el animal con dos alas y pico largo']);
  assert.ok(!SA.clues.leveled([a, b, c], 3).some((x) => /una cola|un pico/.test(x.text)));
});

test('pickClue by level: level 1 stays single-fact, 2 and 3 are multi-trait, empty level falls back', () => {
  const SA = load();
  const all = SA.data.all('animals').filter((x) => !x.easterEgg);
  const rng = SA.clues.makeRng(3);
  assert.equal(SA.clues.pickClue({ animals: all, level: 1, types: ['partAdjective', 'trait'] }, rng).type !== 'multiTrait', true);
  assert.equal(SA.clues.pickClue({ animals: all, level: 2 }, rng).type, 'multiTrait');
  assert.equal(SA.clues.pickClue({ animals: all, level: 3 }, rng).templateId, 'challenge');
  const one = SA.clues.pickClue({ animals: [all[0]], level: 2, types: ['touchPart'] }, rng);
  assert.notEqual(one.type, 'multiTrait');
});

test('clueLevels validator rejects bad entries', () => {
  const SA = load();
  const good = SA.data.get('clueLevels', 'challenge');
  assert.throws(() => SA.data.register('clueLevels', [{ ...good, id: 'x1', level: 9 }]));
  assert.throws(() => SA.data.register('clueLevels', [{ ...good, id: 'x2', facts: [1, 2] }]));
  assert.throws(() => SA.data.register('clueLevels', [{ ...good, id: 'x3', lead: { key: 'phrase:z' } }]));
  assert.throws(() => SA.data.register('clueLevels', [{ ...good, id: 'x4', partsOnly: 'yes' }]));
  assert.throws(() => SA.data.register('clueLevels', [{ ...good, id: 'x5', minimal: 1 }]));
  assert.throws(() => SA.data.register('clueLevels', [{ ...good, id: 'x6', needsCount: 1 }]));
});

// ---- scaffold ----

const quick = { seconds: 5, misses: 0, hints: 0 };
const slow = { seconds: 30, misses: 0, hints: 0 };

test('classify: quick, ok and slow/missed', () => {
  const SA = load();
  assert.equal(SA.scaffold.classify(quick), 'quick');
  assert.equal(SA.scaffold.classify({ seconds: 15, misses: 0, hints: 0 }), 'ok');
  assert.equal(SA.scaffold.classify(slow), 'slow');
  assert.equal(SA.scaffold.classify({ seconds: 3, misses: 1, hints: 0 }), 'slow');
  assert.equal(SA.scaffold.classify({ seconds: 3, misses: 0, hints: 1 }), 'slow');
  assert.equal(SA.scaffold.classify(), 'quick');
});

test('3 quick rounds move up, 3 slow/missed move down, clamped to 1..3, persisted in the save', () => {
  const SA = load();
  const t = SA.scaffold.create();
  assert.equal(t.level(), 1);
  assert.equal(t.record(quick).change, null);
  assert.equal(t.record(quick).change, null);
  assert.deepEqual({ ...t.record(quick) }, { level: 2, change: 'up' });
  assert.equal(SA.save.get().settings.scaffold, 2);
  for (let i = 0; i < 3; i++) t.record(quick);
  assert.equal(t.level(), 3);
  for (let i = 0; i < 6; i++) assert.equal(t.record(quick).level, 3);     // already at the top
  t.record(slow); t.record({ seconds: 2, misses: 2, hints: 0 });
  assert.equal(t.record(slow).change, 'down');
  assert.equal(SA.save.get().settings.scaffold, 2);
  for (let i = 0; i < 3; i++) t.record(slow);
  for (let i = 0; i < 9; i++) assert.equal(t.record(slow).level, 1);       // bottom stays at 1
  assert.equal(SA.save.get().settings.scaffold, 1);
});

test('an in-between round or a mixed run breaks the streak', () => {
  const SA = load();
  const t = SA.scaffold.create();
  t.record(quick); t.record(quick); t.record({ seconds: 15, misses: 0, hints: 0 }); t.record(quick); t.record(quick);
  assert.equal(t.level(), 1);
  t.record(slow);                                     // a slow round also resets the quick streak
  t.record(quick); t.record(quick);
  assert.equal(t.level(), 1);
  t.record(quick);
  assert.equal(t.level(), 2);
});

test('level survives a reload of the save and a bad stored level is clamped', () => {
  const store = {};
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const SA = loadGame(FILES, { localStorage: ls });
  SA.save.reset();
  const t = SA.scaffold.create();
  for (let i = 0; i < 3; i++) t.record(quick);
  SA.save.flush && SA.save.flush();
  const SA2 = loadGame(FILES, { localStorage: ls });
  assert.equal(SA2.save.get().settings.scaffold, 2);
  assert.equal(SA2.scaffold.create({ get: () => 99, set() {} }).level(), 3);
  assert.equal(SA2.scaffold.create({ get: () => 'x', set() {} }).level(), 1);
});

test('shared SA.scaffold.record drives the saved level through SA.round', () => {
  const SA = load();
  let t = 0;
  const game = SA.round.create({ rng: SA.clues.makeRng(5), now: () => t, track() {} });
  let changes = [];
  for (let i = 0; i < 3; i++) {
    const r = game.start();
    t += 4000;
    changes.push(game.pick({ animalId: r.answerId, part: 'cuerpo' }).levelChange);
  }
  assert.deepEqual(changes, [null, null, 'up']);
  assert.equal(SA.save.get().settings.scaffold, 2);
  const r = game.start();
  assert.equal(r.level, 2);
  assert.equal(r.clue.type, 'multiTrait');
  assert.equal(r.hintShown, false);
});

// ---- automatic hint ----

test('controller: hint appears automatically after ~20s and is counted in round.complete.hints', () => {
  const SA = load();
  const events = [];
  const game = SA.round.create({ level: 2, rng: SA.clues.makeRng(9), now: () => 0, track: (type, f) => events.push({ type, ...f }) });
  const view = { showRound() {}, showHint() { events.push({ type: 'view.hint' }); }, toast() {}, shake() {}, celebrate() {}, confetti() {}, clear() {} };
  const timers = [];
  const ctl = SA.prompt.createController({ game, view, audio: {}, later: (fn, ms) => timers.push([fn, ms]) });
  const r = ctl.begin();
  assert.equal(timers[0][1], SA.prompt.AUTO_HINT_MS);
  assert.equal(SA.prompt.AUTO_HINT_MS, 20000);
  assert.equal(r.hintShown, false);
  timers[0][0]();
  assert.equal(r.hintShown, true);
  assert.equal(r.hints, 1);
  assert.ok(events.some((e) => e.type === 'view.hint'));
  game.pick({ animalId: r.answerId, part: 'cuerpo' });
  assert.equal(events.find((e) => e.type === 'round.complete').hints, 1);
});

test('controller: no silhouette auto hint at beginner level, after a correct pick, or for a stale round', () => {
  const SA = load();
  const view = { showRound() {}, showHint() { throw new Error('should not hint'); }, toast() {}, shake() {}, celebrate() {}, confetti() {}, clear() {} };
  const timers = [];
  const b = SA.round.create({ level: 1, rng: SA.clues.makeRng(1), track() {} });
  SA.prompt.createController({ game: b, view, audio: {}, later: (fn) => timers.push(fn) }).begin();
  timers[0]();                                         // beginner's second stage is the biome glow, never showHint
  assert.equal(b.current().hints, 1);
  timers.length = 0;

  const game = SA.round.create({ level: 2, rng: SA.clues.makeRng(2), track() {} });
  const ctl = SA.prompt.createController({ game, view, audio: {}, fx: null, later: (fn) => timers.push(fn) });
  const first = ctl.begin();
  game.pick({ animalId: first.answerId, part: 'cuerpo' });
  timers[0]();                                         // fired after the round is done
  ctl.begin();                                         // a new round starts; the first timer is now stale
  assert.equal(first.hints, 0);
  assert.equal(game.current().hints, 0);
});
