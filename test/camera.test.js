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
  assert.deepEqual(plain(C.panByKeys(start, 0, 0, 0.5, B)), plain(C.clampState(start, B)));
  assert.equal(C.panByKeys({ x: 39.9, z: 0, dist: 30 }, 1, 0, 5, B).x, B.maxX);
});

test('wheel and pinch zoom are clamped', () => {
  assert.ok(C.zoomByWheel(start, 100, B).dist > start.dist);
  assert.ok(C.zoomByWheel(start, -100, B).dist < start.dist);
  assert.equal(C.zoomByWheel(start, 1e5, B).dist, C.DEFAULTS.maxDist);
  assert.equal(C.zoomByWheel(start, -1e5, B).dist, C.DEFAULTS.minDist);
  assert.ok(C.zoomByScale(start, 2, B).dist < start.dist);
  assert.ok(C.zoomByScale(start, 0.5, B).dist > start.dist);
  assert.deepEqual(plain(C.zoomByScale(start, 0, B)), plain(C.clampState(start, B)));
});

test('clampOrbit: pitch is clamped near-horizontal..top-down, yaw wraps, junk input is safe', () => {
  const D = C.DEFAULTS;
  assert.equal(D.minPitch, 10);
  assert.equal(C.clampOrbit(0, -500).pitch, D.minPitch);
  assert.equal(C.clampOrbit(0, 0).pitch, D.minPitch);
  assert.equal(C.clampOrbit(0, 500).pitch, D.maxPitch);
  assert.equal(C.clampOrbit(0, Infinity).pitch, D.maxPitch);
  assert.equal(C.clampOrbit(0, -Infinity).pitch, D.minPitch);
  assert.equal(C.clampOrbit(0, 45).pitch, 45);
  assert.equal(C.clampOrbit(0, NaN).pitch, D.tiltDeg);
  assert.equal(C.clampOrbit(0, undefined).pitch, D.tiltDeg);
  assert.equal(C.clampOrbit(190, 30).yaw, -170);
  assert.equal(C.clampOrbit(-180, 30).yaw, 180);
  assert.equal(C.clampOrbit(720 + 45, 30).yaw, 45);
  assert.equal(C.clampOrbit(1e9, 30).yaw >= -180 && C.clampOrbit(1e9, 30).yaw <= 180, true);
  assert.equal(C.clampOrbit(NaN, 30).yaw, 0);
  assert.equal(C.clampOrbit(Infinity, 30).yaw, 0);
});

test('orbitByPixels: drag changes yaw and pitch, pitch clamps, map target is untouched', () => {
  const s0 = C.clampState(start, B);
  const right = C.orbitByPixels(s0, 100, 0, B);
  assert.ok(right.yaw < s0.yaw && right.pitch === s0.pitch);
  const down = C.orbitByPixels(s0, 0, 50, B);
  assert.ok(down.pitch > s0.pitch);
  assert.equal(C.orbitByPixels(s0, 0, -1e6, B).pitch, C.DEFAULTS.minPitch);
  assert.equal(C.orbitByPixels(s0, 0, 1e6, B).pitch, C.DEFAULTS.maxPitch);
  const wild = C.orbitByPixels(s0, 1e9, NaN, B);
  assert.ok(wild.yaw >= -180 && wild.yaw <= 180 && wild.pitch === s0.pitch);
  assert.equal(right.x, s0.x);
  assert.equal(right.z, s0.z);
  assert.equal(right.dist, s0.dist);
});

test('orbitByKeys: Q/E rotate, R/F tilt, extremes stay clamped', () => {
  const s0 = C.clampState(start, B);
  assert.ok(C.orbitByKeys(s0, 1, 0, 0.5, B).yaw < s0.yaw);
  assert.ok(C.orbitByKeys(s0, -1, 0, 0.5, B).yaw > s0.yaw);
  assert.ok(C.orbitByKeys(s0, 0, 1, 0.5, B).pitch > s0.pitch);
  assert.ok(C.orbitByKeys(s0, 0, -1, 0.5, B).pitch < s0.pitch);
  assert.equal(C.orbitByKeys(s0, 0, -1, 1e6, B).pitch, C.DEFAULTS.minPitch);
  assert.equal(C.orbitByKeys(s0, 0, 1, 1e6, B).pitch, C.DEFAULTS.maxPitch);
  assert.deepEqual(plain(C.orbitByKeys(s0, 0, 0, 0.5, B)), plain(s0));
});

