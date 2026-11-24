// AS-0308: the desierto's seeded rock arch and oasis (pure layout, node:vm) and the stub-THREE render smoke test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const BASE = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/map.js', 'game/peaks.js', 'game/save.js',
  'game/station.js', 'game/player.js', 'game/jump.js'];
const SA = loadGame([...BASE, 'game/desert-plan.js', 'game/wander.js', 'game/decor-plan.js', 'game/ground-cover-plan.js']);
const DP = SA.desertPlan, M = SA.map, L = DP.get();
const range = M.biomeRange('desierto');

test('layout: one arch and one oasis, deterministic per seed, cached', () => {
  assert.ok(L.arch && L.oasis);
  assert.deepEqual(DP.layout(), L);
  assert.deepEqual(DP.layout(), DP.layout());
  assert.notDeepEqual(DP.layout(DP.SEED + 1), L);
  assert.equal(L.oasis.palms.length, 5);
  assert.equal(L.arch.pillars.length, 2);
  assert.equal(DP.get(), DP.get());
});

test('both landmarks sit inside the desierto, away from its borders, the spawn and the station', () => {
  for (const [name, o] of [['arch', L.arch], ['oasis', L.oasis]]) {
    assert.equal(M.biomeAt(o.x), 'desierto');
    assert.ok(o.x - o.r >= range.lo + 8 && o.x + o.r <= range.hi - 8, `${name} x ${o.x} r ${o.r}`);
    assert.ok(o.x - o.r >= M.DUNE_EDGE + 8, `${name} past the dune fade-in`);
    assert.ok(o.z - o.r >= M.BOUNDS.minZ + 4 && o.z + o.r <= M.BOUNDS.maxZ - 4, `${name} z`);
    assert.ok(!SA.player.inSpawnZone(o.x, o.z, o.r) && !SA.station.inFootprint(o.x, o.z, o.r), `${name} near the spawn/station`);
  }
  assert.ok(Math.hypot(L.arch.x - L.oasis.x, L.arch.z - L.oasis.z) >= DP.MIN_APART, 'the two are apart');
  for (const p of L.oasis.palms) assert.ok(M.biomeAt(p.x) === 'desierto' && Math.hypot(p.x - L.oasis.x, p.z - L.oasis.z) > L.oasis.poolR, 'palms stand beside the pool');
});

test('the arch pillars block but the gap under the arch stays walkable', () => {
  const s = DP.solids(), a = L.arch;
  assert.equal(s, DP.solids());
  const pillars = s.filter((c) => c[2] === a.pillarR);
  assert.equal(pillars.length, 2);
  assert.ok(pillars.every((c) => c[3] >= 50), 'a jump never clears a pillar');
  const blocked = (x, z, pad) => s.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + pad);
  const ux = Math.cos(a.ang), uz = Math.sin(a.ang);
  for (let t = -a.gap / 2 + 0.5; t <= a.gap / 2 - 0.5; t += 0.25) assert.ok(!blocked(a.x + ux * t, a.z + uz * t, 0.4), `gap blocked at ${t}`);
  // Walking straight through the gap (across the pillar line) is clear all the way.
  for (let d = -6; d <= 6; d += 0.5) assert.ok(!blocked(a.x - uz * d, a.z + ux * d, 0.4), `walkway blocked at ${d}`);
  assert.ok(blocked(a.pillars[0].x, a.pillars[0].z, 0) && blocked(a.pillars[1].x, a.pillars[1].z, 0));
  assert.ok(a.gap >= 3 && a.topY - a.groundY >= 5, 'a person-sized gap under a tall arch');
  // The pool and the palm trunks block too.
  assert.ok(blocked(L.oasis.x, L.oasis.z, 0) && DP.inPool(L.oasis.x, L.oasis.z) && !DP.inPool(L.oasis.x + 10, L.oasis.z));
  for (const p of L.oasis.palms) assert.ok(blocked(p.x, p.z, 0));
});

