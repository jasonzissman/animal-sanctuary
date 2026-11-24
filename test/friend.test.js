import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// AS-0175: the animal friend: unlock after 3 rescues, choose + name, persistence, follow / idle / celebrate / sleep, hint leading, the scientist's offer.
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/save.js', 'game/map.js', 'game/follow.js', 'game/sleep.js', 'game/data/names.js', 'game/names.js', 'game/data/badges.js', 'game/badges.js',
  'game/rescue-log.js', 'game/friend.js', 'game/data/foods.js', 'game/data/items.js', 'game/inventory.js', 'game/station.js', 'game/npc.js',
  'game/data/missions.js', 'game/missions.js', 'game/scientist-talk.js'];
const DT = 1 / 30;

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
function setup(storage = fakeStorage(), extra = {}) {
  const calls = [];
  const SA = loadGame(FILES, { localStorage: storage, SAT: { track: (t, f) => calls.push(['track', t, f]) }, setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {}, ...extra });
  SA.save.load();
  SA.audio = { sfx: (...a) => calls.push(['sfx', ...a]), say: (k) => calls.push(['say', k]) };
  return { SA, calls, storage };
}
const rescue = (SA, ...ids) => ids.forEach((animalId, i) => SA.rescueLog.record({ animalId, need: 'thorn', biome: 'bosque', night: false, date: '2026-11-0' + (i + 1) }));
const player = (x = -10, z = 10) => ({ x, z, heading: Math.PI / 2, lift: 0 });
function run(SA, p, seconds, speed = 0) {
  let v = null;
  for (let t = 0; t < seconds; t += DT) {
    p.x += Math.sin(p.heading) * speed * DT;
    p.z += Math.cos(p.heading) * speed * DT;
    v = SA.friend.step(DT, p, []);
  }
  return v;
}
function setNight(SA, phase) { SA.daynight = { instance: () => ({ phase: () => phase }), isNight: () => phase === 'night' }; }

test('the friend is offered only after 3 rescues, from the animals you rescued', () => {
  const { SA } = setup();
  rescue(SA, 'conejo', 'tortuga');
  assert.equal(SA.friend.unlocked(), false);
  assert.equal(SA.friend.pending(), false);
  assert.deepEqual(Array.from(SA.friend.candidates()), []);
  rescue(SA, 'conejo');                                    // a repeat of a species is still the third rescue
  assert.equal(SA.friend.unlocked(), true);
  assert.equal(SA.friend.pending(), true);
  const c = SA.friend.candidates();
  assert.deepEqual(Array.from(c, (x) => x.animalId), ['conejo', 'tortuga']);
  assert.equal(c[0].icon, '🐰');
  assert.equal(c[0].named, false);
  assert.match(SA.friend.offer().es, /^Uno de tus amigos quiere acompañarte\.$/);
});

test('a named animal shows its name on the card and becomes the friend\'s individual id', () => {
  const { SA } = setup();
  rescue(SA, 'conejo', 'conejo', 'tortuga');
  SA.names.give('conejo#2', 'luna', 'valiente');
  const c = SA.friend.candidates().filter((x) => x.animalId === 'conejo')[0];
  assert.equal(c.id, 'conejo#2');
  assert.equal(c.text, 'Luna el valiente');                // the conejo is masculine: article and ending follow the ANIMAL
  assert.equal(SA.friend.choose('conejo#2'), true);
  assert.equal(SA.friend.current().text, 'Luna el valiente');
  SA.names.give('conejo#2', 'coco');                       // rename: the friend row is untouched, its text follows the new name
  assert.equal(SA.friend.current().text, 'Coco');
  assert.equal(SA.friend.pending(), false);
});

test('choose only accepts a rescued animal, swaps replace the friend (only one) and the choice is saved across reloads', () => {
  const { SA, calls, storage } = setup();
  rescue(SA, 'conejo', 'tortuga', 'pato');
  assert.equal(SA.friend.choose('aguila'), false, 'not rescued');
  assert.equal(SA.friend.choose('conejo'), true);
  assert.equal(SA.friend.choose('tortuga'), true);
  assert.equal(SA.friend.current().animalId, 'tortuga');
  assert.ok(calls.some((c) => c[0] === 'track' && c[1] === 'friend.chosen'));
  SA.save.flush && SA.save.flush();
  const again = setup(storage).SA;
  assert.equal(again.friend.current().animalId, 'tortuga', 'still your friend after a reload');
  again.friend.clear();
  assert.equal(again.friend.current(), null);
});

test('save drops a bad friend row and keeps a valid one', () => {
  const { SA } = setup();
  SA.save.update({ friend: { id: 'Bad Id!', animalId: 'x' } });
  assert.equal(SA.save.get().friend, undefined);
  SA.save.update({ friend: { id: 'conejo#2', animalId: 'conejo' } });
  assert.deepEqual({ ...SA.save.get().friend }, { id: 'conejo#2', animalId: 'conejo' });
  SA.save.update({ friend: { id: 'conejo' } });
  assert.equal(SA.save.get().friend.animalId, 'conejo');
});

