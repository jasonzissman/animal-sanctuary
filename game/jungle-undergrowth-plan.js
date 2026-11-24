/* SA.junglePlan.undergrowth: pure, seeded layout of the selva's dense big-leaf undergrowth (AS-0390, slice 3/4 of AS-0137). No THREE, no DOM; node:vm tested.
 * Load after game/jungle-plan.js (it adds to SA.junglePlan) and after the optional planners it keeps clear of (station, player, lookouts, surfaces,
 * forest-streams, forest-paths, fallen-logs). It must load before game/render/jungle-undergrowth.js.
 *
 *   SA.junglePlan.undergrowth(seed?) -> { corridors, anchors, plants }   the same for the same seed
 *       anchors:   [{ id, x, z }] the landmarks: 'entrada' (the selva's west edge, nearest the spawn), each giant tree ('gigante-N', its base),
 *                  the pond ('estanque': its shore on the entrance side) and the waterfall ('cascada') when there is one.
 *       corridors: [{ a, b, ax, az, bx, bz, half }] straight walkways of half-width `half` that join the anchors as a minimum spanning tree
 *                  (a pond-crossing link costs extra, so the walks go round the water). The undergrowth stays out of every one of them, so each
 *                  giant tree and the pond can be reached from the entrance along open ground.
 *       plants:    [{ kind: 'fern'|'bigleaf', x, z, y, scale, rot, lean, tone }] in seeded patches of ferns and elephant-ear leaves. Never on water,
 *                  the spawn, the station, a lookout or bridge, a stream, a fallen log, a forest dirt path (SA.forestPaths), a giant's trunk
 *                  or the waterfall, and never within `half` of a corridor.
 *   SA.junglePlan.undergrowthGet()          the cached default layout
 *   SA.junglePlan.corridorDistance(x, z, u?) metres from the nearest corridor centre line (Infinity when there are none)
 * The undergrowth is SOFT: it adds no solids (SA.junglePlan.solids() is unchanged), so the player, animals and followers walk straight through it.
 * Rendering: game/render/jungle-undergrowth.js.
 */