test('ground under both landmarks is gentle and dry', () => {
  for (const o of [L.arch, L.oasis]) {
    for (let a = 0; a < 6.3; a += 0.5) assert.ok(M.groundHeight(o.x + 3 * Math.cos(a), o.z + 3 * Math.sin(a)) > M.WATER_LEVEL + 0.5);
  }
  assert.ok(L.oasis.groundY - L.oasis.lowY <= 1, 'the pool sits on a gentle bit of dune');
});

test('near(): decor, plants and animals keep out of both footprints', () => {
  for (const o of [L.arch, L.oasis]) {
    assert.ok(DP.near(o.x, o.z) && DP.near(o.x + o.r - 0.1, o.z) && !DP.near(o.x + o.r + 2, o.z));
    assert.ok(DP.near(o.x + o.r + 1.5, o.z, 2));
  }
  const inFoot = (x, z) => DP.near(x, z);
  const decor = SA.decorPlan.plan();
  assert.ok(decor.length > 50);
  for (const d of decor) assert.ok(!inFoot(d.x, d.z), `${d.id} grows inside a landmark footprint`);
  // Wandering animals refuse to step into either landmark.
  let moved = 0;
  for (const o of [L.arch, L.oasis]) {
    const home = { x: o.x + o.r + 2, z: o.z };
    const w = SA.wander.create({ biome: 'desierto', movement: 'camina', home, seed: 4, radius: 8 });
    for (let i = 0; i < 4000; i++) {
      const s = w.update(1 / 30);
      assert.ok(!inFoot(s.x, s.z), 'animal inside a landmark');
      if (Math.hypot(s.x - home.x, s.z - home.z) > 1) moved++;
    }
  }
  assert.ok(moved > 100, 'the animals did wander');
});

test('ground cover keeps off both footprints', () => {
  const plan = SA.groundCoverPlan.plan();
  assert.ok(plan.length > 100);
  for (const g of plan) assert.ok(!DP.near(g.x, g.z), `plant at ${g.x},${g.z} inside a landmark`);
});

// --- render: stub THREE ---
function stubTHREE() {
  const log = { meshes: [], inst: [] };
  class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } applyQuaternion() { return this; } add() { return this; } }
  class Geo {
    constructor(n = 8) { this.attributes = { position: { count: n, getX: () => 0, getY: (i) => i * 0.1, getZ: () => 0 } }; this.index = { array: [0, 1, 2, 0, 2, 3] }; }
    applyMatrix4() { return this; } dispose() {} setAttribute() {} setIndex() {} computeVertexNormals() {}
  }
  class Group { constructor() { this.children = []; } add(c) { this.children.push(c); } }
  class Mesh { constructor(g, m) { this.geometry = g; this.material = m; this.position = new V3(); log.meshes.push(this); } }
  class Inst extends Mesh { constructor(g, m, n) { super(g, m); this.count = n; this.set = 0; this.instanceMatrix = {}; log.inst.push(this); } setMatrixAt() { this.set++; } }
  class Mat { constructor(o) { Object.assign(this, o); } }
  const T = {
    Group, Mesh, InstancedMesh: Inst, Vector3: V3, Quaternion: class { setFromEuler() { return this; } setFromAxisAngle() { return this; } }, Euler: class { set() { return this; } },
    Matrix4: class { makeTranslation() { return this; } compose() { return this; } },
    CylinderGeometry: Geo, BoxGeometry: Geo, ConeGeometry: Geo, BufferGeometry: Geo, Float32BufferAttribute: class {},
    MeshPhongMaterial: Mat,
  };
  return { T, log };
}

test('render: arch mesh plus pool, rim and two instanced palm meshes, all in one group', () => {
  const R = loadGame([...BASE, 'game/desert-plan.js', 'game/render/desert-landmarks.js']);
  const { T, log } = stubTHREE();
  const added = [];
  const lm = R.render.createDesertLandmarks(T, { scene: { add: (g) => added.push(g) } });
  assert.deepEqual(added, [lm.group]);
  const st = lm.stats();
  assert.equal(st.palms, 5);
  assert.ok(st.archTriangles > 0 && st.drawCalls === 5);
  assert.equal(log.inst.length, 2, 'palms are instanced: one trunk mesh and one frond mesh');
  assert.ok(log.inst.every((m) => m.count === 5 && m.set === 5));
  assert.equal(lm.group.children.length, 5);
});
