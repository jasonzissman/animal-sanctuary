/* SA.animalMarkings: pure placement of an animal's coat markings (AS-0407; no THREE, no DOM; unit-tested in node:vm).
 *
 * An animal may declare  markings: { type: 'spots' | 'bands', color: '#rrggbb', count: 1..MAX_COUNT }  (validated in
 * game/data/animals.js). plan(animal, specs) lays them out on the body (the animal's non-extra `cuerpo` spec of
 * SA.animalPlan.plan) and returns null when there is nothing to draw, else
 *   { type, color, shape: 'disc' | 'ring' | 'slab', items: [ { position: [x,y,z], rotation: [rx,ry,rz], size: [x,y,z] } ] }
 * with exactly `count` items, in animal space, for ONE instanced mesh over a shared unit geometry per shape:
 *   - spots on a round body: thin flat 'disc's (a unit cylinder) lying on the back and flanks, never the belly, head or tail end
 *   - spots on a box body: the same discs on the box's top and side faces
 *   - bands on a round body: thin 'ring's (a unit cylinder turned along z, a hair wider than the body there) across the body
 *   - bands on a box body: thin 'slab's (a unit box) wrapping the box
 * Markings are decor: the renderer never gives them a pick volume, so they cannot be tapped or change pickVolumes.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var MAX_COUNT = 24;
  var GOLDEN = 2.399963229728653;   // golden angle: spreads spots evenly without a visible pattern
  var BACK_TOP = 0.92, BACK_LOW = -0.1;   // spots run from near the top of the back down the flanks (sin of the elevation)
  var SQUEEZE_Z = 0.8;     // keeps spots off the very front and rear of the body
  var BAND_SPAN = 0.55;    // bands sit within +-55% of the body's half length
  var GROW = 1.03;         // a band is this much wider than the body so its rim shows
  var LIFT = 0.02;         // how far a spot's top face stands proud of the surface, in body-size units

  function half(v) { return [v[0] / 2, v[1] / 2, v[2] / 2]; }

  /** Euler [rx, 0, rz] (order XYZ) that turns +y onto the unit vector n. */
  function tiltTo(n) { return [Math.atan2(n[2], n[1]), 0, -Math.asin(Math.max(-1, Math.min(1, n[0])))]; }

  function unit(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

  /** Point and outward normal on the body surface in direction d (unit), for a round (ellipsoid) or box body of half extents a. */
  function surface(a, d, boxy) {
    if (!boxy) return { p: [a[0] * d[0], a[1] * d[1], a[2] * d[2]], n: unit([d[0] / a[0], d[1] / a[1], d[2] / a[2]]) };
    var m = Math.max(Math.abs(d[0]) / a[0], Math.abs(d[1]) / a[1], Math.abs(d[2]) / a[2]) || 1, k = [0, 0, 0].map(function (_, i) { return Math.abs(d[i]) / a[i] === m; });
    return { p: [d[0] / m, d[1] / m, d[2] / m], n: [k[0] ? Math.sign(d[0]) : 0, k[1] ? Math.sign(d[1]) : 0, k[2] ? Math.sign(d[2]) : 0] };
  }

  function spots(a, c, count, boxy) {
    var mean = (a[0] + a[1] + a[2]) / 3, r = mean * Math.max(0.08, Math.min(0.3, 0.5 / Math.sqrt(count))), items = [];
    var sag = boxy ? 0 : r * r / (2 * mean), th = sag + LIFT * mean * 2;
    for (var i = 0; i < count; i++) {
      var y = BACK_TOP + (BACK_LOW - BACK_TOP) * ((i + 0.5) / count), ring = Math.sqrt(1 - y * y), phi = i * GOLDEN;
      var s = surface(a, unit([ring * Math.sin(phi), y, ring * Math.cos(phi) * SQUEEZE_Z]), boxy);
      var off = LIFT * mean - th / 2;   // centre of the disc relative to the surface point, along the normal
      items.push({ position: [c[0] + s.p[0] + s.n[0] * off, c[1] + s.p[1] + s.n[1] * off, c[2] + s.p[2] + s.n[2] * off],
        rotation: tiltTo(s.n), size: [2 * r, th, 2 * r] });
    }
    return { shape: 'disc', items: items };
  }

  function bands(a, c, count, boxy) {
    var items = [], th = Math.min(0.5 * a[2] * 2 * BAND_SPAN / count, 0.25 * a[2]);
    for (var i = 0; i < count; i++) {
      var t = count === 1 ? 0 : -BAND_SPAN + 2 * BAND_SPAN * (i / (count - 1)), w = boxy ? 1 : Math.sqrt(1 - t * t);
      items.push({ position: [c[0], c[1], c[2] + t * a[2]], rotation: boxy ? [0, 0, 0] : [Math.PI / 2, 0, 0],
        size: boxy ? [2 * a[0] * GROW, 2 * a[1] * GROW, th] : [2 * a[0] * w * GROW, th, 2 * a[1] * w * GROW] });
    }
    return { shape: boxy ? 'slab' : 'ring', items: items };
  }

  /** The body spec the markings sit on: the first non-extra `cuerpo` piece, or null. */
  function bodyOf(specs) {
    return (specs || []).filter(function (s) { return s.part === 'cuerpo' && !s.extra; })[0] || null;
  }

  function plan(animal, specs) {
    var m = animal && animal.markings, body = bodyOf(specs);
    if (!m || !body) return null;
    var boxy = body.builder === 'box', a = half(body.size), laid = m.type === 'spots' ? spots(a, body.position, m.count, boxy) : bands(a, body.position, m.count, boxy);
    return { type: m.type, color: m.color, shape: laid.shape, items: laid.items };
  }

  SA.animalMarkings = { MAX_COUNT: MAX_COUNT, plan: plan, bodyOf: bodyOf };
})(typeof window !== 'undefined' ? window : globalThis);
