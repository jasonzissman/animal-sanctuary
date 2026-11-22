import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/data/clue-levels.js', 'game/clue-levels.js', 'game/save.js',
  'game/round.js', 'game/data/foods.js', 'game/data/items.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js',
  'game/scaffold.js', 'game/mission.js', 'game/mission-card.js', 'game/hint-stage.js', 'game/level-cue.js', 'game/photo.js',
  'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/nearby-task.js', 'game/task-gate.js',
  'game/ui/care-flow.js', 'game/ui/mission-flow.js'];

function setup(opts = {}) {
  const SA = loadGame(FILES);
  SA.save.reset();
  SA.audio = { sfx() {}, say: (k) => said.push(k) };
  const said = [], events = [], pills = [], cleared = [];
  const view = new Proxy({ setPill: (on) => pills.push(on), clear: () => cleared.push(1) }, { get: (o, k) => o[k] || (() => {}) });
  const mission = SA.mission.create({ rng: SA.clues.makeRng(3), level: 1, track() {} });
  const flow = SA.missionFlow.create({ mission, view, care: null, later() {}, gated: true });
  const ids = SA.data.all('animals').filter((a) => !a.easterEgg).map((a) => a.id);
  const world = { player: { x: 0, z: 0, heading: 0 }, animals: [{ id: ids[0], x: 0, z: 5 }, { id: ids[1], x: 40, z: 40 }] };
  const gate = SA.taskGate.create({ flow, game: mission, view, track: (t, f) => events.push({ t, ...f }),
    player: () => world.player, animals: () => world.animals });
  return { SA, mission, flow, gate, world, events, pills, said, cleared, ids };
}

test('no clue round and no pill until the player is near a fitting animal in view', () => {
  const t = setup();
  t.world.player = { x: 0, z: -30, heading: 0 };
  assert.equal(t.gate.update(), null);
  assert.equal(t.mission.current(), null, 'far from every animal: no round');
  assert.deepEqual(t.pills, []);
  assert.deepEqual(t.events, []);
  t.world.player = { x: 0, z: 0, heading: Math.PI };     // 5 m away but facing away
  assert.equal(t.gate.update(), null);
  assert.equal(t.mission.current(), null, 'near but not in view: still no round');
  t.world.player = { x: 0, z: 0, heading: 0 };           // now facing the animal
  const shown = t.gate.update();
  assert.equal(shown.animalId, t.ids[0]);
  assert.equal(shown.kind, 'clue');
  const m = t.mission.current();
  assert.ok(m && m.step === 'find');
  assert.ok(m.answerIds.includes(t.ids[0]), 'the clue is chosen to fit the nearby animal');
  assert.equal(m.answerId, t.ids[0]);
  assert.deepEqual(t.pills, [true]);
  assert.equal(t.said.length, 1, 'the clue is spoken when the round starts');
});

test('walking away hides the pill quietly (no miss, round kept); coming back shows it again and says the clue', () => {
  const t = setup();
  t.gate.update();
  const m = t.mission.current();
  const id = m.id;
  t.world.player = { x: 0, z: -20, heading: 0 };
  assert.equal(t.gate.update(), null);
  assert.deepEqual(t.pills, [true, false]);
  assert.equal(t.mission.current().id, id, 'the round is kept');
  assert.equal(m.misses, 0);
  assert.equal(m.done, false);
  assert.equal(t.events.filter((e) => e.t === 'part.tap' || e.t === 'round.complete').length, 0);
  const said = t.said.length;
  t.world.player = { x: 0, z: 0, heading: 0 };
  assert.equal(t.gate.update().animalId, t.ids[0]);
  assert.equal(t.mission.current().id, id, 'the same round resumes (no new clue)');
  assert.deepEqual(t.pills, [true, false, true]);
  assert.equal(t.said.length, said + 1, 'the clue is said again on return');
});

test('task.shown / task.hidden fire once per transition, never per frame', () => {
  const t = setup();
  for (let i = 0; i < 5; i++) t.gate.update();                       // near: shown once
  t.world.player = { x: 0, z: -2.5, heading: 0 };                    // 7.5 m: still inside NEAR
  t.gate.update();
  t.world.player = { x: 0, z: -4.5, heading: 0 };                    // 9.5 m: inside NEAR + slack, still shown
  t.gate.update();
  t.world.player = { x: 0, z: -20, heading: 0 };
  for (let i = 0; i < 5; i++) t.gate.update();                       // far: hidden once
  const log = t.events.filter((e) => e.t.startsWith('task.'));
  assert.equal(log.length, 2);
  assert.equal(log[0].t, 'task.shown');
  assert.equal(log[0].kind, 'clue');
  assert.equal(log[0].animalId, t.ids[0]);
  assert.equal(log[0].dist, 5);
  assert.equal(log[1].t, 'task.hidden');
  assert.equal(log[1].animalId, t.ids[0]);
  assert.equal(log[1].dist, 25, 'the hidden event carries the distance at the moment it hid');
});

test('while a story mission runs nothing starts and the shown task is hidden', () => {
  const t = setup();
  t.gate.update();
  assert.ok(t.mission.current());
  t.SA.focus = { allowsSmall: () => false, active: () => 'mission', update() {}, onChange() {} };
  t.flow.pause();
  assert.equal(t.gate.update(), null);
  assert.equal(t.mission.current(), null);
  assert.deepEqual(t.events.filter((e) => e.t.startsWith('task.')).map((e) => e.t), ['task.shown', 'task.hidden']);
});

test('a finished round is not restarted on the same animal until the player walks away from it', () => {
  const t = setup();
  t.gate.update();
  const m = t.mission.current();
  m.animalId = t.ids[0];
  m.done = true;                                  // the photo step finished (celebration under way)
  assert.ok(t.gate.update(), 'left alone while celebrating');
  t.flow.begin();                                 // gated begin() with no animal: drops the finished mission, clears the card
  assert.equal(t.mission.current(), null);
  assert.ok(t.cleared.length >= 1);
  assert.equal(t.gate.update(), null, 'the animal just finished stays quiet');
  assert.equal(t.mission.current(), null);
  t.world.player = { x: 0, z: -20, heading: 0 };
  t.gate.update();
  t.world.player = { x: 0, z: 0, heading: 0 };
  assert.ok(t.gate.update(), 'after walking away it can have a new clue');
  assert.ok(t.mission.current());
});

test('gated flow: begin() without an animal starts nothing, and no biome reroll', () => {
  const t = setup();
  assert.equal(t.flow.begin(), null);
  assert.equal(t.mission.current(), null);
  assert.equal(t.flow.canReroll(), false);
  assert.ok(t.flow.begin(t.ids[2]), 'begin(animalId) starts a clue fitted to that animal');
  assert.ok(t.mission.current().answerIds.includes(t.ids[2]));
  assert.equal(t.flow.canReroll(), false);
});

test('mission.start({ animalId }) fits the clue to that animal; without it any clue', () => {
  const t = setup();
  for (const id of t.ids.slice(0, 6)) {
    const m = t.mission.start({ animalId: id });
    assert.ok(m, id);
    assert.ok(m.answerIds.includes(id), id);
  }
  assert.ok(t.mission.start());
});

test('tasks the gate cannot make a clue for are not retried every frame', () => {
  const t = setup();
  let calls = 0;
  const flow = { begin: () => { calls += 1; return null; }, replay() {} };
  const gate = t.SA.taskGate.create({ flow, game: t.mission, player: () => t.world.player, animals: () => t.world.animals });
  for (let i = 0; i < 5; i++) gate.update();
  assert.equal(calls, 1);
  assert.equal(gate.shown(), null);
});
