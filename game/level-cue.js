/* SA.levelCue: pure mapping from a round's `levelChange` ('up' | 'down' | null, see SA.round pick results) to a cue id.
 * No THREE, no DOM (unit-tested in node:vm). The prompt UI draws the cue; there is never any text and never a penalty.
 *
 *   SA.levelCue.cueFor(change) -> 'star-burst' | 'soft-sparkle' | null
 *       'up'   -> 'star-burst'   (a happy little burst of stars)
 *       'down' -> 'soft-sparkle' (a very subtle shimmer on the Replay icon: help is nearby, nothing went wrong)
 *       anything else -> null (no cue)
 *   SA.levelCue.sfxFor(cueId) -> audio sfx name or null   ('star-burst' plays a happy fanfare; the soft cue is silent)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var CUES = { up: 'star-burst', down: 'soft-sparkle' };
  var SFX = { 'star-burst': 'fanfare' };

  function cueFor(change) {
    return (change === 'up' || change === 'down') ? CUES[change] : null;
  }

  function sfxFor(cue) {
    return Object.prototype.hasOwnProperty.call(SFX, cue) ? SFX[cue] : null;
  }

  // Star-burst placement (CSS px). The star badge is fixed at left:12px;bottom:12px (about 110x50), so its centre is
  // roughly (67, 37) from the bottom-left corner. Each star (a 2.2rem emoji, ~36px box) starts centred on the badge
  // and fans out over the upper-right quarter only, so nothing ever leaves the left or bottom edge of the screen.
  var BURST = { centerX: 67, centerBottom: 37, size: 36, count: 6, distance: 110, fromDeg: 10, toDeg: 100 };

  // SA.levelCue.burstPlan() -> { left, bottom, size, stars: [{ dx, dy }] }
  //   left/bottom: CSS offset of each star's box (start position); dx/dy: translate in CSS px (dy < 0 is up).
  function burstPlan() {
    var b = BURST, stars = [];
    for (var i = 0; i < b.count; i++) {
      var deg = b.fromDeg + (b.toDeg - b.fromDeg) * i / (b.count - 1), a = deg * Math.PI / 180;
      stars.push({ dx: Math.round(Math.cos(a) * b.distance), dy: Math.round(-Math.sin(a) * b.distance) });
    }
    return { left: b.centerX - b.size / 2, bottom: b.centerBottom - b.size / 2, size: b.size, stars: stars };
  }

  SA.levelCue = { cueFor: cueFor, sfxFor: sfxFor, burstPlan: burstPlan };
})(typeof window !== 'undefined' ? window : globalThis);
