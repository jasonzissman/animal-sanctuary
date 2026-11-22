import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/map.js', 'game/camera.js', 'game/player.js', 'game/perch.js', 'game/climb.js', 'game/jump.js'];
const SA0 = loadGame(FILES);
const J = SA0.jump;

function run(state, input, seconds, dt = 1 / 60) {
  const trace = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) { state = J.step(state, input, dt); trace.push(state); }
  return { state, trace };
}

test('a hop peaks at about 1.2 units and lands after about 0.6 s', () => {
  let s = J.step(J.create(), { jump: true }, 1 / 60);
  assert.equal(s.event, 'takeoff');
  assert.equal(s.air, true);
  let peak = s.lift, t = 1 / 60, landedAt = null;
  while (landedAt === null && t < 2) {
    s = J.step(s, { jump: false }, 1 / 60); t += 1 / 60;
    peak = Math.max(peak, s.lift);
    if (!s.air) landedAt = t;
  }
  assert.ok(Math.abs(peak - 1.2) < 0.05, `peak ${peak}`);
  assert.ok(Math.abs(landedAt - 0.6) < 0.03, `landed at ${landedAt}`);
  assert.equal(s.lift, 0, 'back exactly on the ground');
  assert.equal(s.event, 'land');
});

test('the arc is the same at any frame rate and never goes below the ground', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144, 0.1]) {
    let s = J.step(J.create(), { jump: true }, dt), peak = s.lift, n = 0;
    while (s.air && n++ < 200) { s = J.step(s, { jump: false }, dt); peak = Math.max(peak, s.lift); assert.ok(s.lift >= 0); }
    assert.ok(Math.abs(peak - 1.2) < 0.15, `dt ${dt}: peak ${peak}`);
    assert.equal(s.air, false);
  }
});

test('holding Space never chains hops: it must be released and pressed again', () => {
  let { state, trace } = run(J.create(), { jump: true }, 3);
  assert.equal(trace.filter((s) => s.event === 'takeoff').length, 1, 'one takeoff while held for 3 s');
  assert.equal(state.air, false);
  assert.equal(state.lift, 0);
  state = J.step(state, { jump: false }, 1 / 60);   // release
  state = J.step(state, { jump: true }, 1 / 60);    // press again
  assert.equal(state.event, 'takeoff');
  // pressing again in the air does nothing extra: the same hop continues and lands
  const mid = run(state, { jump: false }, 0.2).state;
  const again = J.step(J.step(mid, { jump: true }, 1 / 60), { jump: true }, 1 / 60);
  assert.ok(again.vy < state.vy, 'still on the same arc');
  assert.notEqual(again.event, 'takeoff');
});

test('a takeoff can be blocked (up a tree) and cancel drops back to the ground', () => {
  const s = J.step(J.create(), { jump: true }, 1 / 60, false);
  assert.equal(s.air, false);
  const air = J.step(J.create(), { jump: true }, 1 / 60);
  const c = J.cancel(air);
  assert.deepEqual([c.lift, c.air, c.armed], [0, false, false], 'a held key does not re-jump after a cancel');
  assert.deepEqual(J.step(null, null, NaN).lift, 0, 'garbage input is harmless');
  const orig = J.create(); J.step(orig, { jump: true }, 0.05);
  assert.equal(orig.air, false, 'the input state is never mutated');
});

// --- the camera rig: Space wiring, forward momentum, blocking in the air, terrain landing, no canopy reach ---
function makeRig(obstacles = [], audioLog = []) {
  const keys = {};
  const SA = loadGame([...FILES, 'game/picking.js', 'game/render/camera-rig.js', (sa) => { sa.audio = { sfx: (n) => { audioLog.push(n); return true; } }; }],
    { addEventListener: (t, f) => { keys[t] = f; } });
  const canvas = { style: {}, clientHeight: 600, addEventListener() {} };
  const camera = { position: { set() {} }, lookAt() {} };
  const rig = SA.render.createCameraRig({}, canvas, camera, null, { chase: { obstacles: () => obstacles } });
  const ev = (o) => ({ preventDefault() {}, ...o });
  return { SA, rig, keys, ev, frames: (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) rig.update(dt); } };
}

