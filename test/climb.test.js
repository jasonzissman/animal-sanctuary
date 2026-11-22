import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/map.js', 'game/player.js', 'game/perch.js', 'game/reach.js', 'game/climb.js']);
const K = SA.climb;
const DT = 1 / 30;
// A spot where the tree, the player 2.5 south of it and the landing ring all sit on dry ground (terrain has dips).
const dry = (x, z) => !SA.map.isWater(x, z);
let spot = null;
for (let x = -36; x < -4 && !spot; x += 1) for (let z = -20; z < 18 && !spot; z += 1) {
  if ([0, 2.5, 2.7, 3.5, -2.7, -3.5].every((d) => dry(x, z + d)) && [2.7, -2.7].every((d) => dry(x + d, z))) spot = { x, z };
}
const TREE = { x: spot.x, z: spot.z, y: 0, scale: 1, kind: 'jungle' };
const TREES = [TREE, { x: spot.x, z: spot.z - 20, y: 0, scale: 1, kind: 'pine' }];
const NEAR = { x: spot.x, z: spot.z + 2.5 };   // standing next to the trunk
const at = (x, z, extra = {}) => ({ x, z, heading: 0, y: 0, climb: null, ...extra });
const run = (s, input, secs, obstacles) => { for (let t = 0; t < secs - 1e-9; t += DT) s = K.step(s, input, DT, obstacles); return s; };

test('SA.player.climb is the same module', () => assert.equal(SA.player.climb, K));

test('prompt: up near a tree, nothing far away, down while up a tree', () => {
  assert.equal(K.prompt(at(NEAR.x, NEAR.z), TREES), 'up');
  assert.equal(K.prompt(at(TREE.x + 10, TREE.z), TREES), null);
  assert.equal(K.nearest(at(NEAR.x, NEAR.z), TREES), TREE);
  const up = K.toggle(at(NEAR.x, NEAR.z), TREES);
  assert.equal(up.climb.mode, 'up');
  assert.equal(K.prompt(up, TREES), 'down');
  assert.equal(K.nearest(up, TREES), null);
  assert.equal(K.prompt(K.stop(up), TREES), null, 'no button while already coming down');
});

test('start ignores far trees, junk and double starts', () => {
  const far = at(0, 0);
  assert.equal(K.start(far, TREE), far);
  assert.equal(K.start(null, TREE), null);
  assert.equal(K.start(at(NEAR.x, NEAR.z), null).climb, null);
  const up = K.start(at(NEAR.x, NEAR.z), TREE);
  assert.equal(K.start(up, TREE), up);
  assert.equal(K.stop(at(NEAR.x, NEAR.z)).climb, null);
  assert.equal(K.toggle(far, TREES), far);
});

test('climbing up rises smoothly to the canopy height and ends on the canopy', () => {
  let s = K.start(at(NEAR.x, NEAR.z), TREE);
  const top = K.topOf(TREE);
  assert.equal(top, SA.perch.KINDS.jungle.height);
  let prev = 0;
  while (s.climb.mode === 'up') {
    s = K.step(s, { forward: true, left: true }, DT);   // input is ignored while climbing
    assert.ok(s.y >= prev - 1e-9 && s.y <= top + 1e-9);
    prev = s.y;
  }
  assert.equal(s.climb.mode, 'canopy');
  assert.equal(s.y, top);
  assert.ok(Math.abs(Math.hypot(s.x - TREE.x, s.z - TREE.z) - K.TRUNK_R) < 1e-6);
  assert.ok(K.active(s));
  assert.ok(Number.isFinite(s.heading));
});

test('climbing up from the exact trunk centre still works', () => {
  const s = run(K.start(at(TREE.x, TREE.z), TREE), {}, K.UP_TIME + 0.2);
  assert.equal(s.climb.mode, 'canopy');
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z));
});

test('the down button always returns to dry ground, outside the trunk, y = 0', () => {
  let s = run(K.start(at(NEAR.x, NEAR.z), TREE), {}, K.UP_TIME + 0.1);
  assert.equal(s.climb.mode, 'canopy');
  s = K.stop(s);
  assert.equal(s.climb.mode, 'down');
  s = run(s, {}, K.DOWN_TIME + 0.1);
  assert.equal(s.climb, null);
  assert.equal(s.y, SA.map.groundHeight(s.x, s.z));
  assert.ok(!SA.map.isWater(s.x, s.z));
  assert.ok(Math.hypot(s.x - TREE.x, s.z - TREE.z) > 1.6, 'not inside the trunk');
  assert.equal(K.prompt(s, TREES), 'up', 'can climb again right away');
});

