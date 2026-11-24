// AS-0336: the feather and eagle-nest renderer on the real (vendored) three.js with a scripted SA.missionNest state. No WebGL: scene-graph objects only.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/animal-plan.js', 'game/gait.js', 'game/flight.js', 'game/render/animals.js', 'game/render/mission-nest.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

const state = () => ({ key: 'aguila:1', spec: { item: 'pluma', chick: 'aguila', mama: 'aguila' }, feather: { id: 'pluma-1', x: -60, z: 10, y: 1, taken: false },
  summit: { x: -98, z: -26, y: 9, r: 1.4 }, nest: { x: -84, z: -22, y: 10, r: 1.4 }, bridge: { x: -91, z: -24, y: 9 }, crossed: false });

// A scripted SA.missionNest: the state, where things sit (same maths as the pure module) and a view we can change.
const spotsOf = (c) => ({ bowl: { x: c.nest.x, y: c.nest.y, z: c.nest.z }, mama: { x: c.nest.x - 0.2, y: c.nest.y + 0.15, z: c.nest.z }, chick: { x: c.nest.x + 0.2, y: c.nest.y + 0.15, z: c.nest.z }, face: 1 });
function stub(get, view) {
  return { current: get, spots: () => (get() ? spotsOf(get()) : null), view: () => (view ? view() : null), give: () => ({ ok: true }) };
}

test('draws a feather, a nest and two eagles (chick and mamá) on the nest peak; the feather hides when taken; all gone when the mission ends', () => {
  const { SA, THREE } = world();
  let cur = state();
  const scene = new THREE.Scene();
  const r = SA.render.createMissionNest(THREE, { scene, thing: stub(() => cur) });
  assert.ok(scene.children.includes(r.group));
  r.update(0.1);
  assert.equal(r.group.children.length, 4, 'feather, nest bowl, mamá, chick');
  const feather = r.group.children[0];
  assert.equal(feather.visible, true);
  assert.equal(feather.position.x, -60);
  const eagles = r.group.children.filter((c) => c.userData && c.userData.animalId === 'aguila');
  assert.equal(eagles.length, 2);
  assert.ok(eagles.every((e) => Math.abs(e.position.y - 10) < 0.5 && Math.hypot(e.position.x + 84, e.position.z + 22) < 2), 'sitting in the nest on the far peak');
  assert.ok(eagles[1].scale.x < eagles[0].scale.x, 'the chick is smaller than mamá');
  cur.feather.taken = true;
  r.update(0.1);
  assert.equal(r.group.children[0].visible, false);
  cur = null;
  r.update(0.1);
  assert.equal(r.group.children.length, 0);
});

test('the chick has an enlarged invisible pick volume; a tap on it gives the feather, a tap elsewhere does not', () => {
  const { SA, THREE } = world();
  const cur = state();
  const gives = [];
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  const thing = { ...stub(() => cur), give: (p) => { gives.push(p); return { ok: true }; } };
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) };
  const r = SA.render.createMissionNest(THREE, { scene: new THREE.Scene(), thing, canvas, camera, getPlayer: () => ({ x: 1, z: 2 }) });
  r.update(0.1);
  const chick = r.chickNode(), pick = chick.children.find((c) => c.userData.pick);
  assert.deepEqual([pick.userData.animalId, pick.userData.part, pick.visible], ['aguila', 'cuerpo', false]);
  const p = new THREE.Vector3();
  chick.updateMatrixWorld(true);
  pick.getWorldPosition(p);
  camera.position.set(p.x + 4, p.y + 1, p.z + 4);       // looking at the chick from a step away
  camera.lookAt(p);
  camera.updateMatrixWorld(true);
  assert.equal(r.tapAt(100, 100), true, 'the middle of the screen is the chick');
  assert.deepEqual(gives, [{ x: 1, z: 2 }]);
  assert.equal(r.tapAt(2, 2), false, 'a corner of the sky is not');
  assert.equal(gives.length, 1);
});

