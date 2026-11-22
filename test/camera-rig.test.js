import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

// The rig only needs a canvas that takes listeners and a camera that records where it is put.
// There is exactly one camera mode: the third-person chase camera (no overhead, close-up or focus views).
function make(hooks) {
  const listeners = {}, keys = {};
  const canvas = { style: {}, clientHeight: 600, addEventListener: (t, f) => { listeners[t] = f; } };
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.addEventListener = (t, f) => { keys[t] = f; };
  for (const f of ['game/sa.js', 'game/map.js', 'game/camera.js', 'game/player.js', 'game/perch.js', 'game/climb.js', 'game/picking.js', 'game/render/camera-rig.js']) {
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
const chaseRig = (obstacles = []) => make({ chase: { obstacles: () => obstacles } });
const press = (keys, k) => keys.keydown(ev({ key: k }));
const frames = (rig, n, dt = 0.05) => { for (let i = 0; i < n; i++) rig.update(dt); };
function SA_wrap(d) { return ((d + 540) % 360) - 180; }

test('a tap (press and release without travel) leaves the camera untouched', () => {
  const { rig, listeners } = make();
  const before = rig.getState();
  listeners.pointerdown(ev({}));
  listeners.pointermove(ev({ clientX: 103, clientY: 104 }));
  listeners.pointerup(ev({ clientX: 103, clientY: 104 }));
  assert.deepEqual(rig.getState(), before);
});

test('hooks.canOrbit false (rubbing a muddy part) does not orbit', () => {
  const { rig, listeners } = make({ canOrbit: () => false });
  const before = rig.getState();
  listeners.pointerdown(ev({}));
  listeners.pointermove(ev({ clientX: 300, clientY: 300 }));
  frames(rig, 20);
  assert.deepEqual(rig.getState().pitch, before.pitch);
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

test('the wheel zooms the chase camera (always, there is no focus mode that locks it)', () => {
  const { rig, listeners } = make();
  const d0 = rig.getState().dist;
  listeners.wheel(ev({ deltaY: -400 }));
  assert.notEqual(rig.getState().dist, d0);
});

test('there is no overhead or focus camera API: focusOn and release are gone', () => {
  const { rig } = make();
  assert.equal(rig.focusOn, undefined);
  assert.equal(rig.release, undefined);
});

test('opens with the camera a few metres behind the avatar, near ground level, looking at animal height', () => {
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

test('W/Up walk the avatar forward and the camera follows; releasing stops', () => {
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

test('keys always move the player, even right after a pick/care step: no mode, no Escape needed', () => {
  const { rig, keys, SA } = chaseRig();
  SA.picking.emit({ animalId: 'conejo', part: 'orejas' });   // a part was just picked (care/inspect underway)
  for (const k of ['Enter', ' ', 'Tab', 'Escape']) press(keys, k); // keys that used to start/stop part-cycling
  const p0 = rig.getPlayer();
  press(keys, 'ArrowUp');
  frames(rig, 10);
  const p1 = rig.getPlayer();
  assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1 && p1.moving, 'ArrowUp walks the player');
  keys.keyup({ key: 'ArrowUp' });
  press(keys, 'd');
  frames(rig, 10);
  assert.notEqual(rig.getPlayer().heading, p1.heading, 'D still turns the player');
});

test('holding Shift runs (faster than walking); releasing Shift walks again; Shift does nothing else', () => {
  const dist = (shift) => {
    const { rig, keys } = chaseRig();
    const p0 = rig.getPlayer();
    keys.keydown(ev({ key: shift ? 'W' : 'w', shiftKey: shift }));
    frames(rig, 10, 0.05);
    const p = rig.getPlayer();
    return { d: Math.hypot(p.x - p0.x, p.z - p0.z), running: p.running };
  };
  const walking = dist(false), running = dist(true);
  assert.equal(walking.running, false);
  assert.equal(running.running, true);
  assert.ok(Math.abs(running.d / walking.d - 7 / 4) < 0.05, `run is RUN_SPEED/SPEED faster (${running.d} vs ${walking.d})`);

  const { rig, keys } = chaseRig();
  let prevented = false;
  keys.keydown(ev({ key: 'Shift', shiftKey: true, preventDefault() { prevented = true; } }));
  frames(rig, 5);
  assert.equal(prevented, false, 'Shift alone is left to the browser');
  assert.equal(rig.getPlayer().moving, false, 'Shift alone moves nothing');
  // Shift + W, then Shift released while W is still down: back to walking pace, no stuck key
  keys.keydown(ev({ key: 'W', shiftKey: true }));
  frames(rig, 2);
  assert.equal(rig.getPlayer().running, true);
  keys.keyup(ev({ key: 'Shift', shiftKey: false }));
  frames(rig, 2);
  assert.equal(rig.getPlayer().running, false);
  assert.equal(rig.getPlayer().moving, true, 'still walking');
  keys.keyup(ev({ key: 'w', shiftKey: false }));
  frames(rig, 2);
  assert.equal(rig.getPlayer().moving, false, 'releasing w stops (the shifted W is not stuck)');
});

test('Shift while backing up does not run', () => {
  const { rig, keys } = chaseRig();
  keys.keydown(ev({ key: 'S', shiftKey: true }));
  frames(rig, 3);
  assert.equal(rig.getPlayer().moving, true);
  assert.equal(rig.getPlayer().running, false);
});

test('A/D turn the avatar and the camera swings round behind it', () => {
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

test('Q/E and the orbit pad swing the camera around the standing player without moving them', () => {
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
  rig.setOrbitAxes(0, -1);
  frames(rig, 200);
  assert.equal(rig.getState().pitch, 10);
  rig.setOrbitAxes(0, 0);
  press(keys, 'w');   // walking drifts the swing back behind the player
  frames(rig, 100, 0.05);
  keys.keyup({ key: 'w' });
});

test('walking into an animal slides around it, so its tail and feet can be reached', () => {
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

test('a hint glide turns the avatar toward the spot; a pan gesture walks the avatar (touch)', () => {
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

test('dragging orbits the camera around the player without moving them', () => {
  const { rig, listeners } = chaseRig();
  const p0 = rig.getPlayer(), pitch0 = rig.getState().pitch, yaw0 = rig.getState().yaw;
  listeners.pointerdown(ev({}));
  listeners.pointermove(ev({ clientX: 160, clientY: 100 }));
  listeners.pointermove(ev({ clientX: 260, clientY: 140 }));
  listeners.pointerup(ev({ clientX: 260, clientY: 140 }));
  frames(rig, 40);
  assert.ok(rig.getState().pitch > pitch0, 'pitch changed');
  assert.ok(rig.getState().yaw !== yaw0, 'yaw changed');
  assert.equal(rig.getPlayer().x, p0.x);
});

test('getState carries lookY (animal height) so the hint arrow aims where the camera looks', () => {
  const { rig, SA } = chaseRig();
  assert.equal(rig.getState().lookY, SA.camera.DEFAULTS.lookY);
});

test('an easter-egg reveal / care task turns the player toward the creature; the camera stays behind the player', () => {
  const { rig, placed } = chaseRig();
  frames(rig, 30);
  const p0 = rig.getPlayer();
  rig.glideTo(p0.x + 12, p0.z - 12);   // what SA.unlockFlow does
  frames(rig, 120);
  const p = rig.getPlayer();
  assert.deepEqual([p.x, p.z], [p0.x, p0.z], 'the avatar stayed put');
  assert.ok(Math.abs(p.heading - Math.atan2(12, -12)) < 1e-9, 'turned toward the creature');
  const s = rig.getState();
  assert.ok(Math.hypot(s.x - p.x, s.z - p.z) < 4, 'chase camera still at the player');
  const fwd = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
  assert.ok(-((placed.pos.x - p.x) * fwd.x + (placed.pos.z - p.z) * fwd.z) > 2, 'camera is behind the player, facing the creature');
  assert.ok(placed.pos.y < 5, 'never lifted overhead: y ' + placed.pos.y);
});
