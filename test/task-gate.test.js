import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/data/clue-levels.js', 'game/clue-levels.js', 'game/save.js',
  'game/round.js', 'game/data/foods.js', 'game/data/items.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js',
  'game/scaffold.js', 'game/mission.js', 'game/mission-card.js', 'game/hint-stage.js', 'game/level-cue.js', 'game/photo.js',
  'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/nearby-task.js', 'game/task-gate.js',
  'game/ui/care-flow.js', 'game/ui/mission-flow.js'];

// A stub of SA.encounterFlow: one needy animal; start() puts it "in help", release() puts it away.
function fakeEncounters(animalId) {
  const log = { starts: [], announces: [], releases: 0, dismissed: [] };
  let active = null;
  return { log,
    update() {}, tasks: () => (animalId ? [{ kind: 'encounter', id: 'need-1', animalId }] : []),
    active: () => active, start: (id) => { log.starts.push(id); active = id; return true; },
    announce: (id) => log.announces.push(id), release: () => { log.releases += 1; const had = active; active = null; return !!had; },
    dismiss: (id) => log.dismissed.push(id) };
}

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
  const enc = opts.encounters === undefined ? null : fakeEncounters(opts.encounters === true ? ids[0] : opts.encounters);
  const gate = SA.taskGate.create({ flow, game: mission, view, track: (t, f) => events.push({ t, ...f }), encounters: enc,
    player: () => world.player, animals: () => world.animals });
  return { SA, mission, flow, gate, world, events, pills, said, cleared, ids, enc };
}

test('free roam: walking up to animals, in view or not, never starts a clue round', () => {
  const t = setup();
  const spots = [{ x: 0, z: -30, heading: 0 }, { x: 0, z: 0, heading: Math.PI }, { x: 0, z: 0, heading: 0 }, { x: 0, z: 4.5, heading: 0 },
    { x: 38, z: 38, heading: 0 }];
  for (const p of spots) {
    t.world.player = p;
    for (let i = 0; i < 5; i++) assert.equal(t.gate.update(), null, 'no task of any kind without an encounter');
    assert.equal(t.mission.current(), null, 'no clue round');
  }
  assert.deepEqual(t.pills, [], 'no pill');
  assert.deepEqual(t.events, [], 'no task telemetry');
  assert.deepEqual(t.said, [], 'nothing spoken');
});

test('free roam with an encounter: only the encounter prompt appears, once, and no clue round starts', () => {
  const t = setup({ encounters: true });
  t.world.player = { x: 0, z: -30, heading: 0 };
  assert.equal(t.gate.update(), null, 'far: nothing');
  t.world.player = { x: 0, z: 0, heading: 0 };
  const shown = t.gate.update();
  assert.equal(shown.kind, 'encounter');
  assert.equal(shown.animalId, t.ids[0]);
  for (let i = 0; i < 4; i++) assert.equal(t.gate.update().kind, 'encounter');
  assert.deepEqual(t.enc.log.starts, [t.ids[0]], 'the help starts once');
  assert.equal(t.mission.current(), null, 'no clue round alongside it');
  assert.deepEqual(t.pills, [true]);
  const log = t.events.filter((e) => e.t.startsWith('task.'));
  assert.deepEqual(log.map((e) => e.t + ':' + e.kind), ['task.shown:encounter'], 'once per transition, never per frame');
  assert.equal(log[0].dist, 5);
});

test('walking away puts the encounter away quietly; coming back says it again; task.hidden fires once', () => {
  const t = setup({ encounters: true });
  t.gate.update();
  t.world.player = { x: 0, z: -2.5, heading: 0 };                    // 7.5 m: still inside NEAR
  t.gate.update();
  t.world.player = { x: 0, z: -20, heading: 0 };
  for (let i = 0; i < 4; i++) assert.equal(t.gate.update(), null);
  assert.equal(t.enc.log.releases >= 1, true);
  assert.deepEqual(t.pills, [true, false]);
  t.world.player = { x: 0, z: 0, heading: 0 };
  assert.equal(t.gate.update().kind, 'encounter');
  assert.deepEqual(t.pills, [true, false, true]);
  const log = t.events.filter((e) => e.t.startsWith('task.'));
  assert.deepEqual(log.map((e) => e.t), ['task.shown', 'task.hidden', 'task.shown']);
  assert.equal(log[1].dist, 25, 'the hidden event carries the distance when it hid');
  assert.equal(t.mission.current(), null);
});

test('while a story mission runs the encounter is not shown', () => {
  const t = setup({ encounters: true });
  t.SA.focus = { allowsSmall: () => false, active: () => 'mission', update() {}, onChange() {} };
  assert.equal(t.gate.update(), null);
  assert.deepEqual(t.enc.log.starts, []);
  assert.deepEqual(t.pills, []);
  assert.equal(t.mission.current(), null);
});

test('gated flow: begin() without an animal starts nothing, and no biome reroll', () => {
  const t = setup();
  assert.equal(t.flow.begin(), null);
  assert.equal(t.mission.current(), null);
  assert.equal(t.flow.canReroll(), false);
});

test('mission.start({ animalId }) fits the clue to that animal; without it any clue (data-driven mission clue steps)', () => {
  const t = setup();
  for (const id of t.ids.slice(0, 6)) {
    const m = t.mission.start({ animalId: id });
    assert.ok(m, id);
    assert.ok(m.answerIds.includes(id), id);
  }
  assert.ok(t.mission.start());
});

test('the gate has no way to begin a clue: it never calls flow.begin with an animal id', () => {
  const t = setup({ encounters: true });
  const begins = [];
  const flow = { begin: (id) => { begins.push(id); return null; }, replay() {} };
  const gate = t.SA.taskGate.create({ flow, game: t.mission, player: () => t.world.player, animals: () => t.world.animals, encounters: t.enc });
  for (let i = 0; i < 5; i++) gate.update();
  t.world.player = { x: 0, z: -30, heading: 0 };
  for (let i = 0; i < 5; i++) gate.update();
  assert.ok(begins.every((id) => id === undefined), 'only quiet clears');
});

test('story missions start only from the station board: no other game file calls SA.missions.start', () => {
  const dirs = ['game', 'game/ui', 'game/render', 'game/data'];
  const hits = [];
  for (const d of dirs) {
    for (const f of readdirSync(d)) {
      if (!f.endsWith('.js')) continue;
      const src = readFileSync(join(d, f), 'utf8');
      src.split('\n').forEach((line) => {
        if (/SA\.missions\.start\(|missionRuntime\.start\(/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) hits.push(join(d, f));
      });
    }
  }
  assert.deepEqual([...new Set(hits)], [join('game/ui', 'missions-board-view.js')]);
});
