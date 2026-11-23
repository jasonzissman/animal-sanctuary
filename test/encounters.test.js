import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/data/foods.js', 'game/data/items.js',
  'game/data/actions.js', 'game/data/care.js', 'game/data/missions.js', 'game/missions.js', 'game/focus.js',
  'game/nearby-task.js', 'game/data/needs.js', 'game/encounters.js'];

function setup(seed = 7, focus) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const clock = { t: 1000 };
  const allowed = { v: true };
  const enc = SA.encounters.create({ rng: SA.clues.makeRng(seed), now: () => clock.t,
    focus: focus || { allowsSmall: () => allowed.v } });
  const animals = SA.data.all('animals');
  return { SA, enc, clock, allowed, animals };
}

test('needs data: every need names a care task, parts and speakable hints that agree in gender', () => {
  const { SA, animals } = setup();
  const needs = SA.data.all('needs');
  assert.ok(needs.length >= 5);
  for (const n of needs) {
    assert.ok(n.icon);
    assert.ok(SA.data.get('careTasks', n.care));
  }
  assert.notEqual(SA.vocab.get('phrase:atascadom').es, SA.vocab.get('phrase:atascadaf').es);
  assert.ok(animals.length >= 8);
});

test('about 1 in 4 animals gets a need, never above MAX, never on excluded (mission) animals', () => {
  const { SA, enc, animals } = setup();
  const eight = animals.slice(0, 8);
  enc.sync({ animals: eight, excludeIds: [] });
  assert.equal(enc.tasks().length, 2);
  const many = Array.from({ length: 40 }, (_, i) => ({ ...animals[i % animals.length], id: animals[i % animals.length].id + i }));
  const big = setup(3);
  big.enc.sync({ animals: many, excludeIds: [] });
  assert.equal(big.enc.tasks().length, SA.encounters.MAX);

  for (let seed = 1; seed <= 20; seed++) {
    const s = setup(seed);
    const excluded = s.animals.slice(0, 3).map((a) => a.id);
    s.enc.sync({ animals: s.animals, excludeIds: excluded });
    for (const t of s.enc.tasks()) assert.ok(!excluded.includes(t.animalId));
    assert.ok(s.enc.tasks().length <= SA.encounters.MAX);
  }
});

test('tasks are shaped for SA.nearbyTask and the need is data (icon, care task, hint)', () => {
  const { SA, enc, animals } = setup();
  enc.sync({ animals, excludeIds: [] });
  const tasks = enc.tasks();
  assert.ok(tasks.length >= 1);
  for (const t of tasks) {
    assert.equal(t.kind, 'encounter');
    assert.equal(typeof t.id, 'string');
    assert.equal(enc.need(t.animalId), t.need);
    assert.ok(SA.data.get('careTasks', t.need.care));
    const h = enc.hint(t.animalId);
    assert.ok(h.text.startsWith('¡') && h.text.endsWith('!'));
    assert.equal(h.icon, t.need.icon);
    h.keys.forEach((k) => assert.ok(SA.vocab.get(k), k));
  }
  assert.equal(new Set(tasks.map((t) => t.id)).size, tasks.length);
  const nt = SA.nearbyTask.create({ focus: { allowsSmall: () => true } });
  const a = animals.find((x) => x.id === tasks[0].animalId);
  const shown = nt.update({ player: { x: 0, z: 0, heading: 0 }, animals: [{ id: a.id, x: 0, z: 3 }], tasks });
  assert.equal(shown.kind, 'encounter');
  assert.equal(shown.taskId, tasks[0].id);
});

test('needs only go to animals that can have them (wings, paws, diet) and hints agree in gender', () => {
  const { SA, animals } = setup();
  for (let seed = 1; seed <= 30; seed++) {
    const s = setup(seed);
    s.enc.sync({ animals, excludeIds: [] });
    for (const t of s.enc.tasks()) {
      const a = animals.find((x) => x.id === t.animalId);
      if (t.need.part) assert.ok(a.parts.some((p) => p.part === t.need.part), `${a.id} lacks ${t.need.part}`);
      if (t.need.eats) assert.ok(SA.data.all('foods').some((f) => f.diets.includes(a.traits.diet)));
      const h = s.enc.hint(a.id);
      assert.ok(h.keys[1] === t.need.hint[a.name.gender]);
    }
  }
  assert.equal(SA.data.get('needs', 'barro').hint.f, 'phrase:atascadaf');
  assert.equal(SA.data.get('needs', 'barro').hint.m, 'phrase:atascadom');
});

