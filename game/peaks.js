/* SA.peaks: the steep grey mountains as plain data (AS-0193; pure, no THREE or DOM; loads in node:vm after game/map.js).
 * Each peak is { x, z, height }: a cone-shaped mound rising `height` above the rolling terrain at its centre to a small FLAT summit
 * (SUMMIT_R = 1.4, about one to two player lengths across). SA.map.groundHeight calls SA.peaks.raise, so terrain, walking, animals
 * and the camera all agree on the mound; the summit is exactly topY everywhere inside SUMMIT_R.
 *   SA.peaks.LIST                  the data: [{ id, x, z, height }]
 *   SA.peaks.raise(x, z, base)     -> terrain height with the mounds applied on top of `base` (SA.map.baseHeight)
 *   SA.peaks.targets()             -> SA.climb target data: [{ kind: 'peak', id, x, z, y (base), radius, topY, top: { shape: 'circle', size } }]
 *   SA.peaks.shape(peak)           -> { baseY, topY, baseR, topR, pad } for the renderer (the visible grey cone encloses the mound)
 * Content is data: add a row to LIST (keep it off the station, the spawn and the water; test/peaks.test.js checks that).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SUMMIT_R = 1.4;     // flat top radius (the climb target's top.size)
  var BASE_R = 3.8;       // where the mound meets the terrain
  var SOLID_R = 2.5;      // the decor 'pico' obstacle (game/data/decor.js): the walking player stops here, so this is the climb footprint
  var PAD = 0.15;         // the rendered cone is this much wider than the terrain mound, so it always hides it

  var LIST = [
    { id: 'pico-n1', x: -70, z: -18, height: 6.5 }, { id: 'pico-n2', x: -60, z: -15, height: 7.5 }, { id: 'pico-n3', x: -50, z: -20, height: 6 },
    { id: 'pico-s1', x: -72, z: 18, height: 7 }, { id: 'pico-s2', x: -62, z: 20, height: 6 }, { id: 'pico-s3', x: -52, z: 17, height: 7.5 },
  ];

  var bases = {};   // peak id -> ground height at its centre before any mound (computed once)
  function baseY(p) {
    if (bases[p.id] === undefined) bases[p.id] = SA.map.baseHeight(p.x, p.z);
    return bases[p.id];
  }
  function topY(p) { return baseY(p) + p.height; }

  function raise(x, z, base) {
    var h = base;
    for (var i = 0; i < LIST.length; i++) {
      var p = LIST[i], dx = x - p.x;
      if (dx > BASE_R || dx < -BASE_R) continue;
      var r = Math.sqrt(dx * dx + (z - p.z) * (z - p.z));
      if (r >= BASE_R) continue;
      var s = r <= SUMMIT_R ? 1 : (BASE_R - r) / (BASE_R - SUMMIT_R);   // 0 at the foot .. 1 on the summit, a straight cone side
      var m = baseY(p) + p.height * s;
      if (m > h) h = m;
    }
    return h;
  }

  function targets() {
    return LIST.map(function (p) {
      return { kind: 'peak', id: p.id, x: p.x, z: p.z, y: baseY(p), radius: SOLID_R, topY: topY(p), top: { shape: 'circle', size: SUMMIT_R } };
    });
  }

  function shape(p) { return { baseY: baseY(p), topY: topY(p), baseR: BASE_R, topR: SUMMIT_R, pad: PAD }; }

  SA.peaks = { LIST: LIST, SUMMIT_R: SUMMIT_R, BASE_R: BASE_R, SOLID_R: SOLID_R, raise: raise, targets: targets, shape: shape };
})(typeof window !== 'undefined' ? window : globalThis);
