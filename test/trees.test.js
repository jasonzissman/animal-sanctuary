import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tree kinds per biome (AS-0296): 2-3 distinct kinds each, seeded + deterministic, climbable with a perch entry and canopy pad,
// solid trunks, seeded colour variation and an allocation-free canopy sway. Real vendored three.js, no WebGL needed.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/decor.js',
  'game/map.js', 'game/peaks.js', 'game/terrain-color.js', 'game/camera.js', 'game/player.js', 'game/station.js', 'game/perch.js', 'game/blocking.js', 'game/climb.js',
  'game/decor-plan.js', 'game/rocks.js', 'game/render/rocks.js', 'game/render/decor-dry.js', 'game/render/trees.js', 'game/render/decor.js'];
const ctx = vm.createContext({ console });
ctx.window = ctx; ctx.self = ctx;
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const { SA, THREE } = ctx;
const treeRow = (id) => { const r = SA.data.get('decor', id); return r && r.kind ? r : null; };

test('each biome plans 2-3 distinct tree kinds, and the plan is seeded and deterministic', () => {
  const a = SA.decorPlan.plan({ seed: 42 }), b = SA.decorPlan.plan({ seed: 42 }), c = SA.decorPlan.plan({ seed: 7 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const biome of SA.map.STRIPS.map((s) => s.id)) {
    const kinds = new Set(a.filter((e) => e.biome === biome && treeRow(e.decor)).map((e) => treeRow(e.decor).kind));
    assert.ok(kinds.size >= 2 && kinds.size <= 3, `${biome}: ${[...kinds]}`);
  }
  const want = { bosque: ['pine', 'oak', 'birch'], selva: ['jungle', 'palm', 'kapok'], desierto: ['acacia', 'yucca'], montana: ['snowpine', 'fir'] };
  for (const [biome, kinds] of Object.entries(want)) {
    const got = new Set(a.filter((e) => e.biome === biome && treeRow(e.decor)).map((e) => treeRow(e.decor).kind));
    assert.deepEqual([...got].sort(), kinds.slice().sort(), biome);
  }
});

test('plan entries carry a seeded 0..1 tint and a size variation that differ between trees', () => {
  const trees = SA.decorPlan.plan().filter((e) => treeRow(e.decor));
  for (const e of trees) assert.ok(e.tint >= 0 && e.tint < 1 && e.size >= 0.8 && e.size <= 1.4);
  assert.ok(new Set(trees.map((e) => Math.floor(e.tint * SA.render.trees.VARIANTS))).size === SA.render.trees.VARIANTS, 'every colour variant is used');
  assert.ok(new Set(trees.map((e) => e.size.toFixed(2))).size > 40);
});

test('every tree kind is built, tagged, climbable (perch entry + canopy pad) and its trunk blocks walking', () => {
  const T = SA.render.trees.create(THREE);
  const rows = SA.data.all('decor').filter((r) => r.kind);
  assert.ok(rows.length >= 9);
  for (const r of rows) {
    assert.ok(SA.perch.KINDS[r.kind], `${r.id}: SA.perch.KINDS.${r.kind}`);
    assert.ok(T.has(r.kind), `${r.id}: builder for ${r.kind}`);
    const g = T.build(r.kind, 1, 0.5);
    assert.equal(g.userData.tree, true);
    assert.equal(g.userData.kind, r.kind);
    const pads = g.children.filter((o) => o.geometry && o.geometry.type === 'CylinderGeometry' && Math.abs(o.position.y - (SA.perch.KINDS[r.kind].height - 0.07)) < 1e-9);
    assert.equal(pads.length, 1, `${r.id}: one canopy pad at the perch height`);
    assert.ok(SA.blocking.decorRadius(r.id) > 0, `${r.id} blocks the player`);
    assert.equal(SA.blocking.decorHeight(r.id, 1), 0, `${r.id} always blocks (no jump-over height)`);
    const t = SA.climb.fromTree({ x: 5, z: 5, y: 0, scale: 1, kind: r.kind });
    assert.equal(t.topY, SA.perch.KINDS[r.kind].height, `${r.id}: climb top = the perch height`);
  }
});

test('buildDecor places every kind with userData.tree, a matching kind and the decor id', () => {
  const decor = SA.render.buildDecor(THREE);
  const seen = new Set();
  for (const o of decor.children) {
    const row = treeRow(o.userData.decor);
    if (!row) { assert.ok(!o.userData.tree, `${o.userData.decor} is no tree`); continue; }
    assert.equal(o.userData.tree, true);
    assert.equal(o.userData.kind, row.kind);
    seen.add(row.kind);
  }
  assert.equal(seen.size, SA.data.all('decor').filter((r) => r.kind).length, 'every kind appears in the world');
});

test('colour variation: a few shared leaf materials per kind, different tints give different colours', () => {
  const T = SA.render.trees.create(THREE);
  const leafOf = (tint) => { const g = T.build('oak', 1, tint); return g.userData.foliage.children[0].material; };
  const a = leafOf(0.05), b = leafOf(0.95), a2 = leafOf(0.06);
  assert.notEqual(a.color.getHex(), b.color.getHex());
  assert.equal(a, a2, 'the same variant shares one material');
});

test('canopy sway: small, moves the foliage, and update() adds no nodes (preallocated)', () => {
  const T = SA.render.trees.create(THREE);
  const gs = ['pine', 'palm', 'yucca'].map((k, i) => T.build(k, 1, i / 3));
  assert.equal(T.swayCount(), 3);
  const f = gs[0].userData.foliage;
  let moved = false, max = 0;
  for (let i = 0; i < 200; i++) {
    T.update(0.05);
    max = Math.max(max, Math.abs(f.rotation.z), Math.abs(f.rotation.x));
    if (Math.abs(f.rotation.z) > 1e-4) moved = true;
  }
  assert.ok(moved && max < 0.08, `sways slightly (max ${max})`);
  assert.equal(T.swayCount(), 3);
  const src = fs.readFileSync(path.join(ROOT, 'game/render/trees.js'), 'utf8');
  const upd = src.slice(src.indexOf('function update(dt)'), src.indexOf('return { has:'));
  assert.ok(!/\bnew\b|\[\s*\]|\{\s*\w+:|function\s*\(/.test(upd.replace('function update(dt)', '')), 'update() never allocates');
});

test('buildDecor still works without the trees module (rocks, flowers, cacti only)', () => {
  delete SA.render.trees;
  const decor = SA.render.buildDecor(THREE);
  assert.ok(decor.children.length > 50);
  assert.ok(!decor.children.some((o) => o.userData.tree));
  decor.userData.update(0.016);
});
