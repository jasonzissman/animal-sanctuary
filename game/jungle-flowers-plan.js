/* SA.junglePlan.flowers: pure, seeded layout of the selva's bright flowers (AS-0391, slice 4/4 of AS-0137). No THREE, no DOM; node:vm tested.
 * Load after game/jungle-undergrowth-plan.js (it keeps flowers off the undergrowth's corridors) and before game/render/jungle-flowers.js.
 *
 *   SA.junglePlan.flowers(seed?) -> [{ x, z, y, color, h, rot, spot }]   the same for the same seed
 *       color: index into SA.junglePlan.FLOWER_COLORS (7 bright hues); h: stem height (m); spot: 'claro' (inside a clearing), 'borde' (the ring round
 *       one) or 'maleza' (along the undergrowth's edges). Flowers are soft scenery: never on water, the spawn, station, lookouts, bridges, streams,
 *       trunks, the waterfall or in a walking corridor. The count is capped (MAX), so the scene stays light.
 *   SA.junglePlan.flowersGet()   the cached default layout
 * Rendering: game/render/jungle-flowers.js (three InstancedMeshes: stems, blooms, centres).
 */
(function (root) {
  'use strict';
  var SA = root.SA, JP = SA.junglePlan;

  var SEED = 391;
  var MAX = 240;
  var PER_CLEARING = 70, PER_RING = 34, EDGE_TRIES = 160;
  var EDGE = 3;
  var COLORS = ['#ff4f7b', '#ffd23f', '#ff8a3d', '#b86bff', '#ffffff', '#4cc9f0', '#ff3b30'];   // pink, yellow, orange, purple, white, sky blue, red
  var cached = null;

  function usable(x, z) {
    var M = SA.map, range = M.biomeRange('selva'), B = M.BOUNDS;
    if (x < range.lo + EDGE || x > range.hi - EDGE || z < B.minZ + EDGE || z > B.maxZ - EDGE) return false;
    if (M.groundHeight(x, z) < M.WATER_LEVEL + 0.4 || M.nearWater(x, z, 0.6)) return false;
    if (JP.near(x, z, 0.8)) return false;
    if (JP.undergrowthGet && JP.corridorDistance(x, z) < JP.CORRIDOR_HALF) return false;
    if (SA.player && SA.player.inSpawnZone(x, z, 1)) return false;
    if (SA.station && SA.station.inFootprint(x, z, 1.5)) return false;
    if (SA.lookouts && SA.lookouts.near(x, z, 1.5)) return false;
    if (SA.surfaces && SA.surfaces.near(x, z, 1.5)) return false;
    if (SA.forestStreams && SA.forestStreams.inWater(x, z, 1)) return false;
    return true;
  }

  function flowers(seed) {
    var M = SA.map, rand = M.rng(seed === undefined ? SEED : seed), L = JP.get(), out = [];
    function add(x, z, spot, tint) {
      if (out.length >= MAX || !usable(x, z)) return;
      // Clearings favour two or three hues each (a meadow patch), the rest of the colours still show up.
      var color = tint !== undefined && rand() < 0.6 ? (tint + Math.floor(rand() * 3)) % COLORS.length : Math.floor(rand() * COLORS.length);
      out.push({ x: x, z: z, y: M.groundHeight(x, z), color: color, h: 0.35 + rand() * 0.3, rot: rand() * Math.PI * 2, spot: spot });
    }
    L.clearings.forEach(function (c, ci) {
      var i, a, d, tint = (ci * 3 + 1) % COLORS.length;
      for (i = 0; i < PER_CLEARING; i++) { a = rand() * Math.PI * 2; d = c.r * 0.97 * Math.sqrt(rand()); add(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 'claro', tint); }
      for (i = 0; i < PER_RING; i++) { a = rand() * Math.PI * 2; d = c.r + 0.3 + rand() * 2.7; add(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 'borde', tint); }
    });
    var plants = JP.undergrowthGet ? JP.undergrowthGet().plants : [];
    for (var t = 0; t < EDGE_TRIES && plants.length; t++) {   // a flower peeking out beside a random plant
      var p = plants[Math.floor(rand() * plants.length)], b = rand() * Math.PI * 2, r = p.scale * (0.7 + rand() * 0.5);
      add(p.x + Math.cos(b) * r, p.z + Math.sin(b) * r, 'maleza');
    }
    return out;
  }

  function get() { return cached || (cached = flowers()); }

  JP.FLOWER_COLORS = COLORS;
  JP.FLOWER_MAX = MAX;
  JP.flowers = flowers;
  JP.flowersGet = get;
})(typeof window !== 'undefined' ? window : globalThis);
