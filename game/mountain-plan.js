/* SA.mountainPlan: pure, seeded boulder field on the montaña (AS-0309, slice 3/4 of AS-0136). No THREE, no DOM; node:vm tested.
 * Load after game/map.js, game/mountain-trail.js, game/peaks.js and game/rocks.js (optionally game/player.js, game/station.js).
 *
 *   SA.mountainPlan.layout(seed?) -> { clusters: [{ x, z, r }], boulders: [{ x, z, y, size, r, h, kind, variant, scale, yaw, tilt, color }] }
 *       A few clustered groups of boulders (kinds and colours from SA.rocks.spec(.., 'montana')) on the mountain's flanks, the same for the same
 *       seed. Every boulder stands clear of the trail (its own radius + 1 m beyond the strip), the biome borders, the spawn, the station,
 *       the climbable peaks and the other boulders. `r` is the footprint radius and `h` the height above the ground at its centre.
 *       + waterfall (AS-0310, slice 4/4): { x, z, poolR, poolY, lowY, topY, fx, sheetW, r, cliff: [{ x, z, w, d, y, h }], poolSolid, cliffSolids }, the same for
 *       the same seed. A small stone cliff (3 blocks, the middle one lower so the water runs through a notch) stands uphill (-x) of a round pool; the
 *       sheet falls down its +x face (x = fx) into the pool. (x, z) is the pool centre, `r` the footprint radius round (x, z). The site is the flattest of a few
 *       seeded tries, off the trail, borders, spawn, station, peaks, boulder field and boulders (null when none fits).
 *   SA.mountainPlan.get()       the cached default layout
 *   SA.mountainPlan.solids()    [[x, z, r, h], ...] what blocks the walking player (scene.js adds it to the obstacles); low flat stones are jumpable
 *   SA.mountainPlan.near(x, z, pad?)     true on the trail strip or within pad of a boulder cluster; decor and plants keep out (decor-plan.js, ground-cover-plan.js)
 *   SA.mountainPlan.inField(x, z, pad?)  true within pad of a boulder cluster or the waterfall; pickups and animals keep out of it but may use the trail
 *   SA.mountainPlan.inPool(x, z, pad?)   true over the waterfall pool (it is water: you do not wade in)
 * Rendering: game/render/mountain-boulders.js (InstancedMesh), game/render/waterfall.js; the trail itself is lighter ground (game/terrain-color.js).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SEED = 309;
  var CLUSTERS = 4, PER_CLUSTER = 9, CLUSTER_R = 6.5, BORDER = 7, TRIES = 4000;
  var HEIGHTS = { boulder: 0.72, flat: 0.28, stack: 0.8, jagged: 0.95 };   // top of each rock kind at scale 1 (game/render/rocks.js HEIGHTS)
  // The waterfall footprint is a circle of radius FALL_R round the pool centre; it keeps FALL_BORDER (> the 3 m colour blend) from the borders. The
  // mountain is crowded (trail, peaks, boulders), so the site comes from a long seeded search that keeps only gentle ground with a rise behind it.
  var POOL_R = 2.4, FALL_R = 4.8, FALL_H = 4.4, FALL_BORDER = 3.5, MAX_SPREAD = 2.6, FALL_TRIES = 12000;
  var cached = null, cachedSolids = null;

  function peakClear(x, z, r) {
    var P = SA.peaks;
    if (!P) return true;
    for (var i = 0; i < P.LIST.length; i++) if (Math.hypot(x - P.LIST[i].x, z - P.LIST[i].z) < P.BASE_R + r + 1) return false;
    return true;
  }

  /** True when a boulder of footprint radius r may stand at (x, z): inside the montaña, off the trail, spawn, station and peaks. */
  function siteOk(x, z, r, border) {
    var M = SA.map, range = M.biomeRange('montana'), B = M.BOUNDS, bd = border === undefined ? BORDER : border;
    if (x < range.lo + bd + r || x > range.hi - bd - r || z < B.minZ + bd || z > B.maxZ - bd) return false;
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

  function spread(x, z, r) {
    var M = SA.map, lo = M.groundHeight(x, z), hi = lo;
    for (var i = 0; i < 12; i++) {
      var h = M.groundHeight(x + r * Math.cos(i * Math.PI / 6), z + r * Math.sin(i * Math.PI / 6));
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    return { lo: lo, hi: hi };
  }

  /** The waterfall: the flattest seeded site that stands clear of everything else on the mountain. */
  function makeFalls(rand, clusters, boulders) {
    var M = SA.map, range = M.biomeRange('montana'), B = M.BOUNDS, best = null, bestScore = Infinity, found = 0;
    for (var t = 0; t < FALL_TRIES && found < 10; t++) {
      var x = range.lo + rand() * (range.hi - range.lo), z = B.minZ + rand() * (B.maxZ - B.minZ);
      if (!siteOk(x, z, FALL_R, FALL_BORDER)) continue;
      if (M.groundHeight(x - 4, z) - M.groundHeight(x + 2, z) < 0.4) continue;   // the cliff backs into a slope that rises uphill (-x)
      if (clusters.some(function (c) { return Math.hypot(x - c.x, z - c.z) < c.r + FALL_R + 1; })) continue;
      if (boulders.some(function (b) { return Math.hypot(x - b.x, z - b.z) < b.r + FALL_R + 0.5; })) continue;
      var s = spread(x, z, FALL_R - 0.6);
      if (s.hi - s.lo > MAX_SPREAD) continue;
      found++;
      if (s.hi - s.lo < bestScore) { bestScore = s.hi - s.lo; best = { x: x, z: z, lo: s.lo, hi: s.hi }; }
    }
    if (!best) return null;
    var pool = spread(best.x, best.z, POOL_R + 0.5), fx = best.x - POOL_R * 0.6, topY = pool.hi + FALL_H, baseY = best.lo - 0.6, zs = [-1.65, 0, 1.65];
    var cliff = zs.map(function (dz, i) {   // left, middle (a notch for the water), right
      return { x: fx - (i === 1 ? 1.2 : 1.0), z: best.z + dz, w: i === 1 ? 1.6 : 1.7, d: i === 1 ? 2.4 : 2.8, y: baseY, h: topY - (i === 1 ? 0.5 : i * 0.2) - baseY };
    });
    return { x: best.x, z: best.z, poolR: POOL_R, poolY: pool.hi + 0.05, lowY: pool.lo, topY: topY, fx: fx, sheetW: 1.5, r: FALL_R, cliff: cliff,
      poolSolid: [best.x, best.z, POOL_R + 0.4, 99], cliffSolids: zs.map(function (dz) { return [fx - 1.2, best.z + dz, 1.2, 99]; }) };
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
    return { clusters: clusters, boulders: boulders, waterfall: makeFalls(rand, clusters, boulders) };
  }

  function get() { return cached || (cached = layout()); }

  function solids() {
    if (cachedSolids) return cachedSolids;
    var L = get(), out = L.boulders.map(function (b) { return [b.x, b.z, b.r, b.h]; });
    if (L.waterfall) { out.push(L.waterfall.poolSolid); Array.prototype.push.apply(out, L.waterfall.cliffSolids); }   // the pool is water and the cliff is rock: neither can be jumped
    return (cachedSolids = out);
  }

  /** True within pad of a boulder cluster or the waterfall (animals and pickups keep out of the field, but may walk the trail). */
  function inField(x, z, pad) {
    var p = pad || 0, L = get(), w = L.waterfall;
    if (w && Math.hypot(x - w.x, z - w.z) < w.r + p) return true;
    for (var i = 0; i < L.clusters.length; i++) if (Math.hypot(x - L.clusters[i].x, z - L.clusters[i].z) < L.clusters[i].r + p) return true;
    return false;
  }

  /** True on the trail strip or in the boulder field: no trees, plants or other scenery grow there. */
  function near(x, z, pad) { return SA.mountainTrail.onTrail(x, z, pad || 0) || inField(x, z, pad); }

  /** True over the waterfall pool. */
  function inPool(x, z, pad) {
    var w = get().waterfall;
    return !!w && Math.hypot(x - w.x, z - w.z) < w.poolR + (pad || 0);
  }

  SA.mountainPlan = { SEED: SEED, layout: layout, get: get, solids: solids, near: near, inField: inField, inPool: inPool };
})(typeof window !== 'undefined' ? window : globalThis);
