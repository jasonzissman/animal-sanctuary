/* SA.map: pure world layout (no THREE, no DOM). Shared by rendering and tests.
 *
 * The map is a rectangle centred on the origin with four biome strips, west to east: montaña (snowy peaks),
 * bosque (with a river), selva (with a pond) and desierto (dunes). groundHeight(x, z) is the single source of
 * truth for terrain height so decorations, water and animals all agree on where the ground is.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var BOUNDS = { minX: -80, maxX: 80, minZ: -25, maxZ: 25 };
  // Biome strips by x, west to east; each is 40 wide (`lo`/`hi` = world x range).
  var STRIPS = [
    { id: 'montana', lo: -80, hi: -40 }, { id: 'bosque', lo: -40, hi: 0 },
    { id: 'selva', lo: 0, hi: 40 }, { id: 'desierto', lo: 40, hi: 80 },
  ];
  var WATER_LEVEL = -0.3;
  var RIVER = { centerX: -20, wiggle: 3, freq: 0.14, halfWidth: 2.6 };
  var POND = { x: 22, z: 10, radius: 5 };
  var FORD = { z: 19, halfLen: 2.5, level: 0.15 };   // river crossing (dry ground at this height across the river)

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  /** Which biome id owns this point (data id from SA.data 'biomes'). */
  function biomeAt(x) {
    for (var i = 0; i < STRIPS.length - 1; i++) if (x < STRIPS[i].hi) return STRIPS[i].id;
    return STRIPS[STRIPS.length - 1].id;
  }

  /** { id, lo, hi, centerX } of a biome strip, or null. */
  function biomeRange(id) {
    for (var i = 0; i < STRIPS.length; i++) {
      if (STRIPS[i].id === id) return { id: id, lo: STRIPS[i].lo, hi: STRIPS[i].hi, centerX: (STRIPS[i].lo + STRIPS[i].hi) / 2 };
    }
    return null;
  }

  /** Snowy peaks: rise from the montaña border (x = -38) to bumpy peaks up to ~5.5 high. */
  function mountainHeight(x, z) {
    var ramp = smooth((-38 - x) / 10);
    if (ramp <= 0) return 0;
    var bump = Math.max(0, Math.sin(x * 0.19) * Math.sin(z * 0.23 + 1.3));
    return ramp * (1 + 4.5 * bump * bump);
  }

  /** Sand dunes: soft ridges that fade in from the desierto border (x = 38). Lifts the ground 0.8 to 1.7 so it is dry. */
  function duneHeight(x, z) {
    var ramp = smooth((x - 38) / 6);
    return ramp <= 0 ? 0 : ramp * (0.8 + 0.9 * (0.5 + 0.5 * Math.sin(x * 0.23 + Math.sin(z * 0.11) * 2 + z * 0.08)));
  }

  function riverX(z) { return RIVER.centerX + RIVER.wiggle * Math.sin(z * RIVER.freq); }

  function groundHeight(x, z) {
    var h = 0.6 * Math.sin(x * 0.21) * Math.cos(z * 0.17) + 0.4 * Math.sin(x * 0.09 + z * 0.13);
    var dr = Math.abs(x - riverX(z));
    var span = RIVER.halfWidth + 2;
    h -= 2.2 * smooth((span - dr) / 2.5);
    var dp = Math.sqrt((x - POND.x) * (x - POND.x) + (z - POND.z) * (z - POND.z));
    h -= 2.2 * smooth((POND.radius + 2 - dp) / 2.5);
    // The ford: a shallow, dry stretch of the river so the walking player (who cannot enter water) can cross it.
    var wz = smooth((FORD.halfLen + 1.5 - Math.abs(z - FORD.z)) / 1.5) * smooth((span + 1.5 - dr) / 1.5);
    if (wz > 0) h += (FORD.level - h) * wz;
    return h + mountainHeight(x, z) + duneHeight(x, z);
  }

  function isWater(x, z) { return groundHeight(x, z) < WATER_LEVEL; }

  /** True within `margin` world units of the river centre line or pond centre (used for sandy shores). */
  function nearWater(x, z, margin) {
    var dp = Math.sqrt((x - POND.x) * (x - POND.x) + (z - POND.z) * (z - POND.z));
    return Math.abs(x - riverX(z)) < RIVER.halfWidth + margin || dp < POND.radius + margin;
  }

  /** Height-following: ease `prev` (current standing height) toward the ground `target`, frame-rate independent so slopes
   *  feel natural, never lagging more than MAX_LAG from the ground (steep faces cannot sink the feet). No prev = snap. */
  var FOLLOW_RATE = 14, MAX_LAG = 0.5;
  function followHeight(prev, target, dt) {
    if (typeof target !== 'number' || !isFinite(target)) return typeof prev === 'number' && isFinite(prev) ? prev : 0;
    if (typeof prev !== 'number' || !isFinite(prev)) return target;
    var k = 1 - Math.exp(-FOLLOW_RATE * Math.max(0, Math.min(0.1, typeof dt === 'number' && isFinite(dt) ? dt : 0)));
    return clamp(prev + (target - prev) * k, target - MAX_LAG, target + MAX_LAG);
  }

  /** Chase-camera height: the wanted y, but never lower than the terrain under the camera plus `clearance` (default 0.6). */
  function cameraHeight(wantY, x, z, clearance) {
    var floor = Math.max(groundHeight(x, z), WATER_LEVEL) + (typeof clearance === 'number' ? clearance : 0.6);
    return typeof wantY === 'number' && isFinite(wantY) && wantY > floor ? wantY : floor;
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
    BOUNDS: BOUNDS, STRIPS: STRIPS, biomeRange: biomeRange, WATER_LEVEL: WATER_LEVEL, RIVER: RIVER, POND: POND, FORD: FORD,
    clamp: clamp, biomeAt: biomeAt, riverX: riverX, groundHeight: groundHeight, followHeight: followHeight, cameraHeight: cameraHeight, isWater: isWater, nearWater: nearWater, rng: rng,
  };
})(typeof window !== 'undefined' ? window : globalThis);
