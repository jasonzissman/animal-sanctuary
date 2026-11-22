import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

// The rig only needs a canvas that takes listeners and a camera that records where it is put.
function make(hooks) {
  const listeners = {}, keys = {};
  const canvas = { style: {}, clientHeight: 600, addEventListener: (t, f) => { listeners[t] = f; } };
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.addEventListener = (t, f) => { keys[t] = f; };
  for (const f of ['game/sa.js', 'game/map.js', 'game/camera.js', 'game/picking.js', 'game/render/camera-rig.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx, { filename: f });
  }
  const placed = { pos: null, look: null };
  const camera = {
    position: { set: (x, y, z) => { placed.pos = { x, y, z }; } },
    lookAt: (x, y, z) => { placed.look = { x, y, z }; },
  };
  const SA = ctx.window.SA;
  const rig = SA.render.createCameraRig({}, canvas, camera, null, hooks);
  return { rig, listeners, keys, placed, SA };
}

const ev = (o) => ({ pointerId: 1, button: 0, clientX: 100, clientY: 100, preventDefault() {}, ...o });

test('a tap (press and release without travel) leaves the camera untouched', () => {
  const { rig, listeners } = make();
  const before = rig.getState();
  listeners.pointerdown(ev({}));
  listeners.pointermove(ev({ clientX: 103, clientY: 104 }));
  listeners.pointerup(ev({ clientX: 103, clientY: 104 }));
  assert.deepEqual(rig.getState(), before);
});

test('dragging orbits: horizontal changes yaw, vertical changes pitch, target stays put', () => {
  const { rig, listeners } = make();
  const before = rig.getState();
  listeners.pointerdown(ev({}));
  listeners.pointermove(ev({ clientX: 160, clientY: 100 }));   // crosses the tap threshold
  listeners.pointermove(ev({ clientX: 260, clientY: 100 }));
  listeners.pointermove(ev({ clientX: 260, clientY: 40 }));
  listeners.pointerup(ev({ clientX: 260, clientY: 40 }));
  const after = rig.getState();
  assert.ok(after.yaw < before.yaw, 'yaw changed');
  assert.ok(after.pitch < before.pitch, 'pitch changed (lower view)');
  assert.equal(after.x, before.x);
  assert.equal(after.z, before.z);
});

test('hooks.canOrbit false (rubbing a muddy part) does not orbit', () => {
  const { rig, listeners } = make({ canOrbit: () => false });
  const before = rig.getState();
  listeners.pointerdown(ev({}));
  listeners.pointermove(ev({ clientX: 300, clientY: 300 }));
  assert.deepEqual(rig.getState(), before);
});

test('shift-drag pans and stays inside the map', () => {
  const { rig, listeners, SA } = make();
  const before = rig.getState();
  listeners.pointerdown(ev({ shiftKey: true }));
  listeners.pointermove(ev({ clientX: 150, clientY: 100, shiftKey: true }));
  listeners.pointermove(ev({ clientX: -9e6, clientY: 100, shiftKey: true }));
  const after = rig.getState();
  assert.equal(after.yaw, before.yaw);
  assert.equal(after.x, SA.map.BOUNDS.maxX);
});

test('Q/E rotate and R/F tilt via the keyboard; update() places the camera low and to the side', () => {
  const { rig, keys, placed } = make();
  const before = rig.getState();
  keys.keydown(ev({ key: 'e' }));
  keys.keydown(ev({ key: 'f' }));
  rig.update(0.5);
  keys.keyup({ key: 'e' });
  keys.keyup({ key: 'f' });
  const mid = rig.getState();
  assert.ok(mid.yaw < before.yaw && mid.pitch < before.pitch);
  keys.keydown(ev({ key: 'f' }));
  rig.update(1000);
  assert.equal(rig.getState().pitch, 10);
  assert.ok(placed.pos.y < 10 && placed.look.y === 0);
  keys.keyup({ key: 'f' });
  keys.keydown(ev({ key: 'r' }));
  rig.update(1000);
  assert.equal(rig.getState().pitch, 89);
  keys.keydown(ev({ key: 'r', ctrlKey: true, metaKey: true }));   // browser shortcuts are not swallowed
});

test('setOrbitAxes (on-screen buttons) matches the keys: same yaw/pitch change, clamped, and stops at 0', () => {
  const key = make(), pad = make();
  key.keys.keydown(ev({ key: 'e' })); key.keys.keydown(ev({ key: 'f' }));
  key.rig.update(0.5);
  pad.rig.setOrbitAxes(1, -1);
  pad.rig.update(0.5);
  assert.equal(pad.rig.getState().yaw, key.rig.getState().yaw);
  assert.equal(pad.rig.getState().pitch, key.rig.getState().pitch);
  pad.rig.setOrbitAxes(0, -1);
  pad.rig.update(1000);
  assert.equal(pad.rig.getState().pitch, 10);
  pad.rig.setOrbitAxes(0, 5);
  pad.rig.update(1000);
  assert.equal(pad.rig.getState().pitch, 89);
  pad.rig.setOrbitAxes(0, 0);
  const s = pad.rig.getState();
  pad.rig.update(1);
  assert.deepEqual(pad.rig.getState(), s);
});

test('orbit still works while focused on a care target, but wheel zoom is ignored', () => {
  const { rig, listeners } = make();
  rig.focusOn(5, 5, 20);
  const d0 = rig.getState().dist;
  listeners.wheel(ev({ deltaY: 1000 }));
  assert.equal(rig.getState().dist, d0);
  listeners.pointerdown(ev({}));
  listeners.pointermove(ev({ clientX: 200, clientY: 100 }));
  listeners.pointermove(ev({ clientX: 300, clientY: 100 }));
  assert.ok(rig.getState().yaw < 0);
  rig.update(0.1);
  rig.release();
});

test('two-finger pinch zooms; cancel and release reset cleanly', () => {
  const { rig, listeners } = make();
  const d0 = rig.getState().dist;
  listeners.pointerdown(ev({ pointerId: 1, clientX: 100, clientY: 100 }));
  listeners.pointerdown(ev({ pointerId: 2, clientX: 200, clientY: 100 }));
  listeners.pointermove(ev({ pointerId: 2, clientX: 300, clientY: 100 }));
  assert.ok(rig.getState().dist < d0);
  listeners.pointercancel(ev({ pointerId: 2 }));
  listeners.pointerup(ev({ pointerId: 1 }));
});
