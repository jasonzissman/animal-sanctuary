import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadGame } from './helpers/vm.js';

// Forest streams (AS-0301): seeded pure layout that ends in the river, crosses a forest path at a stepping-stone ford, and animals keep out of it.
const BASE = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/map.js', 'game/peaks.js', 'game/save.js',
  'game/station.js', 'game/player.js', 'game/forest-paths.js'];
const SA = loadGame([...BASE, 'game/forest-streams.js', 'game/wander.js', 'game/decor-plan.js', 'game/ground-cover-plan.js']);
const FS = SA.forestStreams, FP = SA.forestPaths, M = SA.map;
const bosque = M.biomeRange('bosque');

test('layout returns 1-2 streams that start dry in the bosque and end in the river', () => {
  const list = FS.layout();
  assert.ok(list.length >= 1 && list.length <= 2, `streams: ${list.length}`);
  for (const s of list) {
    assert.ok(s.points.length >= 12, s.id);
    s.points.forEach(([x, z], i) => {
      assert.ok(x > bosque.lo && x < bosque.hi && z > M.BOUNDS.minZ && z < M.BOUNDS.maxZ, `${s.id} outside the bosque at ${x},${z}`);
      if (i < s.points.length - 2) assert.ok(!M.isWater(x, z), `${s.id} point ${i} is in the river`);
      assert.ok(!SA.player.inSpawnZone(x, z) && !SA.station.inFootprint(x, z), `${s.id} on the spawn/station`);
    });
    const [lx, lz] = s.points[s.points.length - 1];
    assert.ok(M.isWater(lx, lz), `${s.id} does not end in the river`);
    assert.ok(Math.abs(lx - M.riverX(lz)) < M.RIVER.halfWidth, `${s.id} ends away from the river centre`);
  }
});

test('layout is deterministic per seed, and the seed changes it', () => {
  assert.deepEqual(FS.layout(), FS.layout());
  assert.deepEqual(FS.layout(FS.SEED), FS.streams());
  assert.notDeepEqual(FS.layout(FS.SEED + 1), FS.layout());
  for (const seed of [1, 2, 3, 4, 9, 21]) assert.ok(FS.layout(seed).length >= 1, `seed ${seed} gave no stream`);
});

test('each stream crosses a forest path at its ford, and stepping stones span the water there', () => {
  assert.ok(FP.paths().length >= 2);
  for (const s of FS.streams()) {
    assert.ok(FP.onPath(s.ford.x, s.ford.z, 0.3), `${s.id} ford is off every path`);
    assert.ok(FS.inWater(s.ford.x, s.ford.z), `${s.id} ford is not in the water`);
    const near = s.stones.filter((t) => Math.hypot(t.x - s.ford.x, t.z - s.ford.z) < 2);
    assert.ok(near.length >= 4, `${s.id} ford stones: ${near.length}`);
    assert.ok(s.stones.length > near.length, `${s.id} has no stones further along`);
    for (const t of s.stones) {
      assert.ok(FS.inWater(t.x, t.z, 0.2), `${s.id} stone beside the water at ${t.x},${t.z}`);
      assert.ok(t.r > 0.2 && t.r < 0.5 && t.h > 0.2 && t.h < 0.5);
    }
  }
});

test('stones are low solids [x, z, r, h]: a hop clears them and the player may stand on top', () => {
  const solids = FS.stoneSolids();
  assert.equal(solids.length, FS.streams().reduce((n, s) => n + s.stones.length, 0));
  const [x, z, r, h] = solids[0];
  assert.ok(h > 0);
  assert.equal(SA.player.floorAt(x, z, solids, 0), 0, 'a walker is not on top');
  const top = SA.player.floorAt(x, z, solids, h);
  assert.ok(top >= h && top < 0.4, 'a jumper at the stone top stands on it');
});

test('stream water: inWater matches the width, is false far away, and allocates a stable answer', () => {
  const s = FS.streams()[0], mid = s.points[Math.floor(s.points.length / 2)];
  assert.ok(FS.inWater(mid[0], mid[1]));
  assert.ok(FS.distance(mid[0], mid[1]) < 1e-6);
  assert.ok(!FS.inWater(mid[0], mid[1] + 8) || FS.distance(mid[0], mid[1] + 8) < FS.HALF_MAX);
  assert.equal(FS.distance(-100, 30), Infinity);
  assert.ok(!FS.inWater(-100, 30));
  assert.ok(FS.halfWidth(0) < FS.halfWidth(1));
});

