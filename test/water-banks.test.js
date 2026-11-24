import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadGame } from './helpers/vm.js';

// Water banks (AS-0298): seeded, tested layout of the shore, pebbles and reeds; the moving surface and foam are wired without per-frame allocation.
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/map.js', 'game/peaks.js', 'game/save.js',
  'game/station.js', 'game/player.js', 'game/water-banks-plan.js'];

const SA = loadGame(FILES);
const W = SA.waterBanks, M = SA.map;
const plan = W.plan();

test('plan is deterministic and seeded', () => {
  assert.deepEqual(W.plan(), plan);
  assert.deepEqual(W.plan({ seed: 11 }), plan);
  assert.notDeepEqual(W.plan({ seed: 12 }), plan);
});

test('river shore: each wet row brackets the river, the ford stays dry', () => {
  const rows = W.riverShore();
  assert.ok(rows.length > 80);
  const wet = rows.filter((r) => r.wet);
  assert.ok(wet.length > rows.length / 2);
  for (const r of wet) {
    assert.ok(r.xl < M.riverX(r.z) && r.xr > M.riverX(r.z), `row z=${r.z}`);
    assert.ok(r.xr - r.xl < 2 * (M.RIVER.halfWidth + 3));
  }
  const ford = rows.filter((r) => Math.abs(r.z - M.FORD.z) < M.FORD.halfLen - 0.5);
  assert.ok(ford.length && ford.every((r) => !r.wet), 'no water (so no foam or reeds) across the ford');
});

test('pond shore is a ring round the pond at about its radius', () => {
  const ring = W.pondShore();
  assert.equal(ring.length, W.POND_STEPS);
  for (const s of ring) assert.ok(s.r > M.POND.radius - 2 && s.r < M.POND.radius + 3, `r=${s.r}`);
});

test('pebbles and reeds line both the stream and the pond, near the water and on legal ground', () => {
  assert.ok(plan.pebbles.length > 150, `${plan.pebbles.length} pebbles`);
  assert.ok(plan.reeds.length > 50, `${plan.reeds.length} reeds`);
  const nearPond = (e) => Math.hypot(e.x - M.POND.x, e.z - M.POND.z) < M.POND.radius + 4;
  for (const list of [plan.pebbles, plan.reeds]) {
    assert.ok(list.some(nearPond), 'some at the pond');
    assert.ok(list.some((e) => !nearPond(e)), 'some along the stream');
    for (const e of list) {
      assert.ok(M.nearWater(e.x, e.z, 4), `at ${e.x}, ${e.z}`);
      assert.ok(e.y >= M.WATER_LEVEL - 0.25, 'never deep under water');
      assert.equal(e.y, M.groundHeight(e.x, e.z));
      assert.ok(e.tone >= 0 && e.tone <= 1 && e.scale > 0);
      assert.ok(!SA.player.inSpawnZone(e.x, e.z) && !SA.station.inFootprint(e.x, e.z, 1));
      assert.ok(e.x > M.BOUNDS.minX && e.x < M.BOUNDS.maxX && e.z > M.BOUNDS.minZ && e.z < M.BOUNDS.maxZ);
    }
  }
  assert.ok(plan.reeds.every((e) => e.y >= M.WATER_LEVEL - 0.25));
});

test('wave constants are gentle enough that wading height is unchanged for gameplay', () => {
  assert.ok(W.WAVE.amp > 0 && W.WAVE.amp * 2 <= 0.12, 'a few centimetres at most');
});

test('the render modules: wave on the water materials, foam, instanced pebbles/reeds, and no per-frame allocation', () => {
  const world = fs.readFileSync('game/render/world.js', 'utf8'), banks = fs.readFileSync('game/render/water-banks.js', 'utf8');
  assert.ok(world.includes('onBeforeCompile') && world.includes('uTime') && world.includes('transformed.y +='));
  assert.ok(/userData\.update = function \(dt\) \{ uTime\.value \+= dt \|\| 0; \}/.test(world));
  assert.ok(banks.includes('InstancedMesh') && banks.includes('water-foam') && banks.includes('applyWaterWave'));
  assert.ok(!/update\s*:\s*function/.test(banks), 'banks are static: no per-frame work of their own');
  const scene = fs.readFileSync('game/render/scene.js', 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(scene.includes('createWaterBanks') && scene.includes('world.userData.update(dt)'));
  assert.ok(!/waterBanks[^;]*obstacle/i.test(scene), 'soft: not in obstacles');
  for (const f of ['game/blocking.js', 'game/player.js', 'game/decor-plan.js']) assert.ok(!fs.readFileSync(f, 'utf8').includes('waterBanks'), f);
});

test('index.html and the manifest load the plan before world.js and the banks renderer before scene.js', () => {
  const html = fs.readFileSync('index.html', 'utf8'), at = (f) => html.indexOf(`game/${f}`);
  assert.ok(at('map.js') < at('water-banks-plan.js') && at('water-banks-plan.js') < at('render/world.js'));
  assert.ok(at('render/plant-shapes.js') < at('render/water-banks.js') && at('render/water-banks.js') < at('render/scene.js'));
  const man = fs.readFileSync('game/manifest.js', 'utf8');
  assert.ok(man.indexOf('game/water-banks-plan.js') > 0 && man.indexOf('game/render/water-banks.js') > man.indexOf('game/render/plant-shapes.js'));
});

test('with the real three.js: water has a moving wave, foam and instanced pebbles and reeds build', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...FILES, 'game/terrain-color.js', 'game/render/world.js', 'game/render/plant-shapes.js', 'game/render/water-banks.js']) {
    vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  }
  const { THREE } = ctx, world = ctx.SA.render.buildWorld(THREE), scene = new THREE.Scene();
  assert.equal(world.children.length, 3, 'ground, river, pond');
  const t0 = world.userData.uTime.value;
  world.userData.update(0.5);
  assert.equal(world.userData.uTime.value, t0 + 0.5);
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' };
  world.children[1].material.onBeforeCompile(shader);
  assert.ok(shader.uniforms.uTime === world.userData.uTime && /sin\(/.test(shader.vertexShader));
  const wb = ctx.SA.render.createWaterBanks(THREE, { scene, world });
  const st = wb.stats();
  assert.equal(st.pebbles, plan.pebbles.length);
  assert.equal(st.reeds, plan.reeds.length);
  assert.ok(st.foamTriangles > 100);
  const [foam, pebbles, reeds] = wb.meshes;
  assert.equal(foam.name, 'water-foam');
  assert.ok(pebbles.isInstancedMesh && reeds.isInstancedMesh && pebbles.count === st.pebbles && reeds.count === st.reeds);
  assert.ok(scene.children.includes(wb.group));
});