test('on the photo step a tap on either eagle takes the summit photo (snap), la cámara is put in hand first; nothing else counts', () => {
  const { SA, THREE } = world();
  const cur = state();
  const snaps = [], gives = [];
  let status = 'nocamera';
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  const thing = { ...stub(() => cur, () => ({ photo: true, flight: null, flown: true, nudge: null })), give: () => gives.push(1), snap: (p) => { snaps.push(p); return { status }; } };
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) };
  const equipped = [];
  SA.inventory = { equip: (id) => { equipped.push(id); return true; } };
  SA.photo = { CAMERA: 'camara' };
  SA.audio = { say: () => {} };
  const r = SA.render.createMissionNest(THREE, { scene: new THREE.Scene(), thing, canvas, camera, getPlayer: () => ({ x: 3, z: 4 }) });
  r.update(0.1);
  const chick = r.chickNode(), p = new THREE.Vector3();
  chick.updateMatrixWorld(true);
  chick.getWorldPosition(p);
  camera.position.set(p.x + 4, p.y + 1, p.z + 4);
  camera.lookAt(p);
  camera.updateMatrixWorld(true);
  assert.equal(r.tapAt(100, 100), false, 'no camera yet: the camera is put in hand, the photo comes on the next tap');
  assert.deepEqual([snaps, equipped], [[{ x: 3, z: 4 }], ['camara']]);
  status = 'complete';
  assert.equal(r.tapAt(100, 100), true);
  assert.equal(snaps.length, 2);
  assert.equal(r.tapAt(2, 2), false, 'the sky is not the eagles');
  assert.equal(snaps.length, 2);
  assert.equal(gives.length, 0, 'the photo step never gives la pluma');
});

test('the chick flaps and flies a loop along SA.flight, then sits in the nest again; a wrong tap wobbles it', () => {
  const { SA, THREE } = world();
  const cur = state();
  let v = null;
  const r = SA.render.createMissionNest(THREE, { scene: new THREE.Scene(), thing: stub(() => cur, () => v) });
  r.update(0.1);
  const chick = r.chickNode(), home = spotsOf(cur).chick;
  const wings = chick.children.filter((c) => c.userData.part === 'alas' && !c.userData.pick);
  assert.ok(wings.length >= 2, 'eagles have alas');
  const base = wings.map((w) => w.rotation.z);
  assert.deepEqual([chick.position.x, chick.position.y, chick.position.z], [home.x, home.y, home.z]);
  v = { flight: 0.6, flown: true, nudge: null };                       // flapping on the spot, lifted off the twigs
  r.update(0.05);
  assert.ok(chick.position.y > home.y && Math.hypot(chick.position.x - home.x, chick.position.z - home.z) < 1e-6);
  const r1 = wings.map((w) => w.rotation.z);
  r.update(0.05);
  assert.ok(wings.some((w, i) => Math.abs(w.rotation.z - base[i]) > 0.05) && r1.some((z, i) => z !== wings[i].rotation.z), 'the wings beat');
  v = { flight: SA.flight.PHASES.flap + SA.flight.PHASES.fly / 2, flown: true, nudge: null };   // half-way round the loop beside mamá
  r.update(0.05);
  const mama = spotsOf(cur).mama;
  assert.ok(chick.position.y > home.y + 0.8 && Math.hypot(chick.position.x - mama.x, chick.position.z - mama.z) > 1, 'up in the air, out beside mamá');
  v = { flight: null, flown: true, nudge: 0.1 };                        // landed; a tap a moment ago wobbles it
  r.update(0.05);
  assert.deepEqual([chick.position.x, chick.position.y, chick.position.z], [home.x, home.y, home.z]);
  assert.ok(Math.abs(chick.rotation.z) > 0.01, 'a gentle wobble');
  v = { flight: null, flown: true, nudge: null };
  r.update(0.05);
  assert.equal(chick.rotation.z, 0);
  wings.forEach((w, i) => assert.equal(w.rotation.z, base[i]));
});
