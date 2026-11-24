/* SA.terrain: seeded, per-vertex ground colours per biome (AS-0291). Pure logic: no THREE, no DOM, loadable in node:vm.
 *
 *   SA.terrain.groundColor(x, z, height, seed[, out]) -> { r, g, b }   channels 0..1, deterministic for the same inputs.
 *       Pass `out` (any { r, g, b }) to reuse it and allocate nothing. The biome comes from SA.map.STRIPS (data order, west to east).
 *   SA.terrain.BLEND_HALF   half the width (metres) of the soft blend across every biome border (the blend is 2 x this wide)
 *
 * Looks: bosque = grass in three greens with dry and flowery patches; selva = dark rich soil with moss; desierto = sand with
 * ripple stripes and lighter crests; montana = grey scree with snow patches that grow with height (solid white on the high peaks).
 * Value noise only (hashed lattice), so there are no texture files and no per-call allocation beyond the optional result.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var BLEND_HALF = 3;   // borders blend over 6 m ("a few metres")

  function hex(s) { var n = parseInt(s.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(t) { t = clamp01(t); return t * t * (3 - 2 * t); }

  function hash(ix, iz, seed) {
    var h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /** Smooth value noise in 0..1; one lattice cell per unit of (x, z). */
  function noise(x, z, seed) {
    var ix = Math.floor(x), iz = Math.floor(z);
    var fx = smooth(x - ix), fz = smooth(z - iz);
    var a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
  }

  function set(o, c) { o.r = c[0]; o.g = c[1]; o.b = c[2]; }
  function mix(o, c, t) { o.r += (c[0] - o.r) * t; o.g += (c[1] - o.g) * t; o.b += (c[2] - o.b) * t; }

  var GRASS = [hex('#6fae5e'), hex('#7cb86a'), hex('#8cc873')], DRY = hex('#c3b872');
  var FLOWERS = [hex('#f6f0d8'), hex('#f4c542'), hex('#f08fb0')];
  var SOIL = [hex('#4b3a2a'), hex('#3a2c20')], MOSS = hex('#2f5d36'), LITTER = hex('#6a4a2c');
  var SAND = hex('#e0c27a'), TROUGH = hex('#c9a85f'), CREST = hex('#f3e1ac');
  var SCREE = [hex('#8a9a8c'), hex('#767f78'), hex('#9aa398')], ROCK = hex('#5f6663'), SNOW = hex('#f4f8fb');

  // Each style paints (x, z, height, seed) into `o`.
  function forest(x, z, h, seed, o) {
    var n = noise(x * 0.15, z * 0.15, seed + 1);
    set(o, GRASS[1]);
    if (n < 0.5) mix(o, GRASS[0], 1 - n * 2); else mix(o, GRASS[2], (n - 0.5) * 2);
    mix(o, GRASS[0], (noise(x * 0.9, z * 0.9, seed + 5) - 0.5) * 0.35);   // fine tone speckle
    mix(o, DRY, smooth((noise(x * 0.07, z * 0.07, seed + 2) - 0.6) / 0.14) * 0.85);   // dry patches
    if (noise(x * 0.05, z * 0.05, seed + 3) > 0.58) {                                  // flower meadows: single-vertex blooms
      var f = hash(Math.round(x), Math.round(z), seed + 4);
      if (f > 0.78) mix(o, FLOWERS[Math.floor(f * 100) % 3], 0.85);
    }
  }

  function jungle(x, z, h, seed, o) {
    var n = noise(x * 0.18, z * 0.18, seed + 11);
    set(o, SOIL[0]);
    mix(o, SOIL[1], n);
    mix(o, MOSS, smooth((noise(x * 0.1, z * 0.1, seed + 12) - 0.5) / 0.2) * 0.8);
    if (hash(Math.round(x), Math.round(z), seed + 13) > 0.85) mix(o, LITTER, 0.6);   // leaf litter
  }

  function desert(x, z, h, seed, o) {
    var warp = noise(x * 0.08, z * 0.08, seed + 21);
    var r = 0.5 + 0.5 * Math.sin(x * 1.1 + z * 0.3 + warp * 5);   // ripple stripes ~5 m apart
    set(o, TROUGH);
    mix(o, SAND, smooth(r * 1.6));
    mix(o, CREST, r * r * r * r * 0.9);                            // light crests
    mix(o, SAND, (noise(x * 0.9, z * 0.9, seed + 22) - 0.5) * 0.25);
  }

  function mountain(x, z, h, seed, o) {
    var n = noise(x * 0.2, z * 0.2, seed + 31);
    set(o, SCREE[0]);
    if (n < 0.5) mix(o, SCREE[1], 1 - n * 2); else mix(o, SCREE[2], (n - 0.5) * 2);
    if (hash(Math.round(x), Math.round(z), seed + 32) > 0.82) mix(o, ROCK, 0.7);   // loose stones
    // Snow patches by height: ragged snow line near 1.6 m, solid white from ~3.8 m up.
    var snow = smooth((h - 1.6 + (noise(x * 0.25, z * 0.25, seed + 33) - 0.5) * 1.6) / 1.4);
    mix(o, SNOW, snow);
  }

  // Forest path dirt (AS-0300): light tan in two tones blended by noise, lighter than the grass around it.
  var FOREST_LO = -56, FOREST_HI = 0, DIRT_A = hex('#e2c797'), DIRT_B = hex('#d0b080');

  var STYLES = { bosque: forest, selva: jungle, desierto: desert, montana: mountain };
  var scratch = { r: 0, g: 0, b: 0 };

  function paint(id, x, z, h, seed, o) { (STYLES[id] || forest)(x, z, h, seed, o); }

  function groundColor(x, z, height, seed, out) {
    var o = out || { r: 0, g: 0, b: 0 };
    var strips = SA.map.STRIPS, n = strips.length, i, last = n - 1;
    var jitter = (noise(z * 0.2, 7.5, (seed | 0) + 9) - 0.5) * 2;   // the border wiggles +-1 m along z
    var done = false;
    for (i = 0; i < n - 1; i++) {
      var d = x - strips[i].hi + jitter;
      if (d > -BLEND_HALF && d < BLEND_HALF) {
        paint(strips[i].id, x, z, height, seed, o);
        paint(strips[i + 1].id, x, z, height, seed, scratch);
        var t = smooth((d + BLEND_HALF) / (2 * BLEND_HALF));
        o.r += (scratch.r - o.r) * t; o.g += (scratch.g - o.g) * t; o.b += (scratch.b - o.b) * t;
        done = true;
        break;
      }
    }
    if (!done) {
      for (i = 0; i < last; i++) if (x < strips[i].hi) break;
      paint(strips[i].id, x, z, height, seed, o);
    }
    if (SA.forestPaths && x < FOREST_HI + 3 && x > FOREST_LO - 3) {   // AS-0300: lighter dirt along the forest paths
      var dirt = SA.forestPaths.strength(x, z);
      if (dirt > 0) {
        var dn = noise(x * 0.8, z * 0.8, (seed | 0) + 41), k = dirt * 0.95;
        o.r += (DIRT_A[0] + (DIRT_B[0] - DIRT_A[0]) * dn - o.r) * k;
        o.g += (DIRT_A[1] + (DIRT_B[1] - DIRT_A[1]) * dn - o.g) * k;
        o.b += (DIRT_A[2] + (DIRT_B[2] - DIRT_A[2]) * dn - o.b) * k;
      }
    }
    var shade = 1 + Math.max(-0.08, Math.min(0.1, height * 0.05));   // a touch lighter uphill, darker in dips
    o.r = clamp01(o.r * shade); o.g = clamp01(o.g * shade); o.b = clamp01(o.b * shade);
    return o;
  }

  SA.terrain = { groundColor: groundColor, BLEND_HALF: BLEND_HALF, noise: noise };
})(typeof window !== 'undefined' ? window : globalThis);
