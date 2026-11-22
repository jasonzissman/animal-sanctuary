import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/map.js', 'game/camera.js', 'game/player.js', 'game/perch.js', 'game/climb.js',
  'game/space-target.js', 'game/space-use.js'];
const SA = loadGame(FILES.concat((sa) => { sa.pickups = { SPACE_RADIUS: 2.4 }; }));
const P = (x, z, heading = 0, extra = {}) => ({ x, z, heading, ...extra });   // heading 0 faces +z

test('part first: the aim part beats trees and pickups in reach', () => {
  const c = SA.spaceTarget.create();
  const part = { part: 'cola' }, tree = { x: 1, z: 0 }, find = { x: 0, z: 1, id: 'a' };
  const t = c.choose({ player: P(0, 0), part, trees: [tree], pickups: [find] });
  assert.equal(t.kind, 'part');
  assert.equal(t.ref, part);
});

test('null when nothing is in reach (trees beyond the climb range, no pickups, bad input)', () => {
  const c = SA.spaceTarget.create();
  assert.equal(c.choose({ player: P(0, 0), trees: [{ x: SA.climb.RANGE + 0.5, z: 0 }], pickups: [] }), null);
  assert.equal(c.choose({ player: P(0, 0) }), null);
  assert.equal(c.choose({}), null);
  assert.equal(c.choose(null), null);
  assert.equal(c.choose({ player: P(NaN, 0), trees: [{ x: 0, z: 0 }] }), null);
  assert.equal(c.choose({ player: P(0, 0), trees: [{ x: NaN, z: 0 }, null], pickups: [{ x: 0 }, null] }), null);
});

test('a tree in climb range is chosen, and not while up a tree', () => {
  const c = SA.spaceTarget.create(), tree = { x: 2, z: 0 };
  const t = c.choose({ player: P(0, 0), trees: [tree] });
  assert.deepEqual([t.kind, t.ref], ['tree', tree]);
  assert.equal(c.choose({ player: P(0, 0, 0, { climb: 'canopy' }), trees: [tree] }), null);
  const find = { x: 1, z: 0, id: 'f' };
  assert.equal(c.choose({ player: P(0, 0, 0, { climb: 'canopy' }), trees: [tree], pickups: [find] }).kind, 'pickup', 'canopy finds still count');
});

test('nearest and most in front wins: a slightly farther find ahead beats a closer one behind', () => {
  const c = SA.spaceTarget.create();
  const behind = { x: 0, z: -1, id: 'b' }, ahead = { x: 0, z: 1.4, id: 'a' };
  assert.equal(c.choose({ player: P(0, 0, 0), pickups: [behind, ahead] }).ref, ahead);
  c.reset();
  assert.equal(c.choose({ player: P(0, 0, Math.PI), pickups: [behind, ahead] }).ref, behind, 'turning around flips it');
  c.reset();
  const near = { x: 0, z: 0.5, id: 'n' }, far = { x: 0, z: 2, id: 'f' };
  assert.equal(c.choose({ player: P(0, 0), pickups: [far, near] }).ref, near, 'both ahead: nearest wins');
});

test('trees and pickups compete on the same score', () => {
  const c = SA.spaceTarget.create();
  const tree = { x: 2, z: 0 }, find = { x: 0, z: 2.2, id: 'f' };
  assert.equal(c.choose({ player: P(0, 0, 0), trees: [tree], pickups: [find] }).kind, 'pickup');
  c.reset();
  assert.equal(c.choose({ player: P(0, 0, Math.PI / 2), trees: [tree], pickups: [find] }).kind, 'tree', 'facing the tree');
});

test('hysteresis: the current target is kept until a rival is clearly better or it leaves reach', () => {
  const c = SA.spaceTarget.create();
  const a = { x: 0, z: 1.5, id: 'a' }, b = { x: 0.3, z: 1.4, id: 'b' };
  assert.equal(c.choose({ player: P(0, 0), pickups: [a] }).ref, a);
  assert.equal(c.choose({ player: P(0, 0), pickups: [a, b] }).ref, a, 'marginally closer rival does not steal it');
  const flip = SA.spaceTarget.create();
  assert.equal(flip.choose({ player: P(0, 0), pickups: [b, a] }).ref, b);
  assert.equal(flip.choose({ player: P(0, 0), pickups: [a, b] }).ref, b, 'order never flickers the choice');
  const much = { x: 0, z: 0.5, id: 'm' };
  assert.equal(c.choose({ player: P(0, 0), pickups: [a, b, much] }).ref, much, 'a clearly better rival takes over');
  assert.equal(c.choose({ player: P(0, 0), pickups: [a, b] }).ref, b, 'when the current one leaves reach, the best remaining takes over');
  assert.equal(c.choose({ player: P(0, 0), pickups: [a] }).ref, a, 'and the choice follows what is left');
  assert.equal(c.choose({ player: P(0, 0), pickups: [] }), null);
});

