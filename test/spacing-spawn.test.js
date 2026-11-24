import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// AS-0162: spawn placement, herds and tree perches respect SA.spacing.GAP (real animal + biome data).
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/map.js', 'game/station.js', 'game/player.js', 'game/spacing.js', 'game/reach.js', 'game/animal-plan.js', 'game/wander.js',
  'game/perch.js', 'game/gait.js', 'game/render/instances.js', 'game/render/ambient.js'];
const TREES = [
  { x: 8, z: 0, y: 0, scale: 1, kind: 'jungle' }, { x: 12, z: 3, y: 0, scale: 1.2, kind: 'jungle' },
  { x: 16, z: -2, y: 0, scale: 1, kind: 'jungle' }, { x: -10, z: 4, y: 0, scale: 1, kind: 'pine' },
];
const DT = 1 / 30;

function bodies(SA, animals, spots) {
  return animals.map((a) => ({ id: a.id, x: spots[a.id].x, z: spots[a.id].z, r: SA.spacing.bodyRadius(a), pick: SA.animalPlan.pickRadius(a) }));
}
// Several of each species (herds, AS-0130): the same animal data under distinct ids.
function herd(SA, per) {
  const out = [];
  for (const a of SA.data.all('animals')) for (let i = 0; i < per; i++) out.push({ ...a, id: a.id + '#' + i });
  return out;
}

test('initial placements over real data: every pair keeps a body gap of at least 1.5', () => {
  const SA = loadGame(FILES);
  const animals = SA.data.all('animals');
  const b = bodies(SA, animals, SA.animalPlan.placements(animals, { avoid: [[-8, 4]] }));
  assert.ok(b.length >= 11);
  assert.ok(SA.spacing.worst(b) >= SA.spacing.GAP, 'worst gap ' + SA.spacing.worst(b));
});

test('herds of several per species also spawn with at least 1.5 gap, in every biome', () => {
  const SA = loadGame(FILES);
  for (const per of [2, 3]) {
    const animals = herd(SA, per);
    const spots = SA.animalPlan.placements(animals, {});
    const b = bodies(SA, animals, spots);
    for (const a of animals) {
      assert.equal(SA.map.biomeAt(spots[a.id].x), a.biome, a.id);
      assert.ok(!SA.map.isWater(spots[a.id].x, spots[a.id].z), a.id);
    }
    assert.ok(SA.spacing.worst(b) >= SA.spacing.GAP, `per=${per}: worst gap ${SA.spacing.worst(b)}`);
  }
});

test('enlarged pick volumes of different animals do not overlap at spawn (single and herds)', () => {
  const SA = loadGame(FILES);
  for (const animals of [SA.data.all('animals'), herd(SA, 3)]) {
    const b = bodies(SA, animals, SA.animalPlan.placements(animals, {}));
    for (const a of b) assert.ok(a.pick > 0, a.id + ' has pick volumes');
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const d = Math.hypot(b[i].x - b[j].x, b[i].z - b[j].z);
      assert.ok(d >= b[i].pick + b[j].pick, `${b[i].id} / ${b[j].id}: ${d.toFixed(2)} < ${(b[i].pick + b[j].pick).toFixed(2)}`);
    }
  }
});

function makeHoppers(SA, specs, trees, seedBase, sameSeed) {
  const hs = [];
  specs.forEach((sp, i) => {
    hs.push(SA.perch.create({
      biome: 'selva', trees, seed: sameSeed ? seedBase : seedBase + i, home: sp.home, bodyRadius: sp.r,
      others: () => hs.filter((_, j) => j !== i).flatMap((h) => h.claims()),
    }));
  });
  return hs;
}
function worstClaims(SA, hs) {
  // the smallest gap between claimed spots of DIFFERENT animals (one animal's own start and landing spots may be close)
  let m = Infinity;
  hs.forEach((a, i) => hs.forEach((b, j) => {
    if (j <= i) return;
    for (const p of a.claims()) for (const q of b.claims()) m = Math.min(m, SA.spacing.gap({ x: p[0], z: p[1], r: p[2] }, { x: q[0], z: q[1], r: q[2] }));
  }));
  return m;
}