test('it follows you, idles (sits, then chases a butterfly) and stays near', () => {
  const { SA } = setup();
  rescue(SA, 'conejo', 'tortuga', 'pato');
  SA.friend.choose('conejo');
  const p = player();
  assert.equal(SA.friend.step(DT, null, []), null, 'no player, no view');
  let v = run(SA, p, 3, 4);
  assert.equal(v.mode, 'follow');
  assert.equal(v.animalId, 'conejo');
  assert.ok(Math.hypot(v.x - p.x, v.z - p.z) < 3, 'trails close behind');
  const modes = new Set();
  for (let t = 0; t < 14; t += DT) { v = SA.friend.step(DT, p, []); modes.add(v.mode); }
  assert.ok(modes.has('sit') && modes.has('chase'), `idle modes ${[...modes]}`);
  assert.ok(Math.hypot(v.x - p.x, v.z - p.z) < 4);
  p.x += 3;                                                // the player walks off: it follows again at once
  v = run(SA, p, 1, 4);
  assert.equal(v.mode, 'follow');
});

test('it celebrates a rescue with you (the default rescue log tells it)', () => {
  const { SA } = setup();
  rescue(SA, 'conejo', 'tortuga', 'pato');
  SA.friend.choose('conejo');
  const p = player();
  run(SA, p, 1, 3);
  rescue(SA, 'pato');
  const v = SA.friend.step(DT, p, []);
  assert.equal(v.mode, 'celebrate');
  assert.ok(v.lift > 0 || run(SA, p, 0.3).lift > 0);
  assert.notEqual(run(SA, p, 3).mode, 'celebrate', 'the cheer ends');
});

test('a day animal sleeps when idle at night; a night animal sleeps by day', () => {
  const { SA } = setup();
  rescue(SA, 'conejo', 'buho', 'pato');
  SA.friend.choose('conejo');
  const p = player();
  setNight(SA, 'night');
  assert.equal(run(SA, p, 6).mode, 'sleep');
  assert.equal(run(SA, p, 1, 4).mode, 'follow', 'it wakes up and follows when you walk');
  setNight(SA, 'day');
  assert.notEqual(run(SA, p, 6).mode, 'sleep');
  SA.friend.choose('buho');
  assert.equal(run(SA, p, 8).mode, 'sleep', 'the owl dozes by day');
});

test('a hint makes it run a few steps toward the mission animal, call, and come back', () => {
  const { SA, calls } = setup();
  rescue(SA, 'conejo', 'tortuga', 'pato');
  SA.friend.choose('conejo');
  const p = player();
  run(SA, p, 3, 0);
  const before = SA.friend.view();
  assert.equal(SA.friend.hint({ x: p.x + 30, z: p.z }), true);
  assert.equal(SA.friend.leading(), true);
  const modes = [];
  let v = null;
  for (let t = 0; t < 6; t += DT) { v = SA.friend.step(DT, p, []); modes.push(v.mode); if (!SA.friend.leading()) break; }
  assert.ok(modes.includes('run') && modes.includes('call'));
  const far = SA.friend.view();
  assert.ok(far.x > before.x + 4 && far.x < before.x + SA.friend.HINT_RUN + 0.5, `ran ${far.x - before.x}`);
  assert.ok(calls.some((c) => c[0] === 'sfx'), 'the species sound');
  assert.ok(calls.some((c) => c[0] === 'say' && c[1] === 'phrase:poraqui'), '¡Por aquí!');
  assert.ok(calls.some((c) => c[0] === 'track' && c[1] === 'friend.hint'));
  v = run(SA, p, 8, 0);
  assert.ok(Math.hypot(v.x - p.x, v.z - p.z) < 3.5, 'back at your side');
  assert.equal(SA.friend.leading(), false);
});

test('hints do nothing without a friend, without a target, when the animal is already there or while it sleeps', () => {
  const { SA } = setup();
  assert.equal(SA.friend.hint({ x: 1, z: 1 }), false);
  rescue(SA, 'conejo', 'tortuga', 'pato');
  SA.friend.choose('conejo');
  const p = player();
  run(SA, p, 1);
  assert.equal(SA.friend.hint(null), false);
  assert.equal(SA.friend.hint({ x: p.x + 1, z: p.z }), false);
  setNight(SA, 'night');
  assert.equal(SA.friend.hint({ x: p.x + 30, z: p.z }), false);
});

test('onChange fires on choose and clear; the scientist offers the friend after the 3rd rescue until one is chosen', () => {
  const { SA } = setup();
  const seen = [];
  const off = SA.friend.onChange((c) => seen.push(c && c.animalId));
  assert.equal(SA.scientistTalk.reminder().lines.some((l) => l.role === 'friend'), false);
  rescue(SA, 'conejo', 'tortuga', 'pato');
  const line = SA.scientistTalk.reminder().lines.filter((l) => l.role === 'friend')[0];
  assert.equal(line.es, 'Uno de tus amigos quiere acompañarte.');
  assert.equal(line.key, 'phrase:amigoacompanar');
  assert.ok(SA.vocab.get('phrase:amigoacompanar'));
  SA.friend.choose('pato');
  assert.equal(SA.scientistTalk.reminder().lines.some((l) => l.role === 'friend'), false);
  SA.friend.clear();
  off();
  SA.friend.choose('pato');
  assert.deepEqual(Array.from(seen), ['pato', null]);
});