test('Space hops the avatar with a boing, lands on the terrain and does not change reach height', () => {
  const log = [];
  const { SA, rig, keys, ev, frames } = makeRig([], log);
  frames(3);
  const y0 = rig.getPlayer().y;
  let prevented = false;
  keys.keydown(ev({ key: ' ', code: 'Space', preventDefault() { prevented = true; } }));
  assert.equal(prevented, true, 'Space does not scroll the page');
  let peak = 0, steps = 0;
  while (steps++ < 120) {
    frames(1);
    const p = rig.getPlayer();
    peak = Math.max(peak, p.lift);
    assert.equal(p.y, y0, 'standing height (reach) is untouched by a hop: it is not a climb');
    if (steps > 5 && p.lift === 0) break;
  }
  assert.ok(Math.abs(peak - 1.2) < 0.1, `peak ${peak}`);
  assert.equal(rig.getPlayer().lift, 0);
  const lp = rig.getPlayer();
  assert.ok(Math.abs(lp.y - SA.map.groundHeight(lp.x, lp.z)) < 1e-6, 'landed on the terrain height at this spot');
  assert.deepEqual(log, ['hop'], 'one boing, on takeoff only, even though Space is still held');
  keys.keyup(ev({ key: ' ', code: 'Space' }));
  keys.keydown(ev({ key: ' ', code: 'Space' }));
  frames(2);
  assert.ok(rig.getPlayer().lift > 0, 'pressed again: hops again');
  assert.deepEqual(log, ['hop', 'hop']);
});

test('Space on a focused button or with Ctrl is not a jump; Shift+Space is', () => {
  const { rig, keys, ev, frames } = makeRig();
  keys.keydown(ev({ key: ' ', code: 'Space', target: { tagName: 'BUTTON' } }));
  keys.keydown(ev({ key: ' ', code: 'Space', ctrlKey: true }));
  frames(3);
  assert.equal(rig.getPlayer().lift, 0);
  keys.keydown(ev({ key: ' ', code: 'Space', shiftKey: true }));
  frames(3);
  assert.ok(rig.getPlayer().lift > 0);
});

test('jumping while running keeps moving forward at run speed', () => {
  const { rig, keys, ev, frames } = makeRig();
  frames(2);
  keys.keydown(ev({ key: 'W', shiftKey: true }));
  frames(3);
  const a = rig.getPlayer();
  keys.keydown(ev({ key: ' ', code: 'Space', shiftKey: true }));
  frames(20);
  const b = rig.getPlayer();
  assert.ok(b.lift > 0, 'in the air');
  assert.equal(b.running, true);
  assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 20 * (1 / 60) * 10 * 0.9, 'kept running speed through the hop');
});

test('a solid obstacle still blocks the player in the air', () => {
  const start = makeRig().rig.getPlayer();
  const ahead = [start.x + Math.sin(start.heading) * 3, start.z + Math.cos(start.heading) * 3, 1];
  const t = makeRig([ahead]);
  t.keys.keydown(t.ev({ key: 'w' }));
  t.keys.keydown(t.ev({ key: ' ', code: 'Space' }));
  let sawAir = false, closest = Infinity;
  for (let i = 0; i < 90; i++) {
    t.frames(1);
    const p = t.rig.getPlayer();
    sawAir = sawAir || p.lift > 0;
    closest = Math.min(closest, Math.hypot(p.x - ahead[0], p.z - ahead[1]));
  }
  assert.ok(sawAir);
  assert.ok(closest >= 1 + 0.6 - 0.05, `never entered the tree circle (closest ${closest})`);
});

