import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/map.js', 'game/reach.js', 'game/animal-plan.js', 'game/wander.js', 'game/perch.js', 'game/gait.js', 'game/render/ambient.js'];
const TREES = [
  { x: 8, z: 0, y: 0, scale: 1, kind: 'jungle' }, { x: 12, z: 3, y: 0, scale: 1.2, kind: 'jungle' },
  { x: 16, z: -2, y: 0, scale: 1, kind: 'jungle' }, { x: -10, z: 4, y: 0, scale: 1, kind: 'pine' },
  { x: 60, z: 0, y: 0, scale: 1, kind: 'jungle' },
];
const GOOD = () => ({
  id: 'loro', name: { es: 'loro', en: 'parrot', gender: 'm' }, icon: '🦜', biome: 'selva',
  traits: { size: 'pequeño', color: 'verde', movement: 'vuela', diet: 'herbívoro', legs: 2 },
  parts: [{ part: 'cuerpo', color: '#aabbcc', scale: 1, count: 1, offset: [0, 0, 0] }], easterEgg: false,
});
const run = (h, secs, dt = 1 / 30) => { const o = []; for (let t = 0; t < secs; t += dt) o.push(h.update(dt)); return o; };

test('animal data accepts perch "tree", rejects unknown values, and mono/tucan perch', () => {
  const SA = loadGame(FILES);
  const perchers = Array.from(SA.data.all('animals').filter((a) => a.perch), (a) => a.id);
  assert.deepEqual(perchers, ['mono', 'tucan']);
  SA.data.register('animals', [{ ...GOOD(), perch: 'tree' }]);
  assert.throws(() => SA.data.register('animals', [{ ...GOOD(), id: 'lorob', perch: 'cave' }]), /perch/);
  assert.throws(() => SA.data.register('animals', [{ ...GOOD(), id: 'loroc', perch: true }]), /perch/);
});

test('spots are seeded, only in the biome, and sit at canopy height', () => {
  const SA = loadGame(FILES);
  const a = SA.perch.spots(TREES, 'selva', 3), b = SA.perch.spots(TREES, 'selva', 3), c = SA.perch.spots(TREES, 'selva', 4);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.notEqual(JSON.stringify(a), JSON.stringify(c));
  assert.equal(a.length, 9, 'three trees in selva, three spots each (not the pine or the desert tree)');
  for (const s of a) {
    const t = TREES[s.tree];
    assert.equal(SA.map.biomeAt(s.x), 'selva');
    assert.ok(Math.hypot(s.x - t.x, s.z - t.z) <= 1.0 * t.scale + 1e-9, 'on the canopy ring');
    assert.ok(Math.abs(s.y - (t.y + SA.perch.KINDS.jungle.height * t.scale)) < 1e-9);
  }
  assert.equal(SA.perch.spots(TREES, 'montana', 1).length, 0);
  assert.equal(SA.perch.spots(null, 'selva').length, 0);
});

test('a perching animal sits in canopies, hops between nearby trees, and is deterministic', () => {
  const SA = loadGame(FILES);
  const mk = (seed) => SA.perch.create({ biome: 'selva', trees: TREES, seed, home: { x: 10, z: 0 } });
  const a = run(mk(5), 90), b = run(mk(5), 90), c = run(mk(6), 90);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.notEqual(JSON.stringify(a), JSON.stringify(c));
  assert.ok(a.some((p) => p.hopping), 'hops');
  assert.ok(a.some((p) => p.perched), 'sits');
  for (const p of a) {
    assert.equal(SA.map.biomeAt(p.x), 'selva');
    assert.ok(p.y >= 3.9, 'always up in a canopy (got ' + p.y + ')');
  }
  const spots = SA.perch.spots(TREES, 'selva', 5), seen = new Set(), h = mk(5);
  for (let t = 0; t < 200; t += 1 / 30) {
    h.update(1 / 30);
    const s = h.state();
    if (s.mode === 'sit') seen.add(spots[s.spot].tree);
  }
  assert.ok(seen.size >= 2, 'moves between trees');
});

