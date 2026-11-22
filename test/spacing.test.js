import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/map.js', 'game/animal-plan.js', 'game/spacing.js', 'game/wander.js', 'game/gait.js', 'game/render/ambient.js'];
const MOVES = ['salta', 'nada', 'trepa', 'camina lento', 'corre', 'repta', 'vuela'];
const SIZES = ['pequeño', 'mediano', 'grande'];
const BIOME = 'desierto';   // all dry land (x 40..80), so the walkers are never squeezed by water
const DT = 1 / 30;
const EPS = 1e-6;

// n walkers in one biome sharing live positions + radii (as SA.render.createAmbient does); homes default to a spread grid.
function crowd(SA, n, { homes, holdIds = [], radius = 3 } = {}) {
  const ws = [];
  const spots = homes || Array.from({ length: n }, (_, i) => ({ x: 46 + (i % 5) * 6, z: -12 + Math.floor(i / 5) * 6 }));
  spots.forEach((home, i) => {
    const r = SA.spacing.RADIUS[SIZES[i % 3]];
    const w = SA.wander.create({
      movement: MOVES[i % MOVES.length], biome: BIOME, home, seed: 7 + i * 13, radius, bodyRadius: r,
      others: () => ws.flatMap((o, j) => (j === i ? [] : [[o.state().x, o.state().z, o.r]])),
    });
    w.r = r;
    ws.push(w);
  });
  ws.bodies = () => ws.map((w) => ({ x: w.state().x, z: w.state().z, r: w.r }));
  holdIds.forEach((i) => ws[i].hold());
  return ws;
}

test('SA.spacing: GAP is 1.5, radius comes from the size trait, gap is distance minus both radii', () => {
  const SA = loadGame(FILES);
  assert.equal(SA.spacing.GAP, 1.5);
  const r = (size) => SA.spacing.bodyRadius({ traits: { size } });
  assert.ok(r('pequeño') < r('mediano') && r('mediano') < r('grande'));
  assert.equal(SA.spacing.bodyRadius(null), r('grande'), 'unknown animals count as big (safe)');
  assert.equal(SA.spacing.gap({ x: 0, z: 0, r: 0.5 }, { x: 3, z: 4, r: 1 }), 3.5);
  assert.equal(SA.spacing.minGap({ x: 0, z: 0, r: 1 }, [[10, 0, 1], [0, 5, 0.5]]), 3.5);
  assert.equal(SA.spacing.minGap({ x: 0, z: 0 }, []), Infinity);
  assert.equal(SA.spacing.worst([{ x: 0, z: 0, r: 0 }]), Infinity);
  assert.equal(SA.spacing.worst([{ x: 0, z: 0, r: 0 }, { x: 5, z: 0, r: 1 }, { x: 0, z: 2, r: 0 }]), 2);
  for (const a of SA.data.all('animals')) assert.ok(SA.spacing.bodyRadius(a) > 0);
});

test('15 ground animals wandering 120 s never have a body gap below 1.5 after the first second', () => {
  const SA = loadGame(FILES);
  const ws = crowd(SA, 15);
  const start = ws.bodies();
  let minGap = Infinity;
  for (let t = 0; t < 120; t += DT) {
    ws.forEach((w) => w.update(DT));
    if (t >= 1) minGap = Math.min(minGap, SA.spacing.worst(ws.bodies()));
  }
  const moved = ws.bodies().filter((b, i) => Math.hypot(b.x - start[i].x, b.z - start[i].z) > 0.5).length;
  assert.ok(minGap >= SA.spacing.GAP - EPS, `smallest gap ${minGap}`);
  assert.ok(moved >= 8, `they still wander (${moved} moved)`);
});

test('a tight pack that starts inside the gap is separated and then stays apart', () => {
  const SA = loadGame(FILES);
  const homes = Array.from({ length: 12 }, (_, i) => ({ x: 54 + (i % 4) * 2, z: 5 + Math.floor(i / 4) * 2 }));
  const ws = crowd(SA, 12, { homes, radius: 5 });
  let minGap = Infinity;
  for (let t = 0; t < 90; t += DT) {
    ws.forEach((w) => w.update(DT));
    if (t >= 3) minGap = Math.min(minGap, SA.spacing.worst(ws.bodies()));
  }
  assert.ok(minGap >= SA.spacing.GAP - EPS, `smallest gap ${minGap}`);
});

