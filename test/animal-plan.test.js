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
  assert.equal(group.children.length, 10);
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
});

function pickerFor(animalId) {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...DATA, 'game/render/animals.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  const group = SA.render.buildAnimals(THREE);
  const g = group.children.find((c) => c.userData.animalId === animalId);
  group.updateMatrixWorld(true);
  // Cast from outside the animal: origin and direction are given in the animal's own frame (+z = its front).
  return (from, to) => {
    const o = g.localToWorld(new THREE.Vector3(...from));
    const t = g.localToWorld(new THREE.Vector3(...to));
    const ray = new THREE.Raycaster(o, t.sub(o).normalize());
    const hits = ray.intersectObjects(g.userData.pickVolumes, false);
    const naive = hits[0] && hits[0].object.userData.part;
    const hit = SA.animalPlan.choosePick(hits);
    return { naive, part: hit && hit.object.userData.part, id: hit && hit.object.userData.animalId, n: hits.length };
  };
}

test('picking: small parts win over the cabeza/cuerpo boxes around them (conejo)', () => {
  const pick = pickerFor('conejo');
  // From the camera side, straight at each eye, the snout, the tail and the front/back legs.
  assert.equal(pick([0.17, 1.08, 5], [0.17, 1.08, 0.77]).part, 'ojos');
  assert.equal(pick([-0.17, 1.08, 5], [-0.17, 1.08, 0.77]).part, 'ojos');
  assert.equal(pick([0, 0.96, 5], [0, 0.96, 0.84]).part, 'hocico');
  assert.equal(pick([0, 0.5, -5], [0, 0.5, -0.55]).part, 'cola');
  // A ray from the side first crosses the head box (a nearest-hit pick would say cabeza), then meets the eye.
  const oblique = pick([3, 1.08, 0.77], [0.17, 1.08, 0.77]);
  assert.equal(oblique.naive, 'cabeza');
  assert.equal(oblique.part, 'ojos');
  // From the side and from below the legs beat the body.
  const side = pick([5, 0.18, 0.336], [0.28, 0.18, 0.336]);
  assert.equal(side.part, 'patas');
  assert.equal(pick([0.28, -5, 0.336], [0.28, 0.18, 0.336]).part, 'patas');
  // Plain head and body taps still pick the head and body, and carry the animal id.
  assert.equal(pick([0.3, 1.3, 5], [0.3, 1.3, 0.5]).part, 'cabeza');
  const body = pick([0, 0.9, -5], [0, 0.9, 0]);
  assert.equal(body.part, 'cuerpo');
  assert.equal(body.id, 'conejo');
});

test('picking: eyes behind the first surface cannot be tapped through the back of the head', () => {
  const pick = pickerFor('conejo');
  assert.equal(pick([0.17, 1.08, -5], [0.17, 1.08, 0.2]).part, 'cabeza');
});

test('picking: tiny parts of mono and tucan are reachable from the front', () => {
  const mono = pickerFor('mono');
  assert.equal(mono([0.15, 1.68, 5], [0.15, 1.68, 0.56]).part, 'ojos');
  assert.equal(mono([0, 1.52, 5], [0, 1.52, 0.6]).part, 'hocico');
  const tucan = pickerFor('tucan');
  assert.equal(tucan([2, 1.7, 4], [0.25, 1.58, 0.47]).part, 'ojos'); // the beak hides the eyes dead-on
  assert.equal(tucan([0, 1.45, 5], [0, 1.45, 0.9]).part, 'pico');
});

test('choosePick: empty hits give null; hits without a pick volume fall back to the nearest', () => {
  const SA = loadGame(DATA);
  assert.equal(SA.animalPlan.choosePick([]), null);
  const h = [{ distance: 1, object: { userData: {} } }];
  assert.equal(SA.animalPlan.choosePick(h), h[0]);
});

test('plan: big masses get a 1.0x pick volume, small parts 1.6x, and pick volumes follow rotation', () => {
  const SA = loadGame(DATA);
  const specs = SA.animalPlan.plan(SA.data.get('animals', 'conejo'));
  const body = specs.find((s) => s.part === 'cuerpo');
  near(body.pickSize[0], 1.0);
  const beak = SA.animalPlan.plan(SA.data.get('animals', 'tucan')).find((s) => s.part === 'pico');
  assert.deepEqual(Array.from(beak.pickSize), Array.from(beak.size, (n) => n * 1.6));
  near(beak.pickVolume, 0.35 * 0.3 * 1.1 * 1.6 ** 3);
});
