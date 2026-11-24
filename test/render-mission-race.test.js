// AS-0354: the race course renderer (start line, flags, big tree, rabbit) on the real (vendored) three.js with a scripted SA.missionRace state. No WebGL: scene-graph only.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/animal-plan.js', 'game/gait.js', 'game/render/animals.js', 'game/render/mission-race.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

const state = () => ({ key: 'carrera:1', spec: { place: 'arbol-grande', rabbit: 'conejo' },
  start: { x: 0, y: 1, z: 0, r: 3, face: 0 }, goal: { x: 0, y: 1, z: 50, r: 4.5 },
  flags: [1, 2, 3, 4].map((i) => ({ x: i % 2 ? 1 : -1, y: 1, z: i * 10, rotY: 0 })),
  rabbit: { animal: 'conejo', x: 2.4, y: 1, z: 0, rotY: 0, scale: 1 } });

test('draws the start line, the flags, the big tree with a glow ring and the rabbit; all gone when the mission ends', () => {
  const { SA, THREE } = world();
  let cur = null, view = { talk: true, photo: false, passed: [] };
  const scene = new THREE.Scene();
  const r = SA.render.createMissionRace(THREE, { scene, thing: { current: () => cur, view: () => view } });
  assert.ok(scene.children.includes(r.group));
  r.update(0.1);
  assert.equal(r.group.children.length, 0, 'nothing before the mission');
  cur = state();
  r.update(0.1);
  assert.equal(r.group.children.length, 1 + 4 + 1 + 1, 'start line, four flags, the tree and the rabbit');
  const tree = r.group.children[5];
  assert.deepEqual([tree.position.x, tree.position.y, tree.position.z], [0, 1, 50]);
  const torus = tree.children.filter((c) => c.geometry && c.geometry.type === 'TorusGeometry');
  assert.equal(torus.length, 1, 'one glow ring');
  assert.equal(torus[0].geometry.parameters.radius, 4.5, 'the ring marks the goal circle');
  const rabbit = r.group.children[6];
  assert.equal(rabbit.userData.animalId, 'conejo');
  const op = torus[0].material.opacity;
  r.update(0.4);
  assert.notEqual(torus[0].material.opacity, op, 'the ring pulses');
  assert.ok(rabbit.position.y > 1, 'the rabbit hops while it waits to be talked to');
  const pennant = r.group.children[2].children[1];
  const before = pennant.material.color.getHex();
  view = { talk: false, photo: false, passed: [1] };
  r.update(0.1);
  assert.notEqual(pennant.material.color.getHex(), before, 'a flag you passed turns gold');
  assert.equal(pennant.material.color.getHex(), 0xffd23f);
  cur = null;
  r.update(0.1);
  assert.equal(r.group.children.length, 0);
});

test('a tap on the rabbit talks on the talk step; a tap on the big tree photographs it on the photo step; other taps do nothing', () => {
  const { SA, THREE } = world();
  const cur = state();
  const calls = [];
  let view = { talk: true, photo: false, passed: [] };
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) };
  const thing = { current: () => cur, view: () => view, talk: (p) => { calls.push(['talk', p]); return { status: 'step' }; }, snap: (p) => { calls.push(['snap', p]); return { status: 'complete' }; } };
  const r = SA.render.createMissionRace(THREE, { scene: new THREE.Scene(), thing, canvas, camera, getPlayer: () => ({ x: 1, z: 2 }) });
  r.update(0.1);
  const look = (x, y, z, lx, ly, lz) => { camera.position.set(x, y, z); camera.lookAt(lx, ly, lz); camera.updateMatrixWorld(true); };
  look(2.4, 2, 6, 2.4, 1.6, 0);
  assert.equal(r.tapAt(5, 5), false, 'a tap on empty sky');
  assert.equal(r.tapAt(100, 100), true, 'a tap in the middle hits the rabbit');
  assert.deepEqual(calls, [['talk', { x: 1, z: 2 }]]);
  look(0, 3, 40, 0, 4, 50);
  assert.equal(r.tapAt(100, 100), false, 'the big tree is not tappable on the talk step');
  view = { talk: false, photo: true, passed: [] };
  assert.equal(r.tapAt(100, 100), true, 'a tap on the big tree takes the photo');
  assert.deepEqual(calls[1], ['snap', { x: 1, z: 2 }]);
  view = { talk: false, photo: false, passed: [] };
  assert.equal(r.tapAt(100, 100), false, 'not a tap step');
  assert.equal(calls.length, 2);
});

test('the race (AS-0355): the rabbit follows the pace pose (hops while it runs, head down at its carrot), the carrot shrinks and vanishes once eaten, flags reset on a retry', () => {
  const { SA, THREE } = world();
  const cur = { ...state(), carrot: { x: 1.2, z: 25 } };
  let view = { talk: false, photo: false, passed: [1], race: { state: 'countdown', waiting: false, mode: 'wait', eat: 0, ate: false, x: 2.4, y: 1, z: 0, rotY: 0, carrot: cur.carrot } };
  const r = SA.render.createMissionRace(THREE, { scene: new THREE.Scene(), thing: { current: () => cur, view: () => view } });
  r.update(0.1);
  assert.equal(r.group.children.length, 1 + 4 + 1 + 1 + 1, 'start line, flags, tree, rabbit and the carrot');
  const rabbit = r.group.children[6], carrot = r.group.children[7];
  assert.deepEqual([carrot.position.x, carrot.position.z, carrot.visible], [1.2, 25, true]);
  assert.deepEqual([rabbit.position.x, rabbit.position.z, rabbit.position.y], [2.4, 0, 1], 'waiting at the line');
  const pennant = r.group.children[2].children[1];
  assert.equal(pennant.material.color.getHex(), 0xffd23f);
  view = { ...view, passed: [], race: { ...view.race, state: 'running', mode: 'run', x: 2.4, z: 12, rotY: Math.PI / 2 } };
  let high = 0;
  for (let i = 0; i < 20; i++) { r.update(0.05); high = Math.max(high, rabbit.position.y - 1); }
  assert.equal(rabbit.position.z, 12, 'it runs along the path');
  assert.equal(rabbit.rotation.y, Math.PI / 2, 'facing where it runs');
  assert.ok(high > 0.2, 'long hops while it runs: ' + high);
  assert.notEqual(pennant.material.color.getHex(), 0xffd23f, 'the flags are fresh again after a retry');
  view = { ...view, race: { ...view.race, mode: 'eat', eat: 0.8, z: 25 } };
  r.update(0.1);
  assert.ok(rabbit.rotation.x > 0, 'head down at the carrot');
  assert.ok(carrot.scale.x < 1.4 && carrot.scale.x > 0, 'the carrot is nibbled smaller');
  view = { ...view, race: { ...view.race, mode: 'run', eat: 0, ate: true } };
  r.update(0.1);
  assert.equal(carrot.visible, false, 'the carrot is gone once eaten');
  assert.equal(rabbit.rotation.x, 0);
  view = { ...view, race: { ...view.race, state: 'countdown', mode: 'wait', ate: false, z: 0 } };
  r.update(0.1);
  assert.equal(carrot.visible, true, 'a fresh carrot for the next try');
});
