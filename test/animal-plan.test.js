import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/map.js', 'game/animal-plan.js'];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);

test('plan: part counts follow the data (4 patas, 2 orejas, 1 cola)', () => {
  const SA = loadGame(DATA);
  const rabbit = SA.animalPlan.plan(SA.data.get('animals', 'conejo'));
  const count = (k) => rabbit.filter((s) => s.part === k).length;
  assert.equal(count('patas'), 4);
  assert.equal(count('orejas'), 2);
  assert.equal(count('ojos'), 2);
  assert.equal(count('cola'), 1);
  assert.deepEqual(Array.from(rabbit.filter((s) => s.part === 'patas'), (s) => s.index), [0, 1, 2, 3]);
  const duck = SA.animalPlan.plan(SA.data.get('animals', 'pato'));
  assert.equal(duck.filter((s) => s.part === 'patas').length, 2);
});

test('plan: every real animal expands from data alone, with sane numbers', () => {
  const SA = loadGame(DATA);
  for (const a of SA.data.all('animals')) {
    const specs = SA.animalPlan.plan(a);
    assert.equal(specs.length, a.parts.reduce((n, p) => n + p.count, 0), a.id);
    for (const s of specs) {
      assert.equal(s.animalId, a.id);
      assert.ok(SA.parts.BUILDERS.includes(s.builder));
      for (const n of [...s.size, ...s.position, ...s.rotation, ...s.pickSize]) assert.ok(Number.isFinite(n));
    }
  }
});

test('plan: colours and scale overrides come from the animal data', () => {
  const SA = loadGame(DATA);
  const animal = {
    id: 'bicho', parts: [
      { part: 'cuerpo', color: '#112233', scale: 2, count: 1, offset: [0, 1, 0] },
      { part: 'patas', color: '#445566', scale: [0.1, 0.4, 0.2], count: 2, offset: [0.3, 0.2, 0] },
    ],
  };
  const [body, l, r] = SA.animalPlan.plan(animal);
  assert.equal(body.color, '#112233');
  assert.deepEqual(Array.from(body.size), [2, 2, 2]);
  assert.equal(l.color, '#445566');
  assert.deepEqual(Array.from(l.size), [0.1, 0.4, 0.2]);
  assert.deepEqual([l.side, r.side], ['right', 'left']);
  assert.deepEqual([l.position[0], r.position[0]], [-0.3, 0.3]);
});

test('plan: pick volumes are 1.6x the part', () => {
  const SA = loadGame(DATA);
  const eye = SA.animalPlan.plan(SA.data.get('animals', 'conejo')).find((s) => s.part === 'ojos');
  assert.equal(SA.animalPlan.PICK_SCALE, 1.6);
  near(eye.pickSize[0], 0.16 * 1.6);
  near(eye.pickSize[2], 0.16 * 1.6);
});

test('plan: beaks and tails point along z while keeping their world size', () => {
  const SA = loadGame(DATA);
  const beak = SA.animalPlan.plan(SA.data.get('animals', 'tucan')).find((s) => s.part === 'pico');
  near(beak.rotation[0], Math.PI / 2);
  assert.deepEqual(Array.from(beak.worldSize), [0.35, 0.3, 1.1]);
  assert.deepEqual(Array.from(beak.size), [0.35, 1.1, 0.3]);
  const ears = SA.animalPlan.plan(SA.data.get('animals', 'conejo')).filter((s) => s.part === 'orejas');
  assert.ok(ears[0].rotation[2] > 0 && ears[1].rotation[2] < 0, 'ears tilt outward');
});

test('plan: a missing part definition fails with a clear error; custom defs are accepted', () => {
  const SA = loadGame(DATA);
  const a = { id: 'x', parts: [{ part: 'zzz', color: '#000000', scale: 1, count: 1, offset: [0, 0, 0] }] };
  assert.throws(() => SA.animalPlan.plan(a), /no part definition/);
  const def = { key: 'zzz', builder: 'box', anchor: 'center' };
  assert.equal(SA.animalPlan.plan(a, [def])[0].builder, 'box');
  assert.equal(SA.animalPlan.plan(a, { zzz: def })[0].builder, 'box');
  const five = { id: 'y', parts: [{ part: 'zzz', color: '#000000', scale: 1, count: 3, offset: [0.5, 0, 0] }] };
  assert.deepEqual(Array.from(SA.animalPlan.plan(five, [def]), (s) => s.position[0]), [-0.5, 0, 0.5]);
});

test('placements: deterministic, in the right biome, dry, spaced and clear of decor', () => {
  const SA = loadGame(DATA);
  const animals = SA.data.all('animals');
  const avoid = [[-8, 4]];
  const a = SA.animalPlan.placements(animals, { avoid });
  const b = SA.animalPlan.placements(animals, { avoid });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  for (const an of animals) {
    const s = a[an.id];
    assert.equal(SA.map.biomeAt(s.x), an.biome, an.id);
    assert.ok(!SA.map.isWater(s.x, s.z), an.id);
    near(s.y, SA.map.groundHeight(s.x, s.z));
  }
});

test('buildAnimals: groups per animal; every part mesh and pick volume carries userData and is raycastable', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...DATA, 'game/render/animals.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  const group = SA.render.buildAnimals(THREE);
  assert.equal(group.children.length, 6);
  for (const g of group.children) {
    const animal = SA.data.get('animals', g.userData.animalId);
    const parts = g.children.filter((m) => !m.userData.pick);
    const picks = g.children.filter((m) => m.userData.pick);
    assert.equal(parts.length, animal.parts.reduce((n, p) => n + p.count, 0));
    assert.equal(picks.length, parts.length);
    assert.equal(g.userData.pickVolumes.length, picks.length);
    for (const m of g.children) {
      assert.equal(m.userData.animalId, animal.id);
      assert.ok(SA.data.get('parts', m.userData.part));
    }
    for (const p of picks) assert.equal(p.visible, false);
  }
  // A ray aimed at an invisible pick volume hits it (so tiny parts are easy to tap).
  const bunny = group.children.find((g) => g.userData.animalId === 'conejo');
  group.updateMatrixWorld(true);
  const eye = bunny.userData.pickVolumes.find((p) => p.userData.part === 'ojos');
  const target = eye.getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster(target.clone().add(new THREE.Vector3(0.1, 0.05, 0.1)), new THREE.Vector3(-0.1, -0.05, -0.1).normalize());
  const hits = ray.intersectObjects(bunny.userData.pickVolumes, false);
  assert.ok(hits.length > 0);
  assert.equal(hits[0].object.userData.animalId, 'conejo');
});
