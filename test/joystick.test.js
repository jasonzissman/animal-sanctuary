import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const plain = (o) => JSON.parse(JSON.stringify(o));
const load = () => loadGame(['game/sa.js', 'game/joystick.js']);
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('vector: inside the dead zone nothing moves; at the rim it is a unit vector in the thumb direction', () => {
  const J = load().joystick;
  assert.deepEqual(plain(J.vector(0, 0, 50)), { x: 0, y: 0, mag: 0 });
  assert.deepEqual(plain(J.vector(5, -5, 50)), { x: 0, y: 0, mag: 0 }, 'a wobble is ignored');
  const up = J.vector(0, -50, 50);
  assert.ok(near(up.x, 0) && near(up.y, -1) && near(up.mag, 1));
  const diag = J.vector(100, 100, 50);   // way past the rim: clamped to length 1, same direction
  assert.ok(near(Math.hypot(diag.x, diag.y), 1) && near(diag.x, diag.y) && diag.x > 0);
});

test('vector: magnitude grows smoothly from the dead zone edge to the rim', () => {
  const J = load().joystick;
  const a = J.vector(0, 20, 50).mag, b = J.vector(0, 30, 50).mag, c = J.vector(0, 45, 50).mag;
  assert.ok(0 < a && a < b && b < c && c < 1);
  assert.ok(near(J.vector(0, 50 * (J.DEAD_ZONE + 1) / 2, 50).mag, 0.5));
});

test('vector: junk input and a bad radius never produce NaN', () => {
  const J = load().joystick;
  for (const v of [J.vector(NaN, 3, 50), J.vector(undefined, null, 50), J.vector(10, 10, 0), J.vector(10, 10, -5), J.vector(10, 10, NaN)]) {
    assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.mag));
  }
  assert.deepEqual(plain(J.vector(10, 10, 0)), { x: 0, y: 0, mag: 0 });
});

test('toInput: up walks forward, down backs up, left/right turn; opposite axes never overlap', () => {
  const J = load().joystick;
  assert.deepEqual(plain(J.toInput({ x: 0, y: -1 })), { forward: 1, back: 0, left: 0, right: 0 });
  assert.deepEqual(plain(J.toInput({ x: 0, y: 0.5 })), { forward: 0, back: 0.5, left: 0, right: 0 });
  assert.deepEqual(plain(J.toInput({ x: -0.25, y: -0.5 })), { forward: 0.5, back: 0, left: 0.25, right: 0 });
  assert.deepEqual(plain(J.toInput({ x: 1, y: 0 })), { forward: 0, back: 0, left: 0, right: 1 });
  assert.deepEqual(plain(J.toInput(null)), { forward: 0, back: 0, left: 0, right: 0 });
});

test('toInput drives SA.player.step: pushing up walks forward, pushing right turns clockwise', () => {
  const SA = loadGame(['game/sa.js', 'game/map.js', 'game/player.js', 'game/joystick.js']);
  const s0 = SA.player.spawn();
  const fwd = SA.player.step(s0, SA.joystick.toInput(SA.joystick.vector(0, -50, 50)), 0.1);
  assert.ok(Math.hypot(fwd.x - s0.x, fwd.z - s0.z) > 0.3);
  const half = SA.player.step(s0, SA.joystick.toInput({ x: 0, y: -0.5 }), 0.1);
  assert.ok(Math.hypot(half.x - s0.x, half.z - s0.z) < Math.hypot(fwd.x - s0.x, fwd.z - s0.z), 'half push is slower');
  const right = SA.player.step(s0, SA.joystick.toInput({ x: 1, y: 0 }), 0.1);
  assert.ok(right.x === s0.x && right.z === s0.z && right.heading !== s0.heading);
});

test('isTouch: only fingers and pens reveal the joystick', () => {
  const J = load().joystick;
  assert.equal(J.isTouch('touch'), true);
  assert.equal(J.isTouch('pen'), true);
  assert.equal(J.isTouch('mouse'), false);
  assert.equal(J.isTouch(undefined), false);
});

// ---- DOM view ----
const el = (tag) => ({ tag, style: {}, children: [], l: {}, attrs: {}, appendChild(c) { this.children.push(c); },
  addEventListener(t, f) { this.l[t] = f; }, setAttribute(k, v) { this.attrs[k] = v; },
  getBoundingClientRect: () => ({ left: 16, top: 400, width: 136, height: 136 }) });
const ev = (o) => ({ pointerId: 1, clientX: 84, clientY: 468, preventDefault() {}, ...o });

