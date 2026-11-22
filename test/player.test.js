import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/map.js', 'game/player.js']);
const P = SA.player;
const DT = 1 / 30;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

function walk(state, input, seconds, obstacles) {
  for (let t = 0; t < seconds - 1e-9; t += DT) state = P.step(state, input, DT, obstacles);
  return state;
}

test('spawn is in the first biome (bosque), on dry land, inside the map', () => {
  const s = P.spawn();
  assert.equal(SA.map.biomeAt(s.x), 'bosque');
  assert.ok(!SA.map.isWater(s.x, s.z));
  const B = SA.map.BOUNDS;
  assert.ok(s.x > B.minX && s.x < B.maxX && s.z > B.minZ && s.z < B.maxZ);
});

test('forward and back walk along the heading at a fixed speed', () => {
  let s = P.step({ x: 0, z: 0, heading: 0 }, { forward: true }, DT);
  near(s.x, 0); near(s.z, P.SPEED * DT);
  s = P.step({ x: 0, z: 0, heading: Math.PI / 2 }, { forward: 1 }, DT);
  near(s.x, P.SPEED * DT); near(s.z, 0);
  s = P.step({ x: 0, z: 0, heading: 0 }, { back: true }, DT);
  near(s.z, -P.BACK_SPEED * DT);
  s = P.step({ x: 0, z: 0, heading: 0 }, { forward: true, back: true }, DT);
  near(s.z, 0);
});

test('left and right turn in place; right turns toward -x when facing +z', () => {
  const s0 = { x: 0, z: 0, heading: 1 };
  const l = P.step(s0, { left: true }, DT), r = P.step(s0, { right: true }, DT);
  near(l.heading, 1 + P.TURN_RATE * DT); near(r.heading, 1 - P.TURN_RATE * DT);
  near(l.x, 0); near(l.z, 0);
  const turned = walk({ x: 0, z: 0, heading: 0 }, { right: true, forward: true }, 0.5);
  assert.ok(turned.x < 0 && turned.z > 0);
  const h = P.step({ x: 0, z: 0, heading: 0.01 }, { right: true }, DT).heading;
  assert.ok(h >= 0 && h < Math.PI * 2);
});

test('strafe side-steps without turning', () => {
  const r = P.step({ x: 0, z: 0, heading: 0 }, { right: true, strafe: true }, DT);
  near(r.x, -P.SPEED * DT); near(r.z, 0); near(r.heading, 0);
  const l = P.step({ x: 0, z: 0, heading: 0 }, { left: true, strafe: true }, DT);
  near(l.x, P.SPEED * DT);
});

test('the input state is not mutated and bad numbers fall back safely', () => {
  const s = { x: 1, z: 2, heading: 0.5 };
  P.step(s, { forward: true }, DT);
  assert.deepEqual(s, { x: 1, z: 2, heading: 0.5 });
  const bad = P.step({ x: NaN, z: undefined, heading: 'x' }, { forward: NaN, left: NaN }, NaN);
  for (const k of ['x', 'z', 'heading']) assert.ok(isFinite(bad[k]), k);
  const fromNothing = P.step(null, null, DT);
  assert.ok(isFinite(fromNothing.x));
  const spawned = P.spawn();
  assert.deepEqual(P.step(spawned, {}, 0), spawned);
});

test('a huge dt is clamped so a stalled tab cannot teleport the player', () => {
  const s = P.step({ x: 0, z: 0, heading: 0 }, { forward: true }, 5);
  near(s.z, P.SPEED * 0.1);
});

test('the player is clamped to the map bounds on every side', () => {
  const B = SA.map.BOUNDS;
  const E = walk({ x: 0, z: 0, heading: Math.PI / 2 }, { forward: true }, 60);
  assert.ok(E.x <= B.maxX && E.x > B.maxX - 1);
  const W = walk({ x: -30, z: -15, heading: -Math.PI / 2 }, { forward: true }, 60);   // dry row; water blocks the way from x = 0
  assert.ok(W.x >= B.minX && W.x < B.minX + 1);
  const N = walk({ x: -50, z: 0, heading: 0 }, { forward: true }, 30);   // montaña: dry along the whole column
  assert.ok(N.z <= B.maxZ && N.z > B.maxZ - 1);
  const S = walk({ x: -50, z: 0, heading: Math.PI }, { forward: true }, 30);
  assert.ok(S.z >= B.minZ && S.z < B.minZ + 1);
  const out = P.step({ x: 999, z: -999, heading: 0 }, {}, DT);
  assert.ok(out.x <= B.maxX && out.z >= B.minZ);
});

