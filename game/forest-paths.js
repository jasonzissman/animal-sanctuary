/* SA.forestPaths: pure, seeded layout of the winding dirt paths through the bosque (no THREE, no DOM; node:vm tested). AS-0300.
 * Load after game/map.js. game/station.js and game/player.js are optional (the paths keep clear of the station and the spawn).
 *
 *   SA.forestPaths.layout(seed?)     -> [{ id, width, points: [[x, z], ...] }]   2-3 polylines (points ~1 m apart), all inside the bosque strip,
 *                                       all on dry ground, the same for the same seed (default SEED). Built once and cached for the default seed.
 *   SA.forestPaths.paths()           the cached default layout
 *   SA.forestPaths.distance(x, z)    -> metres from the nearest path centre line (Infinity when far from every path); allocates nothing
 *   SA.forestPaths.onPath(x, z, pad?) true within width / 2 + pad of a centre line
 *   SA.forestPaths.strength(x, z)    -> 0..1 dirt amount for the ground colour (1 on the path, a soft fade over FADE metres beyond its edge)
 * How: the bosque is a 2 m grid; a cell is usable when the strip around it is dry and clear of the spawn and station. Each path is a cheapest
 * route (A*) between a seeded start and goal cell, with a seeded cost per cell so the route wanders, then corner-cut twice to curve.
 * Consumers: game/terrain-color.js (lighter dirt ground), game/decor-plan.js and game/ground-cover-plan.js (no trees, grass or plants on a path).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SEED = 11;
  var WIDTH = 2.6;      // metres, the walkable dirt strip
  var FADE = 0.7;       // soft colour edge beyond the strip
  var CELL = 2;         // route grid size
  var TRIES = 30;       // start/goal pairs tried per path until a route exists
  // Where each path starts and ends (x, z ranges, world metres): a western walk, a north-east walk and a southern one over the river ford.
  // The low ground (pools and the river) splits the forest into dry regions; each pair lies inside one region (a pair with no route is retried).
  var ENDS = [
    { a: [-54, -46, 0, 6], b: [-42, -32, -26, -18] },
    { a: [-20, -14, -33, -28], b: [-14, -8, -14, -12] },
    { a: [-44, -34, 22, 32], b: [-14, -4, 26, 32] },
  ];
  var cached = null, cachedBox = null;

  function bosque() { return SA.map.biomeRange('bosque'); }

  /** True when the strip around (x, z) is dry, inside the bosque and clear of the spawn and the station. */
  function clear(x, z) {
    var M = SA.map, r = bosque(), half = WIDTH / 2 + 0.4, dry = M.WATER_LEVEL + 0.15;
    if (x < r.lo + 2 || x > r.hi - 2 || z < M.BOUNDS.minZ + 1 || z > M.BOUNDS.maxZ - 1) return false;
    if (M.groundHeight(x, z) < dry || M.groundHeight(x - half, z) < dry || M.groundHeight(x + half, z) < dry ||
        M.groundHeight(x, z - half) < dry || M.groundHeight(x, z + half) < dry) return false;
    if (SA.player && SA.player.inSpawnZone(x, z, half)) return false;
    return !(SA.station && SA.station.inFootprint(x, z, half + 0.5));
  }

  /** The route grid: usable[] flags and a seeded wander cost per cell. */
  function makeGrid(rand) {
    var B = SA.map.BOUNDS, r = bosque(), g = { x0: r.lo + 2, z0: B.minZ + 1, nx: 0, nz: 0, ok: [], cost: [] }, i, j;
    g.nx = Math.floor((r.hi - 2 - g.x0) / CELL) + 1; g.nz = Math.floor((B.maxZ - 1 - g.z0) / CELL) + 1;
    for (i = 0; i < g.nx; i++) for (j = 0; j < g.nz; j++) { g.ok.push(clear(g.x0 + i * CELL, g.z0 + j * CELL)); g.cost.push(1 + rand() * 2); }
    return g;
  }

  function pickCell(g, rect, rand) {
    var cells = [], i, j;
    for (i = 0; i < g.nx; i++) for (j = 0; j < g.nz; j++) {
      var x = g.x0 + i * CELL, z = g.z0 + j * CELL;
      if (g.ok[i * g.nz + j] && x >= rect[0] && x <= rect[1] && z >= rect[2] && z <= rect[3]) cells.push(i * g.nz + j);
    }
    return cells.length ? cells[Math.floor(rand() * cells.length)] : -1;
  }

  /** Cheapest route between two cells over usable cells (8 neighbours); returns cell indices or null. */
  function route(g, from, to) {
    var n = g.nx * g.nz, dist = [], prev = [], open = [from], done = [], i;
    for (i = 0; i < n; i++) { dist.push(Infinity); prev.push(-1); }
    dist[from] = 0;
    while (open.length) {
      var bi = 0;
      for (i = 1; i < open.length; i++) if (dist[open[i]] + h(open[i]) < dist[open[bi]] + h(open[bi])) bi = i;
      var cur = open.splice(bi, 1)[0];
      if (cur === to) break;
      if (done[cur]) continue;
      done[cur] = true;
      var ci = Math.floor(cur / g.nz), cj = cur % g.nz;
      for (var di = -1; di <= 1; di++) for (var dj = -1; dj <= 1; dj++) {
        var ni = ci + di, nj = cj + dj;
        if ((!di && !dj) || ni < 0 || nj < 0 || ni >= g.nx || nj >= g.nz) continue;
        var nb = ni * g.nz + nj;
        if (!g.ok[nb] || done[nb]) continue;
        var d = dist[cur] + (di && dj ? 1.41 : 1) * g.cost[nb];
        if (d < dist[nb]) { dist[nb] = d; prev[nb] = cur; open.push(nb); }
      }
    }
    function h(c) { return Math.hypot(Math.floor(c / g.nz) - Math.floor(to / g.nz), c % g.nz - to % g.nz); }
    if (prev[to] < 0 && from !== to) return null;
    var out = [];
    for (var c = to; c >= 0; c = prev[c]) out.push(c);
    return out.reverse();
  }

  /** Chaikin corner cutting (keeps both ends): every pass rounds the turns and doubles the points. */
  function smooth(pts, passes) {
    for (var p = 0; p < passes; p++) {
      var out = [pts[0]];
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }

  function layout(seed) {
    var rand = SA.map.rng(seed === undefined ? SEED : seed), g = makeGrid(rand), out = [];
    ENDS.forEach(function (e, idx) {
      for (var t = 0; t < TRIES; t++) {
        var a = pickCell(g, e.a, rand), b = pickCell(g, e.b, rand);
        var cells = a >= 0 && b >= 0 ? route(g, a, b) : null;
        if (!cells || cells.length < 8) continue;
        var pts = smooth(cells.map(function (c) { return [g.x0 + Math.floor(c / g.nz) * CELL, g.z0 + (c % g.nz) * CELL]; }), 2);
        if (pts.every(function (q) { return clear(q[0], q[1]); })) { out.push({ id: 'sendero' + (idx + 1), width: WIDTH, points: pts }); break; }
      }
    });
    return out;
  }

  function paths() {
    if (cached) return cached;
    cached = layout();
    cachedBox = cached.map(function (p) {
      var b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
      p.points.forEach(function (q) { b.x0 = Math.min(b.x0, q[0]); b.x1 = Math.max(b.x1, q[0]); b.z0 = Math.min(b.z0, q[1]); b.z1 = Math.max(b.z1, q[1]); });
      return b;
    });
    return cached;
  }

  /** Squared distance from (x, z) to the segment a-b. */
  function segDist2(x, z, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], len2 = dx * dx + dz * dz;
    var t = len2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var px = a[0] + dx * t - x, pz = a[1] + dz * t - z;
    return px * px + pz * pz;
  }

  function distance(x, z) {
    var list = paths(), best = Infinity, reach = WIDTH / 2 + FADE + 0.01;
    for (var i = 0; i < list.length; i++) {
      var b = cachedBox[i];
      if (x < b.x0 - reach || x > b.x1 + reach || z < b.z0 - reach || z > b.z1 + reach) continue;
      var pts = list[i].points;
      for (var k = 0; k < pts.length - 1; k++) {
        var d2 = segDist2(x, z, pts[k], pts[k + 1]);
        if (d2 < best) best = d2;
      }
    }
    return best === Infinity ? Infinity : Math.sqrt(best);
  }

  function onPath(x, z, pad) { return distance(x, z) < WIDTH / 2 + (pad || 0); }

  function strength(x, z) {
    var over = distance(x, z) - WIDTH / 2;
    if (over <= 0) return 1;
    if (over >= FADE) return 0;
    var t = 1 - over / FADE;
    return t * t * (3 - 2 * t);
  }

  SA.forestPaths = { SEED: SEED, WIDTH: WIDTH, FADE: FADE, layout: layout, paths: paths, distance: distance, onPath: onPath, strength: strength };
})(typeof window !== 'undefined' ? window : globalThis);
