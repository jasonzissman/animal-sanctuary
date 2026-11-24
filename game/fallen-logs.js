/* SA.fallenLogs: pure, seeded layout of the fallen logs lying across the forest paths (no THREE, no DOM; node:vm tested). AS-0302.
 * Load after game/forest-paths.js and game/forest-streams.js (and game/map.js, optionally game/station.js, game/player.js).
 *
 *   SA.fallenLogs.layout(seed?) -> [{ id, x, z, ax, az, bx, bz, dx, dz, length, r, h, onPath, tone }]   a few logs, the same for the same seed.
 *       (x, z) is the centre, a-b the two ends of the trunk's centre line (d = unit direction a -> b), r the trunk radius, h its standing height:
 *       the top of the trunk above the ground (a jump clears it, SA.player.floorAt lets you stand on top and walk along it). Most logs lie
 *       across a forest path (SA.forestPaths, onPath: true, long enough to span the whole dirt strip), 1-2 more lie off the paths.
 *   SA.fallenLogs.logs()      the cached default layout (built once)
 *   SA.fallenLogs.solids()    -> [[x, z, r, h], ...] the cached footprint as LOW SOLIDS: each log is a capsule made of overlapping circles along
 *       its axis, the same shape as the rocks and stream stones, so SA.player.step blocks you unless your jump lift clears h and
 *       floorAt gives the standing height along the whole trunk (scene.js adds it to the obstacles).
 *   SA.fallenLogs.distance(x, z)  -> metres from the nearest log's surface (0 inside it, Infinity when far); allocates nothing
 *   SA.fallenLogs.near(x, z, pad?) true within pad (default 0) of a trunk: animals, trees and plants keep out (wander.js, animal-plan.js,
 *       decor-plan.js, ground-cover-plan.js)
 * The log lies along the ground: ends follow the terrain slope (the renderer tilts it the same way), so h is the same height above the
 * ground under every point of it. Rendering: game/render/fallen-logs.js (one merged mesh).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SEED = 23;
  var PER_PATH = 2;        // logs tried per forest path
  var OFF_PATH = 2;        // extra logs off the paths
  var TRIES = 60;
  var MIN_GAP = 7;         // metres between two log centres
  var R_MIN = 0.3, R_MAX = 0.4;
  var H_PER_R = 1.8;       // standing height = 1.8 x radius (the trunk sinks a little into the soil); 0.54..0.72, a normal hop clears it
  var CIRCLE_STEP = 1.4;   // footprint circles sit every 1.4 radii along the axis
  var cached = null, cachedSolids = null;

  function dryOk(x, z, pad) {
    var M = SA.map, r = M.biomeRange('bosque');
    if (x < r.lo + 3 || x > r.hi - 3 || z < M.BOUNDS.minZ + 3 || z > M.BOUNDS.maxZ - 3) return false;
    if (M.groundHeight(x, z) < M.WATER_LEVEL + 0.35) return false;
    if (SA.player && SA.player.inSpawnZone(x, z, pad)) return false;
    if (SA.station && SA.station.inFootprint(x, z, pad + 1)) return false;
    return !(SA.forestStreams && SA.forestStreams.inWater(x, z, pad + 1.2));
  }

  /** A log centred at (x, z) along direction angle `ang`, or null when it would lie in water, the spawn, a stream or on a steep bit. */
  function make(x, z, ang, onPath, rand, pathLen) {
    var M = SA.map, r = R_MIN + rand() * (R_MAX - R_MIN), len = Math.max(3.6, pathLen) + rand() * 1.0;
    var dx = Math.cos(ang), dz = Math.sin(ang), ax = x - dx * len / 2, az = z - dz * len / 2, bx = x + dx * len / 2, bz = z + dz * len / 2;
    var ga = M.groundHeight(ax, az), gb = M.groundHeight(bx, bz), gc = M.groundHeight(x, z);
    if (Math.abs(gb - ga) > 0.6 || Math.abs(gc - (ga + gb) / 2) > 0.15) return null;   // the trunk follows a gentle slope only
    if (!dryOk(x, z, 1) || !dryOk(ax, az, 0.5) || !dryOk(bx, bz, 0.5) || !dryOk((x + ax) / 2, (z + az) / 2, 0.5) || !dryOk((x + bx) / 2, (z + bz) / 2, 0.5)) return null;
    return { id: '', x: x, z: z, ax: ax, az: az, bx: bx, bz: bz, dx: dx, dz: dz, length: len, r: r, h: r * H_PER_R, onPath: onPath, tone: rand() };
  }

  function clearOfOthers(list, c) {
    for (var i = 0; i < list.length; i++) if (Math.hypot(list[i].x - c.x, list[i].z - c.z) < MIN_GAP) return false;
    return true;
  }

  function layout(seed) {
    var rand = SA.map.rng(seed === undefined ? SEED : seed), out = [], FP = SA.forestPaths, paths = FP ? FP.paths() : [];
    paths.forEach(function (p) {
      var pts = p.points, got = 0;
      for (var t = 0; t < TRIES && got < PER_PATH && pts.length > 12; t++) {
        var k = 4 + Math.floor(rand() * (pts.length - 8)), a = pts[k - 3], b = pts[k + 3];
        var along = Math.atan2(b[1] - a[1], b[0] - a[0]), ang = along + Math.PI / 2 + (rand() - 0.5) * 0.5;
        var c = make(pts[k][0], pts[k][1], ang, true, rand, p.width + 1.2);
        if (c && clearOfOthers(out, c)) { out.push(c); got++; }
      }
    });
    var M = SA.map, range = M.biomeRange('bosque'), off = 0;
    for (var t2 = 0; t2 < TRIES * 4 && off < OFF_PATH; t2++) {
      var x = range.lo + 4 + rand() * (range.hi - range.lo - 8), z = M.BOUNDS.minZ + 4 + rand() * (M.BOUNDS.maxZ - M.BOUNDS.minZ - 8);
      if (FP && FP.distance(x, z) < 4) continue;
      var c2 = make(x, z, rand() * Math.PI, false, rand, 3.6);
      if (c2 && clearOfOthers(out, c2)) { out.push(c2); off++; }
    }
    out.forEach(function (l, i) { l.id = 'tronco' + (i + 1); });
    return out;
  }

  function logs() { return cached || (cached = layout()); }

  /** The footprint of the given logs as [x, z, r, h] circles along each axis (ends included). */
  function toSolids(list) {
    var out = [];
    list.forEach(function (l) {
      var n = Math.max(2, Math.ceil(l.length / (l.r * CIRCLE_STEP)));
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        out.push([l.ax + (l.bx - l.ax) * t, l.az + (l.bz - l.az) * t, l.r, l.h]);
      }
    });
    return out;
  }

  function solids() { return cachedSolids || (cachedSolids = toSolids(logs())); }

  function distance(x, z) {
    var list = logs(), best = Infinity;
    for (var i = 0; i < list.length; i++) {
      var l = list[i], reach = l.length / 2 + l.r + 0.01;
      if (Math.abs(x - l.x) > reach || Math.abs(z - l.z) > reach) continue;
      var t = (x - l.ax) * l.dx + (z - l.az) * l.dz;
      t = t < 0 ? 0 : t > l.length ? l.length : t;
      var d = Math.hypot(x - (l.ax + l.dx * t), z - (l.az + l.dz * t)) - l.r;
      if (d < best) best = d;
    }
    return best === Infinity ? Infinity : Math.max(0, best);
  }

  function near(x, z, pad) { return distance(x, z) <= (pad || 0); }

  SA.fallenLogs = { SEED: SEED, H_PER_R: H_PER_R, layout: layout, logs: logs, solids: solids, toSolids: toSolids, distance: distance, near: near };
})(typeof window !== 'undefined' ? window : globalThis);