test('perchers (mono + tucan, real data) never sit on or land on spots closer than 1.5 for 120 s', () => {
  const SA = loadGame(FILES);
  const [mono, tucan] = ['mono', 'tucan'].map((id) => SA.data.get('animals', id));
  const specs = [mono, tucan].map((a) => ({ r: SA.spacing.bodyRadius(a), home: { x: 10, z: 0 } }));
  for (const seed of [1, 2, 3, 100, 101]) {
    const hs = makeHoppers(SA, specs, TREES, seed);
    let hops = 0, was = [false, false];
    for (let t = 0; t < 120; t += DT) {
      hs.forEach((h, i) => { const p = h.update(DT); if (p.hopping && !was[i]) hops++; was[i] = p.hopping; });
      assert.ok(worstClaims(SA, hs) >= SA.spacing.GAP, `seed ${seed} t=${t.toFixed(1)}: gap ${worstClaims(SA, hs)}`);
    }
    assert.ok(hops > 0, 'they still hop between free spots (seed ' + seed + ')');
  }
});

test('several perchers in the same big tree keep 1.5 apart, and one in a crowd waits instead of landing too close', () => {
  const SA = loadGame(FILES);
  const big = [{ x: 10, z: 0, y: 0, scale: 3, kind: 'jungle' }, { x: 14, z: 2, y: 0, scale: 3, kind: 'jungle' }];
  const specs = [0.3, 0.3, 0.3].map((r) => ({ r, home: { x: 10, z: 0 } }));
  let sameTree = false;
  for (const seed of [1, 5, 9, 13]) {
    const hs = makeHoppers(SA, specs, big, seed, true);   // one seed: all three share the same spot list, so spots compare by index
    const spots = SA.perch.spots(big, 'selva', seed);
    assert.ok(spots.length >= 6);
    for (let t = 0; t < 120; t += DT) {
      hs.forEach((h) => h.update(DT));
      const gap = worstClaims(SA, hs);
      assert.ok(gap >= SA.spacing.GAP, `seed ${seed} t=${t.toFixed(1)}: gap ${gap}`);
      const trees = hs.map((h) => spots[h.state().spot].tree);
      if (new Set(trees).size < trees.length) sameTree = true;
    }
  }
  assert.ok(sameTree, 'the big canopies really do hold two perchers at once');
  // A lone tree with one canopy: the second animal cannot fit anywhere free, so it never hops onto the first one's spot.
  const one = [{ x: 10, z: 0, y: 0, scale: 1, kind: 'jungle' }];
  const hs = makeHoppers(SA, [{ r: 0.6, home: { x: 10, z: 0 } }, { r: 0.6, home: { x: 10, z: 0 } }], one, 3);
  const start = hs.map((h) => h.state().spot);
  for (let t = 0; t < 120; t += DT) hs.forEach((h) => h.update(DT));
  hs.forEach((h, i) => assert.equal(h.state().spot, i === 0 ? start[0] : start[1], 'nobody hops onto a taken spot'));
  assert.notEqual(start[0], start[1], 'they start on different spots');
});

test('ambient: real mono and tucan perch apart through a 120 s simulation', () => {
  const SA = loadGame(FILES);
  SA.picking = { onPick() {} };
  const grp = (id) => {
    const s = SA.animalPlan.placements(SA.data.all('animals'), {})[id];
    return { name: id, userData: { animalId: id, pickVolumes: [] }, position: { x: s.x, y: s.y, z: s.z }, rotation: { y: 0 },
      scale: { x: 1, y: 1, z: 1, set() {} }, children: [] };
  };
  const mono = grp('mono'), tucan = grp('tucan');
  const amb = SA.render.createAmbient({ animals: { children: [mono, tucan] }, avoid: [], trees: TREES });
  const rm = SA.spacing.bodyRadius(SA.data.get('animals', 'mono')), rt = SA.spacing.bodyRadius(SA.data.get('animals', 'tucan'));
  let worst = Infinity;
  for (let t = 0; t < 120; t += DT) {
    amb.update(DT);
    worst = Math.min(worst, SA.spacing.gap({ x: mono.position.x, z: mono.position.z, r: rm }, { x: tucan.position.x, z: tucan.position.z, r: rt }));
  }
  // positions are mid-hop between spots for ~0.9 s at a time, so the strict bound applies to claims; in flight they only
  // cross between two free spots and must never coincide.
  assert.ok(worst > 0, 'the two never overlap, worst gap ' + worst);
});
