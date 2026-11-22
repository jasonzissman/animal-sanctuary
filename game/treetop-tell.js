/* SA.treetopTell: pure rules for the "look up!" tell of a tree with a perched animal (AS-0117). No THREE, no DOM; node:vm tested.
 * From the ground a child cannot see a bird in the canopy, so now and then, while the player is near, the tree rustles
 * (a small canopy shake), the animal gives a soft call that fades with distance, and a round shadow sits on the ground below it.
 * Never any text. Everything is plain numbers (one small reused result object per tell, no per-frame allocation).
 *
 *   SA.treetopTell.NEAR                 metres: the tell only plays when the player is this close (horizontally)
 *   SA.treetopTell.create({ seed, near?, gap? }) -> tell
 *       tell.update(dt, dist) -> { rustle, call }  rustle 0..1 = how strong the shake is now (0 = still);
 *           call = 0 or a volume 0..1 (>0 only on the frame a rustle starts); dist = player distance to the animal (null = far)
 *       gap = [min, max] seconds between tells (seeded, so every animal has its own rhythm)
 *   SA.treetopTell.shake(rustle, t)      -> radians of canopy lean at time t (wobble scaled by rustle)
 *   SA.treetopTell.volume(dist, near?)   -> 0..1 call loudness, 0 at/after `near`, soft (<= MAX_VOLUME) even right below
 *   SA.treetopTell.shadow(height)        -> { scale, opacity }  ground shadow for an animal `height` metres above the ground
 *   SA.treetopTell.treeIndex(trees, x, z, maxDist?) -> index of the nearest tree to (x, z) within maxDist (default 2.2), or -1
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  var NEAR = 16, GAP = [4, 9], DURATION = 1.1, MAX_VOLUME = 0.6, RATE = 22, SWAY = 0.045;

  function volume(dist, near) {
    near = near || NEAR;
    if (typeof dist !== 'number' || !(dist >= 0) || dist >= near) return 0;
    return MAX_VOLUME * (1 - dist / near);
  }

  // Seeded generator local to the tell (mulberry32), so two animals never share a rhythm and tests are repeatable.
  function rng(seed) {
    var a = (seed === undefined ? 1 : seed) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function create(opts) {
    opts = opts || {};
    var near = opts.near || NEAR, gap = opts.gap || GAP, rand = rng(opts.seed);
    var wait = gap[0] + rand() * (gap[1] - gap[0]) * 0.5;   // the first tell comes a bit sooner than the rest
    var age = -1;                                            // seconds into the current rustle; -1 = still
    var out = { rustle: 0, call: 0 };

    function update(dt, dist) {
      dt = Math.max(0, Math.min(dt || 0, 0.1));
      out.call = 0;
      var close = typeof dist === 'number' && dist >= 0 && dist < near;
      if (age >= 0) {                                        // a rustle in progress always finishes smoothly
        age += dt;
        if (age >= DURATION) { age = -1; wait = gap[0] + rand() * (gap[1] - gap[0]); }
      } else if (close) {                                    // the clock only runs while the player is near
        wait -= dt;
        if (wait <= 0) { age = 0; out.call = volume(dist, near); }
      }
      out.rustle = age < 0 ? 0 : Math.sin(Math.PI * (age / DURATION));   // swells then settles
      return out;
    }
    return { update: update };
  }

  function shake(rustle, t) {
    if (!(rustle > 0)) return 0;
    return SWAY * rustle * Math.sin(t * RATE);
  }

  function shadow(height) {
    var h = typeof height === 'number' && height > 0 ? height : 0;
    var k = Math.min(1, h / 6);                              // higher = smaller and fainter
    return { scale: 0.55 - 0.2 * k, opacity: 0.34 - 0.14 * k };
  }

  function treeIndex(trees, x, z, maxDist) {
    var m = maxDist || 2.2, best = -1, bd = m * m;
    for (var i = 0; trees && i < trees.length; i++) {
      var dx = trees[i].x - x, dz = trees[i].z - z, d = dx * dx + dz * dz;
      if (d <= bd) { bd = d; best = i; }
    }
    return best;
  }

  SA.treetopTell = { NEAR: NEAR, DURATION: DURATION, MAX_VOLUME: MAX_VOLUME, create: create, shake: shake, volume: volume, shadow: shadow, treeIndex: treeIndex };
})(typeof window !== 'undefined' ? window : globalThis);