test('view: hidden until a touch, then bottom-left; dragging drives rig.setStick and release recentres', () => {
  const SA = loadGame(['game/sa.js', 'game/joystick.js', 'game/ui/joystick-view.js']);
  assert.doesNotThrow(() => SA.joystickView.create(null, {}).release());
  const body = el('body'), doc = { createElement: el, body };
  const win = { l: {}, addEventListener(t, f) { this.l[t] = f; } };
  const calls = [];
  SA.joystickView.create(doc, { setStick: (x, y) => calls.push([x, y]) }, win);
  const pad = body.children[0];
  assert.equal(pad.style.display, 'none', 'mouse/keyboard devices never see it');
  assert.ok(/left:\d+px;bottom:\d+px/.test(pad.style.cssText));
  assert.ok(+/width:(\d+)px/.exec(pad.style.cssText)[1] >= 100, 'big thumb target');
  assert.ok(pad.attrs['aria-label']);
  assert.equal(pad.children[0].textContent.length <= 2, true, 'icon only');

  win.l.pointerdown({ pointerType: 'mouse' });
  assert.equal(pad.style.display, 'none');
  win.l.pointerdown({ pointerType: 'touch' });
  assert.notEqual(pad.style.display, 'none');

  pad.l.pointerdown(ev({ clientX: 84, clientY: 468 }));          // dead centre: no movement
  assert.deepEqual(calls.pop(), [0, 0]);
  pad.l.pointermove(ev({ clientX: 84, clientY: 400 }));          // thumb pushed up past the rim
  const [x, y] = calls.pop();
  assert.ok(near(x, 0) && near(y, -1));
  pad.l.pointermove(ev({ pointerId: 2, clientX: 200, clientY: 468 }));   // another finger is ignored
  assert.equal(calls.length, 0);
  pad.l.pointerup(ev({ pointerId: 2 }));
  assert.equal(calls.length, 0);
  pad.l.pointerup(ev({}));
  assert.deepEqual(calls.pop(), [0, 0]);
  win.l.blur();
});

// ---- camera rig integration ----
function makeRig() {
  const listeners = {}, keys = {};
  const canvas = { style: {}, clientHeight: 600, addEventListener: (t, f) => { listeners[t] = f; } };
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.addEventListener = (t, f) => { keys[t] = f; };
  for (const f of ['game/sa.js', 'game/map.js', 'game/camera.js', 'game/player.js', 'game/perch.js', 'game/climb.js', 'game/joystick.js', 'game/picking.js', 'game/render/camera-rig.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx, { filename: f });
  }
  const camera = { position: { set() {} }, lookAt() {} };
  const rig = ctx.window.SA.render.createCameraRig({}, canvas, camera, null, { chase: { obstacles: () => [] } });
  return { rig, listeners };
}
const run = (rig, n) => { for (let i = 0; i < n; i++) rig.update(1 / 30); };
const pev = (o) => ({ pointerId: 1, button: 0, clientX: 300, clientY: 300, preventDefault() {}, ...o });

test('rig: the joystick walks and turns the avatar with no keyboard; centring it stops', () => {
  const { rig } = makeRig();
  const p0 = rig.getPlayer();
  rig.setStick(0, -1);
  run(rig, 10);
  const p1 = rig.getPlayer();
  assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1 && p1.moving);
  rig.setStick(1, 0);
  run(rig, 10);
  assert.notEqual(rig.getPlayer().heading, p1.heading, 'turned');
  rig.setStick(0, 0);
  run(rig, 2);
  assert.equal(rig.getPlayer().moving, false);
  rig.setStick(NaN, 'x');   // junk is treated as centred
  run(rig, 2);
  assert.equal(rig.getPlayer().moving, false);
});

test('rig: with the stick held, a one-finger drag on the ground still swings the camera and a tap never does', () => {
  const { rig, listeners } = makeRig();
  const y0 = rig.getState().yaw;
  listeners.pointerdown(pev({}));
  listeners.pointermove(pev({ clientX: 304, clientY: 303 }));
  listeners.pointerup(pev({ clientX: 304, clientY: 303 }));
  run(rig, 1);
  assert.equal(rig.getState().yaw, y0, 'a tap does not turn the view');
  listeners.pointerdown(pev({ pointerId: 2 }));
  listeners.pointermove(pev({ pointerId: 2, clientX: 360, clientY: 300 }));
  listeners.pointermove(pev({ pointerId: 2, clientX: 440, clientY: 300 }));
  const p = rig.getPlayer();
  run(rig, 1);
  assert.notEqual(rig.getState().yaw, y0, 'dragging swings the camera');
  assert.equal(rig.getPlayer().x, p.x, 'and does not walk the player');
});
