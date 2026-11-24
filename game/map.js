/* SA.map: pure world layout (no THREE, no DOM). Shared by rendering and tests.
 *
 * The map is a rectangle centred on the origin with four biome strips, west to east: montaña (snowy peaks),
 * bosque (with a river), selva (with a pond) and desierto (dunes). groundHeight(x, z) is the single source of
 * truth for terrain height so decorations, water and animals all agree on where the ground is.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var BOUNDS = { minX: -112, maxX: 112, minZ: -36, maxZ: 36 };   // 224 x 72, about 2x the area of the original 160 x 50 map (AS-0247)
  // Biome strips by x, west to east; each is 56 wide (`lo`/`hi` = world x range) and together they tile BOUNDS in x.
  var STRIPS = [
    { id: 'montana', lo: -112, hi: -56 }, { id: 'bosque', lo: -56, hi: 0 },
    { id: 'selva', lo: 0, hi: 56 }, { id: 'desierto', lo: 56, hi: 112 },
  ];
  // The mountain and dune ramps start just inside their strip's inner border, so they follow STRIPS and are never hardcoded.
  var MOUNTAIN_EDGE = STRIPS[0].hi + 2, DUNE_EDGE = STRIPS[3].lo - 2;
  var WATER_LEVEL = -0.3;
  var RIVER = { centerX: -28, wiggle: 3, freq: 0.14, halfWidth: 2.6 };   // middle of the bosque strip
  var POND = { x: 31, z: 14, radius: 5 };                                // inside the selva strip
  var FORD = { z: 27, halfLen: 2.5, level: 0.15 };   // river crossing (dry ground at this height across the river)

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

  function rolling(x, z) { return 0.6 * Math.sin(x * 0.21) * Math.cos(z * 0.17) + 0.4 * Math.sin(x * 0.09 + z * 0.13); }

  // The summit ridge (AS-0309): a broad bell across x (SA.mountainTrail.DOME), flat along z over the trail's legs so they run along contours.
  // Without the trail module there is no ridge (h = 0) and the mountain is just the lumpy slope.
  var DOME = SA.mountainTrail ? SA.mountainTrail.DOME : { x: -100, half: 46, h: 0, zFlat: 17, zFade: 17 };
  function domeWeight(x, z) { return smooth(1 - Math.abs(x - DOME.x) / DOME.half) * smooth((DOME.zFlat + DOME.zFade - Math.abs(z)) / DOME.zFade); }

  /** The mountain strip without the trail: it rises from just inside the montaña border (MOUNTAIN_EDGE) to bumpy peaks up to ~5.5 high,
   *  plus the summit ridge, where the lumps are mostly smoothed away, and entirely within 3 m of the trail (fading back in by 12 m, `d` = the
   *  distance to the trail centre line) so the climb is gentle and the trail's shoulders never meet a cliff. */
  function mountainBase(x, z, d) {
    var ramp = smooth((MOUNTAIN_EDGE - x) / 10);
    if (ramp <= 0) return 0;
    var bump = Math.max(0, Math.sin(x * 0.19) * Math.sin(z * 0.23 + 1.3)), dw = DOME.h > 0 ? domeWeight(x, z) : 0;
    return ramp * (1 + 4.5 * bump * bump * (1 - 0.85 * smooth(2 * dw)) * smooth((d - 3) / 9)) + DOME.h * dw;
  }

  var trailProfile = null, trailHit = { d: 0, s: 0 };
  function boxcar(a, half) {
    var out = [], n = a.length;
    for (var i = 0; i < n; i++) {
      var sum = 0, cnt = 0;
      for (var k = Math.max(0, i - half); k <= Math.min(n - 1, i + half); k++) { sum += a[k]; cnt++; }
      out.push(sum / cnt);
    }
    return out;
  }
  /** The trail's ground height at each centre-line point (computed once): the surrounding terrain smoothed over ~12 m (so the trail follows the
   *  lie of the land and never needs a deep cut), then forced never to go downhill, then smoothed again: a steady, gentle grade. */
  function profile() {
    if (trailProfile) return trailProfile;
    var P = SA.mountainTrail.POINTS, raw = [], i;
    for (i = 0; i < P.length; i++) raw.push(rolling(P[i][0], P[i][1]) + mountainBase(P[i][0], P[i][1], 0));
    var y = boxcar(boxcar(raw, 6), 6), hi = -Infinity;
    for (i = 0; i < y.length; i++) { hi = Math.max(hi, y[i]); y[i] = hi; }
    return (trailProfile = boxcar(y, 4));
  }
  function trailGround(s, length) {
    var p = profile(), u = s / length * (p.length - 1), i = Math.min(p.length - 2, Math.floor(u)), f = u - i;
    return p[i] + (p[i + 1] - p[i]) * f;
  }

  /** The mountain's height above the rolling ground: mountainBase with the switchback trail (SA.mountainTrail, AS-0309) carved in. Along the
   *  trail the ground follows profile(), a steady grade far below MAX_WALK_SLOPE; over the shoulder beyond the 2.6 m strip it blends smoothly
   *  back into the surrounding slope (the shoulder never reaches the next leg, so there is no seam). */
  function mountainHeight(x, z) {
    var T = SA.mountainTrail;
    if (!T || x > MOUNTAIN_EDGE) return mountainBase(x, z, Infinity);
    T.sample(x, z, trailHit);
    var m = mountainBase(x, z, trailHit.d), over = trailHit.d - T.WIDTH / 2;
    if (over >= T.FADE) return m;
    var w = smooth(1 - over / T.FADE) * smooth(trailHit.s / 8);   // eased in over the first 8 m so it leaves the border seamlessly
    return m + (trailGround(trailHit.s, T.LENGTH) - rolling(x, z) - m) * w;
  }

  // Seeded dune phases (AS-0307): fixed for every load, so the dunes are the same each time and tests can pin them.
  var DUNE_SEED = 307, DUNE_RAMP = 14;
  var DUNE_PHASE = (function () { var r = rng(DUNE_SEED), p = []; for (var i = 0; i < 6; i++) p.push(r() * 6.2832); return p; })();
  /** The steepest the ground may rise per metre run (rise/run) anywhere a player walks; the dunes are tuned (and tested) well below it. */
  var MAX_WALK_SLOPE = 0.7;

  /** Sand dunes (AS-0307): big rolling dunes of varied height with fine wind ripples on top. They fade in smoothly from just inside the
   *  desierto border (DUNE_EDGE) over DUNE_RAMP metres and always lift the ground at least 0.9 (dry). Crests reach about 4.4 where the
   *  height envelope is high and stay near 1.5 where it is low; slopes stay far below MAX_WALK_SLOPE so the player can always walk out. */
  function duneHeight(x, z) {
    var ramp = smooth((x - DUNE_EDGE) / DUNE_RAMP);
    if (ramp <= 0) return 0;
    var P = DUNE_PHASE;
    var big = 0.5 + 0.5 * Math.sin(x * 0.17 + Math.sin(z * 0.09 + P[0]) * 1.2 + z * 0.05 + P[1]);       // wavy crest lines
    var mid = 0.5 + 0.5 * Math.sin(x * 0.1 - z * 0.07 + P[2] + Math.sin(x * 0.05 + P[3]) * 1.5);        // a second, slower set
    var env = 0.55 + 0.45 * Math.sin(z * 0.07 + x * 0.03 + P[4]);                                          // some dunes tall, some low
    var ripple = 0.07 * Math.sin(x * 1.9 + Math.sin(z * 0.6 + P[5]) * 1.4 + z * 0.4);                      // wind ripples
    return ramp * (0.9 + env * 2.6 * big + 0.9 * mid + ripple);
  }

  function riverX(z) { return RIVER.centerX + RIVER.wiggle * Math.sin(z * RIVER.freq); }

  /** The rolling terrain without the climbable peaks (SA.peaks raises those on top of this). */
  function baseHeight(x, z) {
    var h = rolling(x, z);
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

  /** The single terrain height: baseHeight plus the climbable peaks' mounds and flat summits (SA.peaks, AS-0193). */
  function groundHeight(x, z) {
    var h = baseHeight(x, z);
    return SA.peaks ? SA.peaks.raise(x, z, h) : h;
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
    BOUNDS: BOUNDS, STRIPS: STRIPS, biomeRange: biomeRange, WATER_LEVEL: WATER_LEVEL, RIVER: RIVER, POND: POND, FORD: FORD, MOUNTAIN_EDGE: MOUNTAIN_EDGE, DUNE_EDGE: DUNE_EDGE, MAX_WALK_SLOPE: MAX_WALK_SLOPE, duneHeight: duneHeight, mountainHeight: mountainHeight, DOME: DOME,
    clamp: clamp, biomeAt: biomeAt, riverX: riverX, baseHeight: baseHeight, groundHeight: groundHeight, followHeight: followHeight, cameraHeight: cameraHeight, isWater: isWater, nearWater: nearWater, rng: rng,
  };
})(typeof window !== 'undefined' ? window : globalThis);
