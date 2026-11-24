// AS-0390: the selva's dense big-leaf undergrowth: seeded plan with clear corridors, soft (no colliders), instanced rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const BASE = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/mountain-trail.js', 'game/map.js',
  'game/peaks.js', 'game/save.js', 'game/station.js', 'game/player.js', 'game/forest-streams.js', 'game/forest-paths.js', 'game/fallen-logs.js', 'game/surfaces.js',
  'game/lookouts.js', 'game/perch.js', 'game/climb.js', 'game/jungle-plan.js', 'game/jungle-undergrowth-plan.js'];
const SA = loadGame(BASE);
const M = SA.map, JP = SA.junglePlan, U = JP.undergrowthGet(), HALF = JP.CORRIDOR_HALF;
const giants = JP.get().giants;

test('a seeded plan: the same for the same seed, different for another, and dense', () => {
  assert.deepEqual(JP.undergrowth(), U);
  assert.notDeepEqual(JP.undergrowth(5).plants.map((p) => p.x), U.plants.map((p) => p.x));
  assert.ok(U.plants.length >= 300, 'dense: ' + U.plants.length);
  assert.ok(U.plants.some((p) => p.kind === 'fern') && U.plants.some((p) => p.kind === 'bigleaf'));
  const range = M.biomeRange('selva');
  for (const p of U.plants) {
    assert.ok(p.x > range.lo && p.x < range.hi && M.biomeAt(p.x) === 'selva');
    assert.ok(p.scale >= 1 && p.tone >= 0 && p.tone <= 1 && Math.abs(p.y - M.groundHeight(p.x, p.z)) < 1e-9);
  }
});

test('plants never stand on water, the spawn, the station, bridges, lookouts, streams, forest paths, trunks or the waterfall', () => {
  const W = JP.get().waterfall;
  for (const p of U.plants) {
    assert.ok(!M.nearWater(p.x, p.z, 0), `water at ${p.x},${p.z}`);
    assert.ok(!SA.player.inSpawnZone(p.x, p.z) && !SA.station.inFootprint(p.x, p.z, 0), 'spawn/station');
    assert.ok(!SA.lookouts.near(p.x, p.z, 0) && !SA.surfaces.near(p.x, p.z, 0), 'lookout/bridge');
    assert.ok(!SA.forestStreams.inWater(p.x, p.z, 0) && !SA.forestPaths.onPath(p.x, p.z, 0) && !SA.fallenLogs.near(p.x, p.z, 0), 'stream/path/log');
    assert.ok(!JP.near(p.x, p.z, 0), 'trunk/waterfall');
    if (W) assert.ok(Math.hypot(p.x - W.cx, p.z - W.cz) > W.r, 'waterfall footprint');
  }
});

test('clear corridors join the entrance to every giant tree, the pond and the waterfall, and no plant stands in one', () => {
  const ids = U.anchors.map((a) => a.id);
  assert.ok(ids.includes('entrada') && ids.includes('estanque') && ids.includes('cascada'));
  for (const g of giants) assert.ok(ids.includes(g.id), g.id);
  assert.equal(U.corridors.length, U.anchors.length - 1, 'a spanning tree');
  // Every anchor is reachable from the entrance along the corridors.
  const seen = new Set(['entrada']);
  for (let again = true; again;) { again = false; for (const c of U.corridors) if (seen.has(c.a) !== seen.has(c.b)) { seen.add(c.a); seen.add(c.b); again = true; } }
  assert.equal(seen.size, U.anchors.length, 'every landmark is connected');
  // Walk along every corridor: nothing grows within its half-width.
  for (const c of U.corridors) {
    assert.equal(c.half, HALF);
    const len = Math.hypot(c.bx - c.ax, c.bz - c.az);
    for (let i = 0; i <= 40; i++) {
      const x = c.ax + (c.bx - c.ax) * i / 40, z = c.az + (c.bz - c.az) * i / 40;
      for (const p of U.plants) assert.ok(Math.hypot(p.x - x, p.z - z) >= HALF, `${c.a}->${c.b} blocked at ${i}/40 (len ${len.toFixed(1)})`);
    }
  }
  for (const p of U.plants) assert.ok(JP.corridorDistance(p.x, p.z) >= HALF);
  // The walks go round the pond, not through it.
  for (const c of U.corridors) {
    for (let i = 0; i <= 20; i++) {
      const x = c.ax + (c.bx - c.ax) * i / 20, z = c.az + (c.bz - c.az) * i / 20;
      assert.ok(Math.hypot(x - M.POND.x, z - M.POND.z) > M.POND.radius - 0.5, `${c.a}->${c.b} wades through the pond`);
    }
  }
  // A ring of open ground round each trunk.
  for (const g of giants) for (const p of U.plants) assert.ok(Math.hypot(p.x - g.x, p.z - g.z) > g.solidR + 1.5);
});

