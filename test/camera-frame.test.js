import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

function load(files) {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  for (const f of files) vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx, { filename: f });
  return ctx.window.SA;
}
const PURE = ['game/sa.js', 'game/map.js', 'game/camera.js', 'game/camera-frame.js'];

test('open ground: no perched animals means no framing', () => {
  const C = load(PURE).camera;
  const f = C.frameAbove({ x: 0, z: 0, y: 0 }, []);
  assert.deepEqual({ ...f }, { weight: 0, addDist: 0, addPitch: 0, addLookY: 0, addFov: 0 });
  assert.equal(C.frameAbove(null, null).weight, 0);
});

test('a perched animal above and near pulls back, lowers and looks higher', () => {
  const C = load(PURE).camera;
  const f = C.frameAbove({ x: 0, z: 0, y: 0 }, [{ x: 2, y: 5, z: 1 }]);
  assert.equal(f.weight, 1);
  assert.ok(f.addDist > 0 && f.addPitch < 0 && f.addLookY > 0 && f.addFov >= 0);
  assert.ok(f.addLookY <= C.FRAME_DEFAULTS.maxLook);
});

test('animals too far, too low or junk are ignored; weight fades with distance', () => {
  const C = load(PURE).camera;
  const P = { x: 0, z: 0, y: 0 };
  assert.equal(C.frameAbove(P, [{ x: 12, y: 5, z: 0 }]).weight, 0, 'beyond range');
  assert.equal(C.frameAbove(P, [{ x: 1, y: 0.5, z: 0 }]).weight, 0, 'not above the player');
  assert.equal(C.frameAbove(P, [null, { x: NaN, y: 5, z: 0 }, { x: 'a', y: 5, z: 0 }]).weight, 0, 'junk');
  const mid = C.frameAbove(P, [{ x: 8, y: 5, z: 0 }]), near = C.frameAbove(P, [{ x: 3, y: 5, z: 0 }]);
  assert.ok(mid.weight > 0 && mid.weight < 1 && mid.addDist < near.addDist);
});

test('up a canopy the camera always frames the branches, even with animals level with you', () => {
  const C = load(PURE).camera;
  const up = { x: 0, z: 0, y: 5.2, climb: { mode: 'canopy' } };
  const f = C.frameAbove(up, [{ x: 2, y: 5.2, z: 1 }]);
  assert.equal(f.weight, 1);
  assert.ok(f.addLookY >= C.FRAME_DEFAULTS.canopyLook);
  assert.equal(C.frameAbove(up, []).weight, 1, 'no animals: still pulled back in a canopy');
  assert.equal(C.frameAbove({ x: 0, z: 0, y: 5.2 }, [{ x: 2, y: 5.2, z: 1 }]).weight, 0, 'standing level on the ground does not frame');
});

test('easeFrame is smooth, frame-rate independent and settles in about half a second', () => {
  const C = load(PURE).camera;
  const target = C.frameAbove({ x: 0, z: 0, y: 0 }, [{ x: 1, y: 5, z: 0 }]);
  const one = C.easeFrame(C.NO_FRAME, target, 0.016);
  assert.ok(one.addDist > 0 && one.addDist < target.addDist * 0.15, 'no snap');
  let a = C.NO_FRAME; for (let i = 0; i < 10; i++) a = C.easeFrame(a, target, 0.05);
  let b = C.NO_FRAME; for (let i = 0; i < 50; i++) b = C.easeFrame(b, target, 0.01);
  assert.ok(Math.abs(a.addDist - b.addDist) < 1e-9);
  assert.ok(a.addDist > target.addDist * 0.9, 'about 0.5 s');
  assert.deepEqual({ ...C.easeFrame(null, null, NaN) }, { weight: 0, addDist: 0, addPitch: 0, addLookY: 0, addFov: 0 });
});

// ---- the rig applies it ----
function makeRig(above, ground) {
  const SA = load([...PURE, 'game/player.js', 'game/perch.js', 'game/climb.js', 'game/picking.js', 'game/render/camera-rig.js']);
  const listeners = {};
  const canvas = { style: {}, clientHeight: 600, addEventListener: (t, f) => { listeners[t] = f; } };
  const placed = {};
  const camera = { fov: 45, updated: 0, updateProjectionMatrix() { this.updated++; },
    position: { set: (x, y, z) => { placed.pos = { x, y, z }; } }, lookAt: (x, y, z) => { placed.look = { x, y, z }; } };
  const rig = SA.render.createCameraRig({}, canvas, camera, { chase: { obstacles: () => [], above: () => above(rig.getPlayer()), ground: ground || (() => false) } });
  return { rig, placed, camera, listeners, SA };
}
const run = (rig, n, dt = 0.05) => { for (let i = 0; i < n; i++) rig.update(dt); };
const ahead = (p, d, up) => ({ x: p.x + Math.sin(p.heading) * d, y: p.y + up, z: p.z + Math.cos(p.heading) * d });   // in front of the player
const away = (p, placed) => Math.hypot(placed.pos.x - p.x, placed.pos.z - p.z);

