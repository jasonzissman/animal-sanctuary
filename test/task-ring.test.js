import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// A tiny stub THREE: counts every allocation so we can prove nothing is made per frame.
function stubThree() {
  const made = { n: 0 };
  const count = (C) => class extends C { constructor(...a) { super(...a); made.n++; } };
  class Vec { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
  class Obj {
    constructor() { this.children = []; this.visible = true; this.position = new Vec(); this.scale = new Vec(); this.rotation = new Vec(); this.userData = {}; this.name = ''; }
    add(...o) { o.forEach((c) => { c.parent = this; this.children.push(c); }); }
    getObjectByName(n) { return this.children.find((c) => c.name === n) || null; }
  }
  class Mesh extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; this.raycast = () => { throw new Error('default raycast'); }; } }
  class Mat { constructor(o) { Object.assign(this, o); this.color = { v: o && o.color, set(c) { this.v = c; } }; } }
  const THREE = {
    Group: count(Obj), Mesh: count(Mesh), MeshBasicMaterial: count(Mat), DoubleSide: 2,
    CylinderGeometry: count(class {}), OctahedronGeometry: count(class {}),
  };
  return { THREE, made };
}

function setup() {
  const SA = loadGame(['game/sa.js', 'game/render/instances.js', 'game/render/task-ring.js']);
  const { THREE, made } = stubThree();
  const scene = new THREE.Group();
  const animals = new THREE.Group();
  scene.add(animals);
  const mk = (id, x, z, extra = {}) => {
    const g = new THREE.Group();
    g.name = id; g.position.set(x, 0, z);
    const body = new THREE.Mesh(); body.position.set(0, 0.6, 0); body.scale.set(1.2, 0.8, 1.6); body.userData = { animalId: id, part: 'cuerpo' };
    const pick = new THREE.Mesh(); pick.position.set(0, 0.6, 0); pick.scale.set(2, 2, 2); pick.userData = { animalId: id, part: 'cuerpo', pick: true };
    g.add(body, pick);
    g.userData = { animalId: id, pickVolumes: [pick] };
    Object.assign(g, extra);
    animals.add(g);
    return g;
  };
  const cow = mk('vaca', 3, 4), pig = mk('cerdo', -5, 2);
  const ring = SA.render.createTaskRing(THREE, { scene, animals });
  return { SA, THREE, made, scene, animals, cow, pig, ring };
}

test('shows a see-through cylinder with rising rings round the task animal and follows it', () => {
  const { ring, cow } = setup();
  assert.equal(ring.group.visible, false, 'nothing without a task');
  ring.update(0.016, { animalId: 'vaca', kind: 'clue' });
  assert.equal(ring.active(), 'vaca');
  assert.equal(ring.group.visible, true);
  assert.equal(ring.group.position.x, 3);
  assert.equal(ring.group.position.z, 4);
  assert.ok(ring.material.transparent && ring.material.opacity < 0.4, 'see-through');
  assert.equal(ring.material.depthWrite, false);
  const [body, ...bands] = ring.group.children;
  assert.ok(Math.abs(body.scale.y - 1.0) < 1e-9, 'cylinder is as tall as the animal (0.6 + 0.4)');
  assert.ok(body.scale.x >= 0.8, 'wide enough for the body');
  assert.equal(bands.length, 3);
  assert.ok(bands.every((b) => b.material === body.material), 'one shared material');

  // the rings rise and loop about every 1.5 s
  const y0 = bands.map((b) => b.position.y);
  for (let i = 0; i < 20; i++) ring.update(0.05, { animalId: 'vaca', kind: 'clue' });   // 1.0 s
  assert.ok(bands.some((b, i) => Math.abs(b.position.y - y0[i]) > 0.1), 'rings moved');
  for (let i = 0; i < 10; i++) ring.update(0.05, { animalId: 'vaca', kind: 'clue' });   // 1.5 s total (+0.016)
  assert.ok(bands.every((b, i) => b.position.y >= 0 && b.position.y <= 1.0001));

  // follows the animal
  cow.position.set(10, 0.5, -2);
  ring.update(0.016, { animalId: 'vaca', kind: 'clue' });
  assert.deepEqual([ring.group.position.x, ring.group.position.y, ring.group.position.z], [10, 0.5, -2]);
});

test('rings fade (thin out) near the top and fade in at the bottom', () => {
  const { ring } = setup();
  const bands = () => ring.group.children.slice(1);
  ring.update(0.0, { animalId: 'vaca', kind: 'clue' });
  const thick = [];
  for (let i = 0; i < 30; i++) { ring.update(0.05, { animalId: 'vaca', kind: 'clue' }); bands().forEach((b) => thick.push([b.position.y, b.visible ? b.scale.y : 0])); }
  const top = thick.filter(([y]) => y > 0.95), mid = thick.filter(([y]) => y > 0.3 && y < 0.5);
  assert.ok(top.length && mid.length);
  assert.ok(Math.max(...top.map((t) => t[1])) < Math.min(...mid.map((t) => t[1])), 'thinner near the top than mid-way');
});

