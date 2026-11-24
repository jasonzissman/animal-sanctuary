// AS-0160: lookout towers with a ladder: seeded layout, a 'ladder' climb target as data, the same climb flow as trees, railings that block.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/map.js', 'game/peaks.js', 'game/station.js', 'game/camera.js', 'game/player.js',
  'game/forest-paths.js', 'game/forest-streams.js', 'game/fallen-logs.js', 'game/surfaces.js', 'game/lookouts.js', 'game/perch.js', 'game/jump.js', 'game/climb.js'];
const SA = loadGame(FILES);
const K = SA.climb, LO = SA.lookouts, DT = 1 / 60;
const towers = LO.towers(), targets = LO.targets();

function groundSpot(t, dist) { return { x: t.x + t.face.x * dist, z: t.z + t.face.z * dist }; }
function faceHeading(t) { return Math.atan2(-t.face.x, -t.face.z); }   // looking back at the tower

test('layout: 2+ towers, one per biome (forest and desert), deterministic, on dry flat ground clear of the station', () => {
  assert.ok(towers.length >= 2);
  assert.deepEqual(towers.map((t) => t.biome), LO.BIOMES);
  assert.deepEqual(LO.layout(), LO.layout());
  assert.equal(new Set(towers.map((t) => t.id)).size, towers.length);
  towers.forEach((t) => {
    assert.equal(SA.map.biomeAt(t.x), t.biome);
    assert.ok(SA.map.groundHeight(t.x, t.z) > SA.map.WATER_LEVEL + 0.5, 'dry');
    assert.ok(!SA.station.inFootprint(t.x, t.z, 3));
    assert.ok(Math.abs(t.face.x) + Math.abs(t.face.z) === 1, 'the ladder is on an axis side');
    assert.ok(t.topY - t.groundY >= 3.5, 'a platform well above the ground');
    const front = groundSpot(t, t.base / 2 + 1.2);
    assert.ok(SA.map.groundHeight(front.x, front.z) > SA.map.WATER_LEVEL + 0.5, 'the foot of the ladder is dry');
  });
});

test('targets are plain JSON data of kind ladder, a rect platform with railing solids and noClimb zones', () => {
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(targets))), JSON.stringify(targets));
  targets.forEach((tg, i) => {
    assert.equal(tg.kind, 'ladder');
    assert.equal(tg.id, towers[i].id);
    assert.equal(tg.topY, towers[i].topY);
    assert.equal(tg.top.shape, 'rect');
    assert.ok(tg.top.solids.length > 20 && tg.noClimb.length === 3);
    assert.equal(K.topOf(tg), tg.topY);
  });
});

test('climb target kinds are data: tree|peak|building|ladder are known, unknown generic kinds are ignored', () => {
  assert.deepEqual(Object.keys(K.KINDS).sort(), ['building', 'ladder', 'peak', 'tree']);
  assert.equal(K.KINDS.ladder.top, 'top');
  assert.equal(K.KINDS.tree.top, 'canopy');
  const t = towers[0], spot = groundSpot(t, t.base / 2 + 0.8);
  const near = { x: spot.x, z: spot.z, heading: faceHeading(t), y: t.groundY, climb: null };
  assert.equal(K.nearest(near, [targets[0]]), targets[0]);
  const odd = { ...targets[0], kind: 'rope' };
  assert.equal(K.nearest(near, [odd]), null, 'an unknown kind is junk, not a tree');
  assert.equal(K.start(near, odd), near);
});

test('only the ladder side starts a climb (beside and behind the tower do not)', () => {
  const t = towers[0], tg = targets[0], d = t.base / 2 + 0.8, side = { x: -t.face.z, z: t.face.x };
  const at = (u, v) => ({ x: t.x + t.face.x * u + side.x * v, z: t.z + t.face.z * u + side.z * v, heading: 0, y: t.groundY, climb: null });
  assert.equal(K.nearest(at(d, 0), [tg]), tg, 'in front of the ladder');
  assert.equal(K.nearest(at(d, 0.8), [tg]), tg, 'slightly to one side of the ladder');
  assert.equal(K.nearest(at(-d, 0), [tg]), null, 'behind');
  assert.equal(K.nearest(at(0.2, d + 0.5), [tg]), null, 'beside');
  assert.equal(K.nearest(at(0.2, -d - 0.5), [tg]), null, 'the other side');
  assert.equal(K.nearest(at(d + 6, 0), [tg]), null, 'too far');
});

