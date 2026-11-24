/* SA.rocks: pure, seeded rock generator (no THREE, no DOM; node:vm tested). AS-0299.
 * Load after game/sa.js. game/render/rocks.js turns the specs into low-poly flat-shaded meshes.
 *
 *   SA.rocks.KINDS            ['boulder', 'flat', 'stack', 'jagged']   the shapes (faceted boulder, flat stone, stacked stones, tall spire)
 *   SA.rocks.VARIANTS         how many geometry variants each kind has (the render module builds kind x variant once and shares it)
 *   SA.rocks.PALETTES         { biomeId: ['#rrggbb', ...] }  red-orange desierto, grey montana, mossy green-grey bosque/selva
 *   SA.rocks.seedAt(x, z)     -> a stable integer seed from where a rock stands
 *   SA.rocks.spec(seed, biome) -> { kind, variant, scale: [sx, sy, sz], yaw, tilt: [tx, tz], color }
 *       Same seed + biome always gives the same spec. scale only trims the shape (0.85..1.15) so every rock stays about as tall as the
 *       collision data (game/data/decor.js `height`) says; the world size comes from the decor plan (the group scale).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var KINDS = ['boulder', 'flat', 'stack', 'jagged'];
  var VARIANTS = 3;

  var PALETTES = {
    desierto: ['#c4693a', '#b5532e', '#d2814c', '#a84a2a'],   // red-orange sandstone
    montana: ['#8b9097', '#757b83', '#9da2a8', '#676d75'],    // grey granite
    bosque: ['#7d8a6a', '#6c7d5e', '#8c9577', '#5f7358'],     // mossy green-grey
    selva: ['#6a8059', '#5a7350', '#78896a', '#4f6b4a'],      // darker, damper moss
  };
  var FALLBACK = ['#9a9a96', '#8a8a86', '#a8a8a2', '#7c7c78'];   // an unknown biome gets plain grey

  // Relative weights of the kinds per biome (same order as KINDS): the desert is flat mesas and spires, the mountain jagged.
  var WEIGHTS = {
    bosque: [4, 3, 2, 1], selva: [4, 2, 3, 1], desierto: [2, 4, 2, 3], montana: [2, 1, 2, 5],
  };
  var DEFAULT_WEIGHTS = [3, 2, 2, 2];

  function prng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedAt(x, z) {
    var h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return Math.floor((h - Math.floor(h)) * 4294967295) >>> 0;
  }

  function pickKind(rand, biome) {
    var w = WEIGHTS[biome] || DEFAULT_WEIGHTS, total = 0, i;
    for (i = 0; i < w.length; i++) total += w[i];
    var r = rand() * total;
    for (i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return KINDS[i]; }
    return KINDS[0];
  }

  function spec(seed, biome) {
    var rand = prng(typeof seed === 'number' && isFinite(seed) ? Math.floor(seed) : 1);
    var kind = pickKind(rand, biome);
    var pal = PALETTES[biome] || FALLBACK;
    var variant = Math.floor(rand() * VARIANTS);
    var trim = function () { return 0.85 + rand() * 0.3; };
    var tilt = kind === 'jagged' || kind === 'flat' ? 0.06 : 0.12;   // a boulder may sit a little crooked; a spire stays upright
    return {
      kind: kind,
      variant: variant,
      scale: [trim(), trim(), trim()],
      yaw: rand() * Math.PI * 2,
      tilt: [(rand() - 0.5) * tilt, (rand() - 0.5) * tilt],
      color: pal[Math.floor(rand() * pal.length)],
    };
  }

  SA.rocks = { KINDS: KINDS, VARIANTS: VARIANTS, PALETTES: PALETTES, spec: spec, seedAt: seedAt };
})(typeof window !== 'undefined' ? window : globalThis);
