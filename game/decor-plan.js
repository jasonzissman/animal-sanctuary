/* SA.decorPlan: pure, seeded placement of the scenery (no THREE, no DOM; node:vm tested). AS-0248.
 * Load after game/map.js, game/peaks.js, game/station.js and game/player.js (the last three are optional).
 *
 *   SA.decorPlan.RULES            data rows { decor, biome, count, gap, size, inset? } (decor = an id from game/data/decor.js)
 *   SA.decorPlan.plan(opts?)      -> [{ decor, biome, x, z, y, size, rot, tint }]   (opts.seed, default 42; tint 0..1 = leaf colour variation)
 *       Fills every biome strip across its whole width and the whole z range of SA.map.BOUNDS. Each rule's items are dealt
 *       round-robin into the four quadrants of the strip (west/east half x north/south half), so no corner stays empty.
 *       Nothing lands in water, on the spawn clearing, on a forest dirt path (SA.forestPaths), on the station footprint, or within `gap` of an earlier item.
 *       `size` is a ready scale for the builder (null for items with a fixed shape); `rot` is a yaw in radians.
 *   SA.decorPlan.quadrant(biomeId, x, z) -> 0..3 (bit 0 = east half, bit 1 = south half)
 * game/render/decor.js turns each entry into a mesh; the peaks (SA.peaks) are placed there but reserve space here.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var EDGE = 2;           // keep this far inside BOUNDS in z
  var DRY = 0.45;         // ground must be this far above the water level

  // Counts are roughly double the old 160 x 50 map's, matching the ~2x area (AS-0247). size: 'tree' 0.8..1.4, 'rock' 0.8..1.8, null = fixed.
  var RULES = [
    // AS-0296: each biome has 2-3 tree kinds (pino/roble/abedul, jungle/palmera/ceiba, acacia/yuca + cactus, pinonieve/abeto); totals match the old counts.
    { decor: 'pino', biome: 'bosque', count: 22, gap: 3, size: 'tree' },
    { decor: 'roble', biome: 'bosque', count: 20, gap: 3.2, size: 'tree' },
    { decor: 'abedul', biome: 'bosque', count: 14, gap: 3, size: 'tree' },
    { decor: 'roca', biome: 'bosque', count: 20, gap: 2, size: 'rock' },
    { decor: 'jungle', biome: 'selva', count: 26, gap: 3.2, size: 'tree' },
    { decor: 'palmera', biome: 'selva', count: 20, gap: 3, size: 'tree' },
    { decor: 'ceiba', biome: 'selva', count: 18, gap: 3.6, size: 'tree' },
    { decor: 'roca', biome: 'selva', count: 16, gap: 2, size: 'rock' },
    { decor: 'flor', biome: 'selva', count: 32, gap: 1.5, size: null },
    { decor: 'cactus', biome: 'desierto', count: 20, gap: 3, size: 'tree' },
    { decor: 'acacia', biome: 'desierto', count: 14, gap: 3.4, size: 'tree' },
    { decor: 'yuca', biome: 'desierto', count: 10, gap: 3, size: 'tree' },
    { decor: 'rocaarena', biome: 'desierto', count: 20, gap: 2, size: 'rock' },
    { decor: 'pinonieve', biome: 'montana', count: 26, gap: 3, size: 'tree', hiInset: 4 },
    { decor: 'abeto', biome: 'montana', count: 22, gap: 3, size: 'tree', hiInset: 4 },
    { decor: 'roca', biome: 'montana', count: 14, gap: 2, size: 'rock', hiInset: 4 },   // AS-0299: grey rocks among the pines (last, so no earlier item moves)
  ];

  /** A seeded 0..1 colour tint from where the item stands (a hash, so it never shifts the placement random stream). */
  function tintAt(x, z) { var h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return h - Math.floor(h); }

  function quadrant(biomeId, x, z) {
    var r = SA.map.biomeRange(biomeId);
    return (x >= r.centerX ? 1 : 0) | (z >= 0 ? 2 : 0);
  }

  function usable(x, z) {
    var M = SA.map;
    if (M.groundHeight(x, z) < M.WATER_LEVEL + DRY) return false;
    if (SA.player && SA.player.inSpawnZone(x, z)) return false;       // the spawn stays clear (AS-0105)
    if (SA.station && SA.station.inFootprint(x, z, 1)) return false;  // and so does the research station's footprint
    if (SA.forestStreams && SA.forestStreams.inWater(x, z, 1.2)) return false;   // and out of the forest streams (AS-0301)
    if (SA.fallenLogs && SA.fallenLogs.near(x, z, 1.4)) return false;   // no tree grows through a fallen log (AS-0302)
    if (SA.surfaces && SA.surfaces.near(x, z, 1.6)) return false;   // and off the river bridges and their ends (AS-0158)
    if (SA.forestPaths && SA.forestPaths.onPath(x, z, 1)) return false;   // and the forest dirt paths (AS-0300; a trunk is up to ~1 m wide)
    return true;
  }

  function plan(opts) {
    var M = SA.map, rand = M.rng(opts && opts.seed !== undefined ? opts.seed : 42), B = M.BOUNDS, out = [], taken = [];
    if (SA.peaks) SA.peaks.LIST.forEach(function (p) {
      taken.push([p.x, p.z]);
      for (var a = 0; a < 8; a++) taken.push([p.x + 2 * Math.cos(a * Math.PI / 4), p.z + 2 * Math.sin(a * Math.PI / 4)]);   // keeps pines off the slope
    });
    RULES.forEach(function (rule) {
      var range = M.biomeRange(rule.biome);
      if (!range) return;
      var x0 = Math.max(range.lo + 1.5, B.minX + 1), x1 = Math.min(range.hi - (rule.hiInset || 1.5), B.maxX - 1);
      var z0 = B.minZ + EDGE, z1 = B.maxZ - EDGE, cx = range.centerX;
      for (var i = 0; i < rule.count; i++) {
        var q = i % 4, east = q & 1, south = q >> 1;
        var xa = east ? Math.max(cx, x0) : x0, xb = east ? x1 : Math.min(cx, x1), za = south ? 0 : z0, zb = south ? z1 : 0;
        for (var t = 0; t < 40; t++) {
          var x = xa + rand() * (xb - xa), z = za + rand() * (zb - za);
          if (!usable(x, z)) continue;
          var ok = true;
          for (var k = 0; k < taken.length; k++) {
            var dx = taken[k][0] - x, dz = taken[k][1] - z;
            if (dx * dx + dz * dz < rule.gap * rule.gap) { ok = false; break; }
          }
          if (!ok) continue;
          taken.push([x, z]);
          var size = rule.size === 'tree' ? 0.8 + rand() * 0.6 : rule.size === 'rock' ? 0.8 + rand() : null;
          out.push({ decor: rule.decor, biome: rule.biome, x: x, z: z, y: M.groundHeight(x, z), size: size, rot: rand() * Math.PI * 2, tint: tintAt(x, z) });
          break;
        }
      }
    });
    return out;
  }

  SA.decorPlan = { RULES: RULES, plan: plan, quadrant: quadrant, tintAt: tintAt };
})(typeof window !== 'undefined' ? window : globalThis);