(function (root) {
  'use strict';
  var SA = root.SA, JP = SA.junglePlan;

  var SEED = 390;
  var HALF = 2.2;          // corridor half-width: a clear 4.4 m walk
  var PATCHES = 48, TRIES = 600, MIN_PLANTS = 6;
  var EDGE = 3;            // from the selva's borders and the map edge in z
  var GIANT_CLEAR = 4.4;   // from a trunk's centre: its root flare and a ring of open ground
  var ENTRANCE_INSET = 4;  // the entrance anchor sits this far inside the selva's west border
  var cached = null;

  function segDist(px, pz, s) {
    var dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz, t = l2 ? ((px - s.ax) * dx + (pz - s.az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (s.ax + t * dx), pz - (s.az + t * dz));
  }

  function corridorDistance(x, z, u) {
    var C = (u || get()).corridors, best = Infinity;
    for (var i = 0; i < C.length; i++) { var d = segDist(x, z, C[i]); if (d < best) best = d; }
    return best;
  }

  function anchorsOf(L) {
    var M = SA.map, range = M.biomeRange('selva'), B = M.BOUNDS, P = M.POND, spawn = SA.player && SA.player.spawn ? SA.player.spawn() : { z: 0 };
    var ez = Math.max(B.minZ + EDGE + 3, Math.min(B.maxZ - EDGE - 3, spawn.z)), out = [{ id: 'entrada', x: range.lo + ENTRANCE_INSET, z: ez }];
    L.giants.forEach(function (g) { out.push({ id: g.id, x: g.x, z: g.z }); });
    var ang = Math.atan2(ez - P.z, range.lo + ENTRANCE_INSET - P.x);   // the pond's shore that faces the entrance
    out.push({ id: 'estanque', x: P.x + Math.cos(ang) * (P.radius + 2.8), z: P.z + Math.sin(ang) * (P.radius + 2.8) });
    if (L.waterfall) out.push({ id: 'cascada', x: L.waterfall.cx, z: L.waterfall.cz });
    return out;
  }

  /** A pond-crossing link costs extra so the minimum spanning tree walks round the water. */
  function linkCost(a, b) {
    var P = SA.map.POND, d = Math.hypot(b.x - a.x, b.z - a.z), seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z };
    return d + (segDist(P.x, P.z, seg) < P.radius + 0.8 ? 1000 : 0);
  }

  /** Prim's minimum spanning tree over the anchors, rooted at the entrance. */
  function corridorsOf(anchors) {
    var inTree = [true], out = [];
    for (var i = 1; i < anchors.length; i++) inTree.push(false);
    for (var n = 1; n < anchors.length; n++) {
      var best = null;
      for (var a = 0; a < anchors.length; a++) {
        if (!inTree[a]) continue;
        for (var b = 0; b < anchors.length; b++) {
          if (inTree[b]) continue;
          var c = linkCost(anchors[a], anchors[b]);
          if (!best || c < best.c) best = { a: a, b: b, c: c };
        }
      }
      inTree[best.b] = true;
      var p = anchors[best.a], q = anchors[best.b];
      out.push({ a: p.id, b: q.id, ax: p.x, az: p.z, bx: q.x, bz: q.z, half: HALF });
    }
    return out;
  }

  /** True when a plant of `scale` may stand at (x, z). */
  function usable(x, z, scale, giants, corridors) {
    var M = SA.map, range = M.biomeRange('selva'), B = M.BOUNDS, i;
    if (x < range.lo + EDGE || x > range.hi - EDGE || z < B.minZ + EDGE || z > B.maxZ - EDGE) return false;
    if (M.groundHeight(x, z) < M.WATER_LEVEL + 0.4 || M.nearWater(x, z, 1)) return false;
    for (i = 0; i < giants.length; i++) if (Math.hypot(x - giants[i].x, z - giants[i].z) < GIANT_CLEAR + scale * 0.5) return false;
    for (i = 0; i < corridors.length; i++) if (segDist(x, z, corridors[i]) < HALF + scale * 0.6) return false;
    if (JP.near(x, z, 0.8) || JP.inClearing(x, z, scale * 0.6)) return false;   // and the sunny clearings (AS-0391)
    if (SA.player && SA.player.inSpawnZone(x, z, 1)) return false;
    if (SA.station && SA.station.inFootprint(x, z, 1.5)) return false;
    if (SA.lookouts && SA.lookouts.near(x, z, 1.5)) return false;
    if (SA.surfaces && SA.surfaces.near(x, z, 1.5)) return false;
    if (SA.forestStreams && SA.forestStreams.inWater(x, z, 1)) return false;
    if (SA.fallenLogs && SA.fallenLogs.near(x, z, 0.8)) return false;
    if (SA.forestPaths && SA.forestPaths.onPath(x, z, 1)) return false;
    return true;
  }

  function undergrowth(seed) {
    var M = SA.map, rand = M.rng(seed === undefined ? SEED : seed), L = JP.get(), range = M.biomeRange('selva'), B = M.BOUNDS;
    var anchors = anchorsOf(L), corridors = corridorsOf(anchors), plants = [], patches = 0;
    for (var t = 0; t < TRIES && patches < PATCHES; t++) {
      var cx = range.lo + EDGE + rand() * (range.hi - range.lo - 2 * EDGE), cz = B.minZ + EDGE + rand() * (B.maxZ - B.minZ - 2 * EDGE);
      var pr = 3 + rand() * 3, n = 14 + Math.floor(rand() * 14), bigMix = 0.35 + rand() * 0.4, made = [];   // bigMix: how much of this patch is elephant-ear
      for (var k = 0; k < n; k++) {
        var a = rand() * Math.PI * 2, r = pr * Math.sqrt(rand()), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, big = rand() < bigMix;
        var scale = big ? 1.2 + rand() * 1 : 1.1 + rand() * 0.8, rot = rand() * Math.PI * 2, lean = rand(), tone = rand();
        if (usable(x, z, scale, L.giants, corridors)) made.push({ kind: big ? 'bigleaf' : 'fern', x: x, z: z, y: M.groundHeight(x, z), scale: scale, rot: rot, lean: lean, tone: tone });
      }
      if (made.length < MIN_PLANTS) continue;   // a patch the paths and the pond ate up: not worth drawing
      patches++;
      Array.prototype.push.apply(plants, made);
    }
    return { corridors: corridors, anchors: anchors, plants: plants };
  }

  function get() { return cached || (cached = undergrowth()); }

  JP.UNDERGROWTH_SEED = SEED;
  JP.CORRIDOR_HALF = HALF;
  JP.undergrowth = undergrowth;
  JP.undergrowthGet = get;
  JP.corridorDistance = corridorDistance;
})(typeof window !== 'undefined' ? window : globalThis);
