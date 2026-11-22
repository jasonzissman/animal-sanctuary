import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/map.js', 'game/camera.js']);
const C = SA.camera;
const B = SA.map.BOUNDS;
const start = { x: 0, z: 0, dist: 30 };
const plain = (o) => JSON.parse(JSON.stringify(o));

test('clampState keeps target inside the map and zoom inside limits', () => {
  const s = C.clampState({ x: 999, z: -999, dist: 1 }, B);
  assert.equal(s.x, B.maxX);
  assert.equal(s.z, B.minZ);
  assert.equal(s.dist, C.DEFAULTS.minDist);
  assert.equal(C.clampState({ x: 0, z: 0, dist: 1e6 }, B).dist, C.DEFAULTS.maxDist);
});

test('drag pans so the ground follows the pointer', () => {
  const right = C.panByPixels(start, 100, 0, 600, B);
  assert.ok(right.x < 0, 'dragging right moves the view left');
  const down = C.panByPixels(start, 0, 100, 600, B);
  assert.ok(down.z < 0, 'dragging down moves the view toward -z');
  assert.equal(right.dist, start.dist);
});

test('drag pan distance scales with zoom and is clamped', () => {
  const near = C.panByPixels({ x: 0, z: 0, dist: 20 }, 50, 0, 600, B);
  const far = C.panByPixels({ x: 0, z: 0, dist: 40 }, 50, 0, 600, B);
  assert.ok(Math.abs(far.x) > Math.abs(near.x));
  assert.equal(C.panByPixels(start, -1e6, 0, 600, B).x, B.maxX);
});

test('keys pan, diagonal speed is normalised, no keys is a no-op', () => {
  const r = C.panByKeys(start, 1, 0, 0.5, B);
  const diag = C.panByKeys(start, 1, 1, 0.5, B);
  assert.ok(r.x > 0 && r.z === 0);
  assert.ok(Math.abs(Math.hypot(diag.x, diag.z) - r.x) < 1e-9);
  assert.deepEqual(plain(C.panByKeys(start, 0, 0, 0.5, B)), start);
  assert.equal(C.panByKeys({ x: 39.9, z: 0, dist: 30 }, 1, 0, 5, B).x, B.maxX);
});

test('wheel and pinch zoom are clamped', () => {
  assert.ok(C.zoomByWheel(start, 100, B).dist > start.dist);
  assert.ok(C.zoomByWheel(start, -100, B).dist < start.dist);
  assert.equal(C.zoomByWheel(start, 1e5, B).dist, C.DEFAULTS.maxDist);
  assert.equal(C.zoomByWheel(start, -1e5, B).dist, C.DEFAULTS.minDist);
  assert.ok(C.zoomByScale(start, 2, B).dist < start.dist);
  assert.ok(C.zoomByScale(start, 0.5, B).dist > start.dist);
  assert.deepEqual(plain(C.zoomByScale(start, 0, B)), start);
});

test('position sits behind and above the target', () => {
  const p = C.position({ x: 3, z: 4, dist: 20 });
  assert.equal(p.x, 3);
  assert.ok(p.y > 0 && p.z > 4);
  assert.ok(Math.abs(Math.hypot(p.y, p.z - 4) - 20) < 1e-9);
});

test('map: biomes split at x=0, river and pond are water, rng is deterministic', () => {
  const M = SA.map;
  assert.equal(M.biomeAt(-5), 'bosque');
  assert.equal(M.biomeAt(5), 'selva');
  assert.ok(M.isWater(M.riverX(0), 0));
  assert.ok(M.isWater(M.POND.x, M.POND.z));
  assert.ok(!M.isWater(-35, -20));
  assert.ok(M.nearWater(M.riverX(5) + 3, 5, 2.5) && M.nearWater(M.POND.x, M.POND.z, 1));
  assert.ok(!M.nearWater(-38, -20, 2.5) && !M.nearWater(35, -20, 2.5));
  const a = M.rng(1), b = M.rng(1);
  assert.equal(a(), b());
});