test('hops are short, land on a branch, and hold/release freeze and resume perching', () => {
  const SA = loadGame(FILES);
  const spots = SA.perch.spots(TREES, 'selva', 2);
  const h = SA.perch.create({ biome: 'selva', trees: TREES, seed: 2, home: { x: 10, z: 0 } });
  let last = h.state(), maxHop = 0;
  for (let t = 0; t < 120; t += 1 / 30) {
    h.update(1 / 30);
    const s = h.state();
    if (s.mode === 'sit' && s.spot !== last.spot) {
      maxHop = Math.max(maxHop, Math.hypot(spots[s.spot].x - spots[last.spot].x, spots[s.spot].z - spots[last.spot].z));
      assert.ok(Math.abs(s.x - spots[s.spot].x) < 1e-9 && Math.abs(s.y - spots[s.spot].y) < 1e-9, 'lands exactly on a spot');
    }
    if (s.mode === 'sit') last = s;
  }
  assert.ok(maxHop > 0 && maxHop <= SA.perch.HOP_RANGE);
  h.hold();
  const frozen = run(h, 10);
  assert.ok(frozen.filter((p) => p.hopping).length <= SA.perch.HOP_TIME * 30 + 1, 'only a hop already under way finishes');
  const settled = run(h, 5).map((p) => [p.x, p.y, p.z].join());
  assert.equal(new Set(settled).size, 1, 'held animals stay put');
  h.release();
  assert.ok(run(h, 30).some((p) => p.hopping), 'hops again after release');
  const timed = SA.perch.create({ biome: 'selva', trees: TREES, seed: 2 });
  timed.hold(0.5); timed.hold(0.2);
  assert.equal(timed.state().held, true);
  run(timed, 1);
  assert.equal(timed.state().held, false);
});

test('without trees in range an animal stays put, and with no trees it sits at home', () => {
  const SA = loadGame(FILES);
  const far = [{ x: 5, z: 0 }, { x: 35, z: 0 }];
  const h = SA.perch.create({ biome: 'selva', trees: far, seed: 1, home: { x: 5, z: 0 } });
  for (const p of run(h, 60)) assert.ok(Math.hypot(p.x - 5, p.z) <= 1.0 + 1e-9, 'stays on its own tree');
  assert.equal(SA.perch.hopsOk({ x: 0, z: 0 }, { x: 20, z: 0 }), false);
  assert.equal(SA.perch.hopsOk(null, { x: 0, z: 0 }), false);
  const none = SA.perch.create({ biome: 'selva', trees: [], seed: 1, home: { x: 10, z: 2 } });
  const p = run(none, 5).pop();
  assert.equal(p.x, 10);
  assert.equal(p.y, SA.map.groundHeight(10, 2));
});

test('perched animals are out of reach from the ground and reachable from a canopy height', () => {
  const SA = loadGame(FILES);
  const h = SA.perch.create({ biome: 'selva', trees: TREES, seed: 1, home: { x: 10, z: 0 } });
  const p = run(h, 1).pop();
  assert.equal(SA.reach.canReach({ x: p.x, z: p.z, y: 0 }, { x: p.x, z: p.z, y: p.y }), false);
  assert.equal(SA.reach.canReach({ x: p.x, z: p.z, y: p.y - 0.5 }, { x: p.x, z: p.z, y: p.y }), true);
});

function stubGroup(SA, id) {
  const s = SA.animalPlan.placements(SA.data.all('animals'), {})[id];
  return { name: id, userData: { animalId: id, pickVolumes: [] }, position: { x: s.x, y: s.y, z: s.z }, rotation: { y: 0 },
    scale: { x: 1, y: 1, z: 1, set() {} }, children: [] };
}

test('ambient moves perchers through canopies, marks them perched, and leaves ground animals on the ground', () => {
  const SA = loadGame(FILES);
  SA.picking = { onPick() {} };
  const tucan = stubGroup(SA, 'tucan'), rana = stubGroup(SA, 'rana');
  const amb = SA.render.createAmbient({ animals: { children: [tucan, rana] }, avoid: [], trees: TREES });
  assert.equal(tucan.userData.perched, true);
  assert.equal(rana.userData.perched, undefined);
  let minY = Infinity;
  for (let i = 0; i < 600; i++) { amb.update(1 / 30); minY = Math.min(minY, tucan.position.y); }
  assert.ok(minY >= 3.9, 'tucan stays in the canopy');
  assert.ok(rana.position.y < 3, 'frog stays on the ground');
  amb.hold('tucan'); amb.release('tucan'); amb.setAvoid([[0, 0]]);
});
