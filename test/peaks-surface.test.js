// AS-0214: climbing a mountain stays on its surface; the player (and the camera) never goes inside the peak.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/map.js', 'game/peaks.js', 'game/station.js', 'game/player.js', 'game/perch.js', 'game/reach.js',
  'game/climb.js', 'game/camera.js']);
const K = SA.climb, M = SA.map, P = SA.peaks, C = SA.camera;
const DT = 1 / 30, EPS = 0.01;
const targets = P.targets();
const ANGLES = Array.from({ length: 24 }, (_, i) => (i * Math.PI * 2) / 24 + 0.05);   // corners, faces and in between
const at = (x, z, extra = {}) => ({ x, z, heading: 0, y: M.groundHeight(x, z), climb: null, ...extra });
const below = (s) => P.surfaceY(s.x, s.z) - s.y;

test('the walkable terrain is exactly the rendered cone: terrain, surfaceY and the 8-sided shape agree', () => {
  for (const p of P.LIST) {
    const sh = P.shape(p), t = targets.find((x) => x.id === p.id);
    assert.equal(sh.segments, 8);
    assert.ok(sh.pad > P.PAD, 'drawn a hair wider than the surface (no z-fighting)');
    for (const a of ANGLES) for (const r of [0, 1, 1.5, 2, 2.5, 3, 3.5, 3.9, 4.5]) {
      const x = p.x + r * Math.sin(a), z = p.z + r * Math.cos(a);
      assert.equal(M.groundHeight(x, z), P.surfaceY(x, z));
      assert.ok(P.surfaceY(x, z) >= M.baseHeight(x, z));
    }
    // Corners of the 8-gon stick out to the full radius, the middle of a face only to cos(22.5 deg) of it.
    const R = P.BASE_R + P.PAD, f = Math.PI / 8;
    assert.ok(P.moundY(p.x, p.z + R - 0.05) > -Infinity, 'a corner reaches out');
    assert.equal(P.moundY(p.x + (R - 0.05) * Math.sin(f), p.z + (R - 0.05) * Math.cos(f)), -Infinity, 'the middle of a face is further in');
    assert.ok(Math.abs(P.moundY(p.x + 1, p.z) - t.topY) < 1e-9, 'flat summit at topY');
  }
});

test('climbing up any peak from any side never puts a single frame inside the rock', () => {
  let frames = 0;
  for (const t of targets) for (const a of ANGLES) for (const r of [t.radius + 0.1, t.radius + 1, t.radius + 2.1]) {
    const x = t.x + r * Math.sin(a), z = t.z + r * Math.cos(a);
    let s = K.start(at(x, z), t);
    assert.ok(s.climb, `${t.id} starts from r=${r}`);
    for (let i = 0; i < 90 && s.climb && s.climb.mode === 'up'; i++) {
      assert.ok(below(s) <= EPS, `${t.id} a=${a} r=${r} up frame ${i}: y ${s.y} under the surface ${P.surfaceY(s.x, s.z)}`);
      s = K.step(s, {}, DT, []); frames++;
    }
    assert.equal(s.climb.mode, 'top');
    assert.ok(Math.abs(s.y - t.topY) < 1e-9 && Math.hypot(s.x - t.x, s.z - t.z) < P.SUMMIT_R, 'ends standing on the flat top');
  }
  assert.ok(frames > 1000);
});

test('the up path follows the side: it does not tunnel in and then rise inside the cone', () => {
  const t = targets[0];
  let s = K.start(at(t.x + 4.2, t.z), t), prev = -Infinity;
  for (let i = 0; i < 60 && s.climb.mode === 'up'; i++) {
    s = K.step(s, {}, DT, []);
    if (s.climb.t > 0.2 && s.climb.t < 0.8) assert.ok(Math.hypot(s.x - t.x, s.z - t.z) > 0.3, 'still out on the slope mid-climb');
    assert.ok(s.y >= prev - 1e-9, 'always rising');
    prev = s.y;
  }
});

