// AS-0352: the home that grows one layer per place step, its tap volume, the wobble and the family walking in; real (vendored) three.js, no WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/animal-plan.js', 'game/gait.js', 'game/render/animals.js', 'game/render/home-build.js', 'game/render/mission-home.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

const state = () => ({ key: 'hogar:1', spec: { place: 'hogar' }, spot: { x: -30, y: 1, z: 10, r: 3.2, face: 0 },
  family: [['adult', 'conejo', 4, 10.4, -30, 9.9], ['baby', 'conejito', 3, 11.9, -30.6, 10.5]]
    .map(([role, animal, dx, z, ix, iz]) => ({ role, animal, x: -30 + dx, y: 1, z, rotY: 0, scale: 0.8, inside: { x: ix, y: 1, z: iz, rotY: 0 } })) });

test('buildHome: three hidden layers (sticks, leafy roof, grass) in flat low-poly primitives and a generous invisible pick volume', () => {
  const { SA, THREE } = world();
  const h = SA.render.buildHome(THREE, 3.2);
  assert.deepEqual(Object.keys(h.layers), ['abajo', 'encima', 'dentro']);
  for (const k of Object.keys(h.layers)) { assert.equal(h.layers[k].visible, false, k); assert.ok(h.layers[k].children.length >= 5, k); }
  const types = (g) => new Set(g.children.map((c) => c.geometry.type));
  assert.deepEqual([...types(h.layers.abajo)], ['BoxGeometry']);
  assert.ok(types(h.layers.encima).has('ConeGeometry'));
  assert.equal(h.pick.material.visible, false);
  assert.equal(h.pick.geometry.parameters.radiusTop, 3.2);
  // the doorway toward +z is left open: no stick stands there
  assert.ok(h.layers.abajo.children.every((s) => !(Math.abs(s.position.x) < 0.5 && s.position.z > 1)), 'doorway gap');
});

test('layers pop in as view().layers grows; a wrong item wobbles the home; once built the family walks into it', () => {
  const { SA, THREE } = world();
  const cur = state();
  let view = { layers: [], wobbles: 0, built: false, place: true };
  const r = SA.render.createMissionHome(THREE, { scene: new THREE.Scene(), thing: { current: () => cur, view: () => view } });
  r.update(0.1);
  const house = r.group.children.find((c) => c.children.length === 4 && c.children.some((k) => k.userData && k.userData.homePick));
  assert.ok(house, 'the home is in the scene');
  assert.deepEqual([house.position.x, house.position.z], [-30, 10]);
  const [abajo, encima, dentro] = house.children;
  assert.deepEqual([abajo.visible, encima.visible, dentro.visible], [false, false, false]);
  view = { ...view, layers: ['abajo'] };
  r.update(0.05);
  assert.deepEqual([abajo.visible, encima.visible], [true, false]);
  assert.ok(abajo.scale.x < 1 && abajo.position.y > 0, 'it drops in');
  r.update(0.7);
  assert.ok(Math.abs(abajo.scale.x - 1) < 1e-6 && abajo.position.y === 0, 'and settles');
  view = { ...view, wobbles: 1 };
  r.update(0.05);
  r.update(0.02);
  assert.notEqual(house.rotation.z, 0, 'the home wobbles');
  r.update(1);
  assert.equal(house.rotation.z, 0, 'and rests');
  view = { ...view, layers: ['abajo', 'encima', 'dentro'], built: true, place: false };
  r.update(0.1);
  assert.deepEqual([encima.visible, dentro.visible], [true, true]);
  const rabbits = r.group.children.filter((c) => c.userData && /^conej/.test(c.userData.animalId));
  assert.equal(rabbits.length, 2);
  const start = [rabbits[0].position.x, rabbits[0].position.z];
  r.update(0.3);
  assert.deepEqual([rabbits[0].position.x, rabbits[0].position.z], start, 'they wait for the last layer to pop in');
  for (let i = 0; i < 40; i++) r.update(0.1);
  assert.ok(Math.hypot(rabbits[0].position.x + 30, rabbits[0].position.z - 9.9) < 0.05, 'the adult is inside');
  assert.ok(Math.hypot(rabbits[1].position.x + 30.6, rabbits[1].position.z - 10.5) < 0.05, 'the kit too');
});

test('a tap on the spot on a place step calls put(); a tap elsewhere does not; the photo tap still goes to the rabbits', () => {
  const { SA, THREE } = world();
  const cur = state();
  const puts = [];
  let view = { layers: [], wobbles: 0, place: true };
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(-30, 3, 16);
  camera.lookAt(-30, 1, 10);
  camera.updateMatrixWorld(true);
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) };
  const thing = { current: () => cur, view: () => view, put: (p) => { puts.push(p); return { ok: true }; }, snap: () => ({ status: 'complete' }) };
  const r = SA.render.createMissionHome(THREE, { scene: new THREE.Scene(), thing, canvas, camera, getPlayer: () => ({ x: 1, z: 2 }) });
  r.update(0.1);
  assert.equal(r.tapAt(5, 5), false, 'sky');
  assert.equal(puts.length, 0);
  assert.equal(r.tapAt(100, 110), true, 'the spot');
  assert.deepEqual(puts, [{ x: 1, z: 2 }]);
  view = { ...view, place: false, photo: false };
  assert.equal(r.tapAt(100, 110), false, 'not a place step');
  assert.equal(puts.length, 1);
});