test('walking off the canopy edge climbs down safely', () => {
  let s = run(K.start(at(NEAR.x, NEAR.z), TREE), {}, K.UP_TIME + 0.1);
  let went = 0;
  while (s.climb && s.climb.mode === 'canopy' && went < 300) { s = K.step(s, { forward: true }, DT); went++; }   // keep walking out
  assert.equal(s.climb.mode, 'down');
  assert.ok(went < 300);
  s = run(s, { forward: true }, K.DOWN_TIME + 0.1);
  assert.equal(s.climb, null);
  assert.ok(Math.abs(s.y - SA.map.groundHeight(s.x, s.z)) < 0.5);
});

test('canopy walking stays on the tree and ignores ground obstacles', () => {
  const s = run(K.start(at(NEAR.x, NEAR.z), TREE), {}, K.UP_TIME + 0.1);
  const turned = K.step(s, { left: true }, DT, [[s.x, s.z, 5]]);
  assert.ok(turned.heading !== s.heading);
  assert.equal(turned.y, s.y);
  assert.equal(turned.climb.mode, 'canopy');
  assert.ok(K.edgeRadius(TREE) > K.TRUNK_R);
});

test('aborting a climb halfway comes back down from the current height', () => {
  let s = run(K.start(at(NEAR.x, NEAR.z), TREE), {}, 0.6);
  assert.equal(s.climb.mode, 'up');
  const h = s.y;
  assert.ok(h > 0 && h < K.topOf(TREE));
  s = K.stop(s);
  assert.equal(s.y, h);
  let last = h;
  while (s.climb) { s = K.step(s, {}, DT); assert.ok(s.y <= last + 1e-9); last = s.y; }
  assert.equal(s.y, SA.map.groundHeight(s.x, s.z));
});

test('landing in water falls back to the spot you climbed from', () => {
  // A tree on the river bank whose landing ring (edge + pad) on the far side is in the river.
  const wet = { x: SA.map.riverX(0) - 5, z: 0, y: 0, scale: 1, kind: 'jungle' };
  const start = { x: wet.x - 2.5, z: 0 };   // standing on the dry side, away from the river
  assert.ok(dry(start.x, start.z));
  let s = run(K.start(at(start.x, start.z), wet), {}, K.UP_TIME + 0.1);
  const ring = K.edgeRadius(wet) + 0.6;
  // Slide the canopy position to the river side so the "natural" landing would be wet.
  s = { ...s, x: wet.x + 1, z: wet.z };
  assert.ok(!dry(wet.x + ring, 0), 'precondition: the river-side landing is wet');
  s = run(K.stop(s), {}, K.DOWN_TIME + 0.2);
  assert.equal(s.climb, null);
  assert.ok(Math.hypot(s.x - start.x, s.z - start.z) < 1e-6 || dry(s.x, s.z), 'back on the dry start spot');
});

test('landing is clamped inside the map and pushed out of props', () => {
  const edge = { x: SA.map.BOUNDS.maxX - 0.8, z: 0, y: 0, scale: 1, kind: 'jungle' };
  let s = run(K.start(at(edge.x - 2, 0), edge), {}, K.UP_TIME + 0.1);
  s = run(K.stop(s), {}, K.DOWN_TIME + 0.2, [[edge.x - 2, 0, 1]]);
  assert.equal(s.climb, null);
  assert.ok(s.x <= SA.map.BOUNDS.maxX);
});

test('ground stepping is SA.player.step plus terrain y, and tolerates a missing state', () => {
  const g = K.step(at(0, 0, { y: SA.map.groundHeight(0, 0) }), { forward: true }, DT);
  assert.ok(g.z > 0 && g.climb === null && Math.abs(g.y - SA.map.groundHeight(g.x, g.z)) < 0.5);
  assert.ok(K.step(null, {}, 0).climb === null);
});

