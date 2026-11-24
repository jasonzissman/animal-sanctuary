// AS-0355: Mission 10 race pacing (game/mission-race-pace.js, pure): the countdown, the rabbit's run with its carrot stop, win / lose-and-reset, and the
// guarantee that a player at normal walking speed beats the rabbit on every course the game can place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/data/hand-models.js', 'game/save.js', 'game/mountain-trail.js', 'game/map.js', 'game/peaks.js',
  'game/station.js', 'game/player.js', 'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/mission-race-pace.js', 'game/mission-race.js']);
const P = SA.racePace;
const line = (n) => Array.from({ length: n + 1 }, (_, i) => ({ x: 0, z: (i * 50) / n }));     // a straight 50 m path
const json = (v) => JSON.parse(JSON.stringify(v));

test('normalize fills defaults and clamps; measure sums the path', () => {
  assert.deepEqual(json(P.normalize()), { speed: 8, stopAt: 0.5, stopFor: 12, beat: 0.9, wait: 8 });
  const n = P.normalize({ speed: 99, stopAt: 0, stopFor: -3, beat: 'x', wait: 5 });
  assert.deepEqual(json(n), { speed: 14, stopAt: 0.1, stopFor: 0, beat: 0.9, wait: 5 });
  const m = P.measure([{ x: 0, z: 0 }, { x: 3, z: 4 }, { x: 3, z: 14 }]);
  assert.equal(m.length, 15);
  assert.deepEqual(json(m.cum), [0, 5, 15]);
  assert.equal(P.measure([]).length, 0);
});

test('poseAt: fast run, a stop at the carrot halfway for stopFor seconds, then on to the tree', () => {
  const path = P.measure(line(5)), pace = { speed: 10, stopAt: 0.5, stopFor: 6 };
  assert.equal(P.finishTime(path, pace), 5 + 6);
  assert.deepEqual([P.poseAt(path, pace, 0).z, P.poseAt(path, pace, 0).mode], [0, 'run']);
  assert.equal(P.poseAt(path, pace, 2).z, 20);
  assert.equal(P.poseAt(path, pace, 2).rotY, 0, 'facing along the path');
  for (const t of [2.6, 4, 7.9]) { const p = P.poseAt(path, pace, t); assert.equal(p.mode, 'eat'); assert.equal(p.z, 25, 'stopped halfway at t=' + t); }
  const after = P.poseAt(path, pace, 9);
  assert.equal(after.mode, 'run');
  assert.equal(after.z, 25 + 10 * (9 - 2.5 - 6));
  assert.equal(P.poseAt(path, pace, 11).mode, 'done');
  assert.equal(P.poseAt(path, pace, 99).z, 50);
  const c = P.carrotAt(path, pace);
  assert.ok(Math.abs(c.z - 25) < 1e-9 && Math.abs(Math.abs(c.x) - 1.2) < 1e-9, 'the carrot sits just beside the stop point');
  assert.equal(P.poseAt(P.measure([{ x: 1, z: 1 }]), pace, 3).x, 1, 'a degenerate path never throws');
});

test('machine: the countdown waits for the start line, speaks tres, dos, uno, ya, then runs; nobody wins before ya', () => {
  const m = P.create({ points: line(5), pace: { beat: 1 } });
  assert.equal(m.state, 'countdown');
  assert.equal(m.waiting, true);
  assert.deepEqual(json(m.tick(5, { atStart: false, atGoal: true })), [],'far from the start the countdown does not begin');
  assert.equal(m.state, 'countdown');
  const keys = [];
  const run = (dt, ctx) => m.tick(dt, ctx).forEach((e) => keys.push(e.type === 'beat' ? e.key : e.type));
  run(0.1, { atStart: true });
  assert.equal(m.waiting, false);
  run(0.8, { atStart: true, atGoal: true });
  assert.equal(m.state, 'countdown', 'standing at the tree during the countdown wins nothing');
  run(1, {}); run(1, { atGoal: true });
  assert.deepEqual(keys, ['number:3', 'number:2', 'number:1']);
  assert.equal(m.state, 'countdown');
  run(0.1, { atGoal: true });
  assert.equal(m.state, 'countdown');
  run(1, {});
  assert.deepEqual(keys, ['number:3', 'number:2', 'number:1', 'phrase:ya', 'go']);
  assert.equal(m.state, 'running');
  assert.deepEqual(json(P.BEATS), ['number:3', 'number:2', 'number:1', 'phrase:ya']);
  for (const k of P.BEATS) assert.ok(SA.vocab.get(k), k + ' is a vocab key (spoken)');
  assert.ok(SA.vocab.get('phrase:otravez') && SA.vocab.get('phrase:rapido') && SA.vocab.get('phrase:lento') && SA.vocab.get('phrase:ganaste'));
  assert.deepEqual(json(m.tick(1, { atGoal: true })), [{ type: 'won' }]);
  assert.equal(m.state, 'won');
  assert.deepEqual(json(m.tick(100, {})), [], 'a won race stays won');
});