test('colour follows the task kind', () => {
  const { ring } = setup();
  ring.update(0.016, { animalId: 'vaca', kind: 'clue' });
  const clue = ring.material.color.v;
  ring.update(0.016, { animalId: 'cerdo', kind: 'encounter' });
  assert.notEqual(ring.material.color.v, clue);
  assert.equal(ring.active(), 'cerdo');
  assert.equal(ring.group.position.x, -5, 'moved to the other animal');
});

test('hidden task: vanishes quietly, no sparkle, and comes back with the task', () => {
  const { ring, cow } = setup();
  ring.update(0.016, { animalId: 'vaca', kind: 'clue' });
  ring.update(0.016, null);
  assert.equal(ring.group.visible, false);
  assert.equal(ring.active(), null);
  assert.equal(ring.sparkle.visible, false, 'quiet');
  ring.update(0.016, { animalId: 'vaca', kind: 'clue' });
  assert.equal(ring.group.visible, true);
  cow.visible = false;                                    // the animal itself is hidden
  ring.update(0.016, { animalId: 'vaca', kind: 'clue' });
  assert.equal(ring.group.visible, false);
  ring.update(0.016, { animalId: 'no-such-animal', kind: 'clue' });
  assert.equal(ring.group.visible, false);
  assert.equal(ring.sparkle.visible, false);
});

test('done task: the ring vanishes with a small sparkle that plays out and ends', () => {
  const { ring } = setup();
  ring.update(0.016, { animalId: 'vaca', kind: 'clue' });
  ring.update(0.016, { animalId: 'vaca', kind: 'clue', done: true });
  assert.equal(ring.group.visible, false, 'ring gone');
  assert.equal(ring.sparkle.visible, true, 'sparkle plays');
  assert.equal(ring.sparkle.position.x, 3);
  assert.ok(ring.sparkle.children.every((b) => b.visible));
  ring.update(0.3, { animalId: 'vaca', kind: 'clue', done: true });
  assert.equal(ring.sparkle.visible, true);
  assert.equal(ring.group.visible, false, 'does not come back while done');
  ring.update(0.6, { animalId: 'vaca', kind: 'clue', done: true });
  assert.equal(ring.sparkle.visible, false, 'sparkle ended');
  ring.update(0.016, null);
  assert.equal(ring.sparkle.visible, false);
  // a done task with no ring showing sparkles nothing
  ring.update(0.016, { animalId: 'cerdo', kind: 'clue', done: true });
  assert.equal(ring.sparkle.visible, false);
});

test('allocates nothing per frame (show, follow, sparkle, hide)', () => {
  const { ring, made, cow } = setup();
  ring.update(0.016, { animalId: 'vaca', kind: 'clue' });
  const before = made.n;
  for (let i = 0; i < 300; i++) { cow.position.set(i * 0.01, 0, 0); ring.update(0.016, { animalId: 'vaca', kind: 'clue' }); }
  ring.update(0.016, { animalId: 'vaca', kind: 'clue', done: true });
  for (let i = 0; i < 60; i++) ring.update(0.016, { animalId: 'vaca', kind: 'clue', done: true });
  ring.update(0.016, null);
  ring.update(0.016, { animalId: 'cerdo', kind: 'encounter' });
  for (let i = 0; i < 100; i++) ring.update(0.016, { animalId: 'cerdo', kind: 'encounter' });
  assert.equal(made.n, before, 'no meshes, groups, geometries or materials created after the first frame');
});

test('no pick volume: the ring is outside the animals, has no pickVolumes, and cannot be hit by a raycast', () => {
  const { ring, animals, scene, cow, pig } = setup();
  const volumes = () => animals.children.flatMap((g) => (g.visible !== false && g.userData.pickVolumes) || []);   // as render/picking.js
  const before = volumes();
  ring.update(0.016, { animalId: 'vaca', kind: 'clue' });
  assert.deepEqual(volumes(), before, 'the picking list is unchanged by the ring');
  assert.ok(before.length === 2 && before.every((v) => v.userData.pick));
  assert.ok(scene.children.includes(ring.group) && !animals.children.includes(ring.group));
  const all = [];
  (function walk(o) { all.push(o); o.children.forEach(walk); })(ring.group);
  (function walk(o) { all.push(o); o.children.forEach(walk); })(ring.sparkle);
  const meshes = all.filter((o) => o.geometry);
  assert.ok(meshes.length >= 4 + 10);
  for (const m of meshes) {
    assert.equal(m.userData.pick, undefined);
    assert.equal(m.userData.pickVolumes, undefined);
    assert.equal(m.raycast(), undefined, 'raycast is a no-op');
    assert.ok(!before.includes(m));
  }
  assert.ok(cow.userData.pickVolumes.length === 1 && pig.userData.pickVolumes.length === 1);
});
