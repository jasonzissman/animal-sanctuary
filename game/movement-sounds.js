/* SA.movesound: pure edge detection + rate limiting for the movement sounds that are not footsteps (AS-0120). No THREE, no DOM,
 * no audio; unit-tested in node:vm. The camera rig feeds it the avatar's state each frame and plays every returned event through
 * SA.audio.sfx(sfx, volume, rate) (muted / locked audio stays silent).
 *
 *   SA.movesound.create()                      -> state (plain data, never mutated)
 *   SA.movesound.step(state, input, dt)        -> { state, events: [{ sfx, volume, rate }] }
 *     input  { water, air, climbing, canopy }
 *       water     the avatar stands in water (on the ground, not up a tree)
 *       air       in a hop / fall: a landing in water is SA.footsteps.landSound's job, so no walk-in splash is added on top
 *       climbing  the up/down tree animation (SA.climb mode 'up' | 'down'); canopy  standing in the canopy
 *   Splash: ONE 'splash' when the avatar goes from dry ground into water (edge, not every frame), at most once per SPLASH_GAP (1 s).
 *   Rustle: while climbing, a soft 'rustle' on its first frame and then every RUSTLE_GAP (0.35 s); it stops the frame the climb ends.
 *   Leaf pop: one 'leafPop' on the frame a climb up ends in the canopy (not after climbing down).
 * Constants: SPLASH_GAP, RUSTLE_GAP, SPLASH_VOLUME, RATES.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  var SPLASH_GAP = 1;
  var RUSTLE_GAP = 0.35;
  var SPLASH_VOLUME = 0.5;
  var RATES = [1, 1.08, 0.93, 1.04];   // tiny pitch shifts so repeated rustles are never robotic (a fixed cycle, never random)

  function create() { return { wasWater: false, sinceSplash: SPLASH_GAP, wasClimbing: false, rustleT: 0, n: 0 }; }

  function step(state, input, dt) {
    var s = state || create(), i = input || {};
    var d = dt > 0 ? Math.min(dt, 0.25) : 0;
    var events = [];
    var water = !!i.water && !i.climbing;
    var since = Math.min(SPLASH_GAP, (s.sinceSplash === undefined ? SPLASH_GAP : s.sinceSplash) + d);
    var n = s.n || 0;

    if (water && !s.wasWater && !i.air && since >= SPLASH_GAP) {
      events.push({ sfx: 'splash', volume: SPLASH_VOLUME, rate: 1 });
      since = 0;
    }

    var rustleT = 0;
    if (i.climbing) {
      rustleT = s.wasClimbing ? (s.rustleT || 0) + d : 0;
      if (!s.wasClimbing || rustleT >= RUSTLE_GAP) {
        events.push({ sfx: 'rustle', volume: 1, rate: RATES[n % RATES.length] });
        n += 1;
        rustleT = s.wasClimbing ? rustleT - RUSTLE_GAP : 0;
      }
    } else if (s.wasClimbing && i.canopy) {
      events.push({ sfx: 'leafPop', volume: 1, rate: 1 });
    }

    return { state: { wasWater: water, sinceSplash: since, wasClimbing: !!i.climbing, rustleT: rustleT, n: n }, events: events };
  }

  SA.movesound = { create: create, step: step, SPLASH_GAP: SPLASH_GAP, RUSTLE_GAP: RUSTLE_GAP, SPLASH_VOLUME: SPLASH_VOLUME, RATES: RATES };
})(typeof window !== 'undefined' ? window : globalThis);
