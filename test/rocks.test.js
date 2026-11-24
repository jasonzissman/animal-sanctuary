import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Seeded rock generator (AS-0299): pure SA.rocks specs (deterministic, 4+ shapes, colours per biome) and the thin render module that
// builds shared flat-shaded geometry from them. Real vendored three.js, no WebGL needed.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/decor.js',
  'game/map.js', 'game/peaks.js', 'game/terrain-color.js', 'game/camera.js', 'game/player.js', 'game/station.js', 'game/perch.js', 'game/blocking.js',
  'game/decor-plan.js', 'game/rocks.js', 'game/render/rocks.js', 'game/render/decor-dry.js', 'game/render/trees.js', 'game/render/decor.js'];
const ctx = vm.createContext({ console });
ctx.window = ctx; ctx.self = ctx;
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const { SA, THREE } = ctx;

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const sample = (biome, n = 200) => Array.from({ length: n }, (_, i) => SA.rocks.spec(i * 7919 + 3, biome));

test('the generator is deterministic per seed and differs between seeds', () => {
  assert.deepEqual(SA.rocks.spec(1234, 'bosque'), SA.rocks.spec(1234, 'bosque'));
  assert.deepEqual(SA.rocks.spec(SA.rocks.seedAt(3.5, -9.25), 'montana'), SA.rocks.spec(SA.rocks.seedAt(3.5, -9.25), 'montana'));
  assert.notDeepEqual(sample('bosque', 20), sample('bosque', 20).reverse());
  assert.equal(SA.rocks.seedAt(1, 2), SA.rocks.seedAt(1, 2));
  assert.notEqual(SA.rocks.seedAt(1, 2), SA.rocks.seedAt(2, 1));
});

test('at least four distinct shapes come out, in every biome, with sane proportions', () => {
  assert.ok(SA.rocks.KINDS.length >= 4);
  for (const biome of ['bosque', 'selva', 'desierto', 'montana']) {
    const specs = sample(biome);
    assert.deepEqual([...new Set(specs.map((s) => s.kind))].sort(), [...SA.rocks.KINDS].sort(), biome);
    for (const s of specs) {
      assert.ok(s.variant >= 0 && s.variant < SA.rocks.VARIANTS && Number.isInteger(s.variant));
      s.scale.forEach((v) => assert.ok(v >= 0.85 && v <= 1.15));
      assert.ok(s.yaw >= 0 && s.yaw < Math.PI * 2);
      assert.match(s.color, /^#[0-9a-f]{6}$/);
    }
  }
  assert.ok(SA.rocks.spec(NaN, 'nowhere').kind, 'a bad seed or biome still gives a rock');
});

test('colours differ per biome: desert red-orange, mountain grey, forest mossy green-grey', () => {
  const cols = (b) => new Set(sample(b).map((s) => s.color));
  for (const c of cols('desierto')) { const [r, g, b] = hex(c); assert.ok(r > g + 30 && g > b, `desert ${c} red-orange`); }
  for (const c of cols('montana')) { const [r, g, b] = hex(c); assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 24, `mountain ${c} grey`); }
  for (const biome of ['bosque', 'selva']) for (const c of cols(biome)) { const [r, g, b] = hex(c); assert.ok(g > r && g > b, `${biome} ${c} mossy`); }
  assert.ok(cols('desierto').size > 1, 'shades vary within a biome');
  const all = [...cols('desierto'), ...cols('montana'), ...cols('bosque')];
  assert.equal(new Set(all).size, all.length, 'no colour is shared between desert, mountain and forest');
});

test('the render module builds a shared, flat-shaded, sunken geometry per kind and variant', () => {
  const R = SA.render.rocks.create(THREE);
  for (const kind of SA.rocks.KINDS) {
    for (let v = 0; v < SA.rocks.VARIANTS; v++) {
      const g = R.geometry(kind, v);
      assert.equal(g, R.geometry(kind, v), 'cached and shared');
      assert.ok(g.attributes.position.count >= 30 && g.attributes.position.count % 3 === 0, `${kind}${v}`);
      g.computeBoundingBox();
      assert.ok(Math.abs(g.boundingBox.max.y - SA.render.rocks.HEIGHTS[kind]) < 1e-3, `${kind} top`);
      assert.ok(g.boundingBox.min.y < 0 && g.boundingBox.min.y > -0.2, `${kind} foot is sunk a little`);
      assert.ok(!Number.isNaN(g.boundingBox.max.x));
    }
  }
  assert.equal(R.material('#c4693a'), R.material('#c4693a'));
  assert.equal(R.material('#c4693a').flatShading, true);
});

test('world rocks come from the generator with the placed scale (collision) and biome colours', () => {
  const decor = SA.render.buildDecor(THREE);
  const rocks = decor.children.filter((o) => o.userData.decor === 'roca' || o.userData.decor === 'rocaarena');
  assert.ok(rocks.length >= 60, `${rocks.length} rocks`);
  assert.deepEqual([...new Set(rocks.map((o) => o.userData.rock))].sort(), [...SA.rocks.KINDS].sort());
  const plan = SA.decorPlan.plan({ seed: 42 }).filter((e) => e.decor === 'roca' || e.decor === 'rocaarena');
  assert.equal(rocks.length, plan.length);
  rocks.forEach((o, i) => {
    assert.equal(o.scale.x, plan[i].size, 'group scale is the placed size, as SA.blocking reads it');
    assert.equal(SA.blocking.decorRadius(o.userData.decor), 1, 'still solid');
    assert.ok(SA.blocking.decorHeight(o.userData.decor, o.scale.x) > 0, 'still blocks below its height');
    assert.equal(o.children[0].material.color.getHexString(), plan[i].biome && SA.rocks.spec(SA.rocks.seedAt(plan[i].x, plan[i].z), plan[i].biome).color.slice(1));
  });
  const biomes = new Set(plan.map((e) => e.biome));
  assert.ok(biomes.has('montana') && biomes.has('desierto') && biomes.has('bosque'), 'rocks in forest, desert and mountain');
});
