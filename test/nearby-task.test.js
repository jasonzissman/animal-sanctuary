import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/data/clue-levels.js', 'game/clue-levels.js',
  'game/save.js', 'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/nearby-task.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  return { SA, NT: SA.nearbyTask };
}

const player = (x, z, heading = 0) => ({ x, z, heading });   // heading 0 faces +z
const fox = { id: 'fox', x: 0, z: 5 };
const clueTask = { kind: 'clue', id: 'c1', fits: (a) => a.id === 'fox' };
const run = (nt, p, animals = [fox], tasks = [clueTask]) => nt.update({ player: p, animals, tasks });

test('no fitting animal within NEAR: null; within NEAR: that task and animal', () => {
  const { NT } = setup();
  const nt = NT.create();
  assert.equal(run(nt, player(0, -20)), null);
  assert.equal(run(nt, player(0, -3.1)), null, 'just past NEAR (8 m)');
  const r = run(nt, player(0, 0));
  assert.deepEqual({ ...r, dist: Math.round(r.dist) }, { kind: 'clue', taskId: 'c1', animalId: 'fox', dist: 5 });
  assert.equal(run(nt, player(0, 0), [fox], []), null, 'no tasks, nothing shown');
});

test('between NEAR and NEAR + slack the shown task stays; past it hides without failing; it can come back', () => {
  const { NT } = setup();
  const nt = NT.create();
  const at = (d) => player(0, fox.z - d);       // player d metres south of the fox, facing it (+z)
  assert.equal(run(nt, at(NT.NEAR + 1)), null, 'not started beyond NEAR');
  assert.ok(run(nt, at(NT.NEAR - 1)), 'starts within NEAR');
  assert.equal(run(nt, at(NT.NEAR + 1)).taskId, 'c1', 'kept between NEAR and NEAR + slack');
  assert.equal(run(nt, at(NT.NEAR + NT.HIDE_SLACK - 0.1)).taskId, 'c1');
  assert.equal(run(nt, at(NT.NEAR + NT.HIDE_SLACK + 0.5)), null, 'hidden past NEAR + slack');
  assert.equal(clueTask.id, 'c1', 'the task itself is untouched (hiding never fails it)');
  assert.equal(run(nt, at(NT.NEAR + 1)), null, 'after hiding it must start again from within NEAR');
  assert.equal(run(nt, at(3)).taskId, 'c1', 'and it comes back when the player returns');
});

test('a clue starts only when the animal is roughly in view; an encounter does not need the view', () => {
  const { NT } = setup();
  const nt = NT.create();
  assert.equal(run(nt, player(0, 0, Math.PI)), null, 'animal is behind the player');
  assert.ok(run(nt, player(0, 0, 0.5)), 'slightly turned away still counts');
  nt.reset();
  const enc = { kind: 'encounter', id: 'e1', animalId: 'fox' };
  const r = run(nt, player(0, 0, Math.PI), [fox], [enc]);
  assert.equal(r.kind, 'encounter');
  assert.equal(r.animalId, 'fox');
  nt.reset();
  assert.equal(run(nt, player(0, 4.5, Math.PI), [fox], [clueTask]).animalId, 'fox', 'a clue animal right beside you counts as in view');
  // once shown, turning away does not hide it
  nt.reset();
  run(nt, player(0, 0));
  assert.ok(run(nt, player(0, 0, Math.PI)));
});

test('encounter shows only while its needy animal is within NEAR; the anchor is the nearest fitting animal; position works', () => {
  const { NT } = setup();
  const nt = NT.create();
  const enc = { kind: 'encounter', id: 'e1', animalId: 'bear' };
  const bear = { id: 'bear', position: { x: 20, z: 0 } };
  assert.equal(run(nt, player(0, 0), [fox, bear], [enc]), null);
  assert.equal(run(nt, player(14, 0), [fox, bear], [enc]).animalId, 'bear');
  const near = { id: 'near', x: 0, z: 2 }, far = { id: 'far', x: 0, z: 6 };
  nt.reset();
  const any = { kind: 'clue', id: 'any', fits: () => true };
  assert.equal(run(nt, player(0, 0), [far, near], [any]).animalId, 'near');
});