test('the climb-down button and walking off the summit stay above the rock every frame, from every side', () => {
  for (const t of targets) for (const a of ANGLES) {
    const x = t.x + (t.radius + 1) * Math.sin(a), z = t.z + (t.radius + 1) * Math.cos(a);
    let s = K.start(at(x, z), t);
    for (let i = 0; i < 60 && s.climb.mode === 'up'; i++) s = K.step(s, {}, DT, []);
    assert.equal(s.climb.mode, 'top');
    const top = s;
    s = K.stop(s);   // the down button
    for (let i = 0; i < 80 && s.climb; i++) { assert.ok(below(s) <= EPS, `${t.id} down a=${a} frame ${i}`); s = K.step(s, {}, DT, []); }
    assert.equal(s.climb, null);
    assert.ok(below(s) <= EPS);
    s = { ...top, heading: a };   // walk off the edge heading away from the centre: the fall arc
    let fell = false;
    for (let i = 0; i < 200 && (s.climb || !fell); i++) {
      s = K.step(s, { forward: 1 }, DT, []);
      if (s.climb && s.climb.fall) fell = true;
      assert.ok(below(s) <= EPS, `${t.id} walk-off a=${a} frame ${i}: y ${s.y} under ${P.surfaceY(s.x, s.z)}`);
    }
    assert.ok(fell && s.climb === null, `${t.id} a=${a} landed`);
  }
});

test('walking on the slopes (the feet follow the ground with a lag) is never below the rendered rock', () => {
  for (const t of targets) for (const a of ANGLES) {
    let s = at(t.x + 5.5 * Math.sin(a), t.z + 5.5 * Math.cos(a), { heading: a + Math.PI });   // walk straight at the peak, no solid in the way
    for (let i = 0; i < 150; i++) {
      s = K.step(s, { forward: 1, run: i % 2 === 0 }, DT, []);
      // Rock only: on plain terrain the feet ease toward the ground as always (SA.map.followHeight), on the mound they never trail it.
      assert.ok(P.moundY(s.x, s.z) - s.y <= EPS, `${t.id} a=${a} step ${i}: y ${s.y} under the rock ${P.moundY(s.x, s.z)}`);
      if (Math.hypot(s.x - t.x, s.z - t.z) < 1.0) break;
    }
  }
  const t = targets[2], lagging = { x: t.x + 3, z: t.z, heading: 0, y: M.baseHeight(t.x + 3, t.z), climb: null };   // feet far below the slope
  assert.ok(below(K.step(lagging, {}, DT, [])) <= EPS);
});

test('the chase camera stays above and in front of the rock while climbing, on the summit and coming down', () => {
  const dist = C.DEFAULTS.chaseDist, pitch = C.DEFAULTS.chasePitch * Math.PI / 180;
  const check = (s, camY, yawOff, label) => {
    const back = s.heading + Math.PI + yawOff, h = dist * Math.cos(pitch);
    const cx = s.x + h * Math.sin(back), cz = s.z + h * Math.cos(back);
    const cy = P.cameraY(cx, M.cameraHeight(dist * Math.sin(pitch) + camY, cx, cz), cz, s.x, s.y + 1, s.z, 0.4);
    assert.ok(cy >= P.surfaceY(cx, cz) + 0.4 - 1e-9, `${label}: camera in the rock`);
    for (let f = 1; f <= 20; f++) {   // the line of sight to the player never passes through the peak
      const px = s.x + (cx - s.x) * f / 20, pz = s.z + (cz - s.z) * f / 20, py = s.y + 1 + (cy - s.y - 1) * f / 20;
      assert.ok(py >= P.moundY(px, pz) - 1e-9, `${label}: sight line through the rock at ${f}/20`);
    }
  };
  for (const t of [targets[0], targets[4]]) for (const a of ANGLES.filter((_, i) => i % 3 === 0)) {
    const x = t.x + (t.radius + 1) * Math.sin(a), z = t.z + (t.radius + 1) * Math.cos(a);
    let s = K.start(at(x, z), t), camY = s.y;
    const frames = [];
    for (let i = 0; i < 140; i++) {
      if (i === 60) s = K.stop(s);
      s = K.step(s, {}, DT, []);
      camY += (s.y - camY) * (1 - Math.exp(-5 * DT));   // the rig's lagging camY
      frames.push([s, camY]);
    }
    for (const [fs, cy] of frames) for (const yawOff of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) check(fs, cy, yawOff, `${t.id} a=${a}`);
  }
  assert.equal(P.cameraY(0, 5, 0, 1, 1, 1, 0.4), 5, 'away from every peak the camera height is untouched');
});
