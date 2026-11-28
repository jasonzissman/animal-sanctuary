// AS-0407: back-to-belly vertex-colour gradient on body/head/neck, and spots/bands markings from data.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/map.js', 'game/animal-plan.js', 'game/animal-markings.js', 'game/render/zigzag.js', 'game/render/instances.js', 'game/render/animal-shade.js', 'game/render/animals.js'];

function load() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx;
}

const goodAnimal = (markings) => ({
  id: 'zorro', name: { es: 'zorro', en: 'fox', gender: 'm' }, icon: '🦊', biome: 'bosque',
  traits: { size: 'mediano', color: 'naranja', movement: 'corre', diet: 'omnívoro', legs: 4 },
  parts: [{ part: 'cuerpo', color: '#aabbcc', scale: [0.8, 0.6, 1.2], count: 1, offset: [0, 0.6, 0] }], easterEgg: false, markings,
});

test('gradient geometry: back vertices are darker than belly vertices (cloned, original untouched)', () => {
  const { SA, THREE } = load();
  const unit = new THREE.SphereGeometry(0.5, 12, 9);
  const g = SA.render.animalShade.gradientGeometry(THREE, unit);
  assert.notEqual(g, unit);
  assert.equal(unit.attributes.color, undefined, 'the shared unit geometry is not modified');
  const pos = g.attributes.position, col = g.attributes.color;
  assert.equal(col.count, pos.count);
  let top = Infinity, bottom = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), c = col.getX(i);
    assert.ok(c > 0 && c <= 1);
    if (y > 0.49) top = Math.min(top, c);
    if (y < -0.49) bottom = Math.max(bottom, c);
  }
  assert.ok(top < bottom, `back ${top} is darker than belly ${bottom}`);
  assert.equal(bottom, 1, 'the belly keeps the part colour');
  assert.ok(Math.abs(top - SA.render.animalShade.BACK_SHADE) < 1e-6);
});

test('plan flags body, head and neck pieces for the gradient (upright ones only)', () => {
  const { SA } = load();
  for (const a of SA.data.all('animals')) {
    for (const s of SA.animalPlan.plan(a)) {
      if (!['cuerpo', 'cabeza', 'cuello'].includes(s.part)) assert.ok(!s.gradient, `${a.id} ${s.part} has no gradient`);
    }
  }
  const rabbit = SA.animalPlan.plan(SA.data.get('animals', 'conejo'));
  assert.ok(rabbit.find((s) => s.part === 'cuerpo').gradient);
  assert.ok(rabbit.find((s) => s.part === 'cabeza').gradient);
});

test('built animals: body/head use vertex colours with a shared gradient geometry; limbs and eyes stay flat; picks unchanged', () => {
  const { SA, THREE } = load();
  const group = SA.render.buildAnimals(THREE, {});
  const conejos = group.children.filter((g) => g.userData.animalId === 'conejo');
  assert.ok(conejos.length >= 2);
  const body = (g) => g.children.find((m) => m.userData.part === 'cuerpo' && !m.userData.pick);
  assert.equal(body(conejos[0]).material.vertexColors, true);
  assert.equal(body(conejos[0]).geometry, body(conejos[1]).geometry, 'gradient geometry is cached and shared');
  const want = SA.animalPlan.plan(SA.data.get('animals', 'conejo')).find((s) => s.part === 'cuerpo').color.slice(1).toLowerCase();
  assert.equal(body(conejos[0]).material.color.getHexString(), want, 'the material keeps the part colour (the vertex colours only darken it)');
  const eye = conejos[0].children.find((m) => m.userData.part === 'ojos' && !m.userData.pick);
  assert.ok(!eye.material.vertexColors, 'eyes are not shaded');
  assert.ok(conejos[0].children.filter((m) => m.userData.pick).every((m) => m.geometry instanceof THREE.BoxGeometry));
});