test('walking into an animal circle slides around it and never enters it', () => {
  const animal = [0, 5, 1.5];
  let s = { x: 0.2, z: 0, heading: 0 };
  const min = animal[2] + P.RADIUS;
  let maxX = 0;
  for (let i = 0; i < 300; i++) {
    s = P.step(s, { forward: true }, DT, [animal]);
    assert.ok(Math.hypot(s.x - animal[0], s.z - animal[1]) >= min - 1e-9);
    maxX = Math.max(maxX, Math.abs(s.x));
  }
  assert.ok(maxX > 0.5, 'slid sideways instead of stopping dead');
  assert.ok(s.z > 5, 'ended up past the animal (can reach its tail)');
});

test('a player dropped inside or exactly on an obstacle is pushed out (never stuck)', () => {
  const o = [3, 3, 2];
  for (const start of [{ x: 3.5, z: 3, heading: 0 }, { x: 3, z: 3, heading: 0 }]) {
    const s = P.step(start, {}, DT, [o]);
    assert.ok(Math.hypot(s.x - 3, s.z - 3) >= o[2] + P.RADIUS - 1e-9);
  }
});

test('overlapping obstacles and obstacles beside the map edge still resolve', () => {
  const B = SA.map.BOUNDS;
  const pair = [[0, 0, 1.5], [1, 0, 1.5]];
  const s = P.step({ x: 0.5, z: 0.1, heading: 0 }, {}, DT, pair);
  assert.ok(Math.hypot(s.x, s.z) >= 2.1 - 1e-6 || Math.hypot(s.x - 1, s.z) >= 2.1 - 1e-6);
  const edge = [B.maxX - 1, 0, 2];
  const e = walk({ x: B.maxX - 3, z: 0, heading: Math.PI / 2 }, { forward: true }, 10, [edge]);
  assert.ok(e.x <= B.maxX && isFinite(e.z));
});

test('junk obstacle entries are ignored', () => {
  const s = P.step({ x: 0, z: 0, heading: 0 }, { forward: true }, DT, [null, [NaN, 0, 1], [0, 0, 0], [0, 0.1, -2], [1, 1]]);
  near(s.z, P.SPEED * DT);
});

test('spawn zone helpers: spawn is inside, far away is not, and the zone is an avoid point', () => {
  const s = P.spawn();
  assert.ok(P.inSpawnZone(s.x, s.z));
  assert.ok(!P.inSpawnZone(s.x + P.SPAWN_CLEAR + 0.1, s.z));
  assert.ok(P.inSpawnZone(s.x + P.SPAWN_CLEAR + 0.1, s.z, 1));
  assert.deepEqual(Array.from(P.spawnZone()), [s.x, s.z, P.SPAWN_CLEAR]);
});

test('wedged between two trees and an animal, the player can still walk out (every direction)', () => {
  // Trunks left and right plus a rabbit in front, all overlapping the player: the old push-out pinned them here.
  const obstacles = [[-1.4, 0, 1], [1.4, 0, 1], [0, 1.6, 1.3]];
  for (const heading of [Math.PI, Math.PI + 0.7, Math.PI - 0.7]) {   // the open side, away from the rabbit
    const start = { x: 0, z: 0, heading };
    const s = walk(start, { forward: true }, 1.5, obstacles);
    assert.ok(Math.hypot(s.x - start.x, s.z - start.z) > 1.5, `heading ${heading}: moved ${Math.hypot(s.x, s.z)}`);
  }
  // Facing the rabbit: walking forward is blocked, but turning around (left/right still turn in place) frees the way.
  let t = walk({ x: 0, z: 0, heading: 0 }, { forward: true }, 1, obstacles);
  t = walk(t, { left: true }, 1.4, obstacles);
  t = walk(t, { forward: true }, 1.5, obstacles);
  assert.ok(Math.hypot(t.x, t.z) > 1.5, `turned then walked: ${Math.hypot(t.x, t.z)}`);
  const b = walk({ x: 0, z: 0, heading: 0 }, { back: true }, 1.5, obstacles);
  assert.ok(Math.hypot(b.x, b.z) > 1);
});

test('wedged player ends up clear of the obstacles it walked out of', () => {
  const obstacles = [[-1.4, 0, 1], [1.4, 0, 1], [0, 1.6, 1.3]];
  const s = walk({ x: 0, z: 0, heading: Math.PI }, { forward: true }, 3, obstacles);
  for (const o of obstacles) assert.ok(Math.hypot(s.x - o[0], s.z - o[1]) >= o[2] + P.RADIUS - 0.03);
});

