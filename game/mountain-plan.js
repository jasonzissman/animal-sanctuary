/* SA.mountainPlan: pure, seeded boulder field on the montaña (AS-0309, slice 3/4 of AS-0136). No THREE, no DOM; node:vm tested.
 * Load after game/map.js, game/mountain-trail.js, game/peaks.js and game/rocks.js (optionally game/player.js, game/station.js).
 *
 *   SA.mountainPlan.layout(seed?) -> { clusters: [{ x, z, r }], boulders: [{ x, z, y, size, r, h, kind, variant, scale, yaw, tilt, color }] }
 *       A few clustered groups of boulders (kinds and colours from SA.rocks.spec(.., 'montana')) on the mountain's flanks, the same for the same
 *       seed. Every boulder stands clear of the trail (its own radius + 1 m beyond the strip), the biome borders, the spawn, the station,
 *       the climbable peaks and the other boulders. `r` is the footprint radius and `h` the height above the ground at its centre.
 *   SA.mountainPlan.get()       the cached default layout
 *   SA.mountainPlan.solids()    [[x, z, r, h], ...] what blocks the walking player (scene.js adds it to the obstacles); low flat stones are jumpable
 *   SA.mountainPlan.near(x, z, pad?)     true on the trail strip or within pad of a boulder cluster; decor and plants keep out (decor-plan.js, ground-cover-plan.js)
 *   SA.mountainPlan.inField(x, z, pad?)  true within pad of a boulder cluster only; pickups and animals keep out of it but may use the trail
 * Rendering: game/render/mountain-boulders.js (InstancedMesh); the trail itself is lighter ground (game/terrain-color.js).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SEED = 309;
  var CLUSTERS = 4, PER_CLUSTER = 9, CLUSTER_R = 6.5, BORDER = 7, TRIES = 4000;
  var HEIGHTS = { boulder: 0.72, flat: 0.28, stack: 0.8, jagged: 0.95 };   // top of each rock kind at scale 1 (game/render/rocks.js HEIGHTS)
  var cached = null, cachedSolids = null;

  function peakClear(x, z, r) {
    var P = SA.peaks;
    if (!P) return true;
    for (var i = 0; i < P.LIST.length; i++) if (Math.hypot(x - P.LIST[i].x, z - P.LIST[i].z) < P.BASE_R + r + 1) return false;
    return true;
  }

  /** True when a boulder of footprint radius r may stand at (x, z): inside the montaña, off the trail, spawn, station and peaks. */
  function siteOk(x, z, r) {
    var M = SA.map, range = M.biomeRange('montana'), B = M.BOUNDS;
    if (x < range.lo + BORDER + r || x > range.hi - BORDER - r || z < B.minZ + BORDER || z > B.maxZ - BORDER) return false;
    if (SA.mountainTrail.distance(x, z) < SA.mountainTrail.WIDTH / 2 + r + 1) return false;
    if (SA.player && SA.player.inSpawnZone(x, z, r + 2)) return false;
    if (SA.station && SA.station.inFootprint(x, z, r + 2)) return false;
    return peakClear(x, z, r);
  }

  function makeBoulder(rand, cx, cz, placed) {
    var M = SA.map, R = SA.rocks;
    for (var t = 0; t < 30; t++) {
      var a = rand() * Math.PI * 2, d = CLUSTER_R * Math.sqrt(rand()), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      var size = 1.3 + rand() * 1.1, spec = R.spec(R.seedAt(x, z), 'montana'), r = 0.62 * size * Math.max(spec.scale[0], spec.scale[2]);
      if (!siteOk(x, z, r)) continue;
      var apart = true;
      for (var i = 0; i < placed.length; i++) if (Math.hypot(x - placed[i].x, z - placed[i].z) < r + placed[i].r + 0.3) { apart = false; break; }
      if (!apart) continue;
      return { x: x, z: z, y: M.groundHeight(x, z), size: size, r: r, h: HEIGHTS[spec.kind] * size * spec.scale[1],
        kind: spec.kind, variant: spec.variant, scale: spec.scale, yaw: spec.yaw, tilt: spec.tilt, color: spec.color };
    }
    return null;
  }

  function layout(seed) {
    var rand = SA.map.rng(seed === undefined ? SEED : seed), M = SA.map, range = M.biomeRange('montana'), B = M.BOUNDS;
    var clusters = [], boulders = [];
    for (var t = 0; t < TRIES && clusters.length < CLUSTERS; t++) {
      var x = range.lo + BORDER + CLUSTER_R + rand() * (range.hi - range.lo - 2 * (BORDER + CLUSTER_R));
      var z = B.minZ + BORDER + CLUSTER_R + rand() * (B.maxZ - B.minZ - 2 * (BORDER + CLUSTER_R));
      if (!siteOk(x, z, CLUSTER_R * 0.5)) continue;
      var far = clusters.every(function (c) { return Math.hypot(x - c.x, z - c.z) > CLUSTER_R * 2.4; });
      if (far) clusters.push({ x: x, z: z, r: CLUSTER_R });
    }
    clusters.forEach(function (c) {
      for (var i = 0; i < PER_CLUSTER; i++) {
        var b = makeBoulder(rand, c.x, c.z, boulders);
        if (b) boulders.push(b);
      }
    });
    return { clusters: clusters, boulders: boulders };
  }

  function get() { return cached || (cached = layout()); }

  function solids() {
    return cachedSolids || (cachedSolids = get().boulders.map(function (b) { return [b.x, b.z, b.r, b.h]; }));
  }

  /** True within pad of a boulder cluster (animals and pickups keep out of the field, but may walk the trail). */
  function inField(x, z, pad) {
    var p = pad || 0, L = get();
    for (var i = 0; i < L.clusters.length; i++) if (Math.hypot(x - L.clusters[i].x, z - L.clusters[i].z) < L.clusters[i].r + p) return true;
    return false;
  }

  /** True on the trail strip or in the boulder field: no trees, plants or other scenery grow there. */
  function near(x, z, pad) { return SA.mountainTrail.onTrail(x, z, pad || 0) || inField(x, z, pad); }

  SA.mountainPlan = { SEED: SEED, layout: layout, get: get, solids: solids, near: near, inField: inField };
})(typeof window !== 'undefined' ? window : globalThis);
