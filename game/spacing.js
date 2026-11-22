/* SA.spacing: pure rules for keeping wandering ground animals an arm's length apart (no THREE, no DOM; node:vm tested).
 *
 *   SA.spacing.GAP                     1.5 world units: the smallest allowed body gap between two animals, always
 *   SA.spacing.bodyRadius(animal)      -> body radius from the animal data's size trait (no animal-id special cases)
 *   SA.spacing.gap(a, b)               -> gap between two { x, z, r } bodies = centre distance - both radii
 *   SA.spacing.minGap(me, others)      -> the smallest gap from `me` to any of the [x, z, r] others (Infinity: none)
 *   SA.spacing.worst(bodies)           -> the smallest pairwise gap of a list of { x, z, r } (Infinity: fewer than 2)
 *
 * SA.wander enforces it on every step; SA.render.createAmbient passes each walker the others' live [x, z, r].
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var GAP = 1.5;
  // Body radius (world units) per size trait; an unknown/missing size counts as the biggest so the gap is never too small.
  var RADIUS = { 'pequeño': 0.3, 'mediano': 0.6, 'grande': 1.0 };

  function bodyRadius(animal) {
    var r = animal && animal.traits && RADIUS[animal.traits.size];
    return typeof r === 'number' ? r : RADIUS['grande'];
  }

  function gap(a, b) { return Math.hypot(a.x - b.x, a.z - b.z) - (a.r || 0) - (b.r || 0); }

  function minGap(me, others) {
    var m = Infinity;
    for (var i = 0; i < others.length; i++) m = Math.min(m, Math.hypot(others[i][0] - me.x, others[i][1] - me.z) - (others[i][2] || 0) - (me.r || 0));
    return m;
  }

  function worst(bodies) {
    var m = Infinity;
    for (var i = 0; i < bodies.length; i++) for (var j = i + 1; j < bodies.length; j++) m = Math.min(m, gap(bodies[i], bodies[j]));
    return m;
  }

  SA.spacing = { GAP: GAP, RADIUS: RADIUS, bodyRadius: bodyRadius, gap: gap, minGap: minGap, worst: worst };
})(typeof window !== 'undefined' ? window : globalThis);
