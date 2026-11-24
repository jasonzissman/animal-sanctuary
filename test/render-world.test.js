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
  'game/map.js', 'game/peaks.js', 'game/terrain-color.js', 'game/camera.js', 'game/player.js', 'game/render/world.js', 'game/decor-plan.js', 'game/render/decor-dry.js', 'game/render/trees.js', 'game/render/decor.js',
  'game/data/decor.js', 'game/perch.js',
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

test('buildDecor leaves the spawn circle clear of trees, rocks and flowers', () => {
  const ctx = load();
  const decor = ctx.SA.render.buildDecor(ctx.THREE);
  const P = ctx.SA.player, s = P.spawn();
  for (const o of decor.children) {
    assert.ok(Math.hypot(o.position.x - s.x, o.position.z - s.z) >= P.SPAWN_CLEAR, `decor at ${o.position.x}, ${o.position.z}`);
  }
});

test('buildDecor puts cacti in the desierto and snowy pines and peaks in the montaña', () => {
  const ctx = load();
  const decor = ctx.SA.render.buildDecor(ctx.THREE);
  const inBiome = (id) => decor.children.filter((o) => ctx.SA.map.biomeAt(o.position.x) === id);
  const desert = inBiome('desierto'), mountain = inBiome('montana');
  assert.ok(desert.length >= 20 && mountain.length >= 20, `${desert.length} desert, ${mountain.length} mountain objects`);
  // Cactus: a Group with a green trunk + arms; peak (AS-0193): a Group with a grey flat-topped cone and a white flat cap, one per data row.
  assert.ok(desert.some((o) => o.children.length >= 6), 'cacti have arms');
  const peaks = mountain.filter((o) => o.userData.peak);
  assert.equal(peaks.length, ctx.SA.peaks.LIST.length, 'a peak mesh for every SA.peaks row');
  for (const p of peaks) {
    assert.equal(p.children.length, 2);
    const shape = ctx.SA.peaks.shape(ctx.SA.peaks.LIST.find((r) => r.id === p.userData.peak));
    assert.ok(Math.abs(p.position.y - shape.baseY) < 1e-9);
    assert.ok(p.children[1].geometry.parameters.radiusTop > 1.4, 'flat summit wide enough to hide the 1.4 terrain plateau');
    assert.equal(p.userData.decor, 'pico');
    // Peaks stay out of the middle band where the animals live.
    assert.ok(Math.abs(p.position.z) > 10, `peak at z=${p.position.z}`);
  }
});

test('buildWorld paints high montaña ground with the biome snow colour', () => {
  const ctx = load();
  const ground = ctx.SA.render.buildWorld(ctx.THREE).children[0].geometry;
  const p = ground.attributes.position, c = ground.attributes.color;
  let snowy = 0, bare = 0;
  for (let i = 0; i < p.count; i += 3) {
    if (p.getX(i) > -48) continue;
    const bright = c.getX(i) + c.getY(i) + c.getZ(i);
    const cy = p.getY(i);   // per-vertex paint (AS-0291): colour follows the vertex's own height
    if (cy > 3.9) { snowy++; assert.ok(bright > 2.3, 'snow is near white'); } else if (cy < 1.5) bare++;
  }
  assert.ok(snowy > 0 && bare > 0);
});

test('buildDecor still works when the dry decor module is not loaded', () => {
  const ctx = load();
  delete ctx.SA.render.dryDecor;
  const decor = ctx.SA.render.buildDecor(ctx.THREE);
  assert.ok(decor.children.length > 50);
});
