/* SA.lookouts: pure, seeded layout of the wooden lookout towers with a ladder (no THREE, no DOM; node:vm tested). AS-0160.
 * Load after game/map.js, game/surfaces.js (and optionally game/station.js, game/player.js, game/forest-streams.js) and before game/climb.js users run.
 *
 * One tower per biome in BIOMES (the forest and the desert): a small wooden base on four legs with a ladder up ONE side to a flat platform
 * with a railing all round. The ladder is a plain SA.climb target of kind 'ladder' (the same data shape as a tree, peak or building), so
 * climbing it is exactly the tree flow: C / E / Space or pushing into the ladder for 0.6 s (SA.climb.autoStep), then walking on the platform.
 *
 *   SA.lookouts.layout(seed?) -> [{ id, biome, x, z, face: { x, z }, groundY, topY, base, platform, railH }]   the same for the same seed.
 *       (x, z) centre, face the unit axis direction the ladder is on, groundY the highest ground under the base, topY the platform surface,
 *       base the side of the square tower footprint, platform the side of the platform (it overhangs the base).
 *   SA.lookouts.towers()       the cached default layout (built once)
 *   SA.lookouts.targets()      -> SA.climb target data (kind 'ladder'), plain JSON:
 *       { kind, id, x, z, footprint: { w, d }, topY, top: { shape: 'rect', size: { w, d }, solids: [[x, z, r]] }, noClimb: [{ x0, x1, z0, z1 }] }
 *       top.solids is the railing: posts close enough that nobody falls off. noClimb leaves only the ladder side as a place to start climbing.
 *   SA.lookouts.solids()       -> [[x, z, r], ...] the ground footprint (corner legs, the sides and the ladder foot) for SA.player.step
 *   SA.lookouts.near(x, z, pad?) true within pad of a tower base or its ladder approach (trees, plants and animals keep off)
 *   SA.lookouts.railSolids(tower) / SA.lookouts.zones(tower) the pieces above, for one tower
 * Rendering: game/render/lookouts.js (one merged mesh).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SEED = 160;
  var BIOMES = ['bosque', 'desierto'];
  var BASE = 3.2;           // side of the tower's footprint (the four legs sit on its edge)
  var PLATFORM = 4.0;       // side of the platform: a roomy 4 m square so the 0.6 body still has a floor inside the railing
  var HEIGHT = 4.4;         // platform height above the highest ground under the base (a few player heights: you can see far)
  var RAIL_H = 0.95, RAIL_R = 0.16, RAIL_STEP = 0.5, RAIL_INSET = 0.18;   // the railing posts: gapless for a 0.6 body
  var LEG_R = 0.3, LEG_STEP = 0.55;
  var LADDER_GAP = 5;       // metres of open approach kept in front of the ladder
  var FACES = [{ x: 0, z: -1 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }];
  var cached = null, cachedTargets = null, cachedSolids = null;

  function dry(x, z) { return SA.map.groundHeight(x, z) > SA.map.WATER_LEVEL + 0.5; }

  /** Highest and lowest ground over the tower base square. */
  function spread(x, z, half) {
    var lo = Infinity, hi = -Infinity;
    for (var dx = -half; dx <= half + 1e-9; dx += half / 2) {
      for (var dz = -half; dz <= half + 1e-9; dz += half / 2) {
        var h = SA.map.groundHeight(x + dx, z + dz);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
    }
    return { lo: lo, hi: hi };
  }

  function siteOk(x, z, face) {
    var M = SA.map, half = PLATFORM / 2 + 1;
    for (var dx = -half; dx <= half; dx += half) for (var dz = -half; dz <= half; dz += half) {   // base, platform and surroundings are dry
      if (!dry(x + dx, z + dz)) return false;
    }
    for (var s = 2; s <= LADDER_GAP; s += 1.5) if (!dry(x + face.x * s, z + face.z * s)) return false;   // so is the approach to the ladder
    var sp = spread(x, z, BASE / 2);
    if (sp.hi - sp.lo > 0.7) return false;
    if (M.groundHeight(x, z) > 3) return false;
    var ax = x + face.x * 3, az = z + face.z * 3;
    if (SA.player && (SA.player.inSpawnZone(x, z, 3) || SA.player.inSpawnZone(ax, az, 2))) return false;
    if (SA.station && (SA.station.inFootprint(x, z, 4) || SA.station.inFootprint(ax, az, 2))) return false;
    if (SA.forestStreams && (SA.forestStreams.inWater(x, z, 4) || SA.forestStreams.inWater(ax, az, 2))) return false;
    if (SA.fallenLogs && (SA.fallenLogs.near(x, z, 4) || SA.fallenLogs.near(ax, az, 2))) return false;
    if (SA.surfaces && SA.surfaces.near(x, z, 5)) return false;
    if (SA.peaks && SA.peaks.moundY(x, z) > -Infinity) return false;
    return true;
  }

  function layout(seed) {
    var M = SA.map, rand = M.rng(seed === undefined ? SEED : seed), out = [];
    BIOMES.forEach(function (biome) {
      var r = M.biomeRange(biome);
      if (!r) return;
      for (var t = 0; t < 300; t++) {
        var x = r.lo + 10 + rand() * (r.hi - r.lo - 20), z = M.BOUNDS.minZ + 8 + rand() * (M.BOUNDS.maxZ - M.BOUNDS.minZ - 16);
        var face = FACES[Math.floor(rand() * FACES.length) % FACES.length];
        if (M.biomeAt(x) !== biome || !siteOk(x, z, face)) continue;
        if (out.some(function (o) { return Math.hypot(o.x - x, o.z - z) < 30; })) continue;
        var sp = spread(x, z, BASE / 2);
        out.push({ id: 'torre' + (out.length + 1), biome: biome, x: x, z: z, face: { x: face.x, z: face.z }, groundY: sp.hi, topY: sp.hi + HEIGHT,
          base: BASE, platform: PLATFORM, railH: RAIL_H });
        break;
      }
    });
    return out;
  }

  function towers() { return cached || (cached = layout()); }

  /** The railing posts on the platform (circles on the flat top), all round, just inside its edge. */
  function railSolids(t) {
    var half = t.platform / 2 - RAIL_INSET, n = Math.ceil(2 * half / RAIL_STEP), out = [];
    for (var i = 0; i <= n; i++) {
      var u = -half + 2 * half * i / n;
      out.push([t.x + u, t.z - half, RAIL_R], [t.x + u, t.z + half, RAIL_R]);
      if (i > 0 && i < n) out.push([t.x - half, t.z + u, RAIL_R], [t.x + half, t.z + u, RAIL_R]);
    }
    return out;
  }

  /** Ground zones where nobody can start a climb: beside and behind the tower, and the corners flanking the ladder side. */
  function zones(t) {
    var h = t.base / 2, far = 5, f = t.face, side = h + 0.8;
    // Work in a frame where the ladder faces +u: u along the face, v across it. Each box is returned in world x / z.
    function wbox(u0, u1, v0, v1) {
      var xs = [t.x + f.x * u0 - f.z * v0, t.x + f.x * u1 - f.z * v1, t.x + f.x * u0 - f.z * v1, t.x + f.x * u1 - f.z * v0];
      var zs = [t.z + f.z * u0 + f.x * v0, t.z + f.z * u1 + f.x * v1, t.z + f.z * u0 + f.x * v1, t.z + f.z * u1 + f.x * v0];
      return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) };
    }
    return [wbox(-h - far, h, -h - far, h + far), wbox(h, h + far, -h - far, -side), wbox(h, h + far, side, h + far)];
  }

  function groundSolids(t) {
    var h = t.base / 2 - LEG_R, n = Math.ceil(2 * h / LEG_STEP), out = [];
    for (var i = 0; i <= n; i++) {
      var u = -h + 2 * h * i / n;
      out.push([t.x + u, t.z - h, LEG_R], [t.x + u, t.z + h, LEG_R]);
      if (i > 0 && i < n) out.push([t.x - h, t.z + u, LEG_R], [t.x + h, t.z + u, LEG_R]);
    }
    return out;
  }

  /** Plain SA.climb target data for one tower. */
  function target(t) {
    return { kind: 'ladder', id: t.id, x: t.x, z: t.z, footprint: { w: t.base, d: t.base }, topY: t.topY,
      top: { shape: 'rect', size: { w: t.platform, d: t.platform }, solids: railSolids(t) }, noClimb: zones(t) };
  }

  function targets() { return cachedTargets || (cachedTargets = towers().map(target)); }

  function solids() {
    if (!cachedSolids) { cachedSolids = []; towers().forEach(function (t) { cachedSolids = cachedSolids.concat(groundSolids(t)); }); }
    return cachedSolids;
  }

  function near(x, z, pad) {
    var p = pad || 0, list = towers();
    for (var i = 0; i < list.length; i++) {
      var t = list[i], h = t.platform / 2 + p;
      if (Math.abs(x - t.x) <= h && Math.abs(z - t.z) <= h) return true;
      var a = (x - t.x) * t.face.x + (z - t.z) * t.face.z, b = -(x - t.x) * t.face.z + (z - t.z) * t.face.x;   // the open approach in front of the ladder
      if (a > 0 && a <= LADDER_GAP + p && Math.abs(b) <= 1.5 + p) return true;
    }
    return false;
  }

  SA.lookouts = { SEED: SEED, BIOMES: BIOMES, BASE: BASE, PLATFORM: PLATFORM, HEIGHT: HEIGHT, RAIL_H: RAIL_H, RAIL_R: RAIL_R, layout: layout, towers: towers,
    targets: targets, target: target, solids: solids, groundSolids: groundSolids, railSolids: railSolids, zones: zones, near: near };
})(typeof window !== 'undefined' ? window : globalThis);
