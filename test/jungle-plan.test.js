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
  assert.equal(JP.solids().length, giants.length);
  for (const [x, z, r, h] of JP.solids()) assert.ok(r >= 2 && h > 10, 'a tall solid, never jumped');
  for (const g of giants) assert.ok(JP.near(g.x, g.z) && JP.near(g.x + g.solidR + 0.5, g.z, 1) && !JP.near(g.x + g.solidR + 3, g.z, 1));
  assert.ok(JP.avoidPoints().length === giants.length);
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
