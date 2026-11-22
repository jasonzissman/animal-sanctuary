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
  const W = walk({ x: 0, z: 0, heading: -Math.PI / 2 }, { forward: true }, 60);
  assert.ok(W.x >= B.minX && W.x < B.minX + 1);
  const N = walk({ x: 0, z: 0, heading: 0 }, { forward: true }, 30);
  assert.ok(N.z <= B.maxZ && N.z > B.maxZ - 1);
  const S = walk({ x: 0, z: 0, heading: Math.PI }, { forward: true }, 30);
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