test('resolving removes the need; after the cooldown a new need appears on a different animal', () => {
  const { SA, enc, clock, animals } = setup();
  const four = animals.slice(0, 4);
  enc.sync({ animals: four, excludeIds: [] });
  assert.equal(enc.tasks().length, 1);
  const first = enc.tasks()[0].animalId;
  assert.equal(enc.resolve(first), true);
  assert.equal(enc.resolve(first), false, 'already fixed');
  assert.equal(enc.need(first), null);
  assert.equal(enc.tasks().length, 0);
  enc.sync({ animals: four, excludeIds: [] });
  assert.equal(enc.tasks().length, 0, 'still cooling down');
  clock.t += SA.encounters.COOLDOWN_MS - 1;
  enc.sync({ animals: four, excludeIds: [] });
  assert.equal(enc.tasks().length, 0);
  clock.t += 1;
  enc.sync({ animals: four, excludeIds: [] });
  assert.equal(enc.tasks().length, 1);
  assert.notEqual(enc.tasks()[0].animalId, first);
});

test('a need on an animal that becomes a mission animal or leaves play is dropped', () => {
  const { enc, animals } = setup();
  enc.sync({ animals, excludeIds: [] });
  const id = enc.tasks()[0].animalId;
  enc.sync({ animals, excludeIds: [id] });
  assert.equal(enc.need(id), null);
  assert.ok(!enc.tasks().some((t) => t.animalId === id));
  enc.sync({ animals: [], excludeIds: [] });
  assert.equal(enc.tasks().length, 0);
});

test('shouldCall is true at most once per 20 s per animal, and only for a needy animal', () => {
  const { SA, enc, clock, animals } = setup();
  enc.sync({ animals, excludeIds: [] });
  const id = enc.tasks()[0].animalId;
  assert.equal(enc.shouldCall('nobody', clock.t), false);
  assert.equal(enc.shouldCall(id, clock.t), true);
  assert.equal(enc.shouldCall(id, clock.t + 1), false);
  assert.equal(enc.shouldCall(id, clock.t + SA.encounters.CALL_GAP_MS - 1), false);
  assert.equal(enc.shouldCall(id, clock.t + SA.encounters.CALL_GAP_MS), true);
  assert.equal(enc.shouldCall(id, clock.t + SA.encounters.CALL_GAP_MS + 5), false);
  const other = enc.tasks().map((t) => t.animalId).find((x) => x !== id);
  if (other) assert.equal(enc.shouldCall(other, clock.t + 5), true, 'each animal has its own gap');
  clock.t += 50000;
  assert.equal(enc.shouldCall(id), true, 'defaults to the clock');
});

test('paused while focus disallows small tasks: no new needs, no calls; they come back after', () => {
  const { enc, allowed, animals } = setup();
  allowed.v = false;
  enc.sync({ animals, excludeIds: [] });
  assert.equal(enc.tasks().length, 0, 'no new needs during a mission');
  allowed.v = true;
  enc.sync({ animals, excludeIds: [] });
  const id = enc.tasks()[0].animalId;
  allowed.v = false;
  assert.equal(enc.shouldCall(id, 5), false);
  allowed.v = true;
  assert.equal(enc.shouldCall(id, 5), true, 'a refused call does not use up the gap');
});

test('the real SA.focus is used by default and reset clears everything', () => {
  const SA = loadGame(FILES);
  SA.save.reset();
  const enc = SA.encounters.create({ rng: SA.clues.makeRng(2), now: () => 0 });
  const animals = SA.data.all('animals');
  enc.sync({ animals, excludeIds: [] });
  assert.ok(enc.tasks().length >= 1);
  SA.missions.start(SA.missions.list()[0].id);
  assert.equal(enc.shouldCall(enc.tasks()[0].animalId, 0), false);
  enc.reset();
  assert.equal(enc.tasks().length, 0);
  assert.equal(enc.hint('nobody'), null);
});

test('encounters.js has no THREE/DOM and the page and manifest load it after nearby-task.js', () => {
  const src = fs.readFileSync('game/encounters.js', 'utf8');
  assert.ok(!/THREE\.|document\./.test(src));
  const html = fs.readFileSync('index.html', 'utf8');
  const at = (f) => html.indexOf(`game/${f}`);
  assert.ok(at('nearby-task.js') < at('data/needs.js') && at('data/needs.js') < at('encounters.js'));
  assert.ok(at('data/actions.js') < at('data/needs.js') && at('data/care.js') < at('data/needs.js'));
});
