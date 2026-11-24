// AS-0307: big seeded desierto dunes with wind ripples; groundHeight stays smooth and always walkable. Pure logic (node:vm).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/map.js']);
const M = SA.map;
const B = M.BOUNDS;

function maxSlope(x0, x1, step = 0.25) {
  let worst = 0, at = null;
  for (let x = x0; x <= x1; x += step) {
    for (let z = B.minZ; z <= B.maxZ; z += step) {
      const h = M.groundHeight(x, z);
      for (const [dx, dz] of [[step, 0], [0, step], [step, step]]) {
        const s = Math.abs(M.groundHeight(x + dx, z + dz) - h) / Math.hypot(dx, dz);
        if (s > worst) { worst = s; at = [x, z]; }
      }
    }
  }
  return { worst, at };
}

test('dunes are deterministic (seeded) and fade in from DUNE_EDGE', () => {
  for (const [x, z] of [[60, 3], [80, -20], [100, 30]]) assert.equal(M.duneHeight(x, z), M.duneHeight(x, z));
  for (let z = B.minZ; z <= B.maxZ; z += 3) {
    assert.equal(M.duneHeight(M.DUNE_EDGE, z), 0, 'nothing at the edge');
    assert.equal(M.duneHeight(M.DUNE_EDGE - 30, z), 0, 'nothing west of the edge');
  }
  for (let x = M.DUNE_EDGE; x < M.DUNE_EDGE + 1; x += 0.25) assert.ok(M.duneHeight(x, 0) < 0.15, 'fades in gently from the edge');
});

test('the desierto has dunes of several heights plus small ripples', () => {
  const hs = [];
  for (let x = 72; x <= B.maxX; x += 2) for (let z = B.minZ; z <= B.maxZ; z += 2) hs.push(M.duneHeight(x, z));
  const lo = Math.min(...hs), hi = Math.max(...hs);
  assert.ok(lo >= 0.85, 'always dry sand, got ' + lo);
  assert.ok(hi >= 3.5, 'big crests, got ' + hi);
  assert.ok(hi - lo >= 2.5, 'varied height');
  // Several distinct crest heights: local maxima along a few rows fall in more than two height bands.
  const bands = new Set();
  for (const z of [-30, -15, 0, 15, 30]) {
    for (let x = 72; x < B.maxX - 1; x += 0.5) {
      const a = M.duneHeight(x - 0.5, z), b = M.duneHeight(x, z), c = M.duneHeight(x + 0.5, z);
      if (b > a && b > c && b > 2.2) bands.add(Math.round(b));
    }
  }
  assert.ok(bands.size >= 3, 'crests of several heights: ' + [...bands]);
  // Ripples: the height wiggles on a ~3 m scale (many tiny reversals along a 20 m run).
  let flips = 0, prev = 0;
  for (let x = 90; x < 110; x += 0.25) {
    const d = M.duneHeight(x + 0.25, 5) - M.duneHeight(x, 5);
    if (prev && Math.sign(d) !== Math.sign(prev)) flips++;
    if (d) prev = d;
  }
  assert.ok(flips >= 3, 'small ripples ride on the dunes, flips=' + flips);
});

test('max slope across the desierto and the border into it stays far below the walkable limit', () => {
  const r = maxSlope(M.DUNE_EDGE - 10, B.maxX - 0.5);
  assert.ok(M.MAX_WALK_SLOPE > 0, 'a limit exists');
  assert.ok(r.worst < M.MAX_WALK_SLOPE * 0.75, 'steepest ' + r.worst.toFixed(3) + ' at ' + r.at + ' (limit ' + M.MAX_WALK_SLOPE + ')');
});

test('the dunes stay out of the spawn and the bosque; the bosque/selva and selva/desierto borders stay low and walkable', () => {
  const spawn = { x: -9, z: 14 };
  assert.equal(M.duneHeight(spawn.x, spawn.z), 0);
  for (let x = B.minX; x < M.DUNE_EDGE; x += 1) for (let z = B.minZ; z <= B.maxZ; z += 4) assert.equal(M.duneHeight(x, z), 0);
  // The ground west of the desierto is the same as before dunes (baseHeight without the dune term).
  assert.equal(M.baseHeight(-9, 14), M.groundHeight(-9, 14));
  const border = M.STRIPS[3].lo;   // selva|desierto
  for (let z = B.minZ; z <= B.maxZ; z += 2) {
    // The dunes barely touch the border itself (they have only just started to fade in), so the border ground is the old rolling terrain.
    assert.ok(M.duneHeight(border, z) < 0.3, 'dunes barely lift the border: ' + M.duneHeight(border, z));
    assert.ok(M.groundHeight(border, z) < 2.5, 'low enough to walk onto the dunes');
  }
});
