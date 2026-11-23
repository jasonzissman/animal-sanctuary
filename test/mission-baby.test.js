import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/save.js',
  'game/map.js', 'game/peaks.js', 'game/station.js', 'game/npc.js', 'game/player.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js', 'game/mission-spawn.js', 'game/mission-runtime.js',
  'game/follow.js', 'game/mission-baby.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const tracked = [];
  const missions = SA.missions.create({ rng: () => 0.37, track: (t, f) => tracked.push([t, f]) });
  const spawn = SA.missionSpawn.create({ missions });
  const rt = SA.missionRuntime.create({ missions, spawn, track: (t, f) => tracked.push([t, f]), celebrate: () => {} });
  const baby = SA.missionBaby.create({ missions, spawn, runtime: rt, track: (t, f) => tracked.push([t, f]) });
  missions.start('mama');
  const cur = spawn.sync({ solids: [] });
  const focus = SA.focus.create({ missions });
  return { SA, missions, spawn, rt, baby, cur, tracked, focus };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const stepKind = (missions) => missions.active().stepData.kind;

// A baby stood `apart` units from mamá (the real mission is on its follow step), with the player right beside it.
function nearMama(apart) {
  const s = setup();
  s.missions.advance();
  const placed = { ...s.cur, baby: { ...s.cur.baby, x: s.cur.mama.x + apart, z: s.cur.mama.z } };
  const baby = s.SA.missionBaby.create({ missions: s.missions, spawn: { current: () => placed, waiting: () => false }, runtime: {},
    track: (t, f) => s.tracked.push([t, f]) });
  const player = { x: placed.baby.x + 1.7, z: placed.baby.z, heading: 0, lift: 0 };
  return { ...s, baby, player };
}

test('excitement: none at 12 units or more, rising as the baby gets closer to mamá', () => {
  const { SA } = setup();
  const B = SA.missionBaby;
  assert.equal(B.EXCITE_DIST, 12);
  assert.equal(B.excitement(12), 0);
  assert.equal(B.excitement(30), 0);
  assert.equal(B.excitement(NaN), 0);
  assert.ok(B.excitement(11.9) > 0);
  assert.ok(B.excitement(3) > B.excitement(8), 'warmer when closer');
  assert.equal(B.excitement(0), 1);
  assert.equal(B.isExcited({ x: 0, z: 0 }, { x: 11, z: 0 }), true);
  assert.equal(B.isExcited({ x: 0, z: 0 }, { x: 12.5, z: 0 }), false);
  assert.equal(B.isExcited(null, { x: 0, z: 0 }), false);
});

test('while the baby waits it is a use target and a tap in reach; nothing else is', () => {
  const { baby, cur, missions } = setup();
  assert.equal(stepKind(missions), 'find');
  const t = baby.useTarget();
  assert.equal(t.id, 'baby');
  assert.equal(t.kind, 'npc');
  assert.equal(t.x, cur.baby.x);
  assert.equal(baby.canTap({ x: cur.baby.x + 2, z: cur.baby.z }), true);
  assert.equal(baby.canTap({ x: cur.baby.x + 9, z: cur.baby.z }), false);
  const v = baby.update(0.016, { x: cur.baby.x + 5, z: cur.baby.z, heading: 0 }, []);
  assert.equal(v.following, false);
  assert.equal(v.excited, 0);
});

test('using the piglet completes the find step, hops, squeaks and starts following', () => {
  const { baby, cur, missions, tracked, focus } = setup();
  const player = { x: cur.baby.x + 2, z: cur.baby.z, heading: -Math.PI / 2, lift: 0 };
  baby.update(0.016, player, []);
  assert.equal(baby.use(), true);
  assert.equal(stepKind(missions), 'follow', 'the pill moves on to the follow step');
  assert.equal(missions.active().stepData.line.es, 'Llévalo con mamá');
  assert.equal(focus.active(), 'mission', 'small tasks stay paused');
  assert.equal(focus.allowsSmall(), false);
  assert.equal(baby.useTarget(), null, 'no longer waiting to be found');
  const v = baby.update(0.016, player, []);
  assert.equal(v.following, true);
  assert.equal(v.hop, true, 'a happy hop once');
  assert.equal(v.squeak, true, 'and a squeak');
  assert.equal(tracked.filter(([t, f]) => t === 'mission.babyFound' && f.id === 'mama').length, 1);
  assert.equal(baby.update(0.016, player, []).hop, false, 'the hop does not repeat');
  assert.equal(baby.use(), false, 'using it again does nothing');
});