test('clampState keeps the target on the map and the orbit valid for hostile input', () => {
  const s = C.clampState({ x: NaN, z: 1e12, dist: -5, yaw: 1e12, pitch: -1e12 }, B);
  assert.ok(s.x >= B.minX && s.x <= B.maxX && s.z === B.maxZ);
  assert.equal(s.dist, C.DEFAULTS.minDist);
  assert.equal(s.pitch, C.DEFAULTS.minPitch);
  assert.ok(s.yaw > -180 && s.yaw <= 180);
});

test('position follows yaw and pitch: low pitch is near ground level, yaw swings the camera around', () => {
  const low = C.position({ x: 0, z: 0, dist: 20, yaw: 0, pitch: 10 });
  assert.ok(low.y < 4 && low.z > 19);
  const side = C.position({ x: 0, z: 0, dist: 20, yaw: 90, pitch: 10 });
  assert.ok(side.x > 19 && Math.abs(side.z) < 1e-9);
  const top = C.position({ x: 0, z: 0, dist: 20, yaw: 0, pitch: 89 });
  assert.ok(top.y > 19.9);
  for (const yaw of [0, 33, 90, 180, -120]) {
    const p = C.position({ x: 2, z: 3, dist: 25, yaw, pitch: 40 });
    assert.ok(Math.abs(Math.hypot(p.x - 2, p.y, p.z - 3) - 25) < 1e-9);
  }
});

test('keyboard pan follows the yaw and stays inside the map; easing keeps the orbit', () => {
  // At yaw 90 the camera sits at +x looking toward -x: screen-right is -z, screen-down (toward viewer) is +x.
  const rotated = C.panByKeys({ x: 0, z: 0, dist: 30, yaw: 90, pitch: 55 }, 1, 0, 0.5, B);
  assert.ok(rotated.z < 0 && Math.abs(rotated.x) < 1e-9);
  assert.equal(C.panByKeys({ x: 0, z: 0, dist: 30, yaw: 90, pitch: 55 }, 0, 1, 1e6, B).x, B.maxX);
  const eased = C.easeToward({ x: 0, z: 0, dist: 30, yaw: 70, pitch: 20 }, { x: 5, z: 5, dist: 20 }, 0.1, 4, B);
  assert.equal(eased.yaw, 70);
  assert.equal(eased.pitch, 20);
});

test('key and drag pans move along the camera screen axes at any yaw', () => {
  for (const yaw of [0, 30, 90, 135, 180, -70]) {
    const s = { x: 0, z: 0, dist: 30, yaw, pitch: 55 };
    const p = C.position(s);
    // Ground direction from camera to target is -(p - target); screen-down is toward the camera.
    const dl = Math.hypot(p.x, p.z), down = { x: p.x / dl, z: p.z / dl };
    // Screen-right is down rotated -90 degrees about the vertical: (x, z) -> (z, -x).
    const right = { x: down.z, z: -down.x };
    const dot = (a, b) => a.x * b.x + a.z * b.z;
    const kr = C.panByKeys(s, 1, 0, 0.1, B);
    assert.ok(dot(kr, right) > 0.5 && Math.abs(dot(kr, down)) < 1e-9, 'right key, yaw ' + yaw);
    const kd = C.panByKeys(s, 0, 1, 0.1, B);
    assert.ok(dot(kd, down) > 0.5 && Math.abs(dot(kd, right)) < 1e-9, 'down key, yaw ' + yaw);
    // Dragging right pulls the ground right, so the target moves screen-left.
    const dr = C.panByPixels(s, 50, 0, 600, B);
    assert.ok(dot(dr, right) < 0 && Math.abs(dot(dr, down)) < 1e-9, 'drag right, yaw ' + yaw);
  }
});

test('vertical drag pan speed is capped at low pitch', () => {
  const top = C.panByPixels({ x: 0, z: 0, dist: 30, yaw: 0, pitch: 89 }, 0, 50, 600, B);
  const low = C.panByPixels({ x: 0, z: 0, dist: 30, yaw: 0, pitch: 10 }, 0, 50, 600, B);
  assert.ok(Math.abs(low.z) / Math.abs(top.z) < 3);
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
