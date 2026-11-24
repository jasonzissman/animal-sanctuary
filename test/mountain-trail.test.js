// AS-0309: the montaña's switchback trail (walkable, smooth), its seeded boulder field, snowy summit colour and the instanced renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const BASE = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/mountain-trail.js', 'game/map.js',
  'game/peaks.js', 'game/save.js', 'game/station.js', 'game/player.js', 'game/rocks.js'];
const SA = loadGame([...BASE, 'game/mountain-plan.js', 'game/terrain-color.js', 'game/decor-plan.js', 'game/ground-cover-plan.js']);
const M = SA.map, T = SA.mountainTrail, MP = SA.mountainPlan;
const montana = M.biomeRange('montana');

/** Ground heights sampled every `step` metres along the trail centre line. */
function profile(step) {
  const out = [], p = {};
  for (let s = 0; s <= T.LENGTH; s += step) { T.pointAt(s, p); out.push({ s, x: p.x, z: p.z, y: M.groundHeight(p.x, p.z) }); }
  return out;
}

test('the trail is a long switchback inside the montaña that climbs from the border to the summit', () => {
  assert.ok(T.LENGTH > 90, 'length ' + T.LENGTH);
  for (const [x, z] of T.POINTS) assert.ok(x >= montana.lo && x <= M.MOUNTAIN_EDGE && z > M.BOUNDS.minZ && z < M.BOUNDS.maxZ, `${x},${z}`);
  assert.ok(Math.abs(T.START[0] - M.MOUNTAIN_EDGE) < 0.01, 'starts where the mountain begins');
  // Switchbacks: the walking direction in z flips at least 4 times.
  let flips = 0, last = 0;
  for (let i = 1; i < T.POINTS.length; i++) {
    const dz = T.POINTS[i][1] - T.POINTS[i - 1][1];
    if (Math.abs(dz) > 0.2 && Math.sign(dz) !== last) { if (last) flips++; last = Math.sign(dz); }
  }
  assert.ok(flips >= 3, 'direction flips ' + flips);
  const pr = profile(1);
  assert.ok(pr[pr.length - 1].y - pr[0].y > 5, 'rises ' + (pr[pr.length - 1].y - pr[0].y));
  assert.ok(M.groundHeight(T.END[0], T.END[1]) > 6, 'the end is high on the mountain');
});

test('max slope along the trail: every step is walkable, and the height rises steadily', () => {
  const step = 0.25, pr = profile(step);
  let worst = 0, drop = 0;
  for (let i = 1; i < pr.length; i++) {
    const rise = pr[i].y - pr[i - 1].y;
    worst = Math.max(worst, Math.abs(rise) / step);
    drop = Math.min(drop, rise);
    assert.ok(!M.isWater(pr[i].x, pr[i].z), 'wet at ' + pr[i].s);
  }
  assert.ok(worst < M.MAX_WALK_SLOPE * 0.6, 'steepest ' + worst.toFixed(3) + ' (limit ' + M.MAX_WALK_SLOPE + ')');
  assert.ok(drop > -0.01, 'never goes downhill: ' + drop);
});

test('groundHeight changes smoothly along the trail (no jumps in the slope) and across its width', () => {
  const step = 0.25, pr = profile(step);
  let jump = 0;
  for (let i = 2; i < pr.length; i++) jump = Math.max(jump, Math.abs((pr[i].y - pr[i - 1].y) - (pr[i - 1].y - pr[i - 2].y)) / step);
  assert.ok(jump < 0.15, 'slope changes by ' + jump.toFixed(3) + ' per step');
  // Across the strip the ground is level with the centre line, and the walkable strip stays flat to within a little.
  for (const q of pr.filter((_, i) => i % 20 === 0)) {
    for (const off of [-1.2, 1.2]) {
      const near = T.distance(q.x + off, q.z) < T.WIDTH / 2 ? M.groundHeight(q.x + off, q.z) : q.y;
      assert.ok(Math.abs(near - q.y) < 0.9, `cross-slope at s=${q.s}`);
    }
  }
});

test('the trail strip and the first 1.5 m of its shoulders are walkable in every direction (no cliff faces)', () => {
  let worst = 0, at = null;
  for (let x = -100; x <= M.MOUNTAIN_EDGE; x += 0.5) for (let z = -20; z <= 20; z += 0.5) {
    if (T.distance(x, z) > T.WIDTH / 2 + 1.5) continue;
    const h = M.groundHeight(x, z), s = Math.max(Math.abs(M.groundHeight(x + 0.5, z) - h), Math.abs(M.groundHeight(x, z + 0.5) - h)) / 0.5;
    if (s > worst) { worst = s; at = [x, z]; }
  }
  assert.ok(worst < M.MAX_WALK_SLOPE, `steepest ${worst.toFixed(3)} at ${at}`);
});