test('it follows the player through SA.follow and keeps its distance', () => {
  const { baby, cur } = setup();
  // The piglet starts on the river bank for this seed, so the player walks west, away from the water.
  const player = { x: cur.baby.x - 2, z: cur.baby.z, heading: -Math.PI / 2, lift: 0 };
  baby.update(0.016, player, []);
  baby.use();
  const start = { x: cur.baby.x, z: cur.baby.z };
  for (let i = 0; i < 120; i++) {
    player.x -= 0.07;
    baby.update(0.016, player, []);
  }
  const v = baby.view();
  assert.ok(dist(v, start) > 3, 'it walked after the player');
  assert.ok(dist(v, player) < 4, 'and stayed close');
});

test('solids may be the walk-list function (the real scene passes a function)', () => {
  const { baby, cur } = setup();
  const player = { x: cur.baby.x + 2, z: cur.baby.z, heading: 0, lift: 0 };
  let calls = 0;
  const solids = () => { calls++; return [[cur.baby.x + 40, cur.baby.z + 40, 1]]; };
  baby.update(0.016, player, solids);
  baby.use();
  assert.doesNotThrow(() => {
    for (let i = 0; i < 30; i++) { player.x += 0.1; baby.update(0.016, player, solids); }
  });
  assert.ok(calls > 0, 'the function was resolved');
  assert.equal(baby.view().following, true);
  assert.doesNotThrow(() => baby.update(0.016, player, undefined));
});

test('within 12 units of mamá the baby is excited: it bounces, squeaks again and again, and tracks it once', () => {
  const { baby, player, tracked } = nearMama(6);
  const first = baby.update(0.016, player, []);
  assert.equal(first.following, true);
  assert.ok(first.excited > 0.4, `excited ${first.excited}`);
  assert.equal(first.squeak, true);
  assert.equal(baby.update(0.1, player, []).squeak, false, 'not every frame');
  let squeaks = 0;
  for (let i = 0; i < 600; i++) if (baby.update(0.016, player, []).squeak) squeaks++;
  assert.ok(squeaks >= 3, `keeps squeaking (${squeaks})`);
  assert.equal(tracked.filter(([t]) => t === 'mission.babyExcited').length, 1);
});

test('closer to mamá it is more excited and squeaks faster', () => {
  const near = nearMama(2), mid = nearMama(10);
  const count = (s) => { let n = 0; for (let i = 0; i < 600; i++) if (s.baby.update(0.016, s.player, []).squeak) n++; return n; };
  assert.ok(near.baby.view() === null);
  const nearView = near.baby.update(0.016, near.player, []), midView = mid.baby.update(0.016, mid.player, []);
  assert.ok(nearView.excited > midView.excited);
  assert.ok(count(near) > count(mid));
});

test('15 units from mamá it stays calm: no bounce, no squeaks, no telemetry', () => {
  const { baby, player, tracked } = nearMama(15);
  let squeaks = 0, excited = 0;
  for (let i = 0; i < 600; i++) {
    const v = baby.update(0.016, player, []);
    if (v.squeak) squeaks++;
    excited = Math.max(excited, v.excited);
  }
  assert.equal(squeaks, 0);
  assert.equal(excited, 0);
  assert.equal(tracked.some(([t]) => t === 'mission.babyExcited'), false);
});

test('a reload on the follow step resumes following quietly', () => {
  const { baby, cur, missions, tracked } = setup();
  missions.advance();
  const v = baby.update(0.016, { x: cur.baby.x + 2, z: cur.baby.z, heading: 0, lift: 0 }, []);
  assert.equal(v.following, true);
  assert.equal(v.hop, false);
  assert.equal(tracked.some(([t]) => t === 'mission.babyFound'), false);
});

test('walking up to the baby (the runtime finds it) still makes it hop and follow', () => {
  const { baby, rt, cur, missions } = setup();
  const player = { x: cur.baby.x + 1, z: cur.baby.z, heading: 0, lift: 0 };
  baby.update(0.016, player, []);                 // it was seen waiting
  assert.equal(rt.update(player).status, 'step');
  assert.equal(stepKind(missions), 'follow');
  assert.equal(baby.update(0.016, player, []).hop, true);
});

test('abandoning the mission lets the baby go; nothing is a target any more', () => {
  const { baby, missions, spawn, cur } = setup();
  baby.update(0.016, { x: cur.baby.x + 2, z: cur.baby.z, heading: 0 }, []);
  baby.use();
  baby.update(0.016, { x: cur.baby.x + 2, z: cur.baby.z, heading: 0 }, []);
  missions.abandon();
  spawn.sync({ solids: [] });
  assert.equal(baby.update(0.016, { x: 0, z: 0, heading: 0 }, []), null);
  assert.equal(baby.view(), null);
  assert.equal(baby.useTarget(), null);
  assert.equal(baby.use(), false);
  assert.equal(baby.canTap({ x: 0, z: 0 }), false);
});
