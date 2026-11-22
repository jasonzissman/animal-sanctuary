import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SA = loadGame(['game/sa.js', 'game/reach.js', 'game/click-outcome.js']);
const C = SA.clickOutcome;

test('an in-reach part is a normal pick with no ripple', () => {
  assert.deepEqual({ ...C.decide({ hit: { part: 'cola' }, inReach: true }) }, { kind: 'pick', ripple: false, cue: false });
});

test('an out-of-reach part gets the ¡Acércate! cue and a ripple (never a pick)', () => {
  assert.deepEqual({ ...C.decide({ hit: { part: 'cola' }, inReach: false }) }, { kind: 'far', ripple: true, cue: true });
});

test('empty ground or the avatar (no hit): ripple, plus the cue only when an animal is visible but far', () => {
  assert.deepEqual({ ...C.decide({ hit: null, farVisible: false }) }, { kind: 'ripple', ripple: true, cue: false });
  assert.deepEqual({ ...C.decide({ hit: null, farVisible: true }) }, { kind: 'ripple', ripple: true, cue: true });
  assert.equal(C.decide().kind, 'ripple', 'no input still never throws');
});

test('while the sandbox/album owns clicks an empty click is ignored', () => {
  assert.equal(C.decide({ hit: null, paused: true, farVisible: true }).kind, 'none');
});

test('farVisible: only on-screen animals that are out of reach count', () => {
  const player = { x: 0, z: 0 };
  assert.equal(C.farVisible(player, [{ x: 20, z: 0, onScreen: true }]), true);
  assert.equal(C.farVisible(player, [{ x: 2, z: 0, onScreen: true }]), false, 'in reach');
  assert.equal(C.farVisible(player, [{ x: 20, z: 0, onScreen: false }]), false, 'off screen');
  assert.equal(C.farVisible(player, [null, { x: 2, z: 0, onScreen: true }, { x: 20, z: 0, onScreen: true }]), true);
  assert.equal(C.farVisible(null, [{ x: 20, z: 0, onScreen: true }]), false, 'no player yet');
  assert.equal(C.farVisible(player, []), false);
  assert.equal(C.farVisible(player, [{ x: 3, y: 9, z: 0, onScreen: true }]), true, 'too high up a tree');
  assert.equal(C.farVisible(player, [{ x: 3, y: 9, z: 0, onScreen: true, ignoreHeight: true }]), false, 'canopy perchers ignore height');
});

test('ripplePose shrinks in opacity over its lifetime and ends', () => {
  const a = C.ripplePose(0), b = C.ripplePose(C.RIPPLE_SECONDS / 2);
  assert.ok(a.opacity > b.opacity && b.opacity > 0);
  assert.ok(b.scale > a.scale);
  assert.equal(C.ripplePose(C.RIPPLE_SECONDS), null);
  assert.equal(C.ripplePose(-1), null);
  assert.equal(C.ripplePose(NaN), null);
});

// --- DOM/THREE glue with the real vendored three.js and a stub canvas/DOM ---------------------------------------

function makeEl() {
  return { style: {}, children: [], textContent: '', innerHTML: '', parentNode: null, setAttribute() {},
    appendChild(c) { c.parentNode = this; this.children.push(c); },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; } };
}

function stage(playerAt) {
  const files = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js',
    'game/data/animals.js', 'game/map.js', 'game/animal-plan.js', 'game/render/zigzag.js', 'game/render/animals.js', 'game/reach.js',
    'game/picking.js', 'game/aim.js', 'game/click-outcome.js', 'game/render/click-fx.js', 'game/render/picking.js'];
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  ctx.document = { createElement: makeEl, body: makeEl() };
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const { SA: S, THREE } = ctx;
  const handlers = {};
  const canvas = { addEventListener: (n, f) => { handlers[n] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const animals = S.render.buildAnimals(THREE, {});
  animals.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.5, 400);
  const g = animals.children[0];
  const target = new THREE.Vector3(); g.getWorldPosition(target);
  camera.position.set(target.x + 6, target.y + 4, target.z + 6);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const fx = S.render.createClickFx({ container: ctx.document.body });
  const cues = [], ripples = [];
  const clickFx = { ripple: (x, y) => { ripples.push([x, y]); fx.ripple(x, y); } };
  const reachCue = { show: () => cues.push(1) };
  const player = playerAt(g);
  const picking = S.render.createPicking(THREE, { canvas, camera, animals, container: ctx.document.body, getPlayer: () => player, reachCue, clickFx });
  return { S, handlers, picking, cues, ripples, fx, ctx, g };
}

const ev = (x, y) => ({ pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y, buttons: 0 });
function click(s, x, y) { s.handlers.pointerdown(ev(x, y)); s.handlers.pointerup(ev(x, y)); }

test('a click on empty sky/ground ripples, and shows ¡Acércate! when an animal in view is out of reach; no error, no pick', () => {
  const s = stage((g) => ({ x: g.position.x + 40, y: 0, z: g.position.z }));   // far from every animal
  const picks = [];
  s.S.picking.onPick((p) => picks.push(p));
  click(s, 2, 2);
  assert.equal(picks.length, 0);
  assert.deepEqual(s.ripples, [[2, 2]]);
  assert.equal(s.ctx.document.body.children.length, 1, 'ring added');
  s.fx.update(5);
  assert.equal(s.ctx.document.body.children.length, 0, 'ring removed after it fades');
});

test('a click that lands on an out-of-reach animal shows the cue and emits no pick', () => {
  const s = stage((g) => ({ x: g.position.x + 40, y: 0, z: g.position.z }));
  const picks = [];
  s.S.picking.onPick((p) => picks.push(p));
  const hit = s.picking.pickAt(400, 300);
  assert.ok(hit, 'the camera looks at an animal');
  click(s, 400, 300);
  assert.equal(picks.length, 0, 'out of reach is never a pick');
  assert.equal(s.cues.length, 1, '¡Acércate! cue shown');
  assert.equal(s.ripples.length, 1);
});

test('a click on empty ground with an out-of-reach animal in view shows the cue', () => {
  const s = stage((g) => ({ x: g.position.x + 40, y: 0, z: g.position.z }));
  // Find a screen spot that hits nothing (the aim fallback only considers in-reach parts, so none here).
  let spot = null;
  for (let x = 4; x < 800 && !spot; x += 40) if (!s.picking.pickAt(x, 580)) spot = [x, 580];
  assert.ok(spot, 'there is empty screen');
  click(s, spot[0], spot[1]);
  assert.equal(s.ripples.length, 1);
  assert.equal(s.cues.length, 1, 'an animal is visible but out of reach: ¡Acércate!');
});

test('an in-reach part pick gives no ripple or cue', () => {
  const s = stage((g) => ({ x: g.position.x, y: 0, z: g.position.z }));
  s.S.audio = { say() {} };
  click(s, 400, 300);
  assert.equal(s.ripples.length, 0);
  assert.equal(s.cues.length, 0);
});
