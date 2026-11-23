/* SA.peaks: the steep grey mountains as plain data (AS-0193; pure, no THREE or DOM; loads in node:vm after game/map.js).
 * Each peak is { x, z, height }: a cone-shaped mound rising `height` above the rolling terrain at its centre to a small FLAT summit
 * (SUMMIT_R = 1.4, about one to two player lengths across). SA.map.groundHeight calls SA.peaks.raise, so terrain, walking, animals
 * and the camera all agree on the mound; the summit is exactly topY everywhere inside SUMMIT_R.
 *   SA.peaks.LIST                  the data: [{ id, x, z, height }]
 *   SA.peaks.raise(x, z, base)     -> terrain height with the mounds applied on top of `base` (SA.map.baseHeight)
 *   SA.peaks.moundY(x, z)          -> the RENDERED grey cone's height there (its 8 flat faces, PAD included), or -Infinity off every peak
 *   SA.peaks.surfaceY(x, z)        -> the visible surface: max(SA.map.baseHeight, moundY). The terrain IS this (AS-0214), so walking, the
 *                                     climb animations and the camera floor agree with the rock the renderer draws: never inside a peak
 *   SA.peaks.targets()             -> SA.climb target data: [{ kind: 'peak', id, x, z, y (base), radius, topY, top: { shape: 'circle', size } }]
 *   SA.peaks.shape(peak)           -> { baseY, topY, baseR, topR, pad, segments } for the renderer (drawn SKIN wider than moundY)
 * Content is data: add a row to LIST (keep it off the station, the spawn and the water; test/peaks.test.js checks that).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SUMMIT_R = 1.4;     // flat top radius (the climb target's top.size)
  var BASE_R = 3.8;       // where the mound meets the terrain
  var SOLID_R = 2.5;      // the decor 'pico' obstacle (game/data/decor.js): the walking player stops here, so this is the climb footprint
  var PAD = 0.15;         // the cone is this much wider than the straight BASE_R..SUMMIT_R mound (the walkable surface is this cone)
  var SKIN = 0.02;        // the drawn rock is this much wider again than the walkable surface, so the terrain mesh never z-fights it
  var SEGMENTS = 8;       // radial sides of the drawn cone (CylinderGeometry): the surface follows its flat faces, not a smooth circle
  var HALF_SIDE = Math.PI / SEGMENTS;

  var LIST = [
    { id: 'pico-n1', x: -98, z: -26, height: 6.5 }, { id: 'pico-n2', x: -84, z: -22, height: 7.5 }, { id: 'pico-n3', x: -70, z: -28, height: 6 },
    { id: 'pico-s1', x: -100, z: 26, height: 7 }, { id: 'pico-s2', x: -86, z: 29, height: 6 }, { id: 'pico-s3', x: -72, z: 24, height: 7.5 },
  ];

  var bases = {};   // peak id -> ground height at its centre before any mound (computed once)
  function baseY(p) {
    if (bases[p.id] === undefined) bases[p.id] = SA.map.baseHeight(p.x, p.z);
    return bases[p.id];
  }
  function topY(p) { return baseY(p) + p.height; }

  /** Height above the peak's base of its rendered 8-sided cone at offset (dx, dz), or -1 outside it. */
  function coneRel(p, dx, dz) {
    var r = Math.sqrt(dx * dx + dz * dz);
    if (r >= BASE_R + PAD) return -1;
    // The drawn cone is a polygon: along a face its radius is cos(half side) / cos(angle off the face centre) of the corner radius.
    // CylinderGeometry corners sit at angle k * 2 * HALF_SIDE from +z (x = sin, z = cos), so the face centres are HALF_SIDE past them.
    var phi = Math.atan2(dx, dz) - HALF_SIDE, off = phi - Math.round(phi / (2 * HALF_SIDE)) * 2 * HALF_SIDE;
    var rho = r * Math.cos(off) / Math.cos(HALF_SIDE);   // the corner radius of the cone ring this point sits on
    if (rho >= BASE_R + PAD) return -1;
    return rho <= SUMMIT_R + PAD ? p.height : p.height * (BASE_R + PAD - rho) / (BASE_R - SUMMIT_R);
  }

  function moundY(x, z) {
    var h = -Infinity;
    for (var i = 0; i < LIST.length; i++) {
      var p = LIST[i], dx = x - p.x;
      if (dx > BASE_R + 1 || dx < -BASE_R - 1) continue;
      var rel = coneRel(p, dx, z - p.z);
      if (rel >= 0 && baseY(p) + rel > h) h = baseY(p) + rel;
    }
    return h;
  }

  function raise(x, z, base) {
    var m = moundY(x, z);
    return m > base ? m : base;
  }

  function surfaceY(x, z) { return raise(x, z, SA.map.baseHeight(x, z)); }

  /** Camera height (>= cy) so the sight line from the camera (cx, cy, cz) to the player's body (tx, ty, tz) stays `clearance` above the
   *  rock the whole way: the camera never ends up inside a peak or looks through one (AS-0214; the rig calls this every frame). */
  function cameraY(cx, cy, cz, tx, ty, tz, clearance) {
    var y = cy, c = typeof clearance === 'number' ? clearance : 0.4, N = 12;
    for (var i = 1; i <= N; i++) {
      var f = i / N, m = moundY(tx + (cx - tx) * f, tz + (cz - tz) * f);
      if (m === -Infinity) continue;
      var need = ty + (m + c - ty) / f;   // the line's height at fraction f is ty + (y - ty) * f
      if (need > y) y = need;
    }
    return y;
  }

  function targets() {
    return LIST.map(function (p) {
      return { kind: 'peak', id: p.id, x: p.x, z: p.z, y: baseY(p), radius: SOLID_R, topY: topY(p), top: { shape: 'circle', size: SUMMIT_R } };
    });
  }

  function shape(p) { return { baseY: baseY(p), topY: topY(p), baseR: BASE_R, topR: SUMMIT_R, pad: PAD + SKIN, segments: SEGMENTS }; }

  SA.peaks = { LIST: LIST, SUMMIT_R: SUMMIT_R, BASE_R: BASE_R, SOLID_R: SOLID_R, PAD: PAD, raise: raise, moundY: moundY, surfaceY: surfaceY, cameraY: cameraY, targets: targets, shape: shape };
})(typeof window !== 'undefined' ? window : globalThis);
