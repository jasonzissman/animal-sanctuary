import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// Forest dirt paths (AS-0300): seeded pure layout inside the bosque, lighter ground, and no plants/trees on the paths.
const BASE = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/map.js', 'game/peaks.js', 'game/save.js',
  'game/station.js', 'game/player.js'];
const SA = loadGame([...BASE, 'game/forest-paths.js', 'game/terrain-color.js', 'game/decor-plan.js', 'game/ground-cover-plan.js']);
const FP = SA.forestPaths;
const M = SA.map;
const bosque = M.biomeRange('bosque');

test('layout returns 2-3 paths, all inside the bosque and on dry ground, clear of the spawn and station', () => {
  const list = FP.layout();
  assert.ok(list.length >= 2 && list.length <= 3, `paths: ${list.length}`);
  for (const p of list) {
    assert.ok(p.width > 1 && p.points.length > 10, p.id);
    for (const [x, z] of p.points) {
      assert.ok(x > bosque.lo && x < bosque.hi, `${p.id} x=${x}`);
      assert.ok(z > M.BOUNDS.minZ && z < M.BOUNDS.maxZ, `${p.id} z=${z}`);
      assert.ok(M.groundHeight(x, z) > M.WATER_LEVEL + 0.15,`${p.id} wet at ${x},${z}`);
      assert.ok(!SA.player.inSpawnZone(x, z) && !SA.station.inFootprint(x, z), `${p.id} blocks spawn/station at ${x},${z}`);
    }
  }
});

test('layout is deterministic per seed and the seed changes it', () => {
  assert.deepEqual(FP.layout(), FP.layout());
  assert.deepEqual(FP.layout(FP.SEED), FP.paths());
  assert.notDeepEqual(FP.layout(FP.SEED + 1), FP.layout());
});

test('paths wind (they are not straight lines)', () => {
  for (const p of FP.paths()) {
    const xs = p.points.map((q) => q[0]), zs = p.points.map((q) => q[1]);
    const spread = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    assert.ok(spread > 1.5, `${p.id} spread ${spread}`);
  }
});

test('distance / onPath / strength agree with the polylines', () => {
  const p = FP.paths()[0], [x, z] = p.points[5];
  assert.ok(FP.distance(x, z) < 1e-9);
  assert.ok(FP.onPath(x, z) && FP.strength(x, z) === 1);
  assert.equal(FP.distance(100, 0), Infinity);
  assert.ok(!FP.onPath(100, 0) && FP.strength(100, 0) === 0);
  // Far from every centre line: not on a path, no dirt.
  let far = null;
  for (let fx = bosque.lo; fx < bosque.hi && !far; fx += 1) if (FP.distance(fx, 0) > 6) far = fx;
  assert.ok(far !== null && !FP.onPath(far, 0) && FP.strength(far, 0) === 0);
  // The dirt is full inside the strip and fades smoothly to nothing over FADE metres beyond its edge.
  const rand = M.rng(3);
  let faded = 0;
  for (let i = 0; i < 400; i++) {
    const px = bosque.lo + rand() * 56, pz = M.BOUNDS.minZ + rand() * 72, d = FP.distance(px, pz), s = FP.strength(px, pz);
    if (d <= FP.WIDTH / 2) assert.equal(s, 1);
    else if (d >= FP.WIDTH / 2 + FP.FADE) assert.equal(s, 0);
    else { assert.ok(s > 0 && s < 1); faded++; }
  }
  assert.ok(faded > 0);
});

test('the ground is lighter dirt on the path than on the grass beside it', () => {
  const lum = (c) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
  let onSum = 0, offSum = 0, n = 0;
  for (const p of FP.paths()) {
    for (const [x, z] of p.points) {
      const on = SA.terrain.groundColor(x, z, M.groundHeight(x, z), 7);
      const off = FP.distance(x + 6, z) > 4 ? SA.terrain.groundColor(x + 6, z, M.groundHeight(x + 6, z), 7) : null;
      if (!off) continue;
      onSum += lum(on); offSum += lum(off); n++;
      assert.ok(on.r > on.g * 0.9 && on.r > on.b, 'path ground is brownish (red >= green > blue)');
    }
  }
  assert.ok(n > 10);
  assert.ok(onSum / n > offSum / n + 0.04, `path ${onSum / n} vs grass ${offSum / n}`);
});

test('decor, grass and plants stay off the paths', () => {
  const decor = SA.decorPlan.plan();
  for (const d of decor) assert.ok(!FP.onPath(d.x, d.z), `${d.decor} at ${d.x},${d.z}`);
  assert.ok(decor.filter((d) => d.biome === 'bosque').length > 40, 'the forest is still full of trees');
  const cover = SA.groundCoverPlan.plan();
  for (const e of cover) assert.ok(!FP.onPath(e.x, e.z), `${e.kind} ${e.plant || ''} at ${e.x},${e.z}`);
  for (const e of cover.filter((c) => c.plant)) assert.ok(!FP.onPath(e.x, e.z, 0.7), `plant ${e.plant} hugs a path`);
  assert.ok(cover.filter((c) => c.biome === 'bosque').length > 1000);
});

test('without the module the planners and colours still work', () => {
  const bare = loadGame([...BASE, 'game/terrain-color.js', 'game/decor-plan.js', 'game/ground-cover-plan.js']);
  assert.ok(bare.decorPlan.plan().length > 100 && bare.groundCoverPlan.plan().length > 1000);
  assert.ok(Number.isFinite(bare.terrain.groundColor(-30, 0, 0, 7).r));
});
