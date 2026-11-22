/* SA.map: pure world layout (no THREE, no DOM). Shared by rendering and tests.
 *
 * The map is a rectangle centred on the origin. The west half is the bosque (with a river), the east half
 * is the selva (with a pond). groundHeight(x, z) is the single source of truth for terrain height so
 * decorations, water and (later) animals all agree on where the ground is.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var BOUNDS = { minX: -40, maxX: 40, minZ: -25, maxZ: 25 };
  var WATER_LEVEL = -0.3;
  var RIVER = { centerX: -20, wiggle: 3, freq: 0.14, halfWidth: 2.6 };
  var POND = { x: 22, z: 10, radius: 5 };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  /** Which biome id owns this point (data id from SA.data 'biomes'). */
  function biomeAt(x) { return x < 0 ? 'bosque' : 'selva'; }

  function riverX(z) { return RIVER.centerX + RIVER.wiggle * Math.sin(z * RIVER.freq); }

  function groundHeight(x, z) {
    var h = 0.6 * Math.sin(x * 0.21) * Math.cos(z * 0.17) + 0.4 * Math.sin(x * 0.09 + z * 0.13);
    var dr = Math.abs(x - riverX(z));
    var span = RIVER.halfWidth + 2;
    h -= 2.2 * smooth((span - dr) / 2.5);
    var dp = Math.sqrt((x - POND.x) * (x - POND.x) + (z - POND.z) * (z - POND.z));
    h -= 2.2 * smooth((POND.radius + 2 - dp) / 2.5);
    return h;
  }

  function isWater(x, z) { return groundHeight(x, z) < WATER_LEVEL; }

  /** True within `margin` world units of the river centre line or pond centre (used for sandy shores). */
  function nearWater(x, z, margin) {
    var dp = Math.sqrt((x - POND.x) * (x - POND.x) + (z - POND.z) * (z - POND.z));
    return Math.abs(x - riverX(z)) < RIVER.halfWidth + margin || dp < POND.radius + margin;
  }

  /** Deterministic PRNG (mulberry32) so procedural decoration is identical on every load. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  SA.map = {
    BOUNDS: BOUNDS, WATER_LEVEL: WATER_LEVEL, RIVER: RIVER, POND: POND,
    clamp: clamp, biomeAt: biomeAt, riverX: riverX, groundHeight: groundHeight, isWater: isWater, nearWater: nearWater, rng: rng,
  };
})(typeof window !== 'undefined' ? window : globalThis);
