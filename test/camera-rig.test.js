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
  for (const f of ['game/sa.js', 'game/map.js', 'game/camera.js', 'game/player.js', 'game/picking.js', 'game/render/camera-rig.js']) {
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

// ---- third-person (chase) mode ----
const chaseRig = (obstacles = []) => make({ chase: { obstacles: () => obstacles } });
const press = (keys, k) => keys.keydown(ev({ key: k }));
const frames = (rig, n, dt = 0.05) => { for (let i = 0; i < n; i++) rig.update(dt); };

test('chase: opens with the camera a few metres behind the avatar, near ground level, looking at animal height', () => {
  const { rig, placed } = chaseRig();
  rig.update(0.016);
  const p = rig.getPlayer();
  const fwd = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
  const behind = -((placed.pos.x - p.x) * fwd.x + (placed.pos.z - p.z) * fwd.z);
  assert.ok(behind > 2 && behind < 8, 'behind by ' + behind);
  assert.ok(placed.pos.y > 1 && placed.pos.y < 4, 'height ' + placed.pos.y);
  assert.ok(placed.look.y > 0.5 && placed.look.y < 2, 'looks at ' + placed.look.y);
  assert.equal(p.moving, false);
});

test('chase: W/Up walk the avatar forward and the camera follows; releasing stops', () => {
  const { rig, keys } = chaseRig();
  const p0 = rig.getPlayer(), cam0 = rig.getState();
  press(keys, 'w');
  frames(rig, 10);
  const p1 = rig.getPlayer();
  assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1 && p1.moving);
  assert.ok(Math.hypot(rig.getState().x - cam0.x, rig.getState().z - cam0.z) > 0.5, 'camera followed');
  keys.keyup({ key: 'w' });
  frames(rig, 2);
  assert.equal(rig.getPlayer().moving, false);
});

test('chase: A/D turn the avatar and the camera swings round behind it', () => {
  const { rig, keys } = chaseRig();
  const h0 = rig.getPlayer().heading, y0 = rig.getState().yaw;
  press(keys, 'a');
  frames(rig, 10);
  keys.keyup({ key: 'a' });
  assert.ok(rig.getPlayer().heading !== h0);
  frames(rig, 60);   // settles
  const h = rig.getPlayer().heading;
  const want = SA_wrap(h * 180 / Math.PI + 180);
  assert.ok(Math.abs(SA_wrap(rig.getState().yaw - want)) < 0.5 && rig.getState().yaw !== y0);
});
function SA_wrap(d) { return ((d + 540) % 360) - 180; }

test('chase: Q/E and the orbit pad swing the camera around the standing player without moving them', () => {
  const { rig, keys } = chaseRig();
  const p0 = rig.getPlayer();
  press(keys, 'e');
  frames(rig, 10);
  keys.keyup({ key: 'e' });
  frames(rig, 60);
  const s = rig.getState(), p1 = rig.getPlayer();
  assert.equal(p1.x, p0.x); assert.equal(p1.heading, p0.heading);
  const behind = SA_wrap(p0.heading * 180 / Math.PI + 180);
  assert.ok(Math.abs(SA_wrap(s.yaw - behind)) > 20, 'camera is now off to the side');
  rig.setOrbitAxes(0, 1);
  frames(rig, 100);
  assert.equal(rig.getState().pitch, 89);
  rig.setOrbitAxes(0, 0);
  press(keys, 'w');   // walking drifts the swing back behind the player
  frames(rig, 100, 0.05);
  keys.keyup({ key: 'w' });
});

test('chase: walking into an animal slides around it, so its tail and feet can be reached', () => {
  const { rig, keys } = chaseRig([[-9, 8, 1.3]]);   // an animal straight ahead of the spawn point
  press(keys, 'w');
  frames(rig, 60, 0.05);
  const p = rig.getPlayer();
  assert.ok(Math.hypot(p.x + 9, p.z - 8) >= 1.3 + 0.5, 'stopped outside the animal');
  keys.keyup({ key: 'w' });
  press(keys, 'd'); frames(rig, 20); keys.keyup({ key: 'd' });   // turn aside and walk past it
  press(keys, 'w'); frames(rig, 80); keys.keyup({ key: 'w' });
  assert.ok(Math.hypot(rig.getPlayer().x + 9, rig.getPlayer().z - 8) >= 1.8 - 1e-6, 'never inside the animal');
});

test('chase: a hint glide turns the avatar toward the spot; a pan gesture walks the avatar (touch)', () => {
  const { rig, listeners } = chaseRig();
  const p0 = rig.getPlayer();
  rig.glideTo(p0.x + 10, p0.z);   // due +x
  assert.ok(Math.abs(rig.getPlayer().heading - Math.PI / 2) < 1e-9);
  rig.glideTo(NaN, 0);   // junk is ignored
  assert.ok(Math.abs(rig.getPlayer().heading - Math.PI / 2) < 1e-9);
  listeners.pointerdown(ev({ shiftKey: true }));
  listeners.pointermove(ev({ clientX: 100, clientY: 200, shiftKey: true }));   // crosses the tap threshold
  listeners.pointermove(ev({ clientX: 100, clientY: 300, shiftKey: true }));
  const p1 = rig.getPlayer();
  assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.5, 'moved by the pan');
  assert.equal(p1.heading, rig.getPlayer().heading);
});

test('chase: dragging orbits the camera around the player and care focus still takes over', () => {
  const { rig, listeners } = chaseRig();
  const p0 = rig.getPlayer(), pitch0 = rig.getState().pitch;
  listeners.pointerdown(ev({}));
  listeners.pointermove(ev({ clientX: 160, clientY: 100 }));
  listeners.pointermove(ev({ clientX: 260, clientY: 140 }));
  listeners.pointerup(ev({ clientX: 260, clientY: 140 }));
  frames(rig, 40);
  assert.ok(rig.getState().pitch > pitch0, 'pitch changed');
  assert.equal(rig.getPlayer().x, p0.x);
  rig.focusOn(0, 0, 18);
  frames(rig, 80);
  assert.ok(Math.abs(rig.getState().x) < 0.5, 'focused on the care target');
  rig.release();
  frames(rig, 120);
  assert.ok(Math.hypot(rig.getState().x - p0.x, rig.getState().z - p0.z) < 6, 'camera returns to the player');
});

test('chase: a care focus lifts and zooms out, and release() eases dist and pitch back to the ground-level chase view', () => {
  const { rig, SA } = chaseRig();
  const D = SA.camera.DEFAULTS;
  frames(rig, 30);
  const before = rig.getState();
  rig.focusOn(0, 0, 18);
  frames(rig, 120);
  assert.ok(rig.getState().dist > 15, 'zoomed out for the close-up');
  assert.ok(rig.getState().pitch > D.chasePitch + 10, 'lifted for the care close-up');
  rig.release();
  frames(rig, 240);
  assert.ok(Math.abs(rig.getState().dist - before.dist) < 0.5, 'dist is back near the chase distance');
  assert.ok(Math.abs(rig.getState().dist - D.chaseDist) < 0.5);
  assert.ok(Math.abs(rig.getState().pitch - before.pitch) < 1, 'pitch is back to the chase pitch');
});

test('chase: orbiting during a care focus stops the focus pitch ease so the child keeps control', () => {
  const { rig, keys } = chaseRig();
  rig.focusOn(0, 0, 18);
  keys.keydown({ key: 'r', preventDefault() {} });
  frames(rig, 10);
  keys.keyup({ key: 'r' });
  const p = rig.getState().pitch;
  frames(rig, 60);
  assert.equal(rig.getState().pitch, p);
});
