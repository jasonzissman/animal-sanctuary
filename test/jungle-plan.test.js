// AS-0388: the selva's giant climbable trees: seeded layout (clear of the pond, station, spawn), climb targets and the perch/climb logic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const BASE = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/mountain-trail.js', 'game/map.js',
  'game/peaks.js', 'game/save.js', 'game/station.js', 'game/player.js', 'game/forest-streams.js', 'game/surfaces.js', 'game/lookouts.js', 'game/perch.js',
  'game/climb.js', 'game/jungle-plan.js', 'game/decor-plan.js'];
const SA = loadGame(BASE);
const M = SA.map, JP = SA.junglePlan;
const selva = M.biomeRange('selva');
const giants = JP.get().giants;

test('3-4 giants stand inside the selva, deterministically', () => {
  assert.ok(giants.length >= 3 && giants.length <= 4, 'count ' + giants.length);
  for (const g of giants) {
    assert.equal(M.biomeAt(g.x), 'selva');
    assert.ok(g.x > selva.lo + 6 && g.x < selva.hi - 6 && g.z > M.BOUNDS.minZ + 6 && g.z < M.BOUNDS.maxZ - 6, `${g.id} well inside`);
    assert.ok(!M.isWater(g.x, g.z));
  }
  const again = SA.junglePlan.layout();
  assert.deepEqual(again, JP.get(), 'same seed, same layout');
  assert.notDeepEqual(JP.layout(7).giants.map((g) => g.x), giants.map((g) => g.x), 'a different seed moves them');
});

test('giants keep clear of the pond, station, spawn, forest paths and each other, and leave room for a clearing', () => {
  for (const g of giants) {
    assert.ok(Math.hypot(g.x - M.POND.x, g.z - M.POND.z) > M.POND.radius + JP.POND_GAP - 0.01, `${g.id} pond`);
    assert.ok(!SA.station.inFootprint(g.x, g.z, g.canopyR), `${g.id} station`);
    assert.ok(!SA.player.inSpawnZone(g.x, g.z, g.solidR), `${g.id} spawn`);
    assert.ok(!SA.lookouts.near(g.x, g.z, g.canopyR), `${g.id} lookout`);
    assert.ok(!SA.surfaces.near(g.x, g.z, g.canopyR), `${g.id} bridge`);
    for (const h of giants) if (h !== g) assert.ok(Math.hypot(g.x - h.x, g.z - h.z) >= JP.SPACING, `${g.id}/${h.id} spacing`);
  }
});

test('every giant has a tall trunk, a wide canopy and seeded hanging vines under it', () => {
  for (const g of giants) {
    assert.ok(g.height >= 12 && g.topY === g.y + g.height);
    assert.ok(g.canopyR > g.topR && g.topR > 3, 'canopy wider than its walkable top');
    assert.ok(g.vines.length >= 8);
    for (const v of g.vines) {
      assert.ok(v.len > 3 && v.r < g.canopyR && v.y < g.topY && v.y - v.len > g.y, 'vine hangs from the canopy, above the ground');
    }
  }
});

test('trunks block the player, and decor and plants keep off them', () => {
  assert.equal(JP.solids().length, giants.length + JP.get().waterfall.cliffSolids.length);   // + the waterfall cliff (AS-0389)
  for (const [x, z, r, h] of JP.solids().slice(0, giants.length)) assert.ok(r >= 2 && h > 10, 'a tall solid, never jumped');
  for (const g of giants) assert.ok(JP.near(g.x, g.z) && JP.near(g.x + g.solidR + 0.5, g.z, 1) && !JP.near(g.x + g.solidR + 3, g.z, 1));
  assert.ok(JP.avoidPoints().length === giants.length + 1, 'the trunks plus the waterfall');
  for (const d of SA.decorPlan.plan()) assert.ok(!JP.near(d.x, d.z), `decor on a trunk at ${d.x},${d.z}`);
});

