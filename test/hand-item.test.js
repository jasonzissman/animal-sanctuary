import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// Stub THREE: just enough scene graph to build a hand model (no WebGL).
function vec() { return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; }
function node() {
  return { children: [], position: vec(), rotation: vec(), scale: vec(), userData: {},
    add(c) { this.children.push(c); },
    remove(c) { this.children.splice(this.children.indexOf(c), 1); } };
}
let disposed = 0;
const geo = (kind) => function (...args) { return { kind, args, w: args[0], dispose() { disposed++; } }; };
const THREE = {
  Group: function () { return node(); },
  Mesh: function (g, m) { return Object.assign(node(), { geometry: g, material: m }); },
  BoxGeometry: geo('box'), CylinderGeometry: geo('cylinder'), SphereGeometry: geo('sphere'), ConeGeometry: geo('cone'),
  MeshLambertMaterial: function (o) { return Object.assign({ dispose() { disposed++; } }, o); },
};
const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js', 'game/data/foods.js', 'game/data/items.js',
  'game/data/hand-models.js', 'game/render/hand-item.js']);

test('every item has a valid hand-model spec, and every spec is for a real item', () => {
  const items = SA.data.all('items').map((i) => i.id);
  const models = SA.data.all('handmodels').map((m) => m.id);
  assert.deepEqual([...models].sort(), [...items].sort());
  for (const m of SA.data.all('handmodels')) assert.ok(m.parts.length >= 1 && m.parts.length <= 8, m.id);
  const all = SA.data.all('handmodels');
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(all))), JSON.stringify(all), 'plain JSON data');
});

test('hand-model validation rejects bad specs with a clear error', () => {
  let validate;
  const S = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js', 'game/data/foods.js', 'game/data/items.js',
    (sa) => { const orig = sa.data.defineKind; sa.data.defineKind = (k, v) => { if (k === 'handmodels') validate = v; return orig(k, v); }; },
    'game/data/hand-models.js']);
  assert.ok(validate && S.data.get('handmodels', 'camara'));
  const ok = { shape: 'box', size: [0.1, 0.1, 0.1], color: 0xffffff, pos: [0, 0, 0] };
  assert.doesNotThrow(() => validate({ id: 'camara', parts: [ok] }));
  const rejects = (m, re) => assert.throws(() => S.data.register('handmodels', [m]), re);
  rejects({ id: 'nonexistent', parts: [ok] }, /field "id"/);
  rejects({ id: 'camara', parts: [ok] }, /duplicate/);
  const cases = [
    [{ ...ok, shape: 'torus' }, /shape/], [{ ...ok, size: [0.1] }, /size/], [{ ...ok, size: [0.1, 0, 0.1] }, /size/],
    [{ ...ok, color: -1 }, /color/], [{ ...ok, color: 'red' }, /color/], [{ ...ok, pos: [0, 0] }, /pos/],
    [{ ...ok, rot: [0, 'x', 0] }, /rot/], [{ ...ok, scale: [1, 0, 1] }, /scale/],
  ];
  for (const [part, re] of cases) assert.throws(() => validate({ id: 'camara', parts: [part] }), (e) => re.test(e.saField), JSON.stringify(part));
  assert.throws(() => validate({ id: 'camara', parts: [] }), (e) => e.saField === 'parts');
});

test('the equipped item appears in the hand, swaps on change and is removed when hands are empty', () => {
  let equipped = null;
  const hand = node();
  const h = SA.render.createHandItem(THREE, { hand, getEquipped: () => equipped });
  assert.equal(hand.children.length, 1, 'holder attached to the hand');
  assert.equal(h.group.children.length, 0, 'empty hands: nothing shown');
  assert.equal(h.current(), null);

  equipped = 'cepillo';
  h.update();
  assert.equal(h.current(), 'cepillo');
  assert.equal(h.group.children.length, 1);
  const spec = SA.data.get('handmodels', 'cepillo');
  const model = h.group.children[0];
  assert.equal(model.children.length, spec.parts.length);
  assert.equal(model.children[0].geometry.kind, 'box');
  assert.equal(model.userData.handItem, 'cepillo');

  h.update();   // unchanged: the same model stays
  assert.equal(h.group.children[0], model);

  equipped = 'roca';
  const before = disposed;
  h.update();
  assert.equal(h.current(), 'roca');
  assert.equal(h.group.children.length, 1);
  assert.notEqual(h.group.children[0], model);
  assert.ok(disposed > before, 'old geometry and materials are freed');
  assert.ok(h.group.children[0].children.some((m) => m.scale.x === 1.1), 'scaled parts are applied');

  equipped = null;
  h.update();
  assert.equal(h.current(), null);
  assert.equal(h.group.children.length, 0);
});

test('it builds every shape, and an item with no spec just shows nothing', () => {
  const shapes = new Set();
  for (const m of SA.data.all('handmodels')) {
    let id = m.id;
    const h = SA.render.createHandItem(THREE, { hand: node(), getEquipped: () => id });
    assert.equal(h.current(), id);
    h.group.children[0].children.forEach((mesh) => shapes.add(mesh.geometry.kind));
  }
  assert.deepEqual([...shapes].sort(), ['box', 'cone', 'cylinder', 'sphere']);
  const h = SA.render.createHandItem(THREE, { hand: node(), getEquipped: () => 'unknown' });
  assert.equal(h.current(), null);
});

test('it follows the avatar: the holder hangs off the avatar hand pivot, outside any pick group', () => {
  const avatarSA = loadGame(['game/sa.js', 'game/render/avatar.js']);
  const a = avatarSA.render.createAvatar(THREE);
  const h = SA.render.createHandItem(THREE, { hand: a.parts.armR, getEquipped: () => 'camara' });
  assert.ok(a.parts.armR.children.includes(h.group), 'attached to the right arm, so it swings and moves with the kid');
  assert.ok(h.group.position.y < -0.3, 'at the fist, below the shoulder pivot');
});
