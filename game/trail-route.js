/* SA.trailRoute: where a walking trail can go (AS-0347). Pure (no THREE, no DOM; unit-tested in node:vm). Needs SA.map (optionally SA.station).
 *
 *   SA.trailRoute.find(from, to) -> [{ x, z }, ...]  a polyline from `from` to `to` over dry ground: an A* search over a coarse grid of dry cells
 *       (so it bends through the river's ford and round the station walls, never through water), pulled straight wherever the line is clear.
 *       No map data, or no way through: just [from, to].
 *   SA.trailRoute.dry(x, z)      true on dry ground clear of the station walls and the map edge
 *   SA.trailRoute.clear(a, b)    true when the straight line a -> b is all dry
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var CELL = 2, EDGE = 2, WATER_PAD = 0.5, STATION_PAD = 2, LOOK = 3;

  function dry(x, z) {
    var M = SA.map, B = M.BOUNDS;
    if (x < B.minX + EDGE || x > B.maxX - EDGE || z < B.minZ + EDGE || z > B.maxZ - EDGE) return false;
    if (M.isWater(x, z) || M.isWater(x + WATER_PAD, z) || M.isWater(x - WATER_PAD, z) || M.isWater(x, z + WATER_PAD) || M.isWater(x, z - WATER_PAD)) return false;   // the ford is narrow: only a small margin
    return !(SA.station && SA.station.inFootprint && SA.station.inFootprint(x, z, STATION_PAD));
  }

  function clear(a, b) {
    var n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z));
    for (var i = 1; i < n; i++) if (!dry(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n)) return false;
    return true;
  }

  function find(from, to) {
    var M = SA.map, B = M && M.BOUNDS;
    if (!B || !M.isWater) return [from, to];
    var cols = Math.ceil((B.maxX - B.minX) / CELL), rows = Math.ceil((B.maxZ - B.minZ) / CELL), total = cols * rows, ok = new Uint8Array(total), i;
    function centre(c) { return { x: B.minX + ((c % cols) + 0.5) * CELL, z: B.minZ + (Math.floor(c / cols) + 0.5) * CELL }; }
    function good(c) {
      if (!ok[c]) { var p = centre(c); ok[c] = dry(p.x, p.z) ? 1 : 2; }
      return ok[c] === 1;
    }
    function cellOf(p) {      // the nearest dry cell to a point (looks a few cells out)
      var cx = Math.floor((p.x - B.minX) / CELL), cz = Math.floor((p.z - B.minZ) / CELL), best = -1, bd = 1e9;
      for (var dz = -LOOK; dz <= LOOK; dz++) for (var dx = -LOOK; dx <= LOOK; dx++) {
        var x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= cols || z >= rows || !good(z * cols + x)) continue;
        if (dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = z * cols + x; }
      }
      return best;
    }
    var s = cellOf(from), g = cellOf(to);
    if (s < 0 || g < 0) return [from, to];
    var cost = new Float32Array(total).fill(Infinity), parent = new Int32Array(total).fill(-1), score = new Float32Array(total), open = [s];
    function h(c) { var dx = Math.abs((c % cols) - (g % cols)), dz = Math.abs(Math.floor(c / cols) - Math.floor(g / cols)); return Math.max(dx, dz) + 0.41 * Math.min(dx, dz); }
    cost[s] = 0; score[s] = h(s);
    while (open.length) {
      var bi = 0;
      for (i = 1; i < open.length; i++) if (score[open[i]] < score[open[bi]]) bi = i;
      var c = open.splice(bi, 1)[0];
      if (c === g) break;
      var x0 = c % cols, z0 = Math.floor(c / cols);
      for (var dz2 = -1; dz2 <= 1; dz2++) for (var dx2 = -1; dx2 <= 1; dx2++) {
        var nx = x0 + dx2, nz = z0 + dz2;
        if ((!dx2 && !dz2) || nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
        var nc = nz * cols + nx;
        if (!good(nc) || (dx2 && dz2 && (!good(z0 * cols + nx) || !good(nz * cols + x0)))) continue;     // no cutting corners
        var ng = cost[c] + (dx2 && dz2 ? 1.41 : 1);
        if (ng < cost[nc]) { if (cost[nc] === Infinity) open.push(nc); cost[nc] = ng; parent[nc] = c; score[nc] = ng + h(nc); }
      }
    }
    if (cost[g] === Infinity) return [from, to];
    var cells = [];
    for (var q = g; q >= 0; q = parent[q]) cells.push(centre(q));
    cells.reverse();
    var pts = [from].concat(cells, [to]), out = [from], a = 0;
    while (a < pts.length - 1) {      // string pulling: jump to the farthest cell that can be walked to in a straight line
      var b = pts.length - 1;
      while (b > a + 1 && !clear(pts[a], pts[b])) b--;
      out.push(pts[b]);
      a = b;
    }
    return out;
  }

  SA.trailRoute = { find: find, dry: dry, clear: clear };
})(typeof window !== 'undefined' ? window : globalThis);