// ---- terrain height and water (AS-0077)
test('heightAt returns SA.map.groundHeight', () => {
  for (const [x, z] of [[0, 0], [-9, 14], [22, 10], [-60, 3]]) assert.equal(P.heightAt(x, z), SA.map.groundHeight(x, z));
});

test('starting in water moves to the nearest dry point, even with no input', () => {
  const wetPt = { x: SA.map.riverX(0), z: 0, heading: 0 };
  assert.ok(SA.map.isWater(wetPt.x, wetPt.z));
  const s = P.step(wetPt, {}, 0);
  assert.ok(!SA.map.isWater(s.x, s.z));
  assert.ok(Math.hypot(s.x - wetPt.x, s.z - wetPt.z) < 6, 'moved only to the nearby shore');
  const pond = P.step({ x: 22, z: 10, heading: 0 }, { forward: true }, DT);
  assert.ok(!SA.map.isWater(pond.x, pond.z));
  const n = P.nearestDry(-9, 14);
  near(n.x, -9); near(n.z, 14);
});

test('walking at the river never enters water and slides along the shore', () => {
  for (const heading of [Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4]) {
    let s = { x: SA.map.riverX(0) - 9, z: 0, heading };
    let moved = 0;
    for (let t = 0; t < 6; t += DT) {
      const n = P.step(s, { forward: true }, DT);
      assert.ok(!SA.map.isWater(n.x, n.z), `wet at ${n.x},${n.z}`);
      moved += Math.hypot(n.x - s.x, n.z - s.z);
      s = n;
    }
    assert.ok(moved > 3, 'kept moving (slid) rather than freezing');
  }
});

test('walking around the pond from every side never ends in water', () => {
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    let s = { x: 22 + Math.cos(a) * 12, z: 10 + Math.sin(a) * 8, heading: Math.atan2(-Math.cos(a), -Math.sin(a)) };
    for (let t = 0; t < 8; t += DT) {
      s = P.step(s, { forward: true }, DT);
      assert.ok(!SA.map.isWater(s.x, s.z), `wet at ${s.x},${s.z}`);
    }
  }
});

test('water: false skips the shore rule (canopy walking)', () => {
  const wetPt = { x: SA.map.riverX(0), z: 0, heading: 0 };
  const s = P.step(wetPt, {}, 0, [], { water: false });
  near(s.x, wetPt.x); near(s.z, wetPt.z);
});

test('standing on top of two obstacles the player escapes; a free player is still blocked by a tree', () => {
  const s = walk({ x: 0, z: 0, heading: 0 }, { forward: true }, 2, [[0, 0, 1], [0.1, 0, 1]]);
  assert.ok(Math.hypot(s.x, s.z) > 1.5);
  const t = walk({ x: 0, z: -5, heading: 0 }, { forward: true }, 3, [[0, 0, 1]]);
  assert.ok(Math.hypot(t.x, t.z) >= 1 + P.RADIUS - 0.03);
});

test('the map stays reachable on foot: water blocks, but a ford crosses the river', () => {
  const B = SA.map.BOUNDS, STEP = 1, W = Math.round((B.maxX - B.minX) / STEP) + 1, H = Math.round((B.maxZ - B.minZ) / STEP) + 1;
  const ix = (x) => Math.round((x - B.minX) / STEP), iz = (z) => Math.round((z - B.minZ) / STEP);
  const dry = (i, j) => !SA.map.isWater(B.minX + i * STEP, B.minZ + j * STEP);
  const s = P.spawn(), seen = new Set([ix(s.x) + ',' + iz(s.z)]), queue = [[ix(s.x), iz(s.z)]];
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj, k = a + ',' + b;
      if (a < 0 || b < 0 || a >= W || b >= H || seen.has(k) || !dry(a, b)) continue;
      seen.add(k); queue.push([a, b]);
    }
  }
  for (const [x, z] of [[-60, 0], [-60, -15], [-45, -15], [60, 0], [20, -15]]) {
    if (dry(ix(x), iz(z))) assert.ok(seen.has(ix(x) + ',' + iz(z)), `(${x}, ${z}) reachable`);
  }
  assert.ok(!SA.map.isWater(SA.map.riverX(SA.map.FORD.z), SA.map.FORD.z), 'the ford is dry');
});

test('the player can walk across the ford from the east bank to the west bank', () => {
  const z = SA.map.FORD.z;
  const s = walk({ x: SA.map.riverX(z) + 9, z, heading: -Math.PI / 2 }, { forward: true }, 5);
  assert.ok(s.x < SA.map.riverX(z) - 3, `crossed: ${s.x}`);
  assert.ok(!SA.map.isWater(s.x, s.z));
});
