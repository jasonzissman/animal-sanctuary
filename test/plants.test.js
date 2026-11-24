import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadGame } from './helpers/vm.js';

// Biome ground plants (AS-0295): validated data, per-biome sets, soft by construction, merged-geometry shapes (real three.js r128 in a vm).
const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/decor.js', 'game/data/plants.js',
  'game/map.js', 'game/render/plant-shapes.js']);
const PLANTS = SA.data.all('plant');
const BIOMES = SA.map.STRIPS.map((s) => s.id);
const ok = { id: 'x', biome: 'bosque', family: 'bush', shape: 'bush', count: 50, scale: [0.8, 1.2], tints: ['#112233', '#223344', '#334455'], sway: 0.1 };

test('every biome has its own plant set; ids are unique and biomes real', () => {
  assert.equal(new Set(PLANTS.map((p) => p.id)).size, PLANTS.length);
  for (const b of BIOMES) assert.ok(PLANTS.filter((p) => p.biome === b).length >= 2, `${b} has at least two plants`);
  for (const p of PLANTS) assert.ok(BIOMES.includes(p.biome), p.id);
});

test('bosque has bushes and ferns, selva big leaves and vines, desierto dry shrubs and 2+ cactus shapes, montana flowers and low pines', () => {
  const fam = (b) => PLANTS.filter((p) => p.biome === b).map((p) => p.family);
  assert.ok(['bush', 'fern'].every((f) => fam('bosque').includes(f)));
  assert.ok(['bigleaf', 'vine'].every((f) => fam('selva').includes(f)));
  assert.ok(fam('desierto').includes('shrub'));
  const cacti = PLANTS.filter((p) => p.biome === 'desierto' && p.family === 'cactus');
  assert.ok(cacti.length >= 2 && new Set(cacti.map((p) => p.shape)).size === cacti.length, 'distinct cactus shapes');
  assert.ok(['flower', 'pine'].every((f) => fam('montana').includes(f)));
});

test('plants vary in size and colour', () => {
  for (const p of PLANTS) {
    assert.ok(p.scale[1] > p.scale[0], `${p.id} has a size range`);
    assert.notEqual(p.tints[0], p.tints[2], `${p.id} has a colour range`);
  }
});

test('the validator rejects bad plants with a clear error', () => {
  const bad = (patch, field) => assert.throws(() => SA.data.register('plant', [{ ...ok, ...patch }]), new RegExp(field));
  bad({ id: 'Bad1' }, 'id');
  bad({ family: 'tree' }, 'family');
  bad({ shape: 3 }, 'shape');
  bad({ count: 5 }, 'count');
  bad({ count: 10.5 }, 'count');
  bad({ scale: [1.5, 1] }, 'scale');
  bad({ scale: [1] }, 'scale');
  bad({ tints: ['#112233', '#223344'] }, 'tints');
  bad({ tints: ['#112233', '#223344', '#112233'] }, 'tints');
  bad({ tints: ['red', 'green', 'blue'] }, 'tints');
  bad({ sway: 0.9 }, 'sway');
  bad({ biome: 'Bosque' }, 'biome');
  bad({ solid: true, radius: 1 }, 'soft');
  assert.doesNotThrow(() => SA.data.register('plant', [{ ...ok, id: 'okplant' }]));
});

test('plants are soft: no solid or radius on any row, and none is a blocking decor id', () => {
  const decor = SA.data.all('decor').map((d) => d.id);
  for (const p of PLANTS) {
    assert.equal(p.solid, undefined); assert.equal(p.radius, undefined);
    assert.ok(!decor.includes(p.id), `${p.id} must not shadow a decor id`);
  }
  for (const f of ['game/blocking.js', 'game/decor-plan.js', 'game/player.js', 'game/render/decor.js']) {
    assert.ok(!/groundCover|plantShapes|data\('plant'\)|all\('plant'\)/.test(fs.readFileSync(f, 'utf8')), `${f} never sees ground plants`);
  }
});

test('every plant shape has a builder and builds one non-empty merged geometry', () => {
  const ctx = vm.createContext({ console }); ctx.window = ctx; ctx.self = ctx;
  vm.runInContext(fs.readFileSync('game/vendor/three.min.js', 'utf8'), ctx);
  const THREE = ctx.THREE, S = SA.render.plantShapes;
  for (const p of PLANTS) assert.equal(typeof S.SHAPES[p.shape], 'function', `${p.id} -> ${p.shape}`);
  for (const [name, build] of Object.entries(S.SHAPES).concat([['grass', (T) => S.grass(T)]])) {
    const g = build(THREE);
    assert.ok(g.attributes.position.count > 12 && g.attributes.position.count % 3 === 0, name);
    assert.equal(g.attributes.color.count, g.attributes.position.count, name);
    assert.equal(g.index, null, `${name} is one merged non-indexed geometry`);
    g.computeBoundingBox();
    const h = g.boundingBox.max.y - g.boundingBox.min.y;
    assert.ok(h > 0.2 && h < 2, `${name} height ${h}`);
    for (const v of g.attributes.position.array) assert.ok(Number.isFinite(v), name);
  }
});

test('the renderer instances every plant and shares the grass sway; load order is right', () => {
  const src = fs.readFileSync('game/render/ground-cover.js', 'utf8'), html = fs.readFileSync('index.html', 'utf8');
  assert.ok(src.includes('InstancedMesh') && src.includes('onBeforeCompile') && src.includes('uTime') && src.includes('P.plants()'));
  assert.ok(!/SA\.render\.plantShapes\.SHAPES\.(bush|fern)|'(bosque|selva|desierto|montana)'/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'no biome ids in engine code');
  const at = (f) => html.indexOf(`game/${f}`);
  assert.ok(at('data/plants.js') > 0 && at('data/plants.js') < at('ground-cover-plan.js'));
  assert.ok(at('render/plant-shapes.js') < at('render/ground-cover.js'));
});