test('animals spawned overlapping are pushed apart to the gap within about 1 s, smoothly (no teleport)', () => {
  const SA = loadGame(FILES);
  const ws = crowd(SA, 3, { homes: [{ x: 54, z: 10 }, { x: 54, z: 10 }, { x: 54.5, z: 10.2 }] });
  let prev = ws.bodies(), maxStep = 0, gapAt = null;
  for (let t = 0; t < 2.5; t += DT) {
    ws.forEach((w) => w.update(DT));
    const now = ws.bodies();
    now.forEach((b, i) => { maxStep = Math.max(maxStep, Math.hypot(b.x - prev[i].x, b.z - prev[i].z)); });
    prev = now;
    if (gapAt === null && t >= 1.2) gapAt = SA.spacing.worst(now);
  }
  assert.ok(gapAt >= SA.spacing.GAP - EPS, `gap after ~1 s was ${gapAt}`);
  assert.ok(maxStep <= (3.5 + 1.8) * DT + 1e-9, `largest per-frame step ${maxStep}`);
  assert.ok(SA.spacing.worst(ws.bodies()) >= SA.spacing.GAP - EPS);
});

test('a held animal never moves, even when overlapped, and the others steer around it without breaking the gap', () => {
  const SA = loadGame(FILES);
  const homes = [{ x: 54, z: 10 }, { x: 54, z: 10.3 }, { x: 56, z: 10 }, { x: 52, z: 10 }, { x: 54, z: 8 }, { x: 54, z: 12 }];
  const ws = crowd(SA, 6, { homes, holdIds: [0], radius: 4 });
  const home = ws[0].state();
  let minGap = Infinity;
  for (let t = 0; t < 120; t += DT) {
    ws.forEach((w) => w.update(DT));
    const s = ws[0].state();
    assert.equal(s.x, home.x); assert.equal(s.z, home.z);
    if (t >= 2) minGap = Math.min(minGap, SA.spacing.worst(ws.bodies()));
  }
  assert.ok(minGap >= SA.spacing.GAP - EPS, `smallest gap ${minGap}`);
  ws[0].release();
  let moved = false;
  for (let t = 0; t < 60 && !moved; t += DT) { ws.forEach((w) => w.update(DT)); const s = ws[0].state(); moved = Math.hypot(s.x - home.x, s.z - home.z) > 0.3; }
  assert.ok(moved, 'released: wanders again');
});

test('a walker next to a held animal slides around it or pauses, never through the gap', () => {
  const SA = loadGame(FILES);
  const R = 0.6, blockers = [[56.8, 10, R]];
  for (let seed = 1; seed <= 8; seed++) {
    const w = SA.wander.create({ movement: 'corre', biome: BIOME, home: { x: 52, z: 10 }, seed, radius: 5, bodyRadius: R, others: () => blockers });
    let moved = false;
    for (let t = 0; t < 120; t += DT) {
      const p = w.update(DT);
      moved = moved || p.moving;
      assert.ok(Math.hypot(p.x - blockers[0][0], p.z - blockers[0][1]) - 2 * R >= SA.spacing.GAP - EPS || t < 1, `seed ${seed} at ${t}`);
    }
    assert.ok(moved);
  }
});

test('ambient gives each ground walker the others\' radii: real animals at their placements keep the gap', () => {
  const SA = loadGame(FILES);
  SA.picking = { onPick() {} };
  const spots = SA.animalPlan.placements(SA.data.all('animals'), {});
  const children = SA.data.all('animals').map((a) => ({
    name: a.id, userData: { animalId: a.id }, position: { x: spots[a.id].x, y: 0, z: spots[a.id].z }, rotation: { y: 0 },
    scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, children: [],
  }));
  const amb = SA.render.createAmbient({ animals: { children }, avoid: [] });
  const ground = children.filter((g) => !g.userData.perched);
  const bodies = () => ground.map((g) => ({ x: g.position.x, z: g.position.z, r: SA.spacing.bodyRadius(SA.data.get('animals', g.userData.animalId)) }));
  assert.ok(ground.length >= 8);
  let minGap = Infinity;
  for (let t = 0; t < 60; t += DT) {
    amb.update(DT);
    if (t >= 3) minGap = Math.min(minGap, SA.spacing.worst(bodies()));
  }
  assert.ok(minGap >= SA.spacing.GAP - EPS, `smallest gap ${minGap}`);
});