test('the chooser allocates nothing per call: one reused result object', () => {
  const c = SA.spaceTarget.create(), find = { x: 0, z: 1, id: 'f' };
  const first = c.choose({ player: P(0, 0), pickups: [find] });
  const again = c.choose({ player: P(0, 0.1), pickups: [find] });
  assert.equal(first, again);
});

// ---- dispatcher ----
function rig({ climbPrompt = null } = {}) {
  const calls = [];
  const r = { climbPrompt: () => climbPrompt, toggleClimb: () => calls.push('down'), climbTree: (t) => calls.push('climb:' + t.name) };
  return { r, calls };
}
function dispatcher({ part = null, player = P(0, 0), trees = [], spots = [], climbPrompt = null } = {}) {
  const { r, calls } = rig({ climbPrompt });
  const listeners = {};
  const d = SA.spaceUse.create({
    getPlayer: () => player, trees: () => trees, rig: r, root: { addEventListener: (n, f) => { listeners[n] = f; } },
    picking: { target: () => part, useTarget: () => { calls.push('use'); return true; } },
    pickups: { reachable: (p, radius, out) => { out.length = 0; spots.forEach((s) => out.push(s)); return out; } },
    collect: (s) => { calls.push('collect:' + s.id); return { id: s.id }; },
  });
  const press = (key = ' ', extra = {}) => {
    let prevented = 0;
    listeners.keydown({ key, target: { tagName: 'BODY' }, preventDefault() { prevented++; }, ...extra });
    return prevented;
  };
  return { d, calls, press, listeners };
}

const USE = 'e';

test('key mapping: E (any case) and Enter use; Space, movement, digits and modified keys do not', () => {
  const is = (key, extra = {}) => SA.spaceUse.isUseKey({ key, ...extra });
  for (const k of ['e', 'E', 'Enter']) assert.equal(is(k), true, k);
  assert.equal(is('x', { code: 'KeyE' }), true);
  assert.equal(is('x', { code: 'NumpadEnter' }), true);
  for (const k of [' ', 'Spacebar', 'ArrowUp', 'w', 'a', 's', 'd', 'c', 'q', 't', 'Shift', 'Escape', 'Tab', '1', '9']) assert.equal(is(k), false, k);
  assert.equal(is('x', { code: 'Space' }), false);
  assert.equal(is('e', { ctrlKey: true }), false);
  assert.equal(is('Enter', { metaKey: true }), false);
  assert.equal(is('e', { altKey: true }), false);
  assert.equal(SA.spaceUse.isUseKey(null), false);
});

test('E / Enter use the aim part and never also grab a find or climb', () => {
  for (const k of ['e', 'E', 'Enter']) {
    const { calls, press } = dispatcher({ part: { part: 'orejas' }, trees: [{ x: 1, z: 0, name: 't' }], spots: [{ x: 0, z: 1, id: 'f' }] });
    assert.equal(press(k), 1, k);
    assert.deepEqual(calls, ['use']);
  }
});

test('Space no longer uses, climbs or collects anything and is never swallowed', () => {
  const h = dispatcher({ part: { part: 'cola' }, trees: [{ x: 2, z: 0, name: 'near' }], spots: [{ x: 0, z: 1, id: 'f' }] });
  assert.equal(h.press(' '), 0);
  assert.equal(h.press('x', { code: 'Space' }), 0);
  const up = dispatcher({ player: P(0, 0, 0, { climb: 'canopy' }), climbPrompt: 'down' });
  assert.equal(up.press(' '), 0);
  assert.deepEqual(h.calls.concat(up.calls), []);
});

