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

  SA.levelCue = { cueFor: cueFor, sfxFor: sfxFor };
})(typeof window !== 'undefined' ? window : globalThis);
