// AS-0346: the hollow tree and the mouse family renderer on the real (vendored) three.js with a scripted SA.missionPantry state. No WebGL: scene-graph only.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/animal-plan.js', 'game/gait.js', 'game/render/animals.js', 'game/render/props.js', 'game/render/hollow-tree.js',
  'game/render/mission-pantry.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

const state = () => ({ key: 'ladrones:1', spec: { tree: 'arbolhueco', place: 'despensa' }, tree: { x: -30, y: 1, z: 10, r: 3.2, face: 0 },
  family: [['mama', 'ratoncampo', -0.55, 0.15], ['papa', 'ratoncampo', 0.55, 0.15], ['baby', 'ratoncito', -0.85, 0.85], ['baby', 'ratoncito', 0, 0.95], ['baby', 'ratoncito', 0.85, 0.85]]
    .map(([role, animal, dx, dz]) => ({ role, animal, x: -30 + dx, y: 1, z: 10 + dz, rotY: 0, scale: role === 'baby' ? 0.7 : 0.75 })) });

test('draws the hollow tree with a pantry of strawberries and five mice in it; all gone when the mission ends', () => {
  const { SA, THREE } = world();
  let cur = state();
  const scene = new THREE.Scene();
  const r = SA.render.createMissionPantry(THREE, { scene, thing: { current: () => cur } });
  assert.ok(scene.children.includes(r.group));
  r.update(0.1);
  assert.equal(r.group.children.length, 6, 'the tree and five mice');
  const tree = r.group.children[0];
  assert.deepEqual([tree.position.x, tree.position.z], [-30, 10]);
  let red = 0;
  tree.traverse((o) => { if (o.material && o.material.color && o.material.color.getHex() === 0xe8553d) red++; });
  assert.ok(red >= 20, 'strawberries are piled on the shelves and in the crate');
  const mice = r.group.children.filter((c) => c.userData && /^ratonc/.test(c.userData.animalId));
  assert.equal(mice.length, 5);
  assert.equal(mice.filter((m) => m.userData.animalId === 'ratoncito').length, 3, 'three babies');
  assert.ok(mice.every((m) => Math.hypot(m.position.x + 30, m.position.z - 10) < 1.9), 'standing inside the hollow');
  r.update(0.4);
  assert.ok(mice[2].position.y > 1 && mice[0].position.y === 1, 'the babies hop, the adults stand');
  cur = null;
  r.update(0.1);
  assert.equal(r.group.children.length, 0);
});

test('a tap on a mouse on the photo step takes the photo; a tap elsewhere or on another step does not', () => {
  const { SA, THREE } = world();
  const cur = state();
  const snaps = [];
  let photo = true;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(-30, 2.5, 16);
  camera.lookAt(-30, 1.5, 10.6);
  camera.updateMatrixWorld(true);
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) };
  const thing = { current: () => cur, view: () => ({ photo }), snap: (p) => { snaps.push(p); return { status: 'complete' }; } };
  const r = SA.render.createMissionPantry(THREE, { scene: new THREE.Scene(), thing, canvas, camera, getPlayer: () => ({ x: 1, z: 2 }) });
  r.update(0.1);
  assert.equal(r.tapAt(5, 5), false, 'a tap on empty sky');
  assert.equal(snaps.length, 0);
  assert.equal(r.tapAt(100, 100), true, 'a tap in the middle hits the family');
  assert.deepEqual(snaps, [{ x: 1, z: 2 }]);
  photo = false;
  assert.equal(r.tapAt(100, 100), false, 'not the photo step');
  assert.equal(snaps.length, 1);
});

test('AS-0348: on the share step a tap on a mouse gives the strawberries (not the photo) and the family hops while it cheers', () => {
  const { SA, THREE } = world();
  const cur = state();
  const gives = [];
  let cheer = null;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(-30, 2.5, 16);
  camera.lookAt(-30, 1.5, 10.6);
  camera.updateMatrixWorld(true);
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) };
  const thing = { current: () => cur, view: () => ({ photo: false, share: true, cheer }), give: (p) => { gives.push(p); return { ok: true }; },
    snap: () => { throw new Error('no photo on the share step'); } };
  const r = SA.render.createMissionPantry(THREE, { scene: new THREE.Scene(), thing, canvas, camera, getPlayer: () => ({ x: 1, z: 2 }) });
  const g = r.update(0.1);
  assert.equal(r.tapAt(5, 5), false, 'a tap on empty sky');
  assert.equal(r.tapAt(100, 100), true);
  assert.deepEqual(gives, [{ x: 1, z: 2 }]);
  const ys = (c) => { cheer = c; r.update(0.1); return g.children.slice(1).map((m) => m.position.y); };
  const calm = ys(null), hop = ys(0.3);
  assert.ok(hop.some((y, i) => y > calm[i] + 0.05), 'the mice hop higher while cheering');
});
