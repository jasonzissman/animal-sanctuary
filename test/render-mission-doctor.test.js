// AS-0331: the sick-animal renderer on the real (vendored) three.js with a scripted SA.missionDoctor state. No WebGL: scene-graph objects only.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/animal-plan.js', 'game/render/animals.js', 'game/render/mission-doctor.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

function fake(cur, phase = 'ground') {
  const touched = [];
  return { touched, current: () => cur, view: () => (cur ? { sick: true, checked: false, phase } : { sick: false, checked: false, phase: 'none' }),
    touch: (p, part) => { touched.push(part); return { ok: true }; } };
}
const spot = () => ({ key: 'doctor:1', spec: { item: 'cubo', part: 'frente' }, animal: { id: 'camello', x: 10, z: 4, y: 1, rotY: 0.5 },
  bucket: { id: 'cubo', x: 14, z: 6, y: 1 }, pool: { x: 20, z: 8, r: 3.4 }, phase: 'ground' });

test('builds a droopy camel, a thermometer above it and the bucket; removes them all when the mission ends', () => {
  const { SA, THREE } = world();
  let cur = spot(), phase = 'ground';
  const thing = { current: () => cur, view: () => (cur ? { sick: true, checked: false, phase } : { sick: false, phase: 'none' }), touch() {} };
  const scene = new THREE.Scene();
  const r = SA.render.createMissionDoctor(THREE, { scene, thing });
  r.update(0.1);
  assert.equal(r.group.children.length, 3);
  const camel = r.animalNode();
  assert.equal(camel.userData.animalId, 'camello');
  assert.ok(camel.rotation.x > 0.05, 'nose-down droop');
  const thermo = r.group.children[1];
  assert.equal(thermo.visible, true);
  assert.ok(thermo.position.y > cur.animal.y + 2, 'the thermometer floats above the head');
  const bucket = r.group.children[2];
  assert.equal(bucket.position.x, 14);
  assert.equal(bucket.userData.water.visible, false);
  phase = 'full';
  r.update(0.1, { x: 5, z: 5, y: 1, heading: 0 });
  assert.equal(bucket.userData.water.visible, true);
  assert.ok(Math.abs(bucket.position.x - 5) < 1, 'held in front of the kid');
  cur = null;
  r.update(0.1);
  assert.equal(r.group.children.length, 0);
});

test('the forehead pick volume is an enlarged raycastable part pick: userData { animalId, part: "frente" }', () => {
  const { SA, THREE } = world();
  const cur = spot();
  const thing = fake(cur);
  const scene = new THREE.Scene();
  const r = SA.render.createMissionDoctor(THREE, { scene, thing });
  r.update(0.1);
  const pick = r.animalNode().userData.doctorPick;
  assert.deepEqual([pick.userData.animalId, pick.userData.part, pick.userData.pick], ['camello', 'frente', true]);
  assert.ok(pick.geometry.parameters.radius >= 0.8, 'generous hitbox');
  // A ray straight at the volume hits it (the raycaster ignores `visible`); the tap handler then touches la frente.
  scene.updateMatrixWorld(true);
  const centre = new THREE.Vector3(); pick.getWorldPosition(centre);
  const ray = new THREE.Raycaster(new THREE.Vector3(centre.x, centre.y + 5, centre.z), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObjects([pick], false).length, 1);
  assert.equal(r.tapAt(0, 0), false, 'no canvas / camera: nothing to tap');
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(centre.x, centre.y, centre.z + 8);
  camera.lookAt(centre);
  camera.updateMatrixWorld(true);
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  const r2 = SA.render.createMissionDoctor(THREE, { scene: new THREE.Scene(), thing, canvas, camera });
  r2.update(0.1);
  r2.animalNode().updateMatrixWorld(true);
  const c2 = new THREE.Vector3(); r2.animalNode().userData.doctorPick.getWorldPosition(c2);
  camera.position.set(c2.x, c2.y, c2.z + 8); camera.lookAt(c2); camera.updateMatrixWorld(true);
  assert.equal(r2.tapAt(50, 50), true);
  assert.deepEqual(thing.touched, ['frente']);
  assert.equal(r2.tapAt(2, 2), false, 'a tap elsewhere touches nothing');
});