test('trail sampling is allocation-free, exact on the line and far away is Infinity', () => {
  const out = { d: 0, s: 0 };
  assert.equal(T.sample(T.START[0], T.START[1], out), out);
  assert.ok(out.d < 1e-9 && out.s < 1e-9);
  assert.equal(T.distance(0, 0), Infinity);
  assert.ok(T.onTrail(T.END[0], T.END[1]) && !T.onTrail(-60, -30));
  assert.equal(T.strength(T.END[0], T.END[1]), 1);
  assert.equal(T.strength(0, 0), 0);
  const p = {};
  T.pointAt(-5, p); assert.deepEqual([p.x, p.z], [T.START[0], T.START[1]]);
  T.pointAt(1e9, p); assert.deepEqual([p.x, p.z], [T.END[0], T.END[1]]);
});

test('without the trail module the mountain is unchanged apart from the dome', () => {
  const bare = loadGame(['game/sa.js', 'game/map.js']).map;
  assert.equal(bare.mountainHeight(-40, 0), 0);
  assert.ok(Number.isFinite(bare.groundHeight(-80, 5)));
  assert.equal(M.mountainHeight(-40, 0), 0, 'nothing east of the mountain edge');
});

test('boulder field: seeded, deterministic, clustered and montaña-only', () => {
  const L = MP.get();
  assert.deepEqual(MP.layout(), L);
  assert.equal(MP.get(), MP.get());
  assert.notDeepEqual(MP.layout(MP.SEED + 1), L);
  assert.ok(L.clusters.length >= 3 && L.boulders.length >= 20, `${L.clusters.length} clusters, ${L.boulders.length} boulders`);
  assert.ok(new Set(L.boulders.map((b) => b.kind)).size >= 2, 'a mix of rock kinds');
  for (const b of L.boulders) {
    assert.ok(SA.rocks.KINDS.includes(b.kind) && b.variant >= 0 && b.variant < SA.rocks.VARIANTS && SA.rocks.PALETTES.montana.includes(b.color));
    assert.ok(L.clusters.some((c) => Math.hypot(b.x - c.x, b.z - c.z) <= c.r + 0.01), 'in a cluster');
    assert.equal(b.y, M.groundHeight(b.x, b.z));
  }
});

test('boulders stay off the trail, the spawn, the station, the peaks, the biome borders and each other', () => {
  const L = MP.get();
  for (const b of L.boulders) {
    assert.equal(M.biomeAt(b.x), 'montana');
    assert.ok(b.x - b.r > montana.lo + 5 && b.x + b.r < montana.hi - 5, `border x ${b.x}`);
    assert.ok(b.z - b.r > M.BOUNDS.minZ + 5 && b.z + b.r < M.BOUNDS.maxZ - 5, `border z ${b.z}`);
    assert.ok(T.distance(b.x, b.z) >= T.WIDTH / 2 + b.r + 0.99, `on the trail at ${b.x},${b.z}`);
    assert.ok(!SA.player.inSpawnZone(b.x, b.z, b.r) && !SA.station.inFootprint(b.x, b.z, b.r));
    for (const p of SA.peaks.LIST) assert.ok(Math.hypot(b.x - p.x, b.z - p.z) > SA.peaks.BASE_R + b.r, 'on a peak ' + p.id);
  }
  for (let i = 0; i < L.boulders.length; i++) for (let j = i + 1; j < L.boulders.length; j++) {
    const a = L.boulders[i], b = L.boulders[j];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.r + b.r, 'overlap');
  }
  // The whole trail centre line and strip is clear of every solid.
  for (const q of profile(0.5)) for (const [x, z, r] of MP.solids()) assert.ok(Math.hypot(q.x - x, q.z - z) > r + T.WIDTH / 2, `blocks the trail at s=${q.s}`);
});

test('solids match the boulders; near() covers trail and field, inField() only the field', () => {
  const L = MP.get(), s = MP.solids();
  assert.equal(s, MP.solids());
  assert.equal(s.length, L.boulders.length);
  assert.ok(s.every(([x, z, r, h]) => r > 0.4 && h > 0.2 && h < 3));
  const c = L.clusters[0];
  assert.ok(MP.near(c.x, c.z) && MP.inField(c.x, c.z));
  assert.ok(MP.near(T.END[0], T.END[1]) && !MP.inField(T.END[0], T.END[1]));
  assert.ok(!MP.near(0, 0) && !MP.inField(0, 0));
});

