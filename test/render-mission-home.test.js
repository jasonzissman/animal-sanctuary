// AS-0350: the build-spot marker and the rabbit family renderer on the real (vendored) three.js with a scripted SA.missionHome state. No WebGL: scene-graph only.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/animal-plan.js', 'game/gait.js', 'game/render/animals.js', 'game/render/mission-home.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

const state = () => ({ key: 'hogar:1', spec: { place: 'hogar' }, spot: { x: -30, y: 1, z: 10, r: 3.2, face: 0 },
  family: [['adult', 'conejo', 4, 10.4], ['baby', 'conejito', 3, 11.9], ['baby', 'conejito', 5, 11.7], ['baby', 'conejito', 3, 8.9]]
    .map(([role, animal, dx, z]) => ({ role, animal, x: -30 + dx, y: 1, z, rotY: 0, scale: 0.8 })) });

test('draws the ground marker with a glow ring and the rabbit family; all gone when the mission ends', () => {
  const { SA, THREE } = world();
  let cur = state();
  const scene = new THREE.Scene();
  const r = SA.render.createMissionHome(THREE, { scene, thing: { current: () => cur } });
  assert.ok(scene.children.includes(r.group));
  assert.equal(r.group.children.length, 0, 'nothing before the mission');
  cur = state();
  r.update(0.1);
  assert.equal(r.group.children.length, 5, 'the marker and four rabbits');
  const marker = r.group.children[0];
  assert.deepEqual([marker.position.x, marker.position.y, marker.position.z], [-30, 1, 10]);
  const torus = marker.children.filter((c) => c.geometry && c.geometry.type === 'TorusGeometry');
  assert.equal(torus.length, 1, 'one glow ring');
  assert.equal(marker.children.filter((c) => c.geometry && c.geometry.type === 'BoxGeometry').length, 4, 'four corner stakes');
  const rabbits = r.group.children.filter((c) => c.userData && /^conej/.test(c.userData.animalId));
  assert.equal(rabbits.length, 4);
  assert.equal(rabbits.filter((m) => m.userData.animalId === 'conejito').length, 3, 'three kits');
  const op = torus[0].material.opacity;
  r.update(0.4);
  assert.notEqual(torus[0].material.opacity, op, 'the ring pulses');
  assert.ok(rabbits[1].position.y > 1 && rabbits[0].position.y === 1, 'the kits hop, the adult stands');
  cur = null;
  r.update(0.1);
  assert.equal(r.group.children.length, 0);
});

test('a tap on a rabbit on the photo step takes the photo; a tap elsewhere or on another step does not', () => {
  const { SA, THREE } = world();
  const cur = state();
  const snaps = [];
  let photo = true;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(-26, 2.5, 16);
  camera.lookAt(-26, 1.5, 10.4);
  camera.updateMatrixWorld(true);
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) };
  const thing = { current: () => cur, view: () => ({ photo }), snap: (p) => { snaps.push(p); return { status: 'complete' }; } };
  const r = SA.render.createMissionHome(THREE, { scene: new THREE.Scene(), thing, canvas, camera, getPlayer: () => ({ x: 1, z: 2 }) });
  r.update(0.1);
  assert.equal(r.tapAt(5, 5), false, 'a tap on empty sky');
  assert.equal(snaps.length, 0);
  assert.equal(r.tapAt(100, 100), true, 'a tap in the middle hits the family');
  assert.deepEqual(snaps, [{ x: 1, z: 2 }]);
  photo = false;
  assert.equal(r.tapAt(100, 100), false, 'not the photo step');
  assert.equal(snaps.length, 1);
});
