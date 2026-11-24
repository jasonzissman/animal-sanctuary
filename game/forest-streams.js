/* SA.forestStreams: pure, seeded layout of 1-2 small streams through the bosque (no THREE, no DOM; node:vm tested). AS-0301.
 * Load after game/forest-paths.js (and game/map.js, optionally game/station.js, game/player.js).
 *
 *   SA.forestStreams.layout(seed?) -> [{ id, points: [[x, z], ...], ford: { x, z }, stones: [{ x, z, r, h, rot, tone }] }]
 *       1-2 polylines (points ~1 m apart) from a dry source in the bosque down to the river: the LAST point is in the river water.
 *       Each stream crosses one forest dirt path (SA.forestPaths) at `ford`, where a row of stepping stones spans the water; a few
 *       more stones sit along the stream. Same seed, same layout (default SEED). The default layout is built once and cached.
 *   SA.forestStreams.streams()     the cached default layout
 *   SA.forestStreams.halfWidth(t)  half the water width at fraction t (0..1) along a stream: a thin trickle at the source, wider downstream
 *   SA.forestStreams.distance(x, z) -> metres from the nearest stream centre line (Infinity when far); allocates nothing
 *   SA.forestStreams.inWater(x, z, pad?) true within the water's half width (+ pad) of a stream
 *   SA.forestStreams.stoneSolids() -> [[x, z, r, h], ...] the stones as LOW SOLIDS for SA.player (jump onto them, stand on top, h above ground)
 * The ground is NOT carved: the water is a thin ribbon laid on the terrain (game/render/forest-streams.js), so SA.map.isWater stays
 * river/pond only and the player wades through it freely (AS-0109). Animals keep out of it (game/wander.js, game/animal-plan.js).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SEED = 5;
  var TRIES = 60;          // candidate crossings tried per stream
  var STEP = 1;            // metres between points
  var HALF_MIN = 0.45, HALF_MAX = 0.95, GROW = 8;   // half width: thin at the source, full after GROW metres
  var MEANDER = 1.3;       // sideways wobble (metres)
  var STONE_H = 0.28;      // stepping stone top above the ground (a normal hop clears it)
  var STONE_R = 0.3;
  var cached = null, cachedBox = null;

  function halfWidth(t) { return HALF_MIN + (HALF_MAX - HALF_MIN) * Math.min(1, Math.max(0, t)); }
  function halfAt(i) { return Math.min(HALF_MAX, HALF_MIN + (HALF_MAX - HALF_MIN) * (i * STEP) / GROW); }

  function dry(x, z) {
    var M = SA.map, r = M.biomeRange('bosque');
    if (x < r.lo + 2 || x > r.hi - 2 || z < M.BOUNDS.minZ + 1 || z > M.BOUNDS.maxZ - 1) return false;
    if (M.groundHeight(x, z) < M.WATER_LEVEL + 0.15) return false;
    if (SA.player && SA.player.inSpawnZone(x, z, 1.5)) return false;
    return !(SA.station && SA.station.inFootprint(x, z, 2));
  }

  /** A candidate stream through crossing point c (on a path with tangent t) running to the river: [[x, z], ...] or null. */
  function build(c, tan, rand) {
    var M = SA.map, side = c[0] < M.riverX(c[1]) ? 1 : -1;     // +1: the river lies to the east
    var zr = M.clamp(c[1] + (rand() - 0.5) * 12, M.BOUNDS.minZ + 4, M.BOUNDS.maxZ - 4);
    if (Math.abs(zr - M.FORD.z) < M.FORD.halfLen + 4) return null;   // the dry ford is no place to end
    var rx = M.riverX(zr) - side * 1.2;
    var toR = Math.hypot(rx - c[0], zr - c[1]);
    if (toR < 6 || toR > 30) return null;
    var ang = Math.atan2(c[1] - zr, c[0] - rx) + (rand() - 0.5) * 0.7, len = 7 + rand() * 8;   // the source lies back from the crossing, away from the river
    var src = [c[0] + Math.cos(ang) * len, c[1] + Math.sin(ang) * len];
    var sdx = rx - src[0], sdz = zr - src[1], sl = Math.hypot(sdx, sdz);
    // The stream must meet the path at a real angle, not run along it.
    if (Math.abs(sdx / sl * tan[1] - sdz / sl * tan[0]) < 0.5) return null;
    var total = len + toR, n = Math.ceil(total / STEP), phase = rand() * 6.28, freq = 0.5 + rand() * 0.4, pts = [], i;
    for (i = 0; i <= n; i++) {
      var s = i * STEP, px, pz, dx, dz;
      if (s <= len) { px = src[0] + (c[0] - src[0]) * s / len; pz = src[1] + (c[1] - src[1]) * s / len; dx = c[0] - src[0]; dz = c[1] - src[1]; }
      else { var u = Math.min(1, (s - len) / toR); px = c[0] + (rx - c[0]) * u; pz = c[1] + (zr - c[1]) * u; dx = rx - c[0]; dz = zr - c[1]; }
      var dl = Math.hypot(dx, dz) || 1, ramp = Math.min(1, Math.abs(s - len) / 4) * Math.min(1, (total - s) / 3 + 0.0001), off = MEANDER * Math.sin(phase + s * freq) * ramp;
      px += -dz / dl * off; pz += dx / dl * off;
      if (M.isWater(px, pz)) { pts.push([px, pz], [rx, zr]); break; }     // reached the river: the last point is in the middle of the water
      if (!dry(px, pz)) return null;
      pts.push([px, pz]);
    }
    var last = pts[pts.length - 1];
    return pts.length >= 12 && M.isWater(last[0], last[1]) && Math.abs(last[1] - M.FORD.z) > M.FORD.halfLen + 2 ? pts : null;
  }

  function closest(pts, x, z) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < pts.length; i++) { var d = Math.hypot(pts[i][0] - x, pts[i][1] - z); if (d < bd) { bd = d; best = i; } }
    return best;
  }

  /** The stepping stones of one stream: a row across the water at the ford, then a few singles along it. */
  function stonesFor(pts, fordIdx, rand) {
    var out = [], M = SA.map;
    function stone(x, z, h) {
      if (M.groundHeight(x, z) < M.WATER_LEVEL + 0.1) return;
      out.push({ x: x, z: z, r: STONE_R * (0.85 + rand() * 0.3), h: h + rand() * 0.06, rot: rand() * 6.28, tone: rand() });
    }
    function at(i) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      return { x: pts[i][0], z: pts[i][1], nx: -dz / l, nz: dx / l };
    }
    var f = at(fordIdx), k;
    for (k = -2; k <= 2; k++) stone(f.x + f.nx * k * 0.45 + (rand() - 0.5) * 0.06, f.z + f.nz * k * 0.45 + (rand() - 0.5) * 0.06, STONE_H);
    for (var i = 5; i < pts.length - 4; i += 5 + Math.floor(rand() * 3)) {
      if (Math.abs(i - fordIdx) < 4) continue;
      var p = at(i), off = (rand() - 0.5) * 0.7 * halfAt(i);
      stone(p.x + p.nx * off, p.z + p.nz * off, STONE_H);
    }
    return out;
  }

  function minGap(a, b) {
    var best = Infinity;
    for (var i = 0; i < a.length; i++) for (var j = 0; j < b.length; j++) best = Math.min(best, Math.hypot(a[i][0] - b[j][0], a[i][1] - b[j][1]));
    return best;
  }

  function layout(seed) {
    var rand = SA.map.rng(seed === undefined ? SEED : seed), list = SA.forestPaths ? SA.forestPaths.paths() : [], out = [], used = {};
    for (var s = 0; s < 2 && list.length; s++) {
      for (var t = 0; t < TRIES; t++) {
        var pi = Math.floor(rand() * list.length), p = list[pi], pp = p.points;
        if (pp.length < 12 || (used[pi] && t < TRIES / 2)) continue;     // the second stream prefers a different path
        var k = 4 + Math.floor(rand() * (pp.length - 8)), a = pp[k - 3], b = pp[k + 3], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        var pts = build(pp[k], [(b[0] - a[0]) / tl, (b[1] - a[1]) / tl], rand);
        if (!pts || out.some(function (o) { return minGap(o.points, pts) < 6; })) continue;
        var fi = closest(pts, pp[k][0], pp[k][1]);
        used[pi] = true;
        out.push({ id: 'arroyo' + (s + 1), points: pts, ford: { x: pts[fi][0], z: pts[fi][1] }, stones: stonesFor(pts, fi, rand) });
        break;
      }
    }
    return out;
  }

  function streams() {
    if (cached) return cached;
    cached = layout();
    cachedBox = cached.map(function (st) {
      var b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
      st.points.forEach(function (q) { b.x0 = Math.min(b.x0, q[0]); b.x1 = Math.max(b.x1, q[0]); b.z0 = Math.min(b.z0, q[1]); b.z1 = Math.max(b.z1, q[1]); });
      return b;
    });
    return cached;
  }

  function segDist2(x, z, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], len2 = dx * dx + dz * dz, t = len2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var px = a[0] + dx * t - x, pz = a[1] + dz * t - z;
    return px * px + pz * pz;
  }

  function distance(x, z) {
    var list = streams(), best = Infinity, reach = HALF_MAX + 0.5;
    for (var i = 0; i < list.length; i++) {
      var b = cachedBox[i];
      if (x < b.x0 - reach || x > b.x1 + reach || z < b.z0 - reach || z > b.z1 + reach) continue;
      var pts = list[i].points;
      for (var k = 0; k < pts.length - 1; k++) { var d2 = segDist2(x, z, pts[k], pts[k + 1]); if (d2 < best) best = d2; }
    }
    return best === Infinity ? Infinity : Math.sqrt(best);
  }

  /** Streams are at most HALF_MAX wide, so a point within HALF_MAX + pad of a centre line is checked against the exact local width. */
  function inWater(x, z, pad) {
    var list = streams(), reach = HALF_MAX + (pad || 0);
    if (distance(x, z) > reach) return false;
    for (var i = 0; i < list.length; i++) {
      var pts = list[i].points;
      for (var k = 0; k < pts.length - 1; k++) if (segDist2(x, z, pts[k], pts[k + 1]) < Math.pow(halfAt(k) + (pad || 0), 2)) return true;
    }
    return false;
  }

  function stoneSolids() {
    var out = [];
    streams().forEach(function (st) { st.stones.forEach(function (s) { out.push([s.x, s.z, s.r, s.h]); }); });
    return out;
  }

  SA.forestStreams = { SEED: SEED, STEP: STEP, HALF_MIN: HALF_MIN, HALF_MAX: HALF_MAX, STONE_H: STONE_H, layout: layout, streams: streams, halfWidth: halfWidth,
    halfAt: halfAt, distance: distance, inWater: inWater, stoneSolids: stoneSolids };
})(typeof window !== 'undefined' ? window : globalThis);
