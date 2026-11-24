import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// AS-0254: pure per-instance herd spots (3-5 per regular species) with minimum spacing.
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/map.js', 'game/station.js', 'game/player.js', 'game/spacing.js', 'game/animal-plan.js'];
const load = () => {
  const SA = loadGame(FILES);
  const animals = SA.data.all('animals');
  return { SA, animals, byId: Object.fromEntries(animals.map((a) => [a.id, a])), world: animals.filter((a) => !a.story && !a.easterEgg) };
};

test('every regular species declares a herd of 3-5; story animals and easter eggs keep the default', () => {
  const { animals } = load();
  for (const a of animals) {
    if (a.story || a.easterEgg) assert.equal(a.herd, undefined, a.id);
    else assert.ok(Number.isInteger(a.herd) && a.herd >= 3 && a.herd <= 5, `${a.id} herd ${a.herd}`);
  }
});

test('herdPlacements: herd-count instances per species with distinct ids, in the species biome, on dry ground', () => {
  const { SA, byId, world } = load();
  const list = SA.animalPlan.herdPlacements(world, {});
  assert.equal(list.length, world.reduce((n, a) => n + a.herd, 0));
  assert.equal(new Set(list.map((s) => s.instanceId)).size, list.length);
  for (const a of world) {
    const mine = list.filter((s) => s.animalId === a.id);
    assert.equal(mine.length, a.herd, a.id);
    mine.forEach((s, n) => assert.equal(s.instanceId, a.id + '#' + n));
  }
  for (const s of list) {
    assert.equal(SA.map.biomeAt(s.x), byId[s.animalId].biome, s.instanceId);
    assert.ok(!SA.map.isWater(s.x, s.z), s.instanceId);
    assert.ok(SA.map.groundHeight(s.x, s.z) >= SA.map.WATER_LEVEL + 0.45, s.instanceId);
    assert.equal(s.y, SA.map.groundHeight(s.x, s.z));
    assert.ok(Number.isFinite(s.rotY) && s.radius > 0, s.instanceId);
  }
});

test('herdPlacements: instances keep the body gap, pick clearance and MIN_CENTRE from each other', () => {
  const { SA, byId, world } = load();
  const list = SA.animalPlan.herdPlacements(world, {});
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = byId[list[i].animalId], b = byId[list[j].animalId];
      const d = Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z);
      const need = Math.max(SA.spacing.bodyRadius(a) + SA.spacing.bodyRadius(b) + SA.spacing.GAP, SA.animalPlan.pickRadius(a) + SA.animalPlan.pickRadius(b), 4.5);
      assert.ok(d >= need - 1e-9, `${list[i].instanceId} / ${list[j].instanceId}: ${d.toFixed(2)} < ${need.toFixed(2)}`);
    }
  }
});

test('herdPlacements: clear of the spawn zone, the station footprint and opts.avoid', () => {
  const { SA, world } = load();
  const avoid = [[-30, 5], [40, -8], [70, 12]];
  const list = SA.animalPlan.herdPlacements(world, { avoid });
  for (const s of list) {
    assert.ok(!SA.player.inSpawnZone(s.x, s.z), s.instanceId + ' in spawn zone');
    assert.ok(!SA.station.inFootprint(s.x, s.z), s.instanceId + ' in station footprint');
    for (const p of avoid) assert.ok(Math.hypot(p[0] - s.x, p[1] - s.z) >= 2.4, s.instanceId + ' near avoid point');
  }
});

test('herdPlacements: each species spreads over several sub-areas of its biome, not one clump', () => {
  const { SA, world } = load();
  const list = SA.animalPlan.herdPlacements(world, {});
  for (const a of world) {
    const mine = list.filter((s) => s.animalId === a.id);
    const spread = Math.max(...mine.map((s) => Math.max(...mine.map((o) => Math.hypot(s.x - o.x, s.z - o.z)))));
    assert.ok(spread >= 15, `${a.id} spread ${spread.toFixed(1)}`);
  }
  assert.equal(SA.animalPlan.subAreas('bosque').length, 6);
  assert.deepEqual(Array.from(SA.animalPlan.subAreas('luna')), []);
});

test('herdPlacements: deterministic, and a missing herd means one instance; placements() is unchanged', () => {
  const a = load(), b = load();
  const run = (g) => JSON.parse(JSON.stringify(g.SA.animalPlan.herdPlacements(g.world, { avoid: [[10, 10]] })));
  assert.deepEqual(run(a), run(b));
  const one = a.SA.animalPlan.herdPlacements([a.byId.cerda], {});
  assert.deepEqual(Array.from(one, (s) => s.instanceId), ['cerda#0']);
  const spots = a.SA.animalPlan.placements(a.world, {});
  assert.equal(Object.keys(spots).length, a.world.length);
});
