// AS-0391: the selva's sunny clearings: seeded plan free of trees and undergrowth, lighter ground, bright instanced flowers, walkable.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const BASE = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/mountain-trail.js', 'game/map.js',
  'game/peaks.js', 'game/save.js', 'game/station.js', 'game/player.js', 'game/forest-streams.js', 'game/forest-paths.js', 'game/fallen-logs.js', 'game/surfaces.js',
  'game/lookouts.js', 'game/perch.js', 'game/climb.js', 'game/jungle-plan.js', 'game/jungle-undergrowth-plan.js', 'game/jungle-flowers-plan.js', 'game/decor-plan.js',
  'game/terrain-color.js'];
const SA = loadGame(BASE);
const M = SA.map, JP = SA.junglePlan, L = JP.get(), clearings = L.clearings;

test('the selva has 1-2 sunny clearings: round, dry, deterministic, clear of everything', () => {
  assert.ok(clearings.length >= 1 && clearings.length <= 2, 'count ' + clearings.length);
  assert.deepEqual(JP.layout().clearings, clearings);
  assert.deepEqual(JP.layout(5).giants.length >= 3, true);
  assert.deepEqual(JP.layout().giants, L.giants, 'the trees and the waterfall are unchanged by the clearings');
  for (const c of clearings) {
    assert.equal(M.biomeAt(c.x), 'selva');
    assert.ok(c.r >= 5 && c.r <= 7);
    for (let a = 0; a < 16; a++) {
      const x = c.x + Math.cos(a * Math.PI / 8) * c.r, z = c.z + Math.sin(a * Math.PI / 8) * c.r;
      assert.equal(M.biomeAt(x), 'selva', 'rim in the selva');
      assert.ok(!M.isWater(x, z) && !M.nearWater(x, z, 0), 'rim dry');
      assert.ok(!SA.player.inSpawnZone(x, z) && !SA.station.inFootprint(x, z, 0) && !SA.lookouts.near(x, z, 0) && !SA.surfaces.near(x, z, 0));
    }
    for (const g of L.giants) assert.ok(Math.hypot(g.x - c.x, g.z - c.z) > c.r + g.solidR + 2, `${g.id} stays outside`);
    if (L.waterfall) assert.ok(Math.hypot(L.waterfall.cx - c.x, L.waterfall.cz - c.z) > c.r + L.waterfall.r);
    assert.ok(JP.inClearing(c.x, c.z) && !JP.inClearing(c.x + c.r + 1, c.z));
  }
});

test('no giant tree, decor tree or undergrowth plant stands in a clearing', () => {
  for (const d of SA.decorPlan.plan()) for (const c of clearings) assert.ok(Math.hypot(d.x - c.x, d.z - c.z) > c.r, `decor ${d.decor} inside ${c.id}`);
  for (const p of JP.undergrowthGet().plants) for (const c of clearings) assert.ok(Math.hypot(p.x - c.x, p.z - c.z) > c.r, 'undergrowth inside ' + c.id);
  for (const g of L.giants) assert.ok(!JP.inClearing(g.x, g.z));
  assert.ok(JP.undergrowthGet().plants.length >= 300, 'the undergrowth is still dense');
});

test('the ground is a lighter tint in the clearing and fades to the jungle soil beyond it', () => {
  const c = clearings[0], inside = SA.terrain.groundColor(c.x, c.z, c.y, 1), far = SA.terrain.groundColor(c.x + c.r + JP.TINT_FADE + 2, c.z, c.y, 1);
  assert.equal(JP.clearingStrength(c.x, c.z), 1);
  assert.equal(JP.clearingStrength(c.x + c.r + JP.TINT_FADE + 0.1, c.z), 0);
  assert.ok(JP.clearingStrength(c.x + c.r + 1, c.z) > 0 && JP.clearingStrength(c.x + c.r + 1, c.z) < 1);
  const lum = (o) => o.r + o.g + o.b;
  assert.ok(lum(inside) > lum(far) + 0.5, `lighter: ${lum(inside)} vs ${lum(far)}`);
  assert.ok(inside.g > inside.r && inside.g > inside.b, 'green grass');
});

test('bright flowers in several colours fill the clearings, ring them and edge the undergrowth, capped', () => {
  const F = JP.flowersGet();
  assert.deepEqual(JP.flowers(), F);
  assert.ok(F.length >= 40 && F.length <= JP.FLOWER_MAX, 'count ' + F.length);
  assert.ok(new Set(F.map((f) => f.color)).size >= 5, 'several colours');
  assert.ok(F.every((f) => f.color >= 0 && f.color < JP.FLOWER_COLORS.length && f.h > 0.3 && f.h < 0.7));
  for (const spot of ['claro', 'borde', 'maleza']) assert.ok(F.some((f) => f.spot === spot), spot);
  const inCl = F.filter((f) => f.spot === 'claro');
  assert.ok(inCl.every((f) => JP.inClearing(f.x, f.z)));
  assert.ok(inCl.length >= 40 * clearings.length / 2);
  for (const f of F) {
    assert.ok(!M.nearWater(f.x, f.z, 0) && !JP.near(f.x, f.z, 0) && JP.corridorDistance(f.x, f.z) >= JP.CORRIDOR_HALF, `${f.spot} flower somewhere blocked`);
    assert.ok(!SA.player.inSpawnZone(f.x, f.z) && !SA.station.inFootprint(f.x, f.z, 0));
    assert.ok(Math.abs(f.y - M.groundHeight(f.x, f.z)) < 1e-9);
  }
});

