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
function makeRig(above) {
  const SA = load([...PURE, 'game/player.js', 'game/perch.js', 'game/climb.js', 'game/picking.js', 'game/render/camera-rig.js']);
  const listeners = {};
  const canvas = { style: {}, clientHeight: 600, addEventListener: (t, f) => { listeners[t] = f; } };
  const placed = {};
  const camera = { fov: 45, updated: 0, updateProjectionMatrix() { this.updated++; },
    position: { set: (x, y, z) => { placed.pos = { x, y, z }; } }, lookAt: (x, y, z) => { placed.look = { x, y, z }; } };
  const rig = SA.render.createCameraRig({}, canvas, camera, { chase: { obstacles: () => [], above: () => above(rig.getPlayer()) } });
  return { rig, placed, camera, listeners, SA };
}
const run = (rig, n, dt = 0.05) => { for (let i = 0; i < n; i++) rig.update(dt); };
const away = (p, placed) => Math.hypot(placed.pos.x - p.x, placed.pos.z - p.z);

test('rig: a bird in the tree above eases the camera back and up, then back to normal on open ground', () => {
  let bird = false;
  const { rig, placed, camera } = makeRig((p) => (bird ? [{ x: p.x + 2, y: p.y + 5, z: p.z }] : []));
  run(rig, 40);
  const p0 = rig.getPlayer(), normal = away(p0, placed), lookNormal = placed.look.y, fovNormal = camera.fov;
  bird = true;
  run(rig, 1);
  const early = away(p0, placed);
  assert.ok(early - normal < 1.6, 'eases, no snap in the first frame');
  run(rig, 20);
  assert.ok(away(p0, placed) > normal + 3, 'pulled back');
  assert.ok(placed.look.y > lookNormal + 1.5, 'looking higher');
  assert.ok(camera.fov > fovNormal && camera.updated > 0, 'view widened a little');
  assert.ok(rig.getState().dist > 10, 'getState reports the framed distance');
  bird = false;
  run(rig, 60);
  assert.ok(Math.abs(away(p0, placed) - normal) < 0.05, 'back to the normal chase view');
  assert.ok(Math.abs(placed.look.y - lookNormal) < 0.05);
  assert.ok(Math.abs(camera.fov - fovNormal) < 0.05);
});

test('rig: dragging the view overrides the framing, then it eases back in', () => {
  const { rig, placed, listeners } = makeRig((p) => [{ x: p.x + 2, y: p.y + 5, z: p.z }]);
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
