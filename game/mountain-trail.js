/* SA.mountainTrail: the montaña's switchback trail as a pure polyline (no THREE, no DOM, no dependencies; node:vm tested). AS-0309, slice 3/4 of AS-0136.
 * Load BEFORE game/map.js: SA.map.mountainHeight reads it to carve a smooth, gentle grade into the ground along the trail.
 *
 *   SA.mountainTrail.POINTS         [[x, z], ...] the centre line (~1 m apart), from the biome border (start) up to the summit (end)
 *   SA.mountainTrail.LENGTH         metres along the centre line;  SA.mountainTrail.START / END  the two end points [x, z]
 *   SA.mountainTrail.DOME           { x, half, h, zFlat, zFade }  the summit ridge the trail climbs (SA.map reads it)
 *   SA.mountainTrail.WIDTH / FADE  the flat walkable strip (2.6 m) and the soft shoulder beyond it (the fade never reaches the next leg)
 *   SA.mountainTrail.sample(x, z, out)  fills out.d (metres to the centre line, exact within 12 m of the line's bounding box, else Infinity) and out.s (metres along the line at the nearest
 *                                       point) and returns out; allocates nothing. `out` defaults to a shared scratch object.
 *   SA.mountainTrail.distance(x, z) / onTrail(x, z, pad?) / strength(x, z)   0..1 lighter-ground amount for the colour (1 on the strip, a short fade)
 *   SA.mountainTrail.pointAt(s, out)    -> out.x / out.z at arc length s (clamped); allocates nothing
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var WIDTH = 2.6, FADE = 2.2, COLOR_FADE = 0.7;
  // Waypoints: a walk in from the border, then three legs across the slope joined by hairpin turns 10 m apart (so a leg's shoulder, 3.5 m
  // from its centre line, never meets the next leg's, even inside the rounded hairpin), ending on the summit. Chaikin corner-cutting turns the corners into rounded bends.
  var WAYPOINTS = [[-54, 12], [-70, 12], [-70, -12], [-80, -12], [-80, 12], [-90, 12], [-90, -8], [-98, -1]];
  // The summit ridge the trail climbs (read by SA.map): a bell across x peaking on the crest line x = DOME.x, `h` metres high, flat for |z| <= zFlat
  // (so each straight leg runs along a contour) and rounded off over the next zFade metres.
  var DOME = { x: -100, half: 46, h: 7, zFlat: 17, zFade: 17 };
  var PASSES = 3;

  function chaikin(pts, passes) {
    for (var p = 0; p < passes; p++) {
      var out = [pts[0]];
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }

  /** Resample a polyline so the points are about `step` metres apart (keeps both ends). */
  function resample(pts, step) {
    var out = [pts[0]], carry = 0, i;
    for (i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), at = step - carry;
      while (at <= len) { out.push([a[0] + (b[0] - a[0]) * at / len, a[1] + (b[1] - a[1]) * at / len]); at += step; }
      carry = len - (at - step);
    }
    var last = pts[pts.length - 1], tail = out[out.length - 1];
    if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 0.05) out.push(last);
    return out;
  }

  var POINTS = resample(chaikin(WAYPOINTS, PASSES), 1);
  var N = POINTS.length, px = new Float64Array(N), pz = new Float64Array(N), cum = new Float64Array(N);
  var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  POINTS.forEach(function (q, i) {
    px[i] = q[0]; pz[i] = q[1];
    cum[i] = i ? cum[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]) : 0;
    if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0];
    if (q[1] < minZ) minZ = q[1]; if (q[1] > maxZ) maxZ = q[1];
  });
  var LENGTH = cum[N - 1];
  var REACH = 12.5;   // beyond this many metres from the bounding box of the line the distance is reported as Infinity (SA.map smooths the lumps within 12 m)
  var scratch = { d: Infinity, s: 0 };

  function sample(x, z, out) {
    out = out || scratch;
    out.d = Infinity; out.s = 0;
    if (x < minX - REACH || x > maxX + REACH || z < minZ - REACH || z > maxZ + REACH) return out;
    var best = Infinity, bs = 0;
    for (var k = 0; k < N - 1; k++) {
      var ax = px[k], az = pz[k], dx = px[k + 1] - ax, dz = pz[k + 1] - az, len2 = dx * dx + dz * dz;
      var t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var ex = ax + dx * t - x, ez = az + dz * t - z, d2 = ex * ex + ez * ez;
      if (d2 < best) { best = d2; bs = cum[k] + t * Math.sqrt(len2); }
    }
    out.d = Math.sqrt(best); out.s = bs;
    return out;
  }

  function distance(x, z) { return sample(x, z, scratch).d; }
  function onTrail(x, z, pad) { return distance(x, z) < WIDTH / 2 + (pad || 0); }

  function strength(x, z) {
    var over = distance(x, z) - WIDTH / 2;
    if (over <= 0) return 1;
    if (over >= COLOR_FADE) return 0;
    var t = 1 - over / COLOR_FADE;
    return t * t * (3 - 2 * t);
  }

  function pointAt(s, out) {
    s = s < 0 ? 0 : s > LENGTH ? LENGTH : s;
    var k = 0;
    while (k < N - 2 && cum[k + 1] < s) k++;
    var seg = cum[k + 1] - cum[k], t = seg > 0 ? (s - cum[k]) / seg : 0;
    out.x = px[k] + (px[k + 1] - px[k]) * t; out.z = pz[k] + (pz[k + 1] - pz[k]) * t;
    return out;
  }

  SA.mountainTrail = {
    DOME: DOME, WIDTH: WIDTH, FADE: FADE, POINTS: POINTS, LENGTH: LENGTH, START: POINTS[0], END: POINTS[N - 1],
    sample: sample, distance: distance, onTrail: onTrail, strength: strength, pointAt: pointAt,
  };
})(typeof window !== 'undefined' ? window : globalThis);