test('wandering animals never pick a target (or step) inside stream water', () => {
  for (const s of FS.streams()) {
    const mid = s.points[Math.floor(s.points.length / 2)];
    // Home: a dry spot about 2.5 m from the water, so the 6 m wander circle covers the stream.
    let home = null;
    for (let a = 0; a < 6.28 && !home; a += 0.3) {
      const x = mid[0] + Math.cos(a) * 2.5, z = mid[1] + Math.sin(a) * 2.5;
      if (!FS.inWater(x, z, 0.5) && !M.isWater(x, z) && M.biomeAt(x) === 'bosque' && M.groundHeight(x, z) > M.WATER_LEVEL + 0.5) home = { x, z };
    }
    assert.ok(home, `${s.id}: no dry home beside the stream`);
    for (const seed of [1, 2, 3, 4]) {
      const w = SA.wander.create({ movement: 'corre', biome: 'bosque', home, radius: 6, seed });
      let travelled = 0, px = home.x, pz = home.z;
      for (let i = 0; i < 6000; i++) {
        const p = w.update(0.05);
        travelled += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z;
        assert.ok(!FS.inWater(p.x, p.z, 0), `${s.id} seed ${seed}: animal in stream at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
      }
      assert.ok(travelled > 5, `${s.id} seed ${seed}: the animal never moved (${travelled.toFixed(1)} m)`);
    }
  }
});

test('scenery planners skip the stream water', () => {
  for (const d of SA.decorPlan.plan()) assert.ok(!FS.inWater(d.x, d.z, 0.5), `decor in the stream at ${d.x},${d.z}`);
  for (const g of SA.groundCoverPlan.plan())assert.ok(!FS.inWater(g.x, g.z), `plant in the stream at ${g.x},${g.z}`);
});

test('scripts load in order and the renderer is wired in', () => {
  const html = fs.readFileSync('index.html', 'utf8'), man = fs.readFileSync('game/manifest.js', 'utf8');
  const at = (t, f) => t.indexOf(f);
  for (const t of [html, man]) {
    assert.ok(at(t, 'game/forest-paths.js') < at(t, 'game/forest-streams.js') && at(t, 'game/forest-streams.js') < at(t, 'game/decor-plan.js'));
    assert.ok(at(t, 'game/forest-streams.js') < at(t, 'game/wander.js') && at(t, 'game/render/world.js') < at(t, 'game/render/forest-streams.js'));
    assert.ok(at(t, 'game/render/forest-streams.js') < at(t, 'game/render/scene.js'));
  }
  const scene = fs.readFileSync('game/render/scene.js', 'utf8');
  assert.ok(scene.includes('createForestStreams') && scene.includes('stoneSolids'));
  const renderer = fs.readFileSync('game/render/forest-streams.js', 'utf8');
  assert.ok(renderer.includes('applyWaterWave') && renderer.includes('InstancedMesh'));
  assert.ok(fs.readFileSync('game/wander.js', 'utf8').includes('forestStreams'));
});

test('with the real three.js: one water ribbon on the wave shader and one InstancedMesh of stones build', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...BASE, 'game/forest-streams.js', 'game/terrain-color.js', 'game/render/world.js', 'game/render/forest-streams.js']) {
    vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  }
  const { THREE } = ctx, world = ctx.SA.render.buildWorld(THREE), scene = new THREE.Scene();
  const r = ctx.SA.render.createForestStreams(THREE, { scene, world });
  const st = r.stats(), streams = ctx.SA.forestStreams.streams();
  assert.equal(st.streams, streams.length);
  assert.equal(st.stones, streams.reduce((n, s) => n + s.stones.length, 0));
  assert.ok(st.waterTriangles > 60);
  const [water, stones] = r.meshes;
  assert.equal(water.name, 'forest-stream-water');
  assert.ok(stones.isInstancedMesh && stones.count === st.stones);
  assert.ok(scene.children.includes(r.group));
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' };
  water.material.onBeforeCompile(shader);
  assert.ok(shader.uniforms.uTime === world.userData.uTime && /sin\(/.test(shader.vertexShader), 'the stream rides the shared water wave');
  // Every ribbon vertex floats just above the terrain (never under it, never high above it).
  const p = water.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const lift = p.getY(i) - ctx.SA.map.groundHeight(p.getX(i), p.getZ(i));
    assert.ok(lift > 0.05 && lift < 0.2, `ribbon lift ${lift}`);
  }
});
