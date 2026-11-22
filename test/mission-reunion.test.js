import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/save.js', 'game/map.js', 'game/peaks.js', 'game/station.js', 'game/npc.js', 'game/player.js', 'game/photo.js', 'game/data/step-kinds.js',
  'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js', 'game/mission-spawn.js',
  'game/mission-runtime.js', 'game/follow.js', 'game/mission-baby.js', 'game/data/badges.js', 'game/rescue-log.js', 'game/mission-reunion.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const tracked = [], said = [], celebrated = [];
  const track = (t, f) => tracked.push([t, f]);
  const missions = SA.missions.create({ rng: () => 0.37, track });
  const spawn = SA.missionSpawn.create({ missions });
  const rt = SA.missionRuntime.create({ missions, spawn, track, celebrate: (r) => celebrated.push(r) });
  const log = SA.rescueLog.create({ track });
  const timers = [];
  const audio = { say: (k, done) => { said.push(k); if (done) done(); } };
  const reunion = SA.missionReunion.create({ missions, runtime: rt, log, audio, track, later: (fn, ms) => timers.push([fn, ms]) });
  const baby = SA.missionBaby.create({ missions, spawn, runtime: rt, reunion, track });
  missions.start('mama');
  const cur = spawn.sync({ solids: [] });
  missions.advance();                       // find -> follow
  return { SA, missions, spawn, rt, baby, reunion, log, cur, tracked, said, celebrated, timers };
}
const flush = (timers) => { while (timers.length) timers.shift()[0](); };

test('family vocab exists and the words are in the spoken order', () => {
  const { SA, reunion } = setup();
  assert.deepEqual([...SA.missionReunion.WORDS], ['phrase:mama', 'phrase:cria', 'phrase:bebe', 'phrase:familia', 'phrase:familiajunta']);
  assert.deepEqual([...SA.missionReunion.WORDS.map((k) => SA.vocab.get(k).es)], ['la mamá', 'la cría', 'el bebé', 'la familia', '¡La familia está junta!']);
  assert.ok(reunion);
});

test('too far from mamá: nothing happens; the step stays on follow', () => {
  const { reunion, cur, missions, log } = setup();
  assert.equal(reunion.check({ x: cur.mama.x + 5, z: cur.mama.z }, cur.mama), false);
  assert.equal(missions.active().stepData.kind, 'follow');
  assert.equal(log.count('reunion'), 0);
});

test('reaching mamá completes the follow step, logs one rescue, speaks the family words and fires the hook', () => {
  const { reunion, cur, missions, log, said, timers, tracked } = setup();
  let hooked = null;
  reunion.onReunion = (r) => { hooked = r; };
  assert.equal(reunion.check({ x: cur.mama.x + 1.5, z: cur.mama.z }, cur.mama), true);
  assert.equal(missions.active().stepData.kind, 'photo', 'the next step asks for a family photo');
  assert.equal(log.count('reunion'), 1);
  assert.equal(hooked.mission, 'mama');
  assert.deepEqual([...hooked.badges.map((b) => b.id)],['reune-familias']);
  assert.ok(tracked.some(([t]) => t === 'mission.reunion'));
  assert.deepEqual(said, [], 'the words wait a moment so the new step line is heard first');
  flush(timers);
  assert.deepEqual(said, ['phrase:mama', 'phrase:cria', 'phrase:bebe', 'phrase:familia', 'phrase:familiajunta']);
  // on the photo step it can not fire again
  assert.equal(reunion.check({ x: cur.mama.x, z: cur.mama.z }, cur.mama), false);
  assert.equal(log.count('reunion'), 1);
});

test('the family photo completes the mission with its reward once; the rescue stays logged', () => {
  const { reunion, cur, rt, missions, log, celebrated, SA } = setup();
  reunion.check({ x: cur.mama.x + 1, z: cur.mama.z }, cur.mama);
  const stars = SA.save.get().stars || 0;
  assert.equal(rt.report({ type: 'photo' }).status, 'complete');
  assert.equal(SA.save.get().stars, stars + 2);
  assert.equal(celebrated.length, 1);
  assert.equal(missions.status('mama'), 'done');
  assert.equal(rt.report({ type: 'photo' }).status, 'none');
  assert.equal(log.count('reunion'), 1);
  assert.deepEqual([...log.earned().map((b) => b.id)],['reune-familias']);
});

test('SA.missionBaby reports view.reunion once when the following baby reaches mamá', () => {
  const { SA, cur, reunion, missions, rt } = setup();
  const placed = { ...cur, baby: { ...cur.baby, x: cur.mama.x + 1.2, z: cur.mama.z } };
  const baby = SA.missionBaby.create({ missions, spawn: { current: () => placed, waiting: () => false }, runtime: rt, reunion, track: () => {} });
  const player = { x: placed.baby.x + 1.7, z: placed.baby.z, heading: 0, lift: 0 };
  const v1 = baby.update(0.016, player, []);
  assert.equal(v1.following, true);
  assert.equal(v1.reunion, true);
  assert.equal(missions.active().stepData.kind, 'photo');
  const v2 = baby.update(0.016, player, []);
  assert.equal(v2.reunion, false, 'only once');
  assert.equal(v2.x, v1.x, 'the released baby stays beside mamá instead of following on');
});

test('a replay logs another reunion (a new seed), a repeated key does not; the log survives a save round trip', () => {
  const { SA, log } = setup();
  assert.equal(log.record({ kind: 'reunion', mission: 'mama', key: 'mama:1' }).added, true);
  assert.equal(log.record({ kind: 'reunion', mission: 'mama', key: 'mama:1' }).added, false);
  assert.equal(log.record({ kind: 'reunion', mission: 'mama', key: 'mama:2' }).earned.length, 0, 'the badge is only newly earned once');
  assert.equal(log.count('reunion'), 2);
  assert.equal(log.record({ kind: '' }).added, false);
  const saved = JSON.parse(JSON.stringify(SA.save.get()));
  assert.equal(saved.rescues.length, 2);
});

test('the save drops junk rescue entries and caps the log', () => {
  const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/save.js']);
  SA.save.reset();
  const many = Array.from({ length: 250 }, (_, i) => ({ kind: 'reunion', mission: 'mama', key: 'k' + i }));
  SA.save.update({ rescues: [{ kind: 'BAD KIND' }, 5, null, ...many] });
  const r = SA.save.get().rescues;
  assert.equal(r.length, 200);
  assert.ok(r.every((e) => e.kind === 'reunion'));
});

test('badge rows validate: a bad rule is rejected with a clear error', () => {
  const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/badges.js']);
  assert.equal(SA.data.get('badges', 'reune-familias').rule.kind, 'reunion');
  assert.throws(() => SA.data.register('badges', [{ id: 'x', es: 'X', icon: '⭐', rule: { kind: 'reunion', count: 0 } }]), /rule\.count/);
  assert.throws(() => SA.data.register('badges', [{ id: 'y', es: 'Y', icon: '⭐' }]), /rule/);
});