test('E collects exactly the chosen pickup, or climbs exactly the chosen tree', () => {
  let h = dispatcher({ spots: [{ x: 0, z: 1, id: 'f' }, { x: 0, z: 2, id: 'g' }] });
  h.press(USE);
  assert.deepEqual(h.calls, ['collect:f']);
  h = dispatcher({ trees: [{ x: 2, z: 0, name: 'near' }] });
  h.press(USE);
  assert.deepEqual(h.calls, ['climb:near']);
  h = dispatcher({ trees: [{ x: 2, z: 0, name: 'tree' }], spots: [{ x: 0, z: 1, id: 'f' }] });
  h.press('Enter');
  assert.equal(h.calls.length, 1, 'one action only');
});

test('E with nothing in reach does nothing and is not swallowed; holding it does not repeat', () => {
  const h = dispatcher({ trees: [{ x: 50, z: 0 }] });
  assert.equal(h.press(USE), 0);
  assert.deepEqual(h.calls, []);
  const h2 = dispatcher({ spots: [{ x: 0, z: 1, id: 'f' }] });
  assert.equal(h2.press(USE, { repeat: true }), 1);
  assert.deepEqual(h2.calls, [], 'auto-repeat does not act twice');
});

test('up a tree with nothing else in reach, E climbs down; a part still wins there', () => {
  const up = P(0, 0, 0, { climb: 'canopy' });
  let h = dispatcher({ player: up, climbPrompt: 'down' });
  assert.equal(h.press(USE), 1);
  assert.deepEqual(h.calls, ['down']);
  h = dispatcher({ player: up, climbPrompt: 'down', part: { part: 'pico' } });
  h.press('Enter');
  assert.deepEqual(h.calls, ['use']);
});

test('movement keys, modified E and typing in a field or on a button are never touched', () => {
  const h = dispatcher({ part: { part: 'cola' }, spots: [{ x: 0, z: 1, id: 'f' }] });
  for (const k of ['ArrowUp', 'ArrowLeft', 'w', 'a', 's', 'd', 'c', 'Escape', '1', ' ']) assert.equal(h.press(k), 0, k);
  assert.equal(h.press(USE, { ctrlKey: true }), 0);
  assert.equal(h.press(USE, { target: { tagName: 'INPUT' } }), 0);
  assert.equal(h.press('Enter', { target: { tagName: 'BUTTON' } }), 0, 'Enter on a focused button presses that button');
  assert.deepEqual(h.calls, []);
  assert.equal(h.press('x', { code: 'KeyE' }), 1, 'code KeyE also counts');
});

test('use() (button path) acts on the same single target and reports whether it did anything', () => {
  const h = dispatcher({ spots: [{ x: 0, z: 1, id: 'f' }] });
  assert.equal(h.d.use(), true);
  assert.equal(h.d.target().kind, 'pickup');
  const none = dispatcher();
  assert.equal(none.d.use(), false);
  assert.equal(none.d.target(), null);
});

test('rig.climbTree climbs the given tree only when in range', () => {
  const keys = {}, ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.addEventListener = (t, f) => { keys[t] = f; };
  for (const f of ['game/sa.js', 'game/map.js', 'game/camera.js', 'game/player.js', 'game/perch.js', 'game/climb.js', 'game/picking.js', 'game/render/camera-rig.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx, { filename: f });
  }
  const S = ctx.window.SA, spawn = S.player.spawn();
  const near = { x: spawn.x + 2, z: spawn.z, y: 0, scale: 1, kind: 'jungle' }, far = { x: spawn.x + 20, z: spawn.z, y: 0, scale: 1, kind: 'jungle' };
  const r = S.render.createCameraRig({}, { style: {}, clientHeight: 600, addEventListener() {} }, { position: { set() {} }, lookAt() {} },
    { chase: { obstacles: () => [], trees: () => [near, far] } });
  r.climbTree(far);
  assert.equal(r.getPlayer().climb, null);
  r.climbTree(near);
  assert.equal(r.getPlayer().climb, 'up');
});

test('index.html loads the Space modules after climb and pickups, before the scene', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const at = (f) => html.indexOf('game/' + f);
  assert.ok(at('climb.js') < at('space-target.js') && at('render/pickups.js') < at('space-target.js'));
  assert.ok(at('space-target.js') < at('space-use.js') && at('space-use.js') < at('render/scene.js'));
});
