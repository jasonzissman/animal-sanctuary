// AS-0310: the montaña's waterfall and pool: seeded layout, kept off the trail/spawn/borders, avoided by decor and animals, allocation-free animation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const BASE = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/mountain-trail.js', 'game/map.js',
  'game/peaks.js', 'game/save.js', 'game/station.js', 'game/player.js', 'game/rocks.js'];
const SA = loadGame([...BASE, 'game/mountain-plan.js', 'game/decor-plan.js', 'game/ground-cover-plan.js']);
const M = SA.map, MP = SA.mountainPlan, T = SA.mountainTrail;
const W = MP.get().waterfall;
const montana = M.biomeRange('montana');

test('the waterfall and its pool exist and are the same for the same seed', () => {
  assert.ok(W, 'a site was found');
  const again = MP.layout().waterfall, other = MP.layout(7).waterfall;
  assert.deepEqual(again, W);
  assert.ok(!other || other.x !== W.x || other.z !== W.z, 'another seed moves it');
  assert.ok(W.poolR > 2 && W.topY - W.poolY > 3.5, 'a real drop into a real pool');
  assert.equal(M.biomeAt(W.x), 'montana');
  assert.equal(W.cliff.length, 3);
  assert.ok(W.cliff[1].h < W.cliff[0].h && W.cliff[1].h < W.cliff[2].h, 'the middle block is a notch the water runs through');
  assert.ok(W.fx < W.x && W.fx > W.x - W.poolR, 'the sheet falls inside the pool, downhill of the cliff');
});

test('the waterfall stays off the trail, the spawn, the station, the peaks and the biome borders (checked all round its footprint)', () => {
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    for (const rr of [0, W.r * 0.5, W.r]) {
      const x = W.x + Math.cos(a) * rr, z = W.z + Math.sin(a) * rr;
      assert.ok(T.distance(x, z) > T.WIDTH / 2 + 0.5, `trail ${x},${z}`);
      assert.ok(!SA.player.inSpawnZone(x, z), 'spawn');
      assert.ok(!SA.station.inFootprint(x, z, 0), 'station');
      assert.ok(x > montana.lo + 3.5 && x < montana.hi - 3.5 && z > M.BOUNDS.minZ + 3.5 && z < M.BOUNDS.maxZ - 3.5, `border ${x},${z}`);
    }
  }
  for (const p of SA.peaks.LIST) assert.ok(Math.hypot(W.x - p.x, W.z - p.z) > SA.peaks.BASE_R + W.r);
});

test('the waterfall also stands clear of every boulder and boulder cluster, and the ground under the pool is gentle and dry', () => {
  const L = MP.get();
  for (const b of L.boulders) assert.ok(Math.hypot(b.x - W.x, b.z - W.z) > b.r + W.r, 'boulder');
  for (const c of L.clusters) assert.ok(Math.hypot(c.x - W.x, c.z - W.z) > c.r + W.r, 'cluster');
  assert.ok(W.poolY - W.lowY < 2.7, 'spread ' + (W.poolY - W.lowY));
  assert.ok(!M.isWater(W.x, W.z));
});

test('the pool is water and the cliff is rock: both block the player, animals, pickups and decor keep out', () => {
  assert.ok(MP.inPool(W.x, W.z) && MP.inPool(W.x + W.poolR - 0.1, W.z) && !MP.inPool(W.x + W.poolR + 0.5, W.z));
  const sol = MP.solids();
  // The deep middle of the pool blocks; the shallow west rim is a wading lane to the curtain and the grotto behind it (AS-0174).
  assert.ok(sol.includes(W.poolSolid) && W.poolSolid[3] > 10 && Math.hypot(W.poolSolid[0] - W.x, W.poolSolid[1] - W.z) + W.poolSolid[2] <= W.poolR, 'pool solid');
  assert.ok(Math.hypot(W.fx + 0.5 - W.poolSolid[0], W.z - W.poolSolid[1]) >= W.poolSolid[2] + 0.6, 'you can wade up to the curtain');
  assert.equal(sol.length, MP.get().boulders.length + 1 + W.cliffSolids.length);
  for (const [sx, sz, sr, sh] of W.cliffSolids.concat([W.poolSolid])) assert.ok(sh > 5 && Math.hypot(sx - W.x, sz - W.z) <= W.r, 'not jumpable, inside the footprint');
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, x = W.x + Math.cos(a) * (W.poolR + 0.3), z = W.z + Math.sin(a) * (W.poolR + 0.3);
    assert.ok(MP.inField(x, z, 0.3), 'animals/pickups keep out round the pool');
    assert.ok(MP.near(x, z, 1), 'decor keeps out');
  }
  assert.ok(MP.inField(W.x - 4, W.z + 1, 0), 'and off the cliff');
  assert.ok(!MP.inField(W.x + W.r + 1, W.z, 0) || MP.near(W.x + W.r + 1, W.z, 0) === MP.inField(W.x + W.r + 1, W.z, 0));
});