test('the clearing is walkable: the player crosses it with the real obstacle list, nothing blocks', () => {
  const c = clearings[0], solids = JP.solids();
  let s = { x: c.x - c.r * 0.8, z: c.z, heading: Math.PI / 2 };   // heading PI/2 walks toward +x
  for (let i = 0; i < 24; i++) s = SA.player.step(s, { forward: 1 }, 0.05, solids);
  assert.ok(s.x > c.x, `crossed the middle: ${s.x} vs ${c.x}`);
  assert.ok(Math.abs(s.z - c.z) < 0.01, 'never pushed aside');
  assert.ok(JP.solids().every(([x, z, r]) => Math.hypot(x - c.x, z - c.z) > c.r + r), 'no solid inside');
});

test('renderers: InstancedMesh flowers with shared materials and one shaft material, nothing allocated per frame (stub THREE)', () => {
  const log = { inst: [], meshes: [], allocs: 0 };
  class V { set() { return this; } }
  class Obj { constructor() { log.allocs++; this.position = new V(); this.rotation = new V(); this.scale = new V(); this.matrix = {}; this.children = []; } updateMatrix() {} add(o) { this.children.push(o); } }
  class Color { set() { return this; } }
  class Inst extends Obj { constructor(g, m, n) { super(); Object.assign(this, { count: n, geometry: g, material: m, instanceMatrix: {} }); log.inst.push(this); } setMatrixAt() {} setColorAt() { this.instanceColor = {}; } }
  class Mesh extends Obj { constructor(g, m) { super(); Object.assign(this, { geometry: g, material: m }); log.meshes.push(this); } }
  const geo = class { constructor() { log.allocs++; } };
  const T = { Group: Obj, Object3D: Obj, Color, InstancedMesh: Inst, Mesh, MeshPhongMaterial: class { constructor(o) { Object.assign(this, o); } },
    MeshBasicMaterial: class { constructor(o) { Object.assign(this, o); } }, CylinderGeometry: geo, SphereGeometry: geo, DoubleSide: 2, AdditiveBlending: 2 };
  const R = loadGame([...BASE, 'game/render/jungle-flowers.js', 'game/render/jungle-clearing.js', 'game/daynight.js']);
  const scene = new Obj(), fv = R.render.createJungleFlowers(T, { scene }), cv = R.render.createJungleClearings(T, { scene });
  assert.equal(scene.children.length, 2);
  assert.equal(log.inst.length, 3);
  assert.ok(log.inst.every((m) => m.count === R.junglePlan.flowersGet().length && m.frustumCulled === false));
  assert.equal(new Set(log.inst.map((m) => m.material)).size, 3, 'one shared material per look');
  assert.ok(log.inst[1].instanceColor, 'bloom colours per instance');
  const st = fv.stats();
  assert.equal(st.drawCalls, 3);
  assert.ok(st.colors >= 5);
  assert.equal(log.meshes.length, clearings.length);
  assert.equal(new Set(log.meshes.map((m) => m.material)).size, 1, 'one shaft material');
  const before = log.allocs;
  for (let i = 0; i < 120; i++) cv.update(1 / 60);
  assert.equal(log.allocs, before, 'nothing allocated per frame');
  assert.ok(log.meshes[0].material.opacity > 0 && log.meshes[0].material.opacity <= 0.12);
  assert.equal(cv.stats().shafts, clearings.length);
});

test('load order and scene wiring', () => {
  const html = fs.readFileSync('index.html', 'utf8'), man = fs.readFileSync('game/manifest.js', 'utf8');
  for (const t of [html, man]) {
    const at = (f) => t.indexOf(f);
    assert.ok(at('game/jungle-undergrowth-plan.js') < at('game/jungle-flowers-plan.js') && at('game/jungle-flowers-plan.js') < at('game/decor-plan.js'));
    assert.ok(at('game/render/jungle-flowers.js') > 0 && at('game/render/jungle-clearing.js') < at('game/render/scene.js'));
  }
  const scene = fs.readFileSync('game/render/scene.js', 'utf8');
  assert.ok(scene.includes('createJungleFlowers') && scene.includes('createJungleClearings') && scene.includes('clearings.update(dt)'));
  assert.ok(!/flower|clearing/i.test(scene.split('function obstacles()')[1].split('}))')[0]), 'never an obstacle');
});