test('scenery and plants are planned off the trail and the boulder field', () => {
  for (const d of SA.decorPlan.plan()) assert.ok(!MP.near(d.x, d.z, 0.5), `decor on the mountain trail/field at ${d.x},${d.z}`);
  for (const g of SA.groundCoverPlan.plan()) assert.ok(!MP.near(g.x, g.z), `plant on the mountain trail/field at ${g.x},${g.z}`);
});

test('colour: the trail is lighter ground, and the summit is snow white (deterministic)', () => {
  const mid = {}; T.pointAt(T.LENGTH * 0.35, mid);
  const on = SA.terrain.groundColor(mid.x, mid.z, M.groundHeight(mid.x, mid.z), 7);
  // A point 4 m off the leg at the same height band is scree/snow, not trail dirt: the trail strip differs from it.
  const off = SA.terrain.groundColor(mid.x, mid.z + 5, M.groundHeight(mid.x, mid.z), 7);
  assert.notDeepEqual(on, off);
  const e = T.END, y = M.groundHeight(e[0], e[1]);
  const top = SA.terrain.groundColor(e[0] + 4, e[1] + 4, y, 7);
  assert.ok(top.r > 0.9 && top.g > 0.9 && top.b > 0.9, `summit not white: ${JSON.stringify(top)}`);
  const c = SA.terrain.groundColor(e[0], e[1], y, 7);
  assert.ok(c.b < top.b - 0.05, 'the trail strip on the summit is warmer than the snow around it');
  assert.deepEqual(SA.terrain.groundColor(e[0], e[1], y, 7), c);
});

function stubTHREE() {
  const log = { inst: [], added: [] };
  class V { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
  class Group { constructor() { this.children = []; } add(c) { this.children.push(c); } }
  class Obj { constructor() { this.position = new V(); this.rotation = new V(); this.scale = new V(); this.matrix = {}; } updateMatrix() {} }
  class Inst { constructor(g, m, n) { Object.assign(this, { geometry: g, material: m, count: n, mats: 0, cols: 0, instanceMatrix: {} }); log.inst.push(this); } setMatrixAt() { this.mats++; } setColorAt() { this.cols++; } }
  class Color { set() { return this; } }
  class Geo { setAttribute() {} computeVertexNormals() {} }
  return { log, T: { Group, Object3D: Obj, InstancedMesh: Inst, Color, MeshPhongMaterial: class {}, BufferGeometry: Geo, Float32BufferAttribute: class {} } };
}

test('render: the field is drawn with InstancedMesh, one per kind+variant, one instance per boulder', () => {
  const rocks = { create: () => ({ geometry: (k, v) => ({ k, v }) }) };
  const ctx = loadGame([...BASE, 'game/mountain-plan.js', (sa) => { sa.render = { rocks }; }, 'game/render/mountain-boulders.js']);
  const { T: THREE, log } = stubTHREE();
  const scene = { add: (g) => log.added.push(g) };
  const f = ctx.render.createMountainBoulders(THREE, { scene });
  const L = ctx.mountainPlan.get(), st = f.stats();
  assert.deepEqual(log.added, [f.group]);
  assert.equal(st.boulders, L.boulders.length);
  assert.equal(log.inst.length, st.drawCalls);
  assert.ok(st.drawCalls >= 1 && st.drawCalls <= 12);
  assert.equal(log.inst.reduce((n, m) => n + m.count, 0), L.boulders.length);
  assert.ok(log.inst.every((m) => m.mats === m.count && m.cols === m.count));
});

test('scripts load in order and the renderer is wired in', () => {
  const html = fs.readFileSync('index.html', 'utf8'), man = fs.readFileSync('game/manifest.js', 'utf8');
  const at = (t, f) => t.indexOf(f);
  for (const t of [html, man]) {
    assert.ok(at(t, 'game/mountain-trail.js') >= 0 && at(t, 'game/mountain-trail.js') < at(t, 'game/map.js'));
    assert.ok(at(t, 'game/rocks.js') < at(t, 'game/mountain-plan.js'));
    assert.ok(at(t, 'game/render/rocks.js') < at(t, 'game/render/mountain-boulders.js') && at(t, 'game/render/mountain-boulders.js') < at(t, 'game/render/scene.js'));
  }
  const scene = fs.readFileSync('game/render/scene.js', 'utf8');
  assert.ok(scene.includes('createMountainBoulders') && scene.includes('mountainPlan.solids()'));
  for (const f of ['wander', 'animal-plan', 'decor-plan', 'ground-cover-plan', 'pickups']) assert.ok(fs.readFileSync(`game/${f}.js`, 'utf8').includes('mountainPlan'), f);
});