test('giants are perch kind data and climb targets scaled to their height', () => {
  assert.ok(SA.perch.KINDS.giant && SA.perch.KINDS.giant.height > SA.perch.KINDS.kapok.height * 2);
  const targets = JP.targets();
  assert.equal(targets.length, giants.length);
  targets.forEach((t, i) => {
    assert.equal(t.kind, 'tree');
    assert.ok(Math.abs(t.topY - (giants[i].y + SA.perch.KINDS.giant.height)) < 1e-9);
    assert.ok(SA.climb.topOf(t) === t.topY);
  });
  // The tree-shaped adapter agrees with the generic target (perch kind scaled by the tree's own scale).
  const g = giants[0], viaTree = SA.climb.fromTree({ x: g.x, z: g.z, y: g.y, scale: 1, kind: 'giant' });
  assert.equal(viaTree.topY, g.topY);
});

test('the player climbs a giant from its base, stands at its top and walks around it; walking off is a gentle fall', () => {
  const targets = JP.targets(), t = targets[0], g = giants[0];
  let s = { x: g.x + g.solidR + 0.7, z: g.z, heading: Math.PI / 2, y: g.y, climb: null };   // standing at the trunk, where the solid stops you
  assert.equal(SA.climb.prompt(s, targets), 'up');
  assert.equal(SA.climb.nearest(s, targets), t);
  s = SA.climb.start(s, t);
  assert.equal(s.climb.mode, 'up');
  for (let i = 0; i < 40 && !SA.climb.onTop(s); i++) s = SA.climb.step(s, {}, 0.1, [], targets);
  assert.ok(SA.climb.onTop(s));
  assert.equal(s.climb.mode, 'canopy');
  assert.ok(Math.abs(s.y - g.topY) < 1e-6, 'stands at the top: ' + s.y);
  assert.equal(SA.climb.prompt(s, targets), 'down');
  // A walk across the flat top keeps the height; the canopy is wider than a few steps.
  for (let i = 0; i < 5; i++) s = SA.climb.step(s, { forward: 1 }, 0.1, [], targets);
  assert.ok(SA.climb.onTop(s) && Math.abs(s.y - g.topY) < 1e-6);
  // Walking on past the edge of the top is a fall to the ground, never damage.
  let fell = s;
  for (let i = 0; i < 80 && SA.climb.onTop(fell); i++) fell = SA.climb.step(fell, { forward: 1 }, 0.1, [], []);
  assert.ok(!SA.climb.onTop(fell) && fell.climb && fell.climb.fall, 'walked off the edge');
  // Climbing down lands on dry ground outside the base.
  s = SA.climb.stop(s);
  for (let i = 0; i < 30 && SA.climb.active(s); i++) s = SA.climb.step(s, {}, 0.1, []);
  assert.ok(!SA.climb.active(s));
  assert.ok(Math.hypot(s.x - g.x, s.z - g.z) > g.solidR && !M.isWater(s.x, s.z));
});

test('index.html and the manifest load the plan and the renderer in order; scene.js wires them in', () => {
  const html = fs.readFileSync('index.html', 'utf8'), man = fs.readFileSync('game/manifest.js', 'utf8');
  for (const t of [html, man]) {
    const at = (f) => t.indexOf(f);
    // perch.js is read lazily (the plan is built at scene time), so only the consumers of the plan must come after it.
    assert.ok(at('game/map.js') < at('game/jungle-plan.js') && at('game/jungle-plan.js') < at('game/decor-plan.js') && at('game/jungle-plan.js') < at('game/ground-cover-plan.js'));
    assert.ok(at('game/render/world.js') < at('game/render/jungle-giants.js') && at('game/render/jungle-giants.js') < at('game/render/scene.js'));
  }
  const scene = fs.readFileSync('game/render/scene.js', 'utf8');
  assert.ok(scene.includes('createJungleGiants') && scene.includes('junglePlan.solids()') && scene.includes('junglePlan.targets()'));
  for (const f of ['decor-plan', 'ground-cover-plan']) assert.ok(fs.readFileSync(`game/${f}.js`, 'utf8').includes('junglePlan'), f);
});