test('seeded decor and ground cover never land in the pool or on the cliff', () => {
  const decor = SA.decorPlan.plan(), cover = SA.groundCoverPlan.plan();
  assert.ok(decor.length > 20 && cover.length > 20);
  for (const d of decor) assert.ok(Math.hypot(d.x - W.x, d.z - W.z) > W.r, `decor in the waterfall at ${d.x},${d.z}`);
  for (const g of cover) assert.ok(Math.hypot(g.x - W.x, g.z - W.z) > W.r, `plant in the waterfall at ${g.x},${g.z}`);
});

// ---- the renderer, against a stub THREE ----

function stubTHREE() {
  const log = { added: [], inst: [], meshes: [], allocs: 0, matrices: 0 };
  const V = class { set() { return this; } setScalar() { return this; } };
  class Obj { constructor() { log.allocs++; this.position = new V(); this.rotation = new V(); this.scale = new V(); this.matrix = {}; } updateMatrix() {} }
  class Group extends Obj { constructor() { super(); this.children = []; } add(...c) { this.children.push(...c); } }
  class Mesh extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; log.meshes.push(this); } }
  class Inst extends Obj { constructor(g, m, n) { super(); Object.assign(this, { geometry: g, material: m, count: n, instanceMatrix: { needsUpdate: false } }); log.inst.push(this); } setMatrixAt() { log.matrices++; } }
  const Geo = class { constructor(...a) { this.args = a; } };
  const Mat = class { constructor(o) { Object.assign(this, o); } };
  return { log, T: { Group, Object3D: Obj, Mesh, InstancedMesh: Inst, BoxGeometry: Geo, CylinderGeometry: Geo, RingGeometry: Geo, CircleGeometry: Geo, PlaneGeometry: Geo, SphereGeometry: Geo,
    MeshPhongMaterial: Mat, MeshBasicMaterial: Mat, DoubleSide: 2 } };
}

test('render: cliff, rim, pool, sheet and ONE instanced spray mesh in one group', () => {
  const R = loadGame([...BASE, 'game/mountain-plan.js', 'game/render/waterfall.js']);
  const { T: THREE, log } = stubTHREE();
  const scene = { add: (g) => log.added.push(g) };
  const f = R.render.createWaterfall(THREE, { scene });
  assert.deepEqual(log.added, [f.group]);
  const st = f.stats();
  assert.equal(st.cliffBlocks, 3);
  assert.equal(log.inst.length, 1, 'spray is instanced');
  assert.equal(log.inst[0].count, st.sprayParticles);
  assert.equal(f.group.children.length, st.drawCalls);
  const sheet = log.meshes.find((m) => m.name === 'waterfall-sheet');
  assert.ok(sheet && typeof sheet.material.onBeforeCompile === 'function', 'the sheet scrolls in its shader');
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
  sheet.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uScroll, f.uScroll);
  assert.ok(shader.fragmentShader.includes('uScroll') && shader.vertexShader.includes('vP = position'));
});

test('render: update() scrolls the sheet and moves the spray but allocates no THREE objects', () => {
  const R = loadGame([...BASE, 'game/mountain-plan.js', 'game/render/waterfall.js']);
  const { T: THREE, log } = stubTHREE();
  const f = R.render.createWaterfall(THREE, { scene: { add() {} } });
  const allocs = log.allocs, before = f.uScroll.value, built = log.matrices;
  for (let i = 0; i < 120; i++) f.update(1 / 60);
  assert.equal(log.allocs, allocs, 'no objects created per frame');
  assert.ok(f.uScroll.value > before + 2, 'the sheet scrolls');
  assert.equal(log.matrices - built, 120 * log.inst[0].count, 'every particle is rewritten each frame');
  assert.ok(log.inst[0].instanceMatrix.needsUpdate);
  f.update();   // no dt is fine
});

test('render: nothing is built when the layout has no waterfall', () => {
  const R = loadGame([...BASE, 'game/mountain-plan.js', 'game/render/waterfall.js']);
  R.mountainPlan.get().waterfall = null;
  assert.equal(R.render.createWaterfall(stubTHREE().T, { scene: { add() {} } }), null);
});

test('scripts load in order and the waterfall is wired into the scene and the plan callers', () => {
  const html = fs.readFileSync('index.html', 'utf8'), man = fs.readFileSync('game/manifest.js', 'utf8');
  for (const t of [html, man]) {
    assert.ok(t.indexOf('game/render/mountain-boulders.js') < t.indexOf('game/render/waterfall.js') && t.indexOf('game/render/waterfall.js') < t.indexOf('game/render/scene.js'));
  }
  const scene = fs.readFileSync('game/render/scene.js', 'utf8');
  assert.ok(scene.includes('createWaterfall') && scene.includes('waterfall.update(dt)'));
});
