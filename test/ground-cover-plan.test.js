import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

// Ground cover (AS-0294): seeded, legal placement per biome, density that thins with distance, and soft (never an obstacle).
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/map.js', 'game/peaks.js', 'game/save.js',
  'game/station.js', 'game/player.js', 'game/ground-cover-plan.js'];

const SA = loadGame(FILES);
const G = SA.groundCoverPlan;
const B = SA.map.BOUNDS;
const BIOMES = SA.map.STRIPS.map((s) => s.id);
const plan = G.plan();

test('plan is deterministic and seeded', () => {
  assert.deepEqual(G.plan(), plan);
  assert.deepEqual(G.plan({ seed: 7 }), plan);
  assert.notDeepEqual(G.plan({ seed: 8 }), plan);
});

test('every biome has grass and plants, in its own strip', () => {
  for (const biome of BIOMES) {
    for (const kind of ['grass', 'plant']) {
      const rows = plan.filter((e) => e.biome === biome && e.kind === kind);
      assert.ok(rows.length > 100, `${biome} ${kind}: ${rows.length}`);
      for (const e of rows) assert.equal(SA.map.biomeAt(e.x), biome);
    }
  }
});

test('nothing lands in water, on the spawn, the station, a peak or out of bounds', () => {
  for (const e of plan) {
    assert.ok(e.x > B.minX && e.x < B.maxX && e.z > B.minZ && e.z < B.maxZ);
    assert.ok(!SA.map.isWater(e.x, e.z));
    assert.ok(!SA.player.inSpawnZone(e.x, e.z));
    assert.ok(!SA.station.inFootprint(e.x, e.z, 0));
    for (const p of SA.peaks.LIST) assert.ok(Math.hypot(e.x - p.x, e.z - p.z) >= SA.peaks.BASE_R);
    assert.equal(e.y, SA.map.groundHeight(e.x, e.z));
    assert.ok(e.rank >= 0 && e.rank < 1 && e.tone >= 0 && e.tone < 1 && e.scale > 0);
  }
});

test('palettes come from the biome data and differ per biome', () => {
  const seen = new Set();
  for (const biome of BIOMES) {
    const p = G.palette(biome);
    for (const kind of ['grass', 'plant']) { assert.equal(p[kind].length, 3); p[kind].forEach((h) => assert.match(h, /^#[0-9a-f]{6}$/)); }
    seen.add(p.grass[1]);
  }
  assert.equal(seen.size, BIOMES.length);
  assert.equal(G.palette('bosque').grass[1], '#7cb86a', 'forest grass is the biome ground colour');
});

test('density is highest near the player and thins with distance', () => {
  const grass = plan.filter((e) => e.biome === 'bosque' && e.kind === 'grass');
  const grid = G.makeGrid(grass);
  const out = new Int32Array(5000), px = -20, pz = -10, R = 30;
  const n = G.select(grid, px, pz, R, out);
  assert.ok(n > 50 && n < 5000);
  const bands = [0, 0, 0];   // 0-10, 10-20, 20-30 m
  for (let j = 0; j < n; j++) {
    const e = grass[out[j]], d = Math.hypot(e.x - px, e.z - pz);
    assert.ok(d < R);
    bands[Math.min(2, Math.floor(d / 10))]++;
  }
  const area = [Math.PI * 100, Math.PI * 300, Math.PI * 500];
  const dens = bands.map((b, i) => b / area[i]);
  assert.ok(dens[0] > dens[1] && dens[1] > dens[2], `densities ${dens}`);
});

test('the fixed instance pools (game/render/ground-cover.js POOL) are never overfull anywhere on the map', () => {
  const POOL = { grass: 1400, plant: 500 }, out = new Int32Array(100000), src = fs.readFileSync('game/render/ground-cover.js', 'utf8');
  assert.ok(src.includes('grass: 1400, plant: 500'), 'keep this test in step with POOL');
  for (const s of SA.map.STRIPS) for (const kind of ['grass', 'plant']) {
    const grid = G.makeGrid(plan.filter((e) => e.biome === s.id && e.kind === kind));
    let max = 0;
    for (let x = s.lo; x < s.hi; x += 4) for (let z = B.minZ; z < B.maxZ; z += 4) max = Math.max(max, G.select(grid, x, z, 30, out));
    assert.ok(max < POOL[kind] * 0.9, `${s.id} ${kind} max ${max}`);
  }
});

test('select is exact, stops when the pool is full and handles empty input', () => {
  const grass = plan.filter((e) => e.biome === 'selva' && e.kind === 'grass');
  const grid = G.makeGrid(grass), out = new Int32Array(5000);
  const n = G.select(grid, 28, 0, 20, out), expect = grass.filter((e) => Math.hypot(e.x - 28, e.z) < 20 * (1 - e.rank)).length;
  assert.equal(n, expect);
  assert.equal(G.select(grid, 28, 0, 20, new Int32Array(5)), 5);
  assert.equal(G.select(grid, 5000, 5000, 20, out), 0);
  assert.equal(G.select(G.makeGrid([]), 0, 0, 20, out), 0);
});

test('ground cover is soft: only the render module reads the plan, and decor/obstacle lists never do', () => {
  const scene = fs.readFileSync('game/render/scene.js', 'utf8');
  assert.ok(scene.includes('createGroundCover'));
  assert.ok(!/groundCover[^;]*obstacle/i.test(scene.replace(/\/\/.*$/gm, '')), 'not in obstacles');
  for (const f of ['game/blocking.js', 'game/decor-plan.js', 'game/player.js']) assert.ok(!fs.readFileSync(f, 'utf8').includes('groundCover'), f);
});

test('the sway path allocates nothing: no new THREE objects, arrays or closures in update/fill', () => {
  const src = fs.readFileSync('game/render/ground-cover.js', 'utf8');
  const body = src.slice(src.indexOf('function fill('), src.indexOf('stats:'));
  assert.ok(body.length > 200);
  assert.ok(!/new THREE\./.test(body), 'no new THREE objects');
  assert.ok(!/\[\s*[^\]\s][^\]]*\]\s*[;,)]|\bnew Array|\.map\(|\.filter\(|\{ *[a-z]+:/.test(body.replace(/\[[a-z+0-9* ]+\]/gi, '')), 'no array/object literals');
  assert.ok(src.includes('InstancedMesh') && src.includes('onBeforeCompile') && src.includes('uTime'));
});

test('index.html loads the plan before the render module, both before scene.js', () => {
  const html = fs.readFileSync('index.html', 'utf8'), at = (f) => html.indexOf(`game/${f}`);
  assert.ok(at('map.js') < at('ground-cover-plan.js') && at('player.js') < at('ground-cover-plan.js') && at('ground-cover-plan.js') < at('render/ground-cover.js'));
  assert.ok(at('render/ground-cover.js') < at('render/scene.js'));
});