test('rig: a bird in the tree above eases the camera back and up, then back to normal on open ground', () => {
  let bird = false;
  const { rig, placed, camera } = makeRig((p) => (bird ? [ahead(p, 2, 5)] : []));
  run(rig, 40);
  const p0 = rig.getPlayer(), normal = away(p0, placed), lookNormal = placed.look.y, fovNormal = camera.fov;
  bird = true;
  run(rig, 1);
  const early = away(p0, placed);
  assert.ok(early - normal < 1.6, 'eases, no snap in the first frame');
  run(rig, 20);
  assert.ok(away(p0, placed) > normal + 3, 'pulled back');
  assert.ok(placed.look.y > lookNormal + 0.8, 'looking higher (only as much as feet + bird need)');
  assert.ok(camera.fov > fovNormal && camera.updated > 0, 'view widened a little');
  assert.ok(rig.getState().dist > 10, 'getState reports the framed distance');
  bird = false;
  run(rig, 60);
  assert.ok(Math.abs(away(p0, placed) - normal) < 0.05, 'back to the normal chase view');
  assert.ok(Math.abs(placed.look.y - lookNormal) < 0.05);
  assert.ok(Math.abs(camera.fov - fovNormal) < 0.05);
});

test('rig: dragging the view overrides the framing, then it eases back in', () => {
  const { rig, placed, listeners } = makeRig((p) => [ahead(p, 2, 5)]);
  run(rig, 40);
  const p = rig.getPlayer(), framed = away(p, placed);
  const ev = (o) => ({ pointerId: 1, button: 0, clientX: 100, clientY: 100, preventDefault() {}, ...o });
  listeners.pointerdown(ev({}));
  listeners.pointermove(ev({ clientX: 140, clientY: 100 }));   // past the tap threshold: orbiting
  listeners.pointermove(ev({ clientX: 141, clientY: 100 }));
  run(rig, 40);
  assert.ok(away(p, placed) < framed - 3, 'the child is in charge while dragging');
  listeners.pointerup(ev({ clientX: 141 }));
  run(rig, 40);
  assert.ok(away(p, placed) > framed - 0.1, 'framing returns after the drag');
});

test('rig: the camera never leaves the player while framing and stays within the pitch limits', () => {
  const { rig, placed } = makeRig((p) => [{ x: p.x, y: p.y + 6, z: p.z }]);
  run(rig, 60);
  const p = rig.getPlayer();
  assert.ok(away(p, placed) < 14 && placed.pos.y > 0);
  assert.ok(rig.getState().pitch >= 10);
});

// ---- AS-0216: ground target wins, only frame what you face, wait ~0.6 s, keep feet and animal on screen ----
const bird = (h, d, up) => ({ x: Math.sin(h) * d, y: up, z: Math.cos(h) * d });

test('a usable ground target in reach means no tilt, even under a tree with a perched animal', () => {
  const C = load(PURE).camera;
  const P = { x: 0, z: 0, y: 0, heading: 0 };
  assert.ok(C.frameAbove(P, [bird(0, 2, 5)], null, { ground: false, still: 1 }).weight > 0, 'control: frames without a ground target');
  assert.equal(C.frameAbove(P, [bird(0, 2, 5)], null, { ground: true, still: 5 }).weight, 0);
});

test('a perched animal outside the +-50 degree forward cone never frames', () => {
  const C = load(PURE).camera;
  const P = { x: 0, z: 0, y: 0, heading: 0 }, ctx = { still: 5 };
  assert.equal(C.frameAbove(P, [bird(Math.PI, 3, 5)], null, ctx).weight, 0, 'behind');
  assert.equal(C.frameAbove(P, [bird(Math.PI / 2, 3, 5)], null, ctx).weight, 0, 'to the side');
  assert.equal(C.frameAbove(P, [bird(55 * Math.PI / 180, 3, 5)], null, ctx).weight, 0, 'just outside 50 degrees');
  assert.ok(C.frameAbove(P, [bird(45 * Math.PI / 180, 3, 5)], null, ctx).weight > 0, 'inside the cone');
  assert.ok(C.frameAbove(P, [bird(0.3, 3, 5)], null, ctx).weight > 0, 'nearly dead ahead');
});