test('up in the canopy a perched animal is in reach; from the ground it is not', () => {
  const perch = { x: TREE.x + 0.7, z: TREE.z, y: K.topOf(TREE) };
  assert.equal(SA.reach.canReach({ x: NEAR.x, z: NEAR.z, y: 0 }, perch), false);
  const s = run(K.start(at(NEAR.x, NEAR.z), TREE), {}, K.UP_TIME + 0.1);
  assert.equal(SA.reach.canReach({ x: s.x, z: s.z, y: s.y }, perch), true);
});

test('rig: C climbs when next to a tree and down again, and getPlayer reports y', () => {
  const keys = {}, canvas = { style: {}, clientHeight: 600, addEventListener() {} };
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.addEventListener = (t, f) => { keys[t] = f; };
  for (const f of ['game/sa.js', 'game/map.js', 'game/camera.js', 'game/player.js', 'game/perch.js', 'game/climb.js', 'game/picking.js', 'game/render/camera-rig.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx, { filename: f });
  }
  const placed = {};
  const camera = { position: { set: (x, y, z) => { placed.y = y; } }, lookAt() {} };
  const spawn = ctx.window.SA.player.spawn();
  const tree = { x: spawn.x + 2, z: spawn.z, y: 0, scale: 1, kind: 'jungle' };
  const rig = ctx.window.SA.render.createCameraRig({}, canvas, camera, { chase: { obstacles: () => [], trees: () => [tree] } });
  const frames = (n) => { for (let i = 0; i < n; i++) rig.update(0.05); };
  assert.equal(rig.climbPrompt(), 'up');
  let prevented = 0;
  keys.keydown({ key: 'c', preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.equal(rig.getPlayer().climb, 'up');
  frames(40);
  assert.equal(rig.getPlayer().climb, 'canopy');
  assert.ok(rig.getPlayer().y > 3);
  assert.ok(placed.y > 3, 'chase camera rises with the player');
  assert.equal(rig.climbPrompt(), 'down');
  keys.keydown({ key: ' ', preventDefault() { prevented++; } });
  assert.equal(rig.getPlayer().climb, 'canopy', 'the rig no longer handles Space (SA.spaceUse does)');
  keys.keydown({ key: 'C', preventDefault() {} });
  assert.equal(rig.getPlayer().climb, 'down');
  frames(40);
  assert.equal(rig.getPlayer().climb, null);
  assert.ok(Math.abs(rig.getPlayer().y - ctx.window.SA.map.groundHeight(rig.getPlayer().x, rig.getPlayer().z)) < 1e-9);
  rig.glideTo(0, 0);
  rig.toggleClimb();
  frames(1);
  assert.equal(rig.getPlayer().climb, 'up');
  rig.glideTo(0, 0);
  assert.equal(rig.getPlayer().climb, 'up', 'turning toward a point keeps the climb');
});

test('rig: C does nothing (and is not swallowed) away from a tree', () => {
  const keys = {};
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.addEventListener = (t, f) => { keys[t] = f; };
  for (const f of ['game/sa.js', 'game/map.js', 'game/camera.js', 'game/player.js', 'game/perch.js', 'game/climb.js', 'game/picking.js', 'game/render/camera-rig.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx, { filename: f });
  }
  const camera = { position: { set() {} }, lookAt() {} };
  const rig = ctx.window.SA.render.createCameraRig({}, { style: {}, clientHeight: 600, addEventListener() {} }, camera, {});
  let prevented = 0;
  keys.keydown({ key: 'c', preventDefault() { prevented++; } });
  assert.equal(prevented, 0);
  keys.keydown({ key: ' ', preventDefault() { prevented++; } });   // Space is the jump key now (AS-0113), never a climb
  assert.equal(rig.climbPrompt(), null);
  assert.equal(rig.climbPrompt(), null);
});

test('climb button shows the right icon and toggles through the rig', () => {
  const SA2 = loadGame(['game/sa.js', 'game/ui/climb-button.js']);
  const made = [];
  const doc = { body: { appendChild() {} }, createElement: () => { const el = { style: {}, attrs: {}, on: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.on[t] = f; } }; made.push(el); return el; } };
  let prompt = null, toggled = 0;
  const rig = { climbPrompt: () => prompt, toggleClimb: () => { toggled++; } };
  const view = SA2.climbButton.create(doc, rig);
  view.update();
  assert.equal(made[0].style.display, 'none');
  prompt = 'up'; view.update();
  assert.equal(made[0].textContent, '🧗');
  assert.equal(made[0].style.display, 'block');
  prompt = 'down'; view.update();
  assert.equal(made[0].textContent, '⬇️');
  made[0].on.pointerdown({ preventDefault() {}, stopPropagation() {} });
  assert.equal(toggled, 1);
  made[0].on.contextmenu({ preventDefault() {} });
  prompt = null; view.update();
  assert.equal(made[0].style.display, 'none');
  assert.equal(SA2.climbButton.create(null, rig).element, null);
});

// ---- Auto-climb (AS-0157): push forward into a trunk for AUTO_CLIMB_MS ----
const TRUNK = [[TREE.x, TREE.z, 1]];   // the tree's blocking circle (decor default radius 1)
const FWD = { forward: 1 };
// One frame: walk (blocked by the trunk), then feed the push timer.
function push(s, timer, input = FWD, trees = TREES, dt = DT) {
  const after = K.step(s, input, dt, TRUNK);
  return { s: after, t: K.autoStep(timer, s, after, input, trees, dt * 1000) };
}
function pushFor(s, ms, input = FWD, trees = TREES) {
  let t = null, climbed = null;
  for (let e = 0; e < ms - 1e-6 && !climbed; e += DT * 1000) {
    const r = push(s, t, input, trees); s = r.s; t = r.t;
    if (t.climb) climbed = t;
  }
  return { s, t, climbed };
}
const FACING = at(TREE.x, TREE.z + 1.62, { heading: Math.PI });   // touching the trunk (circle 1 + body 0.6), facing it

test('autoStep: holding forward against a tree for 600 ms starts the climb', () => {
  assert.equal(K.AUTO_CLIMB_MS, 600);
  const early = pushFor(FACING, 400);
  assert.equal(early.climbed, null);
  assert.ok(early.t.progress > 0.4 && early.t.progress < 1, 'the ring is filling');
  const r = pushFor(FACING, 700);
  assert.ok(r.climbed, 'climb fires');
  assert.ok(r.climbed.ms >= 600 && r.climbed.ms < 600 + DT * 1000 + 1e-6);
  assert.equal(r.climbed.tree, TREE);
  assert.equal(K.start(r.s, r.climbed.tree).climb.mode, 'up');
});

test('autoStep: the joystick pushed forward works too (analog forward)', () => {
  assert.ok(pushFor(FACING, 700, { forward: 0.8 }).climbed);
  assert.ok(pushFor(FACING, 700, { forward: 1, run: true }).climbed);
  assert.equal(pushFor(FACING, 700, { forward: 0.1 }).climbed, null, 'a feather touch is not a push');
});

test('autoStep: releasing, turning away or moving freely resets the timer', () => {
  const mid = pushFor(FACING, 400);
  const released = push(mid.s, mid.t, {});
  assert.equal(released.t.ms, 0);
  assert.equal(released.t.progress, 0);
  assert.equal(pushFor(mid.s, 400, FWD).climbed, null, 'starts again from 0: 400 ms is not enough');
  assert.equal(push({ ...mid.s, heading: Math.PI + 1.2 }, mid.t).t.ms, 0, 'turned more than 45 degrees away');
  const away = at(NEAR.x, NEAR.z, { heading: 0 });   // facing away from the tree: walks freely
  assert.equal(K.autoStep(mid.t, away, K.step(away, FWD, DT, TRUNK), FWD, TREES, DT * 1000).ms, 0);
});

test('autoStep: nothing on cacti or rocks (never in the tree list), while climbing, or away from a trunk', () => {
  assert.equal(pushFor(FACING, 1000, FWD, []).climbed, null);
  assert.equal(pushFor(FACING, 1000, FWD, [{ x: TREE.x + 30, z: TREE.z }]).climbed, null);
  const up = K.start(FACING, TREE);
  assert.equal(K.autoStep(null, up, K.step(up, FWD, DT, TRUNK), FWD, TREES, 1000).climb, false, 'already climbing');
  assert.equal(K.autoStep(null, null, null, FWD, TREES, 16).climb, false);
  assert.equal(K.autoStep(null, FACING, FACING, null, TREES, 16).climb, false);
  const far = at(NEAR.x, TREE.z + 2.9, { heading: Math.PI });   // in climb range, but not pushing against the trunk
  assert.equal(K.autoStep(null, far, far, FWD, TREES, 1000).climb, false);
  const other = { x: TREE.x, z: TREE.z };
  assert.equal(K.autoStep({ ms: 590, tree: { x: 1, z: 1 }, progress: 1, climb: false }, FACING, FACING, FWD, [other], 10).ms, 10, 'a different tree restarts the count');
});

test('rig: holding Up against a tree climbs it after 0.6 s, releasing first does not', () => {
  const keys = {};
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.addEventListener = (t, f) => { keys[t] = f; };
  for (const f of ['game/sa.js', 'game/map.js', 'game/camera.js', 'game/player.js', 'game/perch.js', 'game/climb.js', 'game/picking.js', 'game/render/camera-rig.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx, { filename: f });
  }
  const S = ctx.window.SA, sp = S.player.spawn();
  const tree = { x: sp.x + Math.sin(sp.heading) * 2.2, z: sp.z + Math.cos(sp.heading) * 2.2, y: 0, scale: 1, kind: 'jungle' };
  const camera = { position: { set() {} }, lookAt() {} };
  const mk = () => S.render.createCameraRig({}, { style: {}, clientHeight: 600, addEventListener() {} }, camera,
    { chase: { obstacles: () => [[tree.x, tree.z, 1]], trees: () => [tree] } });
  const rig = mk();
  keys.keydown({ key: 'ArrowUp', preventDefault() {} });
  for (let i = 0; i < 8; i++) rig.update(0.05);   // 0.4 s of pushing
  assert.equal(rig.getPlayer().climb, null);
  assert.ok(rig.autoClimb() && rig.autoClimb().progress > 0, 'the ring has something to show');
  keys.keyup({ key: 'ArrowUp' });
  rig.update(0.05);
  assert.equal(rig.autoClimb(), null, 'released: ring gone');
  keys.keydown({ key: 'ArrowUp', preventDefault() {} });
  for (let i = 0; i < 16; i++) rig.update(0.05);
  assert.equal(rig.getPlayer().climb === 'up' || rig.getPlayer().climb === 'canopy', true, 'climbing after 0.6 s of pushing');
  assert.equal(rig.autoClimb(), null);
});

test('auto-climb ring: shows the arc while pushing, hides otherwise', () => {
  const SA2 = loadGame(['game/sa.js', 'game/map.js', 'game/render/auto-climb-ring.js']);
  const added = [];
  class Geo { constructor(i, o, s, p, a, l) { this.theta = l; } dispose() {} }
  class Mesh { constructor(g) { this.geometry = g; this.rotation = {}; this.visible = true; this.position = { set: (x, y, z) => Object.assign(this.position, { x, y, z }) }; } }
  const THREE = { RingGeometry: Geo, Mesh, MeshBasicMaterial: class {}, DoubleSide: 2 };
  let cur = null;
  const ring = SA2.render.createAutoClimbRing(THREE, { scene: { add: (m) => added.push(m) }, getAutoClimb: () => cur });
  assert.equal(added[0], ring.mesh);
  ring.update(0.016);
  assert.equal(ring.mesh.visible, false);
  cur = { tree: { x: 3, z: 4, y: 1 }, progress: 0.5 };
  ring.update(0.016);
  assert.equal(ring.mesh.visible, true);
  assert.equal(ring.mesh.position.x, 3);
  assert.ok(Math.abs(ring.mesh.geometry.theta) > 3);
  const g1 = ring.mesh.geometry;
  cur = { tree: cur.tree, progress: 0.51 };
  ring.update(0.016);
  assert.equal(ring.mesh.geometry, g1, 'no rebuild for a tiny change');
  cur = { tree: { x: 3, z: 4 }, progress: 1 };
  ring.update(0.016);
  assert.notEqual(ring.mesh.geometry, g1);
  cur = null; ring.update(0.016);
  assert.equal(ring.mesh.visible, false);
});