test('the renderer builds shared InstancedMeshes (stub THREE) and allocates nothing per frame', () => {
  const calls = { inst: [], group: 0 };
  class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { return this.set(v.x, v.y, v.z); } }
  class Obj { constructor() { this.position = new V3(); this.rotation = { set() {} }; this.scale = new V3(1, 1, 1); this.quaternion = { setFromUnitVectors() {} }; this.children = []; this.matrix = {}; }
    updateMatrix() {} add(o) { this.children.push(o); } }
  const T = {
    Group: Obj, Object3D: Obj, Vector3: V3, Color: class { set() { return this; } offsetHSL() { return this; } },
    CylinderGeometry: class { constructor(...a) { this.args = a; } }, ConeGeometry: class { constructor(...a) { this.args = a; } },
    MeshPhongMaterial: class { constructor(o) { Object.assign(this, o); } },
    InstancedMesh: class extends Obj { constructor(g, m, n) { super(); this.count = n; this.geometry = g; calls.inst.push(n); this.instanceMatrix = {}; }
      setMatrixAt() {} setColorAt() { this.instanceColor = {}; } },
  };
  loadGame([...BASE, 'game/render/jungle-giants.js']);   // loads cleanly without THREE
  const SA2 = loadGame([...BASE, 'game/render/jungle-giants.js']);
  const scene = new Obj();
  const view = SA2.render.createJungleGiants(T, { scene });
  assert.equal(scene.children.length, 1);
  const st = view.stats();
  assert.equal(st.giants, SA2.junglePlan.get().giants.length);
  assert.ok(st.drawCalls <= 8, 'a handful of draw calls: ' + st.drawCalls);
  assert.ok(st.vineSegments >= st.giants * 8);
  assert.ok(calls.inst.includes(st.vineSegments), 'one instanced mesh holds every vine segment');
  assert.equal(view.update, undefined, 'static: no per-frame work');
});

// ---- AS-0389: the waterfall into the pond ----

const W = JP.get().waterfall;
const worldOf = (l) => ({ x: W.x + l.x * Math.cos(W.yaw) + l.z * Math.sin(W.yaw), z: W.z - l.x * Math.sin(W.yaw) + l.z * Math.cos(W.yaw) });

test('waterfall: a seeded site on the pond shore, the same for the same seed, a different one for another', () => {
  assert.ok(W, 'a site was found');
  assert.deepEqual(JP.layout().waterfall, W);
  const other = JP.layout(7).waterfall;
  assert.ok(!other || other.ang !== W.ang, 'another seed moves it');
  const P = M.POND, d = Math.hypot(W.x - P.x, W.z - P.z);
  assert.ok(d < P.radius + 0.6 && d > P.radius - 1, 'the sheet falls onto the pond water: ' + d);
  assert.equal(W.poolR, undefined, 'no pool of its own: the pond is the pool');
  assert.equal(W.poolY, M.WATER_LEVEL);
  assert.ok(W.topY - W.poolY >= 4, 'a real drop');
  assert.equal(M.biomeAt(W.cx), 'selva');
  // The local +x axis (after the group's yaw) points from the cliff across the pond, toward its centre.
  const toward = worldOf({ x: 1, z: 0 });
  assert.ok((toward.x - W.x) * (P.x - W.x) + (toward.z - W.z) * (P.z - W.z) > 0);
  assert.equal(W.cliff.length, 3);
  assert.ok(W.cliff[1].h < W.cliff[0].h && W.cliff[1].h < W.cliff[2].h, 'the middle block is the notch the water runs through');
});

test('waterfall: clear of the giants, spawn, station, lookouts and bridges (checked all round its footprint)', () => {
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    for (const rr of [0, W.r * 0.5, W.r]) {
      const x = W.cx + Math.cos(a) * rr, z = W.cz + Math.sin(a) * rr;
      assert.ok(!SA.player.inSpawnZone(x, z), 'spawn');
      assert.ok(!SA.station.inFootprint(x, z, 0), 'station');
      assert.ok(!SA.lookouts.near(x, z, 0) && !SA.surfaces.near(x, z, 0), 'lookout/bridge');
      for (const g of giants) assert.ok(Math.hypot(x - g.x, z - g.z) > g.solidR + 1, `${g.id} trunk`);
    }
  }
  for (const g of giants) assert.ok(Math.hypot(W.cx - g.x, W.cz - g.z) >= g.canopyR + W.r, `${g.id} canopy`);
});

