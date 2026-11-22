import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Smoke test: build the terrain and decor with the real vendored three.js (no WebGL needed for geometry).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js',
  'game/map.js', 'game/camera.js', 'game/render/world.js', 'game/render/decor-dry.js', 'game/render/decor.js',
];

function load() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx;
}

test('buildWorld makes ground, river and pond coloured from biome data', () => {
  const ctx = load();
  const world = ctx.SA.render.buildWorld(ctx.THREE);
  assert.equal(world.children.length, 3);
  const ground = world.children[0].geometry;
  assert.ok(ground.attributes.color, 'ground has per-face colours');
  assert.ok(ground.attributes.position.count > 1000);
  const c = ground.attributes.color;
  const p = ground.attributes.position;
  let west = -1, east = -1;
  for (let i = 0; i < p.count && (west < 0 || east < 0); i += 3) {
    if (p.getX(i) < -30 && west < 0) west = i;
    if (p.getX(i) > 30 && east < 0) east = i;
  }
  assert.ok(west >= 0 && east >= 0);
  // bosque ground (#7cb86a) has a stronger red channel than selva ground (#3f8f4f)
  assert.ok(c.getX(west) > c.getX(east), 'west and east halves use different biome colours');
});

test('buildDecor places trees, rocks and flowers deterministically on dry ground', () => {
  const a = load(), b = load();
  const da = a.SA.render.buildDecor(a.THREE), db = b.SA.render.buildDecor(b.THREE);
  assert.ok(da.children.length > 50);
  assert.equal(da.children.length, db.children.length);
  assert.equal(da.children[0].position.x, db.children[0].position.x);
  for (const o of da.children) assert.ok(!a.SA.map.isWater(o.position.x, o.position.z));
});

test('buildDecor puts cacti in the desierto and snowy pines and peaks in the montaña', () => {
  const ctx = load();
  const decor = ctx.SA.render.buildDecor(ctx.THREE);
  const inBiome = (id) => decor.children.filter((o) => ctx.SA.map.biomeAt(o.position.x) === id);
  const desert = inBiome('desierto'), mountain = inBiome('montana');
  assert.ok(desert.length >= 20 && mountain.length >= 20, `${desert.length} desert, ${mountain.length} mountain objects`);
  // Cactus: a Group with a green trunk + arms; peak: a Group with a grey cone and a white cap.
  assert.ok(desert.some((o) => o.children.length >= 6), 'cacti have arms');
  const peaks = mountain.filter((o) => o.scale.x > 0.8 && o.children.length === 2 && o.children[0].geometry.parameters.height === 7);
  assert.ok(peaks.length >= 4, 'snow-capped peaks');
  // Peaks stay out of the middle band where the animals live.
  for (const p of peaks) assert.ok(Math.abs(p.position.z) > 10, `peak at z=${p.position.z}`);
});

test('buildWorld paints high montaña ground with the biome snow colour', () => {
  const ctx = load();
  const ground = ctx.SA.render.buildWorld(ctx.THREE).children[0].geometry;
  const p = ground.attributes.position, c = ground.attributes.color;
  let snowy = 0, bare = 0;
  for (let i = 0; i < p.count; i += 3) {
    if (p.getX(i) > -48) continue;
    const bright = c.getX(i) + c.getY(i) + c.getZ(i);
    if (p.getY(i) > 3.8) { snowy++; assert.ok(bright > 2.3, 'snow is near white'); } else if (p.getY(i) < 1.5) bare++;
  }
  assert.ok(snowy > 0 && bare > 0);
});

test('buildDecor still works when the dry decor module is not loaded', () => {
  const ctx = load();
  delete ctx.SA.render.dryDecor;
  const decor = ctx.SA.render.buildDecor(ctx.THREE);
  assert.ok(decor.children.length > 50);
});