test('facing a perched animal frames only after about 0.6 s standing still (injected dt)', () => {
  const C = load(PURE).camera;
  const P = { x: 0, z: 0, y: 0, heading: 0 }, pts = [bird(0, 3, 5)];
  let hold = 0;
  hold = C.frameHold(hold, 0, 0.3);
  assert.equal(C.frameAbove(P, pts, null, { still: hold }).weight, 0, '0.3 s: not yet');
  hold = C.frameHold(hold, 0.1, 0.3);   // slowed right down: still counting
  assert.ok(hold >= 0.6 - 1e-9);
  assert.ok(C.frameAbove(P, pts, null, { still: hold }).weight > 0, '0.6 s: frames');
  hold = C.frameHold(hold, 3, 0.016);   // walks off: resets at once
  assert.equal(hold, 0);
  assert.equal(C.frameAbove(P, pts, null, { still: hold }).weight, 0);
  assert.equal(C.frameHold(NaN, NaN, NaN), 0, 'junk input is safe');
});

test('the framed view keeps both the feet and the perched animal inside the vertical view', () => {
  const C = load(PURE).camera, D = C.DEFAULTS;
  for (const [d, up] of [[1, 3], [3, 5], [5, 8], [2, 10], [6, 4]]) {
    const f = C.frameAbove({ x: 0, z: 0, y: 0, heading: 0 }, [bird(0, d, up)], null, { still: 1 });
    assert.ok(f.weight === 1, `framed at d=${d} up=${up}`);
    const pos = C.position({ x: 0, z: 0, dist: D.chaseDist + f.addDist, yaw: 0, pitch: C.clampPitch(D.chasePitch + f.addPitch) });
    const look = D.lookY + f.addLookY, half = (D.fovDeg + f.addFov) / 2;
    const axis = Math.atan2(pos.y - look, pos.z) * 180 / Math.PI;   // below horizontal, degrees
    const feetDown = Math.atan2(pos.y, pos.z) * 180 / Math.PI;
    const topDown = Math.atan2(pos.y - (up + C.FRAME_DEFAULTS.animalTop), pos.z + d) * 180 / Math.PI;
    assert.ok(Math.abs(feetDown - axis) < half, `feet on screen (d=${d}, up=${up})`);
    assert.ok(Math.abs(topDown - axis) < half, `animal on screen (d=${d}, up=${up})`);
    assert.ok(f.addLookY <= C.FRAME_DEFAULTS.maxLook);
  }
});

test('up a canopy the framing ignores the cone, the ground target and the wait', () => {
  const C = load(PURE).camera;
  const up = { x: 0, z: 0, y: 5.2, heading: 0, climb: { mode: 'canopy' } };
  assert.equal(C.frameAbove(up, [{ x: 0, y: 6, z: -2 }], null, { ground: true, still: 0 }).weight, 1);
});

test('rig: a ground target in reach keeps the chase view; without one it frames after the wait', () => {
  let ground = true;
  const { rig, placed } = makeRig((p) => [ahead(p, 2, 5)], () => ground);
  run(rig, 40);
  const p = rig.getPlayer(), normal = away(p, placed);
  const open = makeRig(() => []); run(open.rig, 40);
  assert.ok(Math.abs(normal - away(open.rig.getPlayer(), open.placed)) < 0.05, 'plain chase view under the tree');
  ground = false;
  run(rig, 30, 0.05);   // standing the whole time, so no extra wait once the ground target is gone
  assert.ok(away(p, placed) > normal + 3, 'framed after standing still');
  ground = true;
  run(rig, 60);
  assert.ok(Math.abs(away(p, placed) - normal) < 0.05, 'eases back out when a ground target appears');
});

test('rig: a perched animal behind the player never tilts the camera', () => {
  const { rig, placed } = makeRig((p) => [ahead(p, -3, 5)]);
  run(rig, 40);
  const open = makeRig(() => []); run(open.rig, 40);
  assert.ok(Math.abs(away(rig.getPlayer(), placed) - away(open.rig.getPlayer(), open.placed)) < 0.05);
  assert.ok(Math.abs(placed.look.y - open.placed.look.y) < 0.05);
});
