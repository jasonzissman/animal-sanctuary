/* SA.junglePlan: pure, seeded layout of the selva's giant climbable trees (AS-0388, slice 1/4 of AS-0137). No THREE, no DOM; node:vm tested.
 * Load after game/map.js (optional: station.js, player.js, lookouts.js, surfaces.js) and before game/decor-plan.js. SA.perch is read lazily when the layout is built.
 *
 *   SA.junglePlan.layout(seed?) -> { giants: [{ id, x, z, y, trunkR, solidR, height, topY, canopyR, topR, yaw, tint, vines: [{ a, r, y, len, sway }] }] }
 *       3-4 giant trees in the selva, the same for the same seed. Each stands on dry, gentle ground inside the selva's borders, clear of the
 *       pond (POND_GAP beyond its edge, which also leaves the pond's shore for the waterfall site of the next slice), the spawn, the station,
 *       the lookouts and bridges, and at least SPACING from every other giant (so each leaves a ring of open ground for a sunny clearing and
 *       undergrowth paths). `y` = ground at the trunk, `topY` = the flat standing height of the top canopy tier, `topR` its walkable radius.
 *       vines: seeded hanging vines under the canopy rim: angle `a`, radius `r` from the trunk, start height `y` (absolute) and length `len`.
 *   SA.junglePlan.get()       the cached default layout
 *   SA.junglePlan.solids()    [[x, z, r, h], ...] the trunks (too tall to jump), for SA.player.step (scene.js adds them to the obstacles)
 *   SA.junglePlan.near(x, z, pad?)  true within pad of a trunk's solid base (scenery and plants keep out of it)
 *   SA.junglePlan.targets()   SA.climb target data (kind 'tree', generic: x, z, radius, topY, top), so the giants climb like any tree; their canopy
 *                             height is SA.perch.KINDS.giant scaled by the tree's own scale
 *   SA.junglePlan.avoidPoints() [[x, z], ...] trunk centres, for the animal/pickup avoid list
 * Rendering: game/render/jungle-giants.js.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SEED = 388;
  var COUNT = 4, MIN_COUNT = 3, TRIES = 4000;   // up to COUNT giants; the test requires at least MIN_COUNT
  var BORDER = 9;          // from the selva's borders and the map edge in z (the biome colour blend is 3 m each side)
  var POND_GAP = 14;       // from the pond's edge: its shore is kept for the waterfall slice
  var SPACING = 22;        // between trunks: the canopies (radius ~7.5) never overlap and a clearing fits between
  var MAX_SPREAD = 1.2;    // ground height difference round the trunk
  var VINES = 12;
  var FALLBACK = { height: 15, radius: 4.2 };   // used when SA.perch is not loaded (kind 'giant' in game/perch.js is the source)
  var cached = null, cachedSolids = null, cachedTargets = null;

  function kind() { var K = SA.perch && SA.perch.KINDS; return (K && K.giant) || FALLBACK; }

  function spread(x, z, r) {
    var M = SA.map, lo = M.groundHeight(x, z), hi = lo;
    for (var i = 0; i < 8; i++) {
      var h = M.groundHeight(x + r * Math.cos(i * Math.PI / 4), z + r * Math.sin(i * Math.PI / 4));
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    return hi - lo;
  }

  /** True when a giant's trunk (solid radius r) may stand at (x, z). */
  function siteOk(x, z, r) {
    var M = SA.map, range = M.biomeRange('selva'), B = M.BOUNDS, P = M.POND;
    if (x < range.lo + BORDER || x > range.hi - BORDER || z < B.minZ + BORDER || z > B.maxZ - BORDER) return false;
    if (Math.hypot(x - P.x, z - P.z) < P.radius + POND_GAP) return false;
    if (M.groundHeight(x, z) < M.WATER_LEVEL + 0.6) return false;
    if (SA.player && SA.player.inSpawnZone(x, z, r + 4)) return false;
    if (SA.station && SA.station.inFootprint(x, z, r + 5)) return false;
    if (SA.lookouts && SA.lookouts.near(x, z, r + 6)) return false;
    if (SA.surfaces && SA.surfaces.near(x, z, r + 6)) return false;
    if (SA.forestStreams && SA.forestStreams.inWater(x, z, r + 6)) return false;
    return spread(x, z, r + 1) <= MAX_SPREAD;
  }

  function makeGiant(rand, x, z, i) {
    var k = kind(), y = SA.map.groundHeight(x, z), scale = 1, vines = [];
    var canopyR = k.radius * 1.9, topR = k.radius + 0.6, topY = y + k.height * scale;
    for (var v = 0; v < VINES; v++) {
      var a = (v / VINES) * Math.PI * 2 + (rand() - 0.5) * 0.35, low = rand() < 0.5;   // half hang from the rim of the lowest tier, half from nearer the trunk
      var r = canopyR * (low ? 0.92 : 0.55) * (0.92 + rand() * 0.08);
      vines.push({ a: a, r: r, y: topY - 3.2, len: 4.5 + rand() * 5.5, sway: (rand() - 0.5) * 1.2 });
    }
    return { id: 'gigante-' + (i + 1), x: x, z: z, y: y, trunkR: 1.9, solidR: 2.2, height: k.height * scale, topY: topY, canopyR: canopyR, topR: topR,
      yaw: rand() * Math.PI * 2, tint: rand(), vines: vines };
  }

  function layout(seed) {
    var M = SA.map, rand = M.rng(seed === undefined ? SEED : seed), range = M.biomeRange('selva'), B = M.BOUNDS, giants = [];
    for (var t = 0; t < TRIES && giants.length < COUNT; t++) {
      var x = range.lo + BORDER + rand() * (range.hi - range.lo - 2 * BORDER), z = B.minZ + BORDER + rand() * (B.maxZ - B.minZ - 2 * BORDER);
      if (!siteOk(x, z, 2.2)) continue;
      if (giants.some(function (g) { return Math.hypot(x - g.x, z - g.z) < SPACING; })) continue;
      giants.push(makeGiant(rand, x, z, giants.length));
    }
    return { giants: giants };
  }

  function get() { return cached || (cached = layout()); }

  function solids() {
    return cachedSolids || (cachedSolids = get().giants.map(function (g) { return [g.x, g.z, g.solidR, 99]; }));
  }

  function avoidPoints() { return get().giants.map(function (g) { return [g.x, g.z]; }); }

  function near(x, z, pad) {
    var G = get().giants, p = pad || 0;
    for (var i = 0; i < G.length; i++) if (Math.hypot(x - G[i].x, z - G[i].z) < G[i].solidR + p) return true;
    return false;
  }

  function targets() {
    return cachedTargets || (cachedTargets = get().giants.map(function (g) {
      return { kind: 'tree', giant: true, id: g.id, x: g.x, z: g.z, y: g.y, radius: g.solidR, topY: g.topY, top: { shape: 'circle', size: g.topR } };
    }));
  }

  SA.junglePlan = { SEED: SEED, COUNT: COUNT, MIN_COUNT: MIN_COUNT, SPACING: SPACING, POND_GAP: POND_GAP, layout: layout, get: get, solids: solids,
    near: near, targets: targets, avoidPoints: avoidPoints };
})(typeof window !== 'undefined' ? window : globalThis);
