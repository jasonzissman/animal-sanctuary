import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// Stub THREE: a tiny scene graph (children, add/remove, parent) and a colour with setRGB. No WebGL.
function vec() { return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; }
function Mesh(geometry, material) {
  return { geometry, material, children: [], parent: null, position: vec(), scale: vec(), userData: {}, visible: true,
    add(c) { c.parent = this; this.children.push(c); },
    remove(c) { this.children.splice(this.children.indexOf(c), 1); c.parent = null; } };
}
function Group() { const g = Mesh(null, null); return g; }
let mats = 0;
const THREE = {
  Mesh,
  BackSide: 1,
  MeshBasicMaterial: function (o) { mats++; return Object.assign({}, o, { color: { r: 0, g: 0, b: 0, setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; } } }); },
};
const geo = (r) => ({ boundingSphere: { radius: r, center: { x: 0, y: 0, z: 0 } } });
const SA = loadGame(['game/sa.js', 'game/render/target-outline.js']);

function setup() {
  const tree = Group(); const trunk = Mesh(geo(1), {}), crown = Mesh(geo(2), {}); tree.add(trunk); tree.add(crown);
  const ear = Mesh(geo(0.3), {}), find = Group(), fruit = Mesh(geo(0.2), {}); find.add(fruit);
  const nodes = { tree, part: ear, pickup: find };
  let target = null;
  const o = SA.render.createTargetOutline(THREE, { getTarget: () => target, nodeFor: (kind) => nodes[kind] });
  const shellsOn = (m) => m.children.filter((c) => c.userData.outline);
  return { o, tree, trunk, crown, ear, find, fruit, shellsOn, set: (t) => { target = t; } };
}

test('outlines every mesh of exactly the chosen object, with one shared back-face material', () => {
  const before = mats;
  const s = setup();
  assert.equal(mats - before, 1, 'one outline material');
  s.set({ kind: 'tree', ref: {} });
  s.o.update(0.016);
  assert.equal(s.shellsOn(s.trunk).length, 1);
  assert.equal(s.shellsOn(s.crown).length, 1);
  assert.equal(s.shellsOn(s.ear).length, 0, 'other objects stay plain');
  assert.equal(s.shellsOn(s.fruit).length, 0);
  assert.equal(s.shellsOn(s.trunk)[0].material, s.o.material);
  assert.equal(s.shellsOn(s.crown)[0].material, s.o.material, 'shared material');
  assert.equal(s.o.material.side, THREE.BackSide);
  assert.ok(s.shellsOn(s.trunk)[0].scale.x > 1, 'inflated');
  assert.equal(s.shellsOn(s.trunk)[0].raycast(), undefined, 'shell ignores raycasts');
  assert.equal(mats - before, 1, 'still one material');
});

test('moves to a new target, disappears with none, and reuses cached shells', () => {
  const s = setup();
  s.set({ kind: 'tree', ref: {} }); s.o.update(0.016);
  const first = s.shellsOn(s.trunk)[0];
  s.set({ kind: 'part', ref: { mesh: s.ear } }); s.o.update(0.016);
  assert.equal(s.shellsOn(s.trunk).length, 0);
  assert.equal(s.shellsOn(s.ear).length, 1);
  s.set({ kind: 'pickup', ref: {} }); s.o.update(0.016);
  assert.equal(s.shellsOn(s.ear).length, 0);
  assert.equal(s.shellsOn(s.fruit).length, 1);
  s.set(null); s.o.update(0.016);
  assert.equal(s.shellsOn(s.fruit).length, 0);
  assert.equal(s.o.active(), false);
  s.set({ kind: 'tree', ref: {} }); s.o.update(0.016);
  assert.equal(s.shellsOn(s.trunk)[0], first, 'shell is built once per mesh, then re-attached');
});

test('an unchanged target does not rebuild or re-attach (no flicker); the pulse changes colour and size in place', () => {
  const s = setup();
  const ref = { mesh: s.ear };
  s.set({ kind: 'part', ref }); s.o.update(0);
  const shell = s.shellsOn(s.ear)[0];
  const adds = s.ear.children.length;
  const seen = new Set(), sizes = new Set();
  for (let i = 0; i < 60; i++) {
    s.set({ kind: 'part', ref: { mesh: s.ear } });   // a fresh wrapper for the same mesh is the same target
    s.o.update(0.02);
    assert.equal(s.ear.children.length, adds);
    assert.equal(s.shellsOn(s.ear)[0], shell);
    seen.add(s.o.material.color.g.toFixed(3)); sizes.add(shell.scale.x.toFixed(3));
  }
  assert.ok(seen.size > 3 && sizes.size > 3, 'it pulses');
});

test('pulse stays in range and the rim is warm yellow', () => {
  const T = SA.render.targetOutline;
  for (let t = 0; t < 3; t += 0.1) assert.ok(T.pulse(t) >= 0 && T.pulse(t) <= 1);
  const [r, g, b] = T.COLOR;
  assert.ok(r > 0.9 && g > 0.6 && b < 0.3);
  assert.ok(T.grow(0.01) <= 1.5 && T.grow(100) >= 1.1, 'rim width is clamped for tiny and huge meshes');
});

test('no target node means no outline, and missing getTarget is safe', () => {
  const o = SA.render.createTargetOutline(THREE, { getTarget: () => ({ kind: 'tree', ref: {} }), nodeFor: () => null });
  o.update(0.016);
  assert.equal(o.active(), false);
  const o2 = SA.render.createTargetOutline(THREE, {});
  o2.update(0.016);
  assert.equal(o2.active(), false);
});