test('while a story mission is active (SA.focus) nothing is shown, and it returns afterwards', () => {
  const { SA, NT } = setup();
  const nt = NT.create();
  assert.ok(run(nt, player(0, 0)));
  SA.missions.start(SA.missions.list()[0].id);
  assert.equal(SA.focus.allowsSmall(), false);
  assert.equal(run(nt, player(0, 0)), null);
  assert.equal(nt.shown(), null);
  SA.missions.abandon();
  assert.equal(SA.focus.allowsSmall(), true);
  assert.ok(run(nt, player(0, 0)));
});

test('bad input never throws', () => {
  const { NT } = setup();
  const nt = NT.create({ focus: { allowsSmall() { throw new Error('x'); } } });
  assert.equal(nt.update(), null);
  assert.equal(nt.update({ player: { x: 0, z: 0 }, animals: [null, { id: 'a' }], tasks: [null, { id: 't', fits() { throw new Error('x'); } }] }), null);
  assert.equal(NT.create().update({ player: { x: 0, z: 0 }, animals: [{ id: 'a', x: 1, z: 1 }], tasks: [{ id: 't', fits: () => true }] }).dist > 0, true);
});

test('pickClueFor: the clue fits the nearby animal, and any other fitting animal is still correct', () => {
  const { SA, NT } = setup();
  const all = SA.data.all('animals').filter((a) => !a.easterEgg);
  let found = 0;
  for (const animal of all) {
    const clue = NT.pickClueFor(animal, { animals: all, recent: [], level: 1 }, SA.clues.makeRng(7));
    assert.ok(clue, `a clue for ${animal.id}`);
    assert.ok(SA.clues.matches(clue, animal), `${clue.text} fits ${animal.id}`);
    assert.equal(clue.answer.animalId, animal.id);
    assert.ok(clue.answerIds.includes(animal.id));
    for (const other of all) {
      assert.equal(clue.answerIds.includes(other.id), SA.clues.matches(clue, other), 'answerIds are exactly the animals that fit');
    }
    if (clue.answerIds.length > 1) found += 1;
  }
  assert.ok(found > 0, 'at least one clue has several fitting animals, all accepted');
});

test('pickClueFor skips recent clues, supports levels, ids, and returns null when nothing fits', () => {
  const { SA, NT } = setup();
  const all = SA.data.all('animals').filter((a) => !a.easterEgg);
  const first = NT.pickClueFor(all[0].id, { animals: all.map((a) => a.id), recent: [] }, SA.clues.makeRng(1));
  const again = NT.pickClueFor(all[0], { animals: all, recent: [first.key] }, SA.clues.makeRng(1));
  assert.notEqual(again.key, first.key);
  const hard = NT.pickClueFor(all[0], { animals: all, recent: [], level: 3 }, SA.clues.makeRng(2));
  assert.ok(SA.clues.matches(hard, all[0]));
  assert.equal(NT.pickClueFor('nope', { animals: all }), null);
  const every = SA.clues.candidates([all[0]], ['partAdjective', 'trait']).map((c) => c.key);
  assert.equal(NT.pickClueFor(all[0], { animals: [all[0]], recent: every }, SA.clues.makeRng(1)), null);
  assert.ok(NT.pickClueFor(all[0], { animals: [], recent: [] }, null), 'the animal itself joins the animals in play');
});

test('index.html and the manifest load nearby-task.js after focus.js and clues.js', () => {
  for (const f of ['index.html', 'game/manifest.js']) {
    const s = fs.readFileSync(f, 'utf8');
    assert.ok(s.indexOf('game/focus.js') < s.indexOf('game/nearby-task.js'), f);
    assert.ok(s.indexOf('game/clues.js') < s.indexOf('game/nearby-task.js'), f);
  }
});
