import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/save.js',
  'game/map.js', 'game/peaks.js', 'game/station.js', 'game/npc.js', 'game/player.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/missions.js', 'game/mission-spawn.js', 'game/mission-runtime.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  return SA;
}
const SPEC = { baby: 'cerdito', mama: 'cerda', minApart: 14 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// A scatter of solids (trees, rocks) over the whole bosque strip, [x, z, r], like the player's obstacle list.
function solidsGrid(SA) {
  const out = [];
  const rand = SA.map.rng(99);
  for (let i = 0; i < 160; i++) out.push([-40 + rand() * 40, -24 + rand() * 48, 0.6 + rand() * 1.2]);
  return out;
}

function assertReachable(SA, p, solids, label) {
  const M = SA.map, B = M.BOUNDS;
  assert.ok(p.x > B.minX && p.x < B.maxX && p.z > B.minZ && p.z < B.maxZ, `${label} inside the map`);
  assert.equal(M.biomeAt(p.x), 'bosque', `${label} in the species' habitat (bosque)`);
  assert.equal(M.isWater(p.x, p.z), false, `${label} not in water`);
  assert.equal(M.nearWater(p.x, p.z, 0), false, `${label} not on the river/pond bank`);
  assert.equal(SA.station.inFootprint(p.x, p.z, 0), false, `${label} not in the station`);
  assert.equal(SA.player.inSpawnZone(p.x, p.z, 0), false, `${label} not on the player's spawn`);
  for (const s of solids) assert.ok(Math.hypot(s[0] - p.x, s[1] - p.z) >= s[2], `${label} outside solid ${s}`);
  assert.ok(Math.abs(p.y - M.groundHeight(p.x, p.z)) < 1e-9, `${label} stands on the ground`);
}

test('place: both pigs on reachable dry ground, apart, for many seeds', () => {
  const SA = setup();
  const solids = solidsGrid(SA);
  for (let seed = 1; seed <= 60; seed++) {
    const r = SA.missionSpawn.place(SPEC, seed, { solids });
    assert.ok(r, `a spot exists for seed ${seed}`);
    assert.equal(r.baby.id, 'cerdito');
    assert.equal(r.mama.id, 'cerda');
    assert.ok(dist(r.baby, r.mama) >= 14, `seed ${seed}: pigs ${dist(r.baby, r.mama)} apart`);
    assertReachable(SA, r.baby, solids, 'baby');
    assertReachable(SA, r.mama, solids, 'mama');
  }
});

test('place: deterministic from the seed, different seeds give different spots', () => {
  const SA = setup();
  const a = SA.missionSpawn.place(SPEC, 5, {});
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(SA.missionSpawn.place(SPEC, 5, {}))));
  const b = SA.missionSpawn.place(SPEC, 6, {});
  assert.ok(dist(a.baby, b.baby) > 0.01 || dist(a.mama, b.mama) > 0.01);
});

test('place: unknown species or a missing spec places nothing; a larger minApart is honoured', () => {
  const SA = setup();
  assert.equal(SA.missionSpawn.place({ baby: 'nope', mama: 'cerda' }, 1, {}), null);
  assert.equal(SA.missionSpawn.place(null, 1, {}), null);
  const far = SA.missionSpawn.place({ baby: 'cerdito', mama: 'cerda', minApart: 25 }, 3, {});
  assert.ok(dist(far.baby, far.mama) >= 25);
});

test('starting Mission 1 spawns both pigs (sync), the same run keeps them, and finishing clears them', () => {
  const SA = setup();
  const seen = [];
  SA.missionSpawn.onChange((c) => seen.push(c && c.key));
  assert.equal(SA.missionSpawn.sync({ solids: () => [] }), null, 'no mission: no pigs');
  assert.equal(SA.missions.start('mama').ok, true);
  const solids = solidsGrid(SA);
  const cur = SA.missionSpawn.sync({ solids: () => solids });
  assert.ok(cur && cur.baby && cur.mama);
  assert.ok(dist(cur.baby, cur.mama) >= 14);
  assertReachable(SA, cur.baby, solids, 'baby');
  assertReachable(SA, cur.mama, solids, 'mama');
  assert.equal(SA.missionSpawn.sync({ solids: () => [] }), cur, 'the same run is not re-placed');
  assert.equal(seen.length, 1, 'listeners hear the placement once');
  SA.missions.abandon();
  assert.equal(SA.missionSpawn.sync(), null);
  assert.equal(seen.length, 2, 'and the clearing');
  assert.equal(SA.missionSpawn.locate('cerdito'), null);
});

test('each step of Mission 1 exposes its world target: piglet for find, mamá for follow', () => {
  const SA = setup();
  const solids = solidsGrid(SA);
  SA.missions.start('mama');
  const cur = SA.missionSpawn.sync({ solids: () => solids });
  const rt = SA.missionRuntime.create({ celebrate: () => {}, grant: () => {}, track: () => {} });
  const t1 = rt.target();
  assert.equal(t1.role, 'baby');
  assert.equal(t1.id, 'cerdito');
  assert.equal(t1.x, cur.baby.x);
  assert.equal(t1.z, cur.baby.z);
  assert.equal(SA.missionSpawn.waiting(SA.missions.active().stepData), true, 'the baby cries while it waits to be found');
  // Walking up to the piglet finds it (the runtime locates it through the spawn) and the target moves to mamá.
  assert.equal(rt.update({ x: cur.baby.x + 1, z: cur.baby.z }).status, 'step');
  const t2 = rt.target();
  assert.equal(t2.role, 'mama');
  assert.equal(t2.id, 'cerda');
  assert.equal(t2.x, cur.mama.x);
  assert.equal(t2.z, cur.mama.z);
  assert.equal(SA.missionSpawn.waiting(SA.missions.active().stepData), false, 'no more crying once found');
  assert.equal(rt.report({ type: 'followed', animal: 'cerdito' }).status, 'step');
  assert.equal(rt.target().role, 'mama', 'the family photo is at mamá');
});

test('target is null without a spawn, an `at`, or a running mission', () => {
  const SA = setup();
  assert.equal(SA.missionRuntime.create().target(), null);
  assert.equal(SA.missionSpawn.target({ kind: 'find' }, null), null);
  assert.equal(SA.missionSpawn.target({ kind: 'find', at: 'baby' }, null), null);
  assert.equal(SA.missionSpawn.waiting(null), false);
});

test('mission data: spawn and `at` are validated', () => {
  const SA = setup();
  const row = (extra, stepExtra) => Object.assign({ id: 'x1', n: 9, es: 'X', en: 'X', icon: '1', intro: { es: 'Hola', icon: '1' }, reward: { stars: 1 },
    steps: [Object.assign({ kind: 'find', target: 'a', line: { es: 'Hola', icon: '1' } }, stepExtra)] }, extra);
  assert.throws(() => SA.data.register('missions', [row({ spawn: { baby: 'cerdito' } })]), /spawn\.mama/);
  assert.throws(() => SA.data.register('missions', [row({ spawn: { baby: 'a', mama: 'b', minApart: 0 } })]), /minApart/);
  assert.throws(() => SA.data.register('missions', [row({ spawn: { baby: 'a', mama: 'b' } }, { at: 'dad' })]), /\.at/);
  assert.throws(() => SA.data.register('missions', [row({}, { at: 'baby' })]), /declare a spawn/);
  const m1 = SA.data.get('missions', 'mama');
  assert.deepEqual(JSON.parse(JSON.stringify(m1.spawn)), SPEC);
  assert.deepEqual(Array.from(m1.steps, (s) => s.at), ['baby', 'mama', 'mama']);
});