function climbUp(t, tg) {
  let s = { x: t.x + t.face.x * (t.base / 2 + 0.8), z: t.z + t.face.z * (t.base / 2 + 0.8), heading: faceHeading(t), y: t.groundY, climb: null };
  assert.equal(K.prompt(s, [tg]), 'up');
  s = K.toggle(s, [tg]);
  assert.equal(s.climb.mode, 'up');
  for (let i = 0; i < 200 && s.climb && s.climb.mode === 'up'; i++) s = K.step(s, {}, DT, LO.solids());
  return s;
}

test('the same climb flow as a tree: up to the platform, stand at its height, then down to the start spot', () => {
  towers.forEach((t, i) => {
    const tg = targets[i];
    let s = climbUp(t, tg);
    assert.ok(K.onTop(s));
    assert.equal(s.climb.mode, 'top');
    assert.equal(s.y, t.topY);
    assert.ok(Math.hypot(s.x - t.x, s.z - t.z) < 0.1, 'arrives at the platform centre');
    assert.equal(K.prompt(s, [tg]), 'down');
    s = K.toggle(s, [tg]);
    assert.equal(s.climb.mode, 'down');
    for (let k = 0; k < 200 && s.climb; k++) s = K.step(s, {}, DT, LO.solids());
    assert.equal(s.climb, null);
    assert.ok(Math.abs(s.y - SA.map.groundHeight(s.x, s.z)) < 0.01, 'back on the ground');
  });
});

test('auto-climb: pushing into the ladder side for 600 ms climbs it (the legs block the body)', () => {
  const t = towers[0], tg = targets[0], obs = LO.solids();
  let s = { x: t.x + t.face.x * (t.base / 2 + 3), z: t.z + t.face.z * (t.base / 2 + 3), heading: faceHeading(t), y: t.groundY, climb: null };
  const FWD = { forward: 1, turn: 0 };
  let timer = null, started = false;
  for (let i = 0; i < 400 && !started; i++) {
    const before = s;
    s = K.step(s, FWD, DT, obs);
    timer = K.autoStep(timer, before, s, FWD, targets, DT * 1000);
    if (timer.climb) { s = K.start(s, timer.tree); started = true; }
  }
  assert.ok(started, 'the push climbs');
  assert.equal(timer.tree, tg);
  assert.equal(s.climb.target.kind, 'ladder');
});

test('on the platform you walk freely, but the railing keeps you from falling off', () => {
  const t = towers[1], tg = targets[1];
  const start = climbUp(t, tg);
  assert.equal(start.climb.mode, 'top');
  for (let a = 0; a < 8; a++) {   // run flat out in eight directions for 4 seconds each: nobody ever leaves the platform
    let s = { ...start, heading: (a * Math.PI) / 4 };
    let maxOff = 0;
    for (let i = 0; i < 240; i++) {
      s = K.step(s, { forward: 1, turn: 0, run: true }, DT, LO.solids(), targets);
      assert.ok(K.onTop(s), `still on top (direction ${a}, frame ${i})`);
      assert.equal(s.y, t.topY);
      maxOff = Math.max(maxOff, Math.abs(s.x - t.x), Math.abs(s.z - t.z));
    }
    assert.ok(maxOff < t.platform / 2 - 0.3, 'stopped inside the railing');
    assert.ok(maxOff > 0.7, 'there is room to walk about');
  }
});

test('near(): trees keep off the tower and its ladder approach', () => {
  const t = towers[0], a = groundSpot(t, 4);
  assert.ok(LO.near(t.x, t.z, 0));
  assert.ok(LO.near(a.x, a.z, 0), 'the open approach in front of the ladder');
  assert.ok(!LO.near(t.x - t.face.x * 12, t.z - t.face.z * 12, 1));
});

test('solids: the legs and sides block on the ground and the railing is gapless', () => {
  const t = towers[0], S = LO.solids();
  assert.ok(S.length >= 4 * towers.length);
  const rail = LO.railSolids(t);
  // Every consecutive pair of railing posts along a side is closer than a body can squeeze through (2 x (radius + body) = ~1.5).
  const north = rail.filter((c) => Math.abs(c[1] - (t.z - (t.platform / 2 - 0.18))) < 1e-6).sort((p, q) => p[0] - q[0]);
  for (let i = 1; i < north.length; i++) assert.ok(north[i][0] - north[i - 1][0] < 0.6);
  assert.ok(!SA.player || SA.player.RADIUS === 0.6);
});