test('machine: the rabbit eats its carrot (eat / dash events), and reaching the tree first resets AT ONCE to the countdown (nothing is lost)', () => {
  const m = P.create({ points: line(5), pace: { speed: 10, stopFor: 6, beat: 0.5 } });
  m.tick(0, { atStart: true });
  m.tick(1.5, {});
  assert.equal(m.state, 'running');
  assert.equal(m.pose().z, 0);
  const ev = [];
  for (let i = 0; i < 400 && m.losses === 0; i++) m.tick(0.1, {}).forEach((e) => ev.push(e.type + ':' + m.state));
  assert.deepEqual(ev, ['eat:running', 'dash:running', 'lost:countdown'], 'eat, dash, then lost-and-reset in the same tick');
  assert.equal(m.losses, 1);
  assert.equal(m.state, 'countdown', 'the race is back at the countdown immediately');
  assert.equal(m.waiting, true);
  assert.equal(m.t, 0);
  assert.equal(m.pose().z, 0, 'the rabbit is back at the start');
  assert.equal(m.ate(), false, 'its carrot is back');
  assert.deepEqual(json(m.tick(0.1, { atStart: false })), []);
  assert.equal(json(m.tick(0.1, { atStart: true }))[0].key, 'number:3', 'the countdown starts as soon as the player is at the line');
  assert.ok(m.eating() === 0);
});

test('eating() and ate() follow the carrot stop', () => {
  const m = P.create({ points: line(5), pace: { speed: 10, stopFor: 10, beat: 0.3 } });
  m.tick(0, { atStart: true }); m.tick(1, {});
  m.tick(2.6, {});
  assert.ok(m.eating() > 0 && m.eating() < 0.1);
  assert.equal(m.ate(), false);
  m.tick(5, {});
  assert.ok(Math.abs(m.eating() - 0.51) < 0.02);
  m.tick(5.5, {});
  assert.equal(m.eating(), 0);
  assert.equal(m.ate(), true);
});

test('at normal walking speed the player beats the rabbit on every course the game can place, and the rabbit is still eating its carrot when they pass', () => {
  const spec = SA.data.get('missions', 'carrera').race, walk = SA.player.SPEED, bad = [];
  assert.equal(walk, 4);
  for (let s = 1; s <= 400; s++) {
    const p = SA.missionRace.place(spec, (s * 2654435761) % 2147483647);
    if (!p) { bad.push([s, 'null']); continue; }
    const path = P.measure([p.rabbit].concat(p.flags, [p.goal])), pace = P.normalize(spec.pace);
    const player = Math.hypot(p.goal.x - p.start.x, p.goal.z - p.start.z) / walk;       // walking straight at the player's normal speed
    const rabbit = P.finishTime(path, pace);
    if (!(player < rabbit)) bad.push([s, 'rabbit first', player, rabbit]);
    if (!(player * 1.25 < rabbit)) bad.push([s, 'no slack for a detour', player, rabbit]);       // a bit of effort: a 25% longer way still wins
    if (P.poseAt(path, pace, player).mode !== 'eat') bad.push([s, 'not eating', player]);
    if (!(rabbit < player * 2)) bad.push([s, 'too easy: the rabbit is slower than a half-speed walker', player, rabbit]);
    if (!(pace.speed > walk)) bad.push([s, 'the rabbit is fast']);
  }
  assert.deepEqual(bad.slice(0, 5), []);
});
