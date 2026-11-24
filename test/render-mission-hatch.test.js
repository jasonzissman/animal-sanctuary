// AS-0315: the hatch renderer runs on the real (vendored) three.js with a scripted SA.missionHatch view: tracks, mamá, the cracking egg,
// the shells and the duckling, plus the family photo tap. No WebGL: only scene-graph objects are touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/map.js', 'game/spacing.js', 'game/animal-plan.js', 'game/mission-hatch.js', 'game/render/instances.js', 'game/render/animals.js', 'game/render/mission-carry.js', 'game/render/mission-hatch.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

function scripted(SA) {
  const nest = { id: 'nido', x: 30, z: 12, y: 1 }, egg = { id: 'huevo', x: 35, z: 12, y: 1 };
  const fam = SA.missionHatch.family(nest, 3);
  const spec = { baby: 'patito', mama: 'pato', seconds: 5 };
  const state = { phase: 'none', crack: 0, t: 0 };
  SA.missionCarry = { current: () => ({ key: 'huevo:1', spec: { item: 'huevo', to: 'nido', hatch: spec }, item: egg, to: nest, phase: state.carry || 'ground' }) };
  const snaps = [];
  const hatch = { trail: SA.missionHatch.trail, update() {}, snap: (p) => { snaps.push(p); return { status: 'complete' }; },
    view: () => ({ key: 'huevo:1', phase: state.phase, crack: state.crack, t: state.t, spec, nest, mama: fam.mama, baby: fam.baby }) };
  return { state, hatch, nest, egg, snaps };
}

test('renders tracks while the egg lies out, mamá at the nest, then the cracking egg, the shells and the duckling', () => {
  const { SA, THREE } = world();
  const s = scripted(SA);
  const scene = new THREE.Scene();
  const r = SA.render.createMissionHatch(THREE, { scene, hatch: s.hatch, getPlayer: () => ({ x: 0, z: 0 }) });
  assert.ok(scene.children.includes(r.group));
  r.update(0.1);
  const [tracks, mama, baby, crackEgg, lid, cup] = r.group.children;
  assert.ok(tracks.visible && tracks.children.length >= 4, 'a visible trail of tracks and feathers');
  assert.equal(mama.userData.animalId, 'pato');
  assert.equal(baby.userData.animalId, 'patito');
  assert.equal(baby.visible, false, 'no duckling before the hatch');
  assert.equal(crackEgg.visible, false);

  s.state.carry = 'placed';
  r.update(0.1);
  assert.equal(tracks.visible, false, 'the trail goes once the egg is picked up');

  s.state.phase = 'cracking'; s.state.crack = 0.5;
  r.update(0.1);
  assert.equal(crackEgg.visible, true);
  assert.deepEqual([crackEgg.position.x, crackEgg.position.z], [s.nest.x, s.nest.z]);
  assert.equal(baby.visible, false);

  s.state.phase = 'hatched'; s.state.crack = 1;
  r.update(0.01);
  assert.equal(crackEgg.visible, false);
  assert.ok(lid.visible && cup.visible && baby.visible, 'shells and duckling appear');
  assert.ok(baby.scale.x < 0.5, 'the duckling pops out small');
  for (let i = 0; i < 20; i++) r.update(0.1);
  assert.equal(baby.scale.x, 1);
  assert.ok(Math.abs(baby.position.x - SA.missionHatch.family(s.nest, 3).baby.x) < 1e-9, 'it settles beside mamá');
});

test('a reload straight into the hatched state shows the duckling at full size, with no pop', () => {
  const { SA, THREE } = world();
  const s = scripted(SA);
  s.state.phase = 'hatched'; s.state.carry = 'placed';
  const r = SA.render.createMissionHatch(THREE, { scene: new THREE.Scene(), hatch: s.hatch });
  r.update(0.01);
  assert.equal(r.group.children[2].visible, true);
  assert.equal(r.group.children[2].scale.x, 1);
});

test('the shared egg model has a shell and spots; the carry renderer hides its own egg once it cracks', () => {
  const { SA, THREE } = world();
  const egg = SA.render.createMissionCarry.makeEgg(THREE);
  assert.ok(egg.children.length >= 4);
  const s = scripted(SA);
  s.state.carry = 'placed';
  SA.missionHatch.view = () => s.hatch.view();
  const scene = new THREE.Scene();
  const carry = SA.render.createMissionCarry(THREE, { scene, thing: SA.missionCarry, getPlayer: () => ({ x: 0, z: 0 }) });
  const shown = (phase) => { s.state.phase = phase; carry.update(0.1); return carry.group.children[1].visible; };
  assert.equal(shown('waiting'), true);
  assert.equal(shown('cracking'), false);
  assert.equal(shown('hatched'), false);
});

test('tapping the family with the camera takes the photo; a tap elsewhere does not', () => {
  const { SA, THREE } = world();
  const s = scripted(SA);
  s.state.phase = 'hatched'; s.state.carry = 'placed';
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  const r = SA.render.createMissionHatch(THREE, { scene: new THREE.Scene(), hatch: s.hatch, canvas, camera, getPlayer: () => ({ x: 1, z: 2 }) });
  r.update(1);
  const baby = r.babyNode();
  baby.updateMatrixWorld(true);
  camera.position.set(s.nest.x, s.nest.y + 4, s.nest.z - 6);
  camera.lookAt(baby.position.x, baby.position.y + 0.5, baby.position.z);
  camera.updateMatrixWorld(true);
  assert.equal(r.tapAt(50, 50), true, 'a tap on the duckling');
  assert.deepEqual(JSON.parse(JSON.stringify(s.snaps)), [{ x: 1, z: 2 }]);
  camera.lookAt(s.nest.x + 40, 0, s.nest.z + 40);
  camera.updateMatrixWorld(true);
  assert.equal(r.tapAt(50, 50), false, 'a tap on empty ground');
  assert.equal(s.snaps.length, 1);
});
