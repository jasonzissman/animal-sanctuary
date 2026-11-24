/* SA.waterBanks: pure, seeded layout of the water edges, pebbles and reeds (no THREE, no DOM; node:vm tested). AS-0298.
 * Load after game/map.js (and optionally game/peaks.js, game/station.js, game/player.js, which keep things off their footprints).
 *
 *   SA.waterBanks.WAVE                  { amp, ... } the gentle surface wave (metres); game/render/world.js runs it in the vertex shader
 *   SA.waterBanks.riverShore()          -> [{ z, wet, xl, xr }] where the river water meets the bank on each side, every STEP_Z metres
 *                                          (wet=false where the ground is dry across the river, e.g. the ford)
 *   SA.waterBanks.pondShore()           -> [{ angle, r }] radius of the pond's water edge round POND (r = 0 never happens: the middle is wet)
 *   SA.waterBanks.plan(opts?)           -> { pebbles: [...], reeds: [...] }  (opts.seed, default 11); each entry
 *                                          { x, z, y, scale, rot, tone } with tone 0..1 picking a colour; identical on every load.
 * Pebbles sit in a band across the water's edge; reeds stand just on the dry side. Both are soft (never an obstacle).
 * Nothing lands on the spawn clearing, the station footprint or a peak. game/render/water-banks.js draws it all.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var STEP_Z = 0.75;      // river sampling step along z
  var POND_STEPS = 40;    // pond edge samples round the circle
  var SCAN = 0.1;         // metres per step when searching outward for the shore
  var MESH_EXTRA = 0.8;   // the river water mesh is RIVER.halfWidth + this wide each side (game/render/world.js)
  var POND_EXTRA = 0.6;   // and the pond mesh is POND.radius + this
  var WAVE ={ amp: 0.045, speed: 1.3, freqX: 0.9, freqZ: 0.7 };

  function water(x, z) { return SA.map.groundHeight(x, z) < SA.map.WATER_LEVEL; }

  function riverShore() {
    var M = SA.map, B = M.BOUNDS, out = [], reach = MESH_EXTRA + M.RIVER.halfWidth;   // water only exists on the river mesh, not on every low spot
    for (var z = B.minZ + 1; z <= B.maxZ - 1 + 1e-9; z += STEP_Z) {
      var cx = M.riverX(z), row = { z: z, wet: water(cx, z), xl: cx, xr: cx };
      if (row.wet) {
        for (var d = 0; d < reach && water(cx - d, z); d += SCAN) row.xl = cx - d;
        for (d = 0; d < reach && water(cx + d, z); d += SCAN) row.xr = cx + d;
      }
      out.push(row);
    }
    return out;
  }

  function pondShore() {
    var P = SA.map.POND, out = [], reach = P.radius + POND_EXTRA;
    for (var i = 0; i < POND_STEPS; i++) {
      var a = i / POND_STEPS * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), r = 0;
      for (var d = 0; d < reach && water(P.x + c * d, P.z + s * d); d += SCAN) r = d;
      out.push({ angle: a, r: r });
    }
    return out;
  }

  function usable(x, z) {
    var M = SA.map, B = M.BOUNDS;
    if (x < B.minX + 1 || x > B.maxX - 1 || z < B.minZ + 1 || z > B.maxZ - 1) return false;
    if (SA.player && SA.player.inSpawnZone && SA.player.inSpawnZone(x, z)) return false;
    if (SA.station && SA.station.inFootprint && SA.station.inFootprint(x, z, 1)) return false;
    if (SA.peaks) {
      for (var i = 0; i < SA.peaks.LIST.length; i++) {
        var p = SA.peaks.LIST[i];
        if (Math.hypot(x - p.x, z - p.z) < SA.peaks.BASE_R + 0.5) return false;
      }
    }
    return true;
  }

  /** Candidate points along every shore line: (x, z) of the water edge plus the outward unit vector (ox, oz). */
  function edges() {
    var list = [];
    riverShore().forEach(function (r) {
      if (!r.wet) return;
      list.push({ x: r.xl, z: r.z, ox: -1, oz: 0 }, { x: r.xr, z: r.z, ox: 1, oz: 0 });
    });
    var P = SA.map.POND;
    pondShore().forEach(function (p) {
      var c = Math.cos(p.angle), s = Math.sin(p.angle);
      list.push({ x: P.x + c * p.r, z: P.z + s * p.r, ox: c, oz: s });
    });
    return list;
  }

  function plan(opts) {
    var M = SA.map, rand = M.rng(opts && opts.seed !== undefined ? opts.seed : 11), out = { pebbles: [], reeds: [] };
    function add(list, e, back, scaleLo, scaleHi, side) {
      var x = e.x + e.ox * back + e.oz * side, z = e.z + e.oz * back - e.ox * side, scale = scaleLo + rand() * (scaleHi - scaleLo), rot = rand() * Math.PI * 2, tone = rand();
      var y = M.groundHeight(x, z);
      if (!usable(x, z) || y < M.WATER_LEVEL - 0.25) return;
      list.push({ x: x, z: z, y: y, scale: scale, rot: rot, tone: tone });
    }
    edges().forEach(function (e) {
      // Always roll the same numbers per edge point, so a rejected one never shifts the rest.
      var n = 1 + Math.floor(rand() * 3), k, back, side;
      for (k = 0; k < n; k++) { back = -0.3 + rand() * 1.6; side = (rand() - 0.5) * 0.7; add(out.pebbles, e, back, 0.07, 0.2, side); }
      if (rand() < 0.45) { back = 0.25 + rand() * 0.9; side = (rand() - 0.5) * 0.7; add(out.reeds, e, back, 0.8, 1.35, side); }
    });
    return out;
  }

  SA.waterBanks = { STEP_Z: STEP_Z, POND_STEPS: POND_STEPS, WAVE: WAVE, riverShore: riverShore, pondShore: pondShore, plan: plan };
})(typeof window !== 'undefined' ? window : globalThis);
