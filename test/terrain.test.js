// AS-0091: the player, animals and pickups sit on SA.map.groundHeight; slopes are eased; solid things block; the camera
// never goes underground. Pure logic only (node:vm, no THREE).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/items.js', 'game/map.js', 'game/save.js', 'game/perch.js', 'game/data/props.js',
  'game/habitat.js', 'game/prop-avoid.js', 'game/data/decor.js', 'game/camera.js', 'game/player.js', 'game/reach.js', 'game/climb.js',
  'game/blocking.js', 'game/inventory.js', 'game/data/pickups.js', 'game/pickups.js', 'game/animal-plan.js']);
const M = SA.map;
const DT = 1 / 30;

test('followHeight: snaps with no previous height, eases toward the ground, never lags far behind', () => {
  assert.equal(M.followHeight(undefined, 2, DT), 2);
  assert.equal(M.followHeight(NaN, 2, DT), 2);
  const one = M.followHeight(0, 1, DT);
  assert.ok(one > 0 && one < 1, 'eased, not snapped');
  assert.equal(M.followHeight(1, 1, DT), 1);
  let y = 0;
  for (let i = 0; i < 90; i++) y = M.followHeight(y, 1, DT);
  assert.ok(Math.abs(y - 1) < 1e-3, 'settles on the ground');
  assert.equal(M.followHeight(0, 5, 0.1), 4.5, 'a cliff cannot leave the feet more than MAX_LAG below the ground');
  assert.equal(M.followHeight(5, 0, 0.1), 0.5, 'nor above it');
  assert.equal(M.followHeight(1, 1.2, 0), 1,'dt 0 does not move');
  assert.equal(M.followHeight(3, NaN, DT), 3);
  assert.equal(M.followHeight(undefined, NaN, DT), 0);
});

test('cameraHeight: never below the terrain (or water) under the camera, otherwise as wanted', () => {
  assert.equal(M.cameraHeight(10, 0, 0), 10);
  for (let x = -78; x < 78; x += 3) for (let z = -23; z < 23; z += 4) {
    assert.ok(M.cameraHeight(-5, x, z) >= Math.max(M.groundHeight(x, z), M.WATER_LEVEL) + 0.6 - 1e-9);
    assert.ok(M.cameraHeight(NaN, x, z) >= M.groundHeight(x, z));
  }
  // On a mountain peak a camera that merely sits "7 units back, 2 up" would be inside the hill.
  let peak = { x: -60, z: 0, h: -Infinity };
  for (let x = -75; x < -42; x += 1) for (let z = -20; z < 20; z += 1) if (M.groundHeight(x, z) > peak.h) peak = { x, z, h: M.groundHeight(x, z) };
  assert.ok(peak.h > 3);
  assert.ok(M.cameraHeight(1, peak.x, peak.z) > peak.h);
});

test('the walking player keeps its feet on the terrain over the whole map', () => {
  let s = SA.climb.step(SA.player.spawn(), {}, 0);
  assert.equal(s.y, M.groundHeight(s.x, s.z), 'spawn snaps onto the ground');
  let worst = 0, lo = Infinity, hi = -Infinity;
  for (const heading of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {   // march across the map in each direction
    s = { x: heading === 0 || heading === Math.PI ? 0 : -70, z: heading === 0 ? -20 : heading === Math.PI ? 20 : 0, heading, y: undefined, climb: null };
    s = SA.climb.step(s, {}, 0);
    for (let i = 0; i < 600; i++) {
      s = SA.climb.step(s, { forward: true }, DT);
      const g = M.groundHeight(s.x, s.z);
      worst = Math.max(worst, Math.abs(s.y - g));
      lo = Math.min(lo, s.y); hi = Math.max(hi, s.y);
    }
  }
  assert.ok(hi - lo > 1, 'the player really went up and down hills (' + (hi - lo).toFixed(2) + ')');
  assert.ok(worst <= 0.5 + 1e-9, 'feet never more than the follow lag from the ground: ' + worst);
});

test('going uphill the player rises smoothly: no frame jumps more than a step could climb', () => {
  let s = { x: -45, z: 0, heading: Math.PI / 2 * -1, y: undefined, climb: null };   // west, up into the montaña
  s = SA.climb.step(s, {}, 0);
  const start = s.y;
  let maxJump = 0;
  for (let i = 0; i < 300; i++) {
    const prev = s.y;
    s = SA.climb.step(s, { forward: true }, DT);
    maxJump = Math.max(maxJump, Math.abs(s.y - prev));
  }
  assert.ok(maxJump < 0.35, 'per-frame height change ' + maxJump);
  assert.notEqual(s.y, start);
});

test('standing still lets the feet settle onto the ground', () => {
  let s = { x: -50, z: 3, heading: 0, y: M.groundHeight(-50, 3) + 0.4, climb: null };
  for (let i = 0; i < 60; i++) s = SA.climb.step(s, {}, DT);
  assert.ok(Math.abs(s.y - M.groundHeight(-50, 3)) < 1e-3);
});

test('the player cannot walk through trees, rocks or placed props (real decor and prop data)', () => {
  const radii = ['pino', 'jungle', 'roca', 'cactus', 'rocaarena', 'pico', 'pinonieve'].map((id) => [id, SA.blocking.decorRadius(id)]);
  for (const [id, r] of radii) assert.ok(r > 0, id + ' is solid');
  const decor = radii.map(([id], i) => ({ x: 0, z: 6 + i * 0, decor: id }));
  for (const [id, r] of radii) {
    const obs = SA.blocking.obstacles({ decor: [{ x: 0, z: 6, decor: id }] });
    let s = { x: 0, z: 0, heading: 0, y: undefined, climb: null };
    for (let i = 0; i < 300; i++) {
      s = SA.climb.step(s, { forward: true }, DT, obs);
      assert.ok(Math.hypot(s.x, s.z - 6) >= r + SA.player.RADIUS - 1e-6, id + ' blocks the player');
    }
  }
  assert.equal(decor.length, 7);
  // Flowers are soft; a solid placed prop (árbol) blocks while flores do not.
  assert.equal(SA.blocking.obstacles({ decor: [{ x: 0, z: 6, decor: 'flor' }] }).length, 0);
  SA.save.reset();
  const props = [{ prop: 'arbol', x: 0, z: 6 }, { prop: 'flores', x: 4, z: 6 }];
  const solid = SA.blocking.solidProps(props);
  assert.equal(solid.length, 1);
  let s = { x: 0, z: 0, heading: 0, y: undefined, climb: null };
  for (let i = 0; i < 300; i++) s = SA.climb.step(s, { forward: true }, DT, SA.blocking.obstacles({ propPoints: solid }));
  assert.ok(Math.hypot(s.x - solid[0][0], s.z - solid[0][1]) >= solid[0][2] + SA.player.RADIUS - 1e-6);
});

test('animals are placed on the terrain surface and pickups hover just above it', () => {
  const placed = SA.animalPlan.placements(SA.data.all('animals'), {});
  assert.ok(Object.keys(placed).length > 0);
  for (const id of Object.keys(placed)) assert.equal(placed[id].y, M.groundHeight(placed[id].x, placed[id].z), id + ' stands on the ground');
  const spots = SA.pickups.layout({ trees: [], seed: 7 });
  assert.ok(spots.length > 0);
  for (const p of spots.filter((q) => q.where !== 'tree')) {
    const lift = p.y - M.groundHeight(p.x, p.z);
    assert.ok(lift > 0 && lift < 1, p.id + ' hovers ' + lift.toFixed(2) + ' above the ground');
  }
});
