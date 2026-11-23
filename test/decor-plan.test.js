import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// Decor plan + pickup layout over the whole 2x map (AS-0248): every quadrant of every biome is filled, nothing is out of bounds, wet or on the spawn/station.
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/data/foods.js', 'game/data/items.js', 'game/map.js', 'game/peaks.js', 'game/save.js', 'game/station.js', 'game/player.js', 'game/perch.js',
  'game/inventory.js', 'game/data/pickups.js', 'game/pickups.js', 'game/decor-plan.js'];

const SA = loadGame(FILES);
const B = SA.map.BOUNDS;
const BIOMES = SA.map.STRIPS.map((s) => s.id);

function legal(x, z, what) {
  assert.ok(x > B.minX && x < B.maxX && z > B.minZ && z < B.maxZ, `${what} inside BOUNDS (${x}, ${z})`);
  assert.ok(!SA.map.isWater(x, z), `${what} not in water (${x}, ${z})`);
  assert.ok(!SA.player.inSpawnZone(x, z), `${what} outside the spawn clearing (${x}, ${z})`);
  assert.ok(!SA.station.inFootprint(x, z, 0), `${what} outside the station (${x}, ${z})`);
}

// Trees as scene.js derives them from the decor.
function treesOf(plan) {
  return plan.filter((e) => e.decor === 'pino' || e.decor === 'jungle').map((e) => ({ x: e.x, z: e.z, y: e.y, scale: e.size, kind: e.decor === 'pino' ? 'pine' : 'jungle' }));
}

test('decor plan is deterministic and seeded', () => {
  const a = SA.decorPlan.plan({ seed: 42 }), b = SA.decorPlan.plan({ seed: 42 }), c = SA.decorPlan.plan({ seed: 43 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('decor plan: every quadrant of every biome has decor, and it is all legal', () => {
  const plan = SA.decorPlan.plan();
  for (const biome of BIOMES) {
    const seen = new Set();
    for (const e of plan.filter((p) => p.biome === biome)) {
      assert.equal(SA.map.biomeAt(e.x), biome, 'stays in its strip');
      seen.add(SA.decorPlan.quadrant(biome, e.x, e.z));
    }
    assert.deepEqual([...seen].sort(), [0, 1, 2, 3], `${biome}: all four quadrants have decor`);
  }
  for (const e of plan) legal(e.x, e.z, e.decor);
});

test('decor plan: about twice the old density, spread over the full z range and strip width', () => {
  const plan = SA.decorPlan.plan();
  assert.ok(plan.length >= 250, `${plan.length} items`);
  for (const biome of BIOMES) {
    const mine = plan.filter((p) => p.biome === biome), r = SA.map.biomeRange(biome);
    assert.ok(Math.min(...mine.map((p) => p.z)) < -26 && Math.max(...mine.map((p) => p.z)) > 26, `${biome} reaches the north and south edges`);
    assert.ok(Math.max(...mine.map((p) => p.x)) - Math.min(...mine.map((p) => p.x)) > (r.hi - r.lo) * 0.8, `${biome} spans its strip`);
  }
});

test('decor plan: items keep their gap and every id has decor data', () => {
  const plan = SA.decorPlan.plan(), ids = new Set(SA.decorPlan.RULES.map((r) => r.decor));
  for (const id of ids) assert.ok(plan.some((e) => e.decor === id), id);
  for (let i = 0; i < plan.length; i++) for (let j = i + 1; j < plan.length; j++) {
    assert.ok(Math.hypot(plan[i].x - plan[j].x, plan[i].z - plan[j].z) >= 1.5, 'no two items overlap');
  }
});

test('pickups: every quadrant of every biome has a find, none out of bounds, in water or on the spawn/station', () => {
  const plan = SA.decorPlan.plan();
  const avoid = plan.map((e) => [e.x, e.z]).concat(SA.station.avoidPoints());
  const spots = SA.pickups.layout({ trees: treesOf(plan), avoid, seed: 80 });
  for (const biome of BIOMES) {
    const r = SA.map.biomeRange(biome), seen = new Set();
    for (const s of spots.filter((p) => p.biome === biome)) seen.add((s.x >= r.centerX ? 1 : 0) | (s.z >= 0 ? 2 : 0));
    assert.deepEqual([...seen].sort(), [0, 1, 2, 3], `${biome}: all four quadrants have a pickup`);
  }
  for (const s of spots) legal(s.x, s.z, s.id);
  for (const rule of SA.data.all('pickups')) for (const biome of rule.biomes) {
    assert.equal(spots.filter((s) => s.rule === rule.id && s.biome === biome).length, rule.count, rule.id + ' in ' + biome);
  }
});
