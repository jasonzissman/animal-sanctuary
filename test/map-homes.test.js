import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// AS-0249 (slice 3/3 of AS-0129): animal homes, wander areas and mission anchors cover the whole 2x map.
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/save.js',
  'game/map.js', 'game/peaks.js', 'game/station.js', 'game/npc.js', 'game/player.js', 'game/spacing.js', 'game/animal-plan.js', 'game/photo.js',
  'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/mission-spawn.js'];

const world = (SA) => SA.data.all('animals').filter((a) => !a.story);

test('each quadrant of each biome has an animal home or a wander area', () => {
  const SA = loadGame(FILES);
  const animals = world(SA);
  const spots = SA.animalPlan.placements(animals, {});
  for (const strip of SA.map.STRIPS) {
    const inBiome = animals.filter((a) => a.biome === strip.id);
    assert.ok(inBiome.length, `${strip.id} has animals`);
    for (const q of SA.animalPlan.quadrants(strip.id)) {
      const homes = inBiome.filter((a) => spots[a.id].quad === q.id);
      const wander = inBiome.filter((a) => a.perch !== 'tree' && Math.hypot(spots[a.id].x - q.cx, spots[a.id].z - q.cz) <= spots[a.id].radius);
      assert.ok(homes.length || wander.length, `${strip.id} ${q.id}: no animal home or wander area`);
      for (const a of homes) {
        const s = spots[a.id];
        assert.ok(s.x >= q.x0 && s.x <= q.x1 && s.z >= q.z0 && s.z <= q.z1, `${a.id} home inside its quadrant`);
      }
    }
  }
});

test('every animal home is inside BOUNDS, on dry flat ground and away from the spawn clearing and the station', () => {
  const SA = loadGame(FILES);
  const B = SA.map.BOUNDS, sp = SA.player.spawn();
  const spots = SA.animalPlan.placements(world(SA), {});
  for (const a of world(SA)) {
    const s = spots[a.id];
    assert.ok(s.x > B.minX && s.x < B.maxX && s.z > B.minZ && s.z < B.maxZ, `${a.id} inside BOUNDS`);
    assert.equal(SA.map.biomeAt(s.x), a.biome, `${a.id} in its biome`);
    assert.ok(SA.map.groundHeight(s.x, s.z) >= SA.map.WATER_LEVEL + 0.45, `${a.id} on dry ground`);
    assert.ok(Math.hypot(s.x - sp.x, s.z - sp.z) >= SA.player.SPAWN_CLEAR + 1, `${a.id} away from the spawn`);
    assert.equal(SA.station.inFootprint(s.x, s.z, 1.5), false, `${a.id} off the station`);
  }
});

test('animals spread over the strip instead of clustering in the old middle (z reaches both halves of the map)', () => {
  const SA = loadGame(FILES);
  const spots = Object.values(SA.animalPlan.placements(world(SA), {}));
  assert.ok(spots.some((s) => s.z > 18) && spots.some((s) => s.z < -18), 'homes beyond the old +-18 band');
  assert.ok(spots.every((s) => s.radius >= SA.animalPlan.DEFAULT_RADIUS));
  assert.ok(spots.some((s) => s.radius > SA.animalPlan.DEFAULT_RADIUS), 'sparse biomes hand empty quadrants to a roaming animal');
});

test('mission anchors (both pigs) for many seeds: inside BOUNDS, dry, off the spawn clearing, far apart', () => {
  const SA = loadGame(FILES);
  const B = SA.map.BOUNDS, sp = SA.player.spawn();
  const spec = SA.data.get('missions', 'mama').spawn;
  for (let seed = 1; seed <= 40; seed++) {
    const r = SA.missionSpawn.place(spec, seed, {});
    assert.ok(r, `seed ${seed} places`);
    for (const p of [r.baby, r.mama]) {
      assert.ok(p.x > B.minX && p.x < B.maxX && p.z > B.minZ && p.z < B.maxZ, 'inside BOUNDS');
      assert.equal(SA.map.isWater(p.x, p.z), false, 'dry ground');
      assert.ok(Math.hypot(p.x - sp.x, p.z - sp.z) >= SA.player.SPAWN_CLEAR, 'away from the spawn clearing');
    }
    assert.ok(Math.hypot(r.baby.x - r.mama.x, r.baby.z - r.mama.z) >= spec.minApart);
  }
});