test('the undergrowth adds no colliders: solids are unchanged and the player walks straight through a dense patch', () => {
  assert.equal(JP.solids().length, giants.length + JP.get().waterfall.cliffSolids.length, 'only trunks and the cliff');
  assert.equal(JP.avoidPoints().length, giants.length + 1);
  const solids = JP.solids();
  // Pick the plant whose patch is densest, face it and walk 6 m through it with the real obstacle list.
  const dense = U.plants.map((p) => ({ p, n: U.plants.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 2).length })).sort((a, b) => b.n - a.n)[0].p;
  assert.ok(dense && solids.every(([x, z, r]) => Math.hypot(x - dense.x, z - dense.z) > r + 3), 'no trunk beside it');
  let s = { x: dense.x - 3, z: dense.z, heading: Math.PI / 2 };   // heading PI/2 walks toward +x
  for (let i = 0; i < 30; i++) s = SA.player.step(s, { forward: 1 }, 0.05, solids);
  assert.ok(s.x > dense.x + 1, `walked through the patch: ${s.x} vs ${dense.x}`);
  assert.ok(Math.abs(s.z - dense.z) < 0.01, 'never pushed aside');
});

test('the renderer builds two shared InstancedMeshes, adds no collider and allocates nothing per frame (stub THREE)', () => {
  const log = { inst: [], allocs: 0 };
  class V { set() { return this; } }
  class Obj { constructor() { log.allocs++; this.position = new V(); this.rotation = new V(); this.scale = new V(); this.matrix = {}; this.children = []; } updateMatrix() {} add(o) { this.children.push(o); } }
  class Color { set() { return this; } lerpColors() { return this; } }
  class Inst extends Obj { constructor(g, m, n) { super(); Object.assign(this, { count: n, geometry: g, material: m, instanceMatrix: {} }); log.inst.push(this); } setMatrixAt() {} setColorAt() { this.instanceColor = {}; } }
  const T = { Group: Obj, Object3D: Obj, Color, InstancedMesh: Inst, MeshPhongMaterial: class { constructor(o) { Object.assign(this, o); } } };
  const R = loadGame([...BASE, 'game/render/jungle-undergrowth.js']);
  R.render.plantShapes = { SHAPES: { fern: () => ({ id: 'fern' }), bigleaf: () => ({ id: 'bigleaf' }) } };
  const scene = new Obj(), view = R.render.createJungleUndergrowth(T, { scene });
  assert.deepEqual(scene.children, [view.group]);
  assert.equal(log.inst.length, 2);
  assert.equal(log.inst[0].material, log.inst[1].material, 'one shared material');
  assert.ok(log.inst.every((m) => m.frustumCulled === false));
  const st = view.stats();
  assert.equal(st.plants, R.junglePlan.undergrowthGet().plants.length);
  assert.equal(log.inst[0].count + log.inst[1].count, st.plants);
  assert.equal(st.drawCalls, 2);
  const before = log.allocs;
  for (let i = 0; i < 120; i++) view.update(1 / 60);
  assert.equal(log.allocs, before, 'nothing allocated per frame');
  // The sway shader hook only patches the vertex shader source.
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' };
  log.inst[0].material.onBeforeCompile(shader);
  assert.ok(shader.uniforms.uTime.value > 0 && shader.vertexShader.includes('swayBend'));
  assert.ok(typeof log.inst[0].material.customProgramCacheKey() === 'string');
});

test('load order and scene wiring: plan after the jungle plan, renderer after plant shapes and before the scene', () => {
  const html = fs.readFileSync('index.html', 'utf8'), man = fs.readFileSync('game/manifest.js', 'utf8');
  for (const t of [html, man]) {
    const at = (f) => t.indexOf(f);
    assert.ok(at('game/jungle-plan.js') < at('game/jungle-undergrowth-plan.js') && at('game/jungle-undergrowth-plan.js') > 0);
    assert.ok(at('game/render/plant-shapes.js') < at('game/render/jungle-undergrowth.js') && at('game/render/jungle-undergrowth.js') < at('game/render/scene.js'));
  }
  const scene = fs.readFileSync('game/render/scene.js', 'utf8');
  assert.ok(scene.includes('createJungleUndergrowth') && scene.includes('undergrowth.update(dt)'));
  assert.ok(!/undergrowth/i.test(scene.split('function obstacles()')[1].split('}))')[0]), 'never an obstacle');
});
