/* SA.reroll: offer a gentle new Scout & Spot round when the camera settles in a different biome (pure; no THREE/DOM).
 *
 *   SA.reroll.shouldReroll({ roundBiome, cameraBiome, dwellSeconds, picks }) -> boolean
 *       true when the round was rolled for a biome, the camera is now in a different one, it has stayed there for
 *       at least DWELL_SECONDS, and no pick has been made this round.
 *   SA.reroll.createWatcher({ game, biome, canReroll?, onReroll }) -> { update(dt) -> boolean }
 *       Call once per frame (seconds). Tracks how long the camera has stayed in one biome and calls onReroll() when
 *       the rule fires. `game` is an SA.round game; `biome()` returns the camera biome id (or null);
 *       `canReroll()` returns false while the care loop or the sandbox owns the screen.
 *       A re-roll is just a new round: it adds no miss and emits no round.complete for the abandoned one.
 *   SA.reroll.payload(from, to) -> { from, to }   pure builder for the round.reroll event fields (animal ids)
 *   SA.reroll.track(sat, from, to) -> boolean     SAT.track('round.reroll', payload); no-op without SAT
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var DWELL_SECONDS = 2;

  function shouldReroll(s) {
    if (!s || typeof s.roundBiome !== 'string' || !s.roundBiome) return false;
    if (typeof s.cameraBiome !== 'string' || !s.cameraBiome || s.cameraBiome === s.roundBiome) return false;
    if (typeof s.dwellSeconds !== 'number' || !(s.dwellSeconds >= DWELL_SECONDS)) return false;
    return !(s.picks > 0);
  }

  function createWatcher(o) {
    var seen = null, dwell = 0, lastRound = null;
    return {
      update: function (dt) {
        var r = o.game.current();
        if (r !== lastRound) { lastRound = r; dwell = 0; }       // a new round restarts the wait
        var cam = o.biome();
        if (cam !== seen) { seen = cam; dwell = 0; }              // the camera moved on: start counting again
        else dwell += dt > 0 ? dt : 0;
        if (!r || r.done || r.pointerUsed) return false;          // the arrow glide must not abandon the round
        if (o.canReroll && !o.canReroll()) { dwell = 0; return false; }
        if (o.game.hasBiomePool && !o.game.hasBiomePool(cam)) return false;
        if (!shouldReroll({ roundBiome: r.biome, cameraBiome: cam, dwellSeconds: dwell, picks: r.picks })) return false;
        dwell = 0;
        o.onReroll();
        return true;
      },
    };
  }

  /** Pure: the round.reroll event fields, the abandoned and the new target animal ids (null when unknown). */
  function payload(from, to) {
    return { from: typeof from === 'string' && from ? from : null, to: typeof to === 'string' && to ? to : null };
  }

  /** Emit round.reroll once through `sat` (window.SAT). Does nothing when SAT is missing; telemetry never breaks play. */
  function track(sat, from, to) {
    if (!sat || typeof sat.track !== 'function') return false;
    try { sat.track('round.reroll', payload(from, to)); } catch (e) { return false; }
    return true;
  }

  SA.reroll = { DWELL_SECONDS: DWELL_SECONDS, shouldReroll: shouldReroll, createWatcher: createWatcher,
    payload: payload, track: track };
})(typeof window !== 'undefined' ? window : globalThis);
