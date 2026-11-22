/* SA.treeCue: pure rules for the subtle sparkle on a tapped tree (no THREE, no DOM; unit-tested in node:vm).
 * After AFTER_TAPS taps on the same tree a few tiny sparkles drift up from it. There is never any text.
 *
 *   SA.treeCue.AFTER_TAPS            3
 *   SA.treeCue.shouldSparkle(taps)   -> boolean (taps = how many times this tree has been tapped, including this one)
 *   SA.treeCue.pose(i, t)            -> { dx, dy, scale, opacity } of sparkle i (0..COUNT-1) t seconds in, or null when over
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var AFTER_TAPS = 3, COUNT = 4, DURATION = 1.2;

  function shouldSparkle(taps) { return typeof taps === 'number' && taps >= AFTER_TAPS; }

  function pose(i, t) {
    if (typeof t !== 'number' || !(t >= 0 && t < DURATION)) return null;
    var k = t / DURATION, a = (i / COUNT) * Math.PI * 2;
    var s = Math.sin(k * Math.PI);                       // grows then fades: gentle in and out
    return { dx: Math.cos(a) * 0.6, dy: 0.8 * k + (i % 2) * 0.2, scale: 0.15 + 0.15 * s, opacity: 0.9 * s };
  }

  SA.treeCue = { AFTER_TAPS: AFTER_TAPS, COUNT: COUNT, DURATION: DURATION, shouldSparkle: shouldSparkle, pose: pose };
})(typeof window !== 'undefined' ? window : globalThis);