// --- the touch jump button (AS-0114) ---
test('rig.jump() hops exactly like Space: one hop per landing, none in the air', () => {
  const log = [];
  const { rig, frames } = makeRig([], log);
  frames(3);
  assert.equal(rig.jump(), true);
  frames(2);
  assert.ok(rig.getPlayer().lift > 0, 'in the air after a tap');
  assert.equal(rig.jump(), false, 'a tap in the air is ignored (and not buffered)');
  frames(60);
  assert.equal(rig.getPlayer().lift, 0, 'landed, no second hop chained');
  assert.deepEqual(log, ['hop']);
  assert.equal(rig.jump(), true, 'a new tap after landing hops again');
  frames(2);
  assert.ok(rig.getPlayer().lift > 0);
  assert.deepEqual(log, ['hop', 'hop']);
});

test('jump button: big round icon-only button, shown at the first touch, taps call rig.jump', () => {
  const SA = loadGame(['game/sa.js', 'game/ui/jump-button.js']);
  const made = [];
  const doc = { body: { appendChild() {} }, createElement: () => { const el = { style: {}, attrs: {}, on: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.on[t] = f; } }; made.push(el); return el; } };
  const win = { addEventListener(t, f) { win[t] = f; } };
  let jumps = 0;
  const view = SA.jumpButton.create(doc, { jump: () => { jumps++; } }, win);
  const b = made[0];
  assert.equal(b.style.display, 'none', 'hidden on mouse/keyboard devices');
  assert.equal(b.textContent, '⬆️');
  assert.ok(SA.jumpButton.SIZE >= 72 && /border-radius:50%/.test(b.style.cssText));
  win.pointerdown({ pointerType: 'mouse' });
  assert.equal(b.style.display, 'none');
  win.pointerdown({ pointerType: 'touch' });
  assert.equal(b.style.display, 'block');
  let stopped = 0;
  b.on.pointerdown({ preventDefault() {}, stopPropagation() { stopped++; } });
  assert.deepEqual([jumps, stopped], [1, 1], 'the tap jumps and does not reach the canvas (no drag-to-look)');
  b.on.contextmenu({ preventDefault() {} });
  assert.equal(SA.jumpButton.create(null, { jump() {} }).element, null);
  assert.equal(SA.jumpButton.create(doc, {}).element, null);
  assert.ok(view.element);
});

test('the avatar rises with the hop and squashes and stretches', () => {
  const node = () => ({ children: [], position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, add(c) { this.children.push(c); } });
  const THREE = { Group: function () { return node(); }, Mesh: function (g, m) { return Object.assign(node(), { geometry: g, material: m }); },
    BoxGeometry: function () { return {}; }, SphereGeometry: function () { return {}; }, MeshLambertMaterial: function (o) { return o; } };
  const SA = loadGame(['game/sa.js', 'game/jump.js', 'game/render/avatar.js']);
  const a = SA.render.createAvatar(THREE);
  const body = a.group.children[0];
  const player = { x: 1, y: 2, z: 3, heading: 0, moving: false, lift: 0 };
  a.update(1 / 60, player);
  assert.deepEqual([body.scale.x, body.scale.y], [1, 1], 'standing: no squash');
  let s = SA.jump.create(), minY = 1, maxY = 1, top = 0;
  for (let i = 0; i < 60; i++) {
    s = SA.jump.step(s, { jump: i === 0 }, 1 / 60);
    a.update(1 / 60, { ...player, lift: s.lift });
    minY = Math.min(minY, body.scale.y); maxY = Math.max(maxY, body.scale.y); top = Math.max(top, a.group.position.y);
  }
  assert.ok(minY < 0.9, `squashed (${minY})`);
  assert.ok(maxY > 1.05, `stretched (${maxY})`);
  assert.ok(Math.abs(top - (2 + 1.2)) < 0.1, 'drawn at y + lift');
  assert.equal(a.group.position.y, 2, 'lands back on the standing height');
  for (let i = 0; i < 60; i++) a.update(1 / 60, player);
  assert.ok(Math.abs(body.scale.y - 1) < 0.01, 'settles back to normal');
});
