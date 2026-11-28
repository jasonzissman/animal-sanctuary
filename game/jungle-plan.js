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
 *   layout().waterfall (AS-0389, slice 2/4): the selva's small waterfall on the pond's shore, or null. { x, z (foot of the sheet, just inside the water edge),
 *       ang (outward from the pond), yaw (group turn so local +x points across the pond), local: true, moss: true, cx, cz, r (footprint circle: near() and
 *       avoidPoints() keep scenery, animals and pickups off it), poolY (the pond's water level; no pool of its own), topY, lowY, fx: 0, sheetW,
 *       cliff: [{ x, z, w, d, y, h }] LOCAL offsets, cliffSolids: [[x, z, r, 99]] world, added to solids() (rock, never jumped) }. Seeded after the giants
 *       (same trees per seed), clear of the giants' canopies, spawn, station, lookouts, bridges and streams. The water itself is the pond: it blocks nobody extra.
 * layout().clearings (AS-0391, slice 4/4): 1-2 sunny clearings, [{ id, x, z, y, r (open radius), shaftR }]: round, open, gentle, dry ground inside the selva, clear of
 *       every giant's canopy, the pond, the waterfall, spawn, station, lookouts, bridges and streams. Seeded after the waterfall (same trees/falls per seed).
 *   SA.junglePlan.inClearing(x, z, pad?)   true within pad of a clearing's open circle: decor trees, rocks, undergrowth and its flowers keep out of it
 *   SA.junglePlan.clearingStrength(x, z)   0..1 ground-tint weight (1 inside the open circle, fading to 0 over TINT_FADE beyond it), for SA.terrain
 * Rendering: game/render/jungle-giants.js, game/render/waterfall.js (createJungleWaterfall), game/render/jungle-clearing.js (light shaft), game/render/jungle-flowers.js.
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
  var FALL_R = 4.2, FALL_H = 5, FALL_FACE = 0.4, FALL_TRIES = 400;   // waterfall footprint radius, the lip's height above the water, how far the face stands inside the water edge
  var CLEAR_COUNT = 2, CLEAR_TRIES = 600, CLEAR_R = 6, TINT_FADE = 2.5;   // clearings: up to 2, open radius ~6 m (+- 1), tint fades over 2.5 m beyond it
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

  /** The waterfall site (AS-0389): a small mossy cliff on the pond's shore whose sheet falls into the water. The seeded search picks an angle round the
   *  pond; the cliff stands on the outside (local +x points back across the pond), clear of every giant, the station, the spawn, lookouts, bridges and
   *  streams, with dry rising ground behind it. Coordinates: x, z = the foot of the sheet (a hair inside the pond's water edge); cliff blocks and fx are
   *  LOCAL offsets (x toward the pond, z along the face); the renderer turns the group by `yaw`. cliffSolids are world [x, z, r, 99]. */
  function makeFalls(rand, giants) {
    var M = SA.map, P = M.POND, range = M.biomeRange('selva'), B = M.BOUNDS, zs = [-1.65, 0, 1.65];
    for (var t = 0; t < FALL_TRIES; t++) {
      var ang = rand() * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang), d = P.radius + 0.6 - FALL_FACE;   // the sheet falls just inside the water edge
      var x = P.x + ca * d, z = P.z + sa * d, cx = P.x + ca * (d + 2.2), cz = P.z + sa * (d + 2.2);
      if (cx < range.lo + BORDER || cx > range.hi - BORDER || cz < B.minZ + BORDER || cz > B.maxZ - BORDER) continue;
      if (giants.some(function (g) { return Math.hypot(cx - g.x, cz - g.z) < g.canopyR + FALL_R; })) continue;
      if (SA.player && SA.player.inSpawnZone(cx, cz, FALL_R)) continue;
      if (SA.station && SA.station.inFootprint(cx, cz, FALL_R + 1)) continue;
      if (SA.lookouts && SA.lookouts.near(cx, cz, FALL_R + 2)) continue;
      if (SA.surfaces && SA.surfaces.near(cx, cz, FALL_R + 2)) continue;
      if (SA.forestStreams && SA.forestStreams.inWater(cx, cz, FALL_R + 2)) continue;
      var low = Infinity, back = -Infinity;
      for (var u = 0; u <= 4; u++) for (var v = -1; v <= 1; v++) {   // ground under the cliff: u runs from the face to the back, v across it
        var gx = P.x + ca * (d + 0.4 + u * 0.8) - sa * v * 1.65, gz = P.z + sa * (d + 0.4 + u * 0.8) + ca * v * 1.65, gh = M.groundHeight(gx, gz);
        if (gh < low) low = gh;
        if (u === 4 && gh > back) back = gh;
      }
      if (back < M.WATER_LEVEL - 0.4 || M.isWater(P.x + ca * (d + 5), P.z + sa * (d + 5))) continue;   // land (not more water) behind the cliff
      var topY = M.WATER_LEVEL + FALL_H, baseY = low - 0.6, yaw = Math.PI - ang, cy = Math.cos(yaw), sy = Math.sin(yaw);
      if (topY - back < 3.5) continue;
      var cliff = zs.map(function (dz, i) {   // left, middle (a notch for the water), right
        return { x: i === 1 ? -1.2 : -1.0, z: dz, w: i === 1 ? 1.6 : 1.7, d: i === 1 ? 2.4 : 2.8, y: baseY, h: topY - (i === 1 ? 0.5 : i * 0.2) - baseY };
      });
      return { x: x, z: z, ang: ang, yaw: yaw, local: true, moss: true, cx: cx, cz: cz, r: FALL_R, poolY: M.WATER_LEVEL, lowY: low, topY: topY, fx: 0, sheetW: 1.5, cliff: cliff,
        cliffSolids: [-2.0, 2.0].map(function (dz) { return [x + (-1.2) * cy + dz * sy, z - (-1.2) * sy + dz * cy, 1.0, 99]; }) };   // two side walls: the middle block is the grotto's tunnel (AS-0174)
    }
    return null;
  }

  /** Sunny clearings (AS-0391): round open patches of the selva, at most CLEAR_COUNT, clear of everything the selva already holds. */
  function makeClearings(rand, giants, falls) {
    var M = SA.map, range = M.biomeRange('selva'), B = M.BOUNDS, P = M.POND, out = [];
    for (var t = 0; t < CLEAR_TRIES && out.length < CLEAR_COUNT; t++) {
      var r = CLEAR_R + (rand() - 0.5) * 2, pad = r + 2;
      var x = range.lo + BORDER + pad + rand() * (range.hi - range.lo - 2 * (BORDER + pad)), z = B.minZ + BORDER + pad + rand() * (B.maxZ - B.minZ - 2 * (BORDER + pad));
      if (Math.hypot(x - P.x, z - P.z) < P.radius + pad + 2 || M.groundHeight(x, z) < M.WATER_LEVEL + 0.6) continue;
      if (giants.some(function (g) { return Math.hypot(x - g.x, z - g.z) < g.canopyR * 0.6 + pad; })) continue;   // the sun reaches it: canopies stay beside it
      if (falls && Math.hypot(x - falls.cx, z - falls.cz) < falls.r + pad) continue;
      if (out.some(function (c) { return Math.hypot(x - c.x, z - c.z) < c.r + pad + 8; })) continue;
      if (SA.player && SA.player.inSpawnZone(x, z, pad)) continue;
      if (SA.station && SA.station.inFootprint(x, z, pad)) continue;
      if (SA.lookouts && SA.lookouts.near(x, z, pad)) continue;
      if (SA.surfaces && SA.surfaces.near(x, z, pad)) continue;
      if (SA.forestStreams && SA.forestStreams.inWater(x, z, pad)) continue;
      if (spread(x, z, r) > MAX_SPREAD * 1.5) continue;
      out.push({ id: 'claro-' + (out.length + 1), x: x, z: z, y: M.groundHeight(x, z), r: r, shaftR: r * 0.8 });
    }
    return out;
  }

  function layout(seed) {
    var M = SA.map, rand = M.rng(seed === undefined ? SEED : seed), range = M.biomeRange('selva'), B = M.BOUNDS, giants = [];
    for (var t = 0; t < TRIES && giants.length < COUNT; t++) {
      var x = range.lo + BORDER + rand() * (range.hi - range.lo - 2 * BORDER), z = B.minZ + BORDER + rand() * (B.maxZ - B.minZ - 2 * BORDER);
      if (!siteOk(x, z, 2.2)) continue;
      if (giants.some(function (g) { return Math.hypot(x - g.x, z - g.z) < SPACING; })) continue;
      giants.push(makeGiant(rand, x, z, giants.length));
    }
    var falls = makeFalls(rand, giants);   // after the giants, so the same seed keeps the same trees
    return { giants: giants, waterfall: falls, clearings: makeClearings(rand, giants, falls) };
  }

  function get() { return cached || (cached = layout()); }

  function solids() {
    if (cachedSolids) return cachedSolids;
    var L = get(), out = L.giants.map(function (g) { return [g.x, g.z, g.solidR, 99]; });
    if (L.waterfall) Array.prototype.push.apply(out, L.waterfall.cliffSolids);   // the cliff is rock: it cannot be jumped
    return (cachedSolids = out);
  }

  function avoidPoints() {
    var L = get(), out = L.giants.map(function (g) { return [g.x, g.z]; });
    if (L.waterfall) out.push([L.waterfall.cx, L.waterfall.cz]);
    return out;
  }

  /** True within pad of a trunk's solid base or of the waterfall's footprint. */
  function near(x, z, pad) {
    var L = get(), G = L.giants, p = pad || 0, w = L.waterfall;
    for (var i = 0; i < G.length; i++) if (Math.hypot(x - G[i].x, z - G[i].z) < G[i].solidR + p) return true;
    if (w && SA.grottoPlan && SA.grottoPlan.near(x, z, p)) return true;   // the grotto behind the fall (AS-0174)
    return !!w && Math.hypot(x - w.cx, z - w.cz) < w.r + p;
  }

  /** True within pad of a clearing's open circle. */
  function inClearing(x, z, pad) {
    var C = get().clearings, p = pad || 0;
    for (var i = 0; i < C.length; i++) if (Math.hypot(x - C[i].x, z - C[i].z) < C[i].r + p) return true;
    return false;
  }

  function clearingStrength(x, z) {
    var C = get().clearings, best = 0;
    for (var i = 0; i < C.length; i++) {
      var k = 1 - (Math.hypot(x - C[i].x, z - C[i].z) - C[i].r) / TINT_FADE;
      if (k > best) best = k > 1 ? 1 : k;
    }
    return best;
  }

  function targets() {
    return cachedTargets || (cachedTargets = get().giants.map(function (g) {
      return { kind: 'tree', giant: true, id: g.id, x: g.x, z: g.z, y: g.y, radius: g.solidR, topY: g.topY, top: { shape: 'circle', size: g.topR } };
    }));
  }

  SA.junglePlan = { SEED: SEED, COUNT: COUNT, MIN_COUNT: MIN_COUNT, SPACING: SPACING, POND_GAP: POND_GAP, layout: layout, get: get, solids: solids,
    near: near, inClearing: inClearing, clearingStrength: clearingStrength, TINT_FADE: TINT_FADE, targets: targets, avoidPoints: avoidPoints };
})(typeof window !== 'undefined' ? window : globalThis);
