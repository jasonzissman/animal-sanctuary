// AS-0347: SA.trailRoute: a walkable polyline over dry ground (through the river's ford, round the station), pure node:vm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/mountain-trail.js', 'game/map.js',
  'game/peaks.js', 'game/station.js', 'game/trail-route.js'];

test('a route across the river crosses where the ford is, never through water or the station', () => {
  const SA = loadGame(FILES), R = SA.trailRoute, from = { x: -2.9, z: 12.95 }, to = { x: -45, z: -20 };
  const way = R.find(from, to);
  assert.deepEqual([way[0].x, way[0].z], [from.x, from.z]);
  assert.deepEqual([way[way.length - 1].x, way[way.length - 1].z], [to.x, to.z]);
  assert.ok(way.length >= 3, 'it bends round the water');
  for (let i = 1; i < way.length; i++) {
    const a = way[i - 1], b = way[i], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 2);
    for (let k = 1; k < n; k++) {
      const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
      assert.equal(SA.map.isWater(x, z), false, `water at ${x.toFixed(1)}, ${z.toFixed(1)}`);
      assert.equal(SA.station.inFootprint(x, z, 0), false);
    }
  }
  const crossing = way.some((p) => Math.abs(p.z - SA.map.FORD.z) < 6);
  assert.ok(crossing, 'it uses the ford');
});

test('same-side targets are nearly straight; helpers; a missing map gives the straight line', () => {
  const SA = loadGame(FILES), R = SA.trailRoute;
  const way = R.find({ x: -5, z: -20 }, { x: -10, z: -25 });
  assert.ok(way.length >= 2 && way.length <= 4);
  assert.equal(R.dry(-200, 0), false, 'off the map');
  assert.equal(R.dry(-8, 17), false, 'inside the station');
  assert.equal(R.clear({ x: -5, z: -20 }, { x: -6, z: -20 }), true);
  const bare = loadGame(['game/sa.js', 'game/trail-route.js']);
  const line = bare.trailRoute.find({ x: 0, z: 0 }, { x: 5, z: 5 });
  assert.equal(line.length, 2);
  // An unreachable goal (inside an off-map corner) falls back to the straight line.
  assert.equal(R.find({ x: -5, z: 5 }, { x: -9999, z: 9999 }).length, 2);
});