test('markings data is validated with clear errors', () => {
  const { SA } = load();
  assert.doesNotThrow(() => load().SA.data.register('animals', [goodAnimal({ type: 'spots', color: '#112233', count: 5 })]));
  assert.throws(() => SA.data.register('animals', [goodAnimal({ type: 'dots', color: '#112233', count: 5 })]), /markings\.type.*spots, bands/);
  assert.throws(() => SA.data.register('animals', [goodAnimal({ type: 'spots', color: 'red', count: 5 })]), /markings\.color/);
  assert.throws(() => SA.data.register('animals', [goodAnimal({ type: 'spots', color: '#112233', count: 0 })]), /markings\.count/);
  assert.throws(() => SA.data.register('animals', [goodAnimal({ type: 'spots', color: '#112233', count: 2.5 })]), /markings\.count/);
  assert.throws(() => SA.data.register('animals', [goodAnimal({ type: 'bands', color: '#112233', count: 25 })]), /markings\.count/);
  assert.throws(() => SA.data.register('animals', [goodAnimal('spots')]), /markings.*must be an object/);
  const noBody = goodAnimal({ type: 'spots', color: '#112233', count: 3 });
  noBody.parts[0].part = 'cabeza';
  assert.throws(() => SA.data.register('animals', [noBody]), /markings.*cuerpo/);
});

test('plan: the requested number of spots / bands, all on the body, none on the belly', () => {
  const { SA } = load();
  for (const type of ['spots', 'bands']) {
    for (const count of [1, 3, 10, 24]) {
      const a = goodAnimal({ type, color: '#112233', count });
      const specs = SA.animalPlan.plan(a), body = specs.find((s) => s.part === 'cuerpo');
      const m = SA.animalMarkings.plan(a, specs);
      assert.equal(m.items.length, count, `${type} x${count}`);
      assert.equal(m.shape, type === 'spots' ? 'disc' : 'ring');
      for (const it of m.items) {
        assert.ok(Math.abs(it.position[0] - body.position[0]) <= body.size[0] / 2 * 1.05);
        assert.ok(Math.abs(it.position[2] - body.position[2]) <= body.size[2] / 2 * 1.05);
        if (type === 'spots') assert.ok(it.position[1] > body.position[1] - body.size[1] * 0.2, 'spots stay off the belly');
        assert.ok(it.size.every((n) => n > 0 && n < Math.max(...body.size)));
      }
    }
  }
  const none = SA.animalMarkings.plan(goodAnimal(undefined), SA.animalPlan.plan(goodAnimal(undefined)));
  assert.equal(none, null);
});

test('plan: box bodies get slab bands and flat discs on the box faces', () => {
  const { SA } = load();
  const a = goodAnimal({ type: 'bands', color: '#112233', count: 4 });
  a.parts[0].builder = 'box';
  const specs = SA.animalPlan.plan(a);
  assert.equal(SA.animalMarkings.plan(a, specs).shape, 'slab');
  a.markings = { type: 'spots', color: '#112233', count: 6 };
  const m = SA.animalMarkings.plan(a, specs), body = specs[0];
  assert.equal(m.shape, 'disc');
  for (const it of m.items) {
    const d = [0, 1, 2].map((i) => Math.abs(it.position[i] - body.position[i]) / (body.size[i] / 2));
    assert.ok(Math.max(...d) > 0.99 && Math.max(...d) < 1.2, 'on a face of the box');
  }
});

test('shipped animals with markings build ONE instanced mesh, decor only, outside pickVolumes', () => {
  const { SA, THREE } = load();
  const marked = SA.data.all('animals').filter((a) => a.markings);
  assert.ok(marked.some((a) => a.markings.type === 'spots') && marked.some((a) => a.markings.type === 'bands'), 'both kinds ship');
  const group = SA.render.buildAnimals(THREE, {});
  for (const a of marked) {
    const groups = group.children.filter((g) => g.userData.animalId === a.id);
    assert.ok(groups.length > 0);
    for (const g of groups) {
      const inst = g.children.filter((m) => m.isInstancedMesh);
      assert.equal(inst.length, 1, `${a.id}: one instanced mesh`);
      assert.equal(inst[0].count, a.markings.count);
      assert.ok(inst[0].userData.decor && inst[0].userData.part === undefined && !inst[0].userData.pick);
      assert.ok(!g.userData.pickVolumes.includes(inst[0]));
      assert.ok(g.userData.pickVolumes.every((p) => p.userData.pick && p.userData.part));
    }
    assert.equal(groups[0].children.find((m) => m.isInstancedMesh).geometry, groups[1] ? groups[1].children.find((m) => m.isInstancedMesh).geometry : groups[0].children.find((m) => m.isInstancedMesh).geometry, 'geometry shared across the herd');
  }
  const plain = group.children.find((g) => g.userData.animalId === 'conejo');
  assert.ok(!plain.children.some((m) => m.isInstancedMesh), 'animals without markings get none');
});