test('waterfall: the cliff blocks the player (never jumped) and scenery, animals and pickups keep out; no solid out over the pond', () => {
  const sol = JP.solids();
  assert.equal(sol.length, giants.length + W.cliffSolids.length);
  W.cliffSolids.forEach((s, i) => {
    assert.ok(s[3] > 10 && s[2] >= 1);
    const w = worldOf({ x: W.cliff[i].x, z: W.cliff[i].z });
    assert.ok(Math.hypot(s[0] - w.x, s[1] - w.z) < 0.5, 'the solid sits under its cliff block');
    assert.ok(sol.includes(s));
  });
  assert.ok(JP.near(W.cx, W.cz) && !JP.near(W.cx + W.r + 2, W.cz + W.r + 2, 0));
  assert.ok(JP.avoidPoints().some(([x, z]) => x === W.cx && z === W.cz));
  for (const d of SA.decorPlan.plan()) assert.ok(Math.hypot(d.x - W.cx, d.z - W.cz) > W.r, `decor in the waterfall at ${d.x},${d.z}`);
  const P = M.POND;
  for (const [x, z, r] of sol.slice(giants.length)) assert.ok(Math.hypot(x - P.x, z - P.z) - r > 0.8, 'the water in front of the sheet is open');
});

function stubTHREE() {
  const log = { meshes: [], inst: [], allocs: 0 };
  const V = class { set() { return this; } setScalar() { return this; } };
  class Obj { constructor() { log.allocs++; this.position = new V(); this.rotation = { x: 0, y: 0, z: 0 }; this.scale = new V(); this.matrix = {}; } updateMatrix() {} }
  class Group extends Obj { constructor() { super(); this.children = []; } add(...c) { this.children.push(...c); } }
  class Mesh extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; log.meshes.push(this); } }
  class Inst extends Obj { constructor(g, m, n) { super(); Object.assign(this, { count: n, instanceMatrix: { needsUpdate: false } }); log.inst.push(this); } setMatrixAt() {} }
  const Geo = class {}, Mat = class { constructor(o) { Object.assign(this, o); } };
  return { log, T: { Group, Object3D: Obj, Mesh, InstancedMesh: Inst, BoxGeometry: Geo, CylinderGeometry: Geo, RingGeometry: Geo, CircleGeometry: Geo, PlaneGeometry: Geo,
    SphereGeometry: Geo, MeshPhongMaterial: Mat, MeshBasicMaterial: Mat, DoubleSide: 2 } };
}

test('waterfall render: mossy cliff, scrolling sheet and ONE instanced spray at the site; no pool; update() allocates nothing', () => {
  const R = loadGame([...BASE, 'game/rocks.js', 'game/mountain-plan.js', 'game/render/waterfall.js']);
  const { T, log } = stubTHREE(), added = [];
  const f = R.render.createJungleWaterfall(T, { scene: { add: (g) => added.push(g) } });
  assert.deepEqual(added, [f.group]);
  assert.equal(f.group.name, 'waterfall-selva');
  assert.ok(Math.abs(f.group.rotation.y - W.yaw) < 1e-12, 'turned to face the pond');
  const names = log.meshes.map((m) => m.name);
  assert.ok(names.includes('waterfall-sheet') && names.includes('waterfall-moss-cap-0') && !names.includes('waterfall-pool') && !names.includes('waterfall-rim'));
  assert.equal(log.inst.length, 1, 'spray is instanced');
  assert.equal(f.group.children.length, f.stats().drawCalls);
  const allocs = log.allocs, before = f.uScroll.value;
  for (let i = 0; i < 120; i++) f.update(1 / 60);
  assert.equal(log.allocs, allocs, 'nothing allocated per frame');
  assert.ok(f.uScroll.value > before + 2 && log.inst[0].instanceMatrix.needsUpdate);
  // The montaña's waterfall is still built (with its pool) by the same builder.
  const s2 = stubTHREE();
  const mt = R.render.createWaterfall(s2.T, { scene: { add() {} } });
  assert.equal(mt.group.name, 'waterfall');
  assert.ok(s2.log.meshes.some((m) => m.name === 'waterfall-pool'));
  R.junglePlan.get().waterfall = null;
  assert.equal(R.render.createJungleWaterfall(s2.T, {}), null);
});

test('waterfall is wired into the scene after the plan and the builder load', () => {
  const scene = fs.readFileSync('game/render/scene.js', 'utf8');
  assert.ok(scene.includes('createJungleWaterfall') && scene.includes('jungleFall.update(dt)'));
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.indexOf('game/jungle-plan.js') < html.indexOf('game/render/waterfall.js') && html.indexOf('game/render/waterfall.js') < html.indexOf('game/render/scene.js'));
});
