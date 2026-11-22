/* SA.footsteps: pure footstep timing (AS-0118). No THREE, no DOM, no audio; unit-tested in node:vm. The camera rig feeds it the
 * avatar's state each frame and plays the returned sound through SA.audio.sfx (so muted / locked audio stays silent).
 *
 *   SA.footsteps.create()                                  -> state { t, n } (plain data, never mutated)
 *   SA.footsteps.step(state, input, dt)                    -> { state, event }
 *     input  { moving, running, air, climbing, surface }
 *       moving    the avatar moved this frame; running  Shift / stick at its edge (quicker steps)
 *       air       in the hop / double jump / a fall; climbing  the up/down tree animation (no steps in either)
 *       surface   'ground' (default) | 'water' | 'canopy': picks the recipe
 *     event  null, or { sfx: 'step' | 'stepWet' | 'stepLeaf', rate, volume }: play SA.audio.sfx(sfx, volume, rate).
 *            `rate` is a tiny pitch variation (a fixed cycle, so it is never robotic and never random).
 * A step lands about every WALK_GAP (0.45 s) walking and RUN_GAP (0.28 s) running; standing still, airborne or climbing resets
 * the timer so the next walk starts with a step after about half a gap.
 *   SA.footsteps.landSound(surface)                        -> { sfx: 'land' | 'splash' | 'stepLeaf', volume } (AS-0119): the sound for
 *            SA.jump event 'land': a soft thump on the ground, a quieter splash in water, a leafy brush in a canopy.
 * Constants: WALK_GAP, RUN_GAP, RECIPE (surface -> sfx name), RATES.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  var WALK_GAP = 0.45;
  var RUN_GAP = 0.28;
  var RECIPE = { ground: 'step', water: 'stepWet', canopy: 'stepLeaf' };
  var RATES = [1, 1.07, 0.94, 1.03, 0.97];   // a short repeating cycle of tiny pitch shifts
  var VOLUME = 1;

  function create() { return { t: 0, n: 0 }; }

  function step(state, input, dt) {
    var s = state || create(), i = input || {};
    if (!i.moving || i.air || i.climbing) return { state: { t: 0, n: s.n }, event: null };   // reset: next walk starts with a half-gap
    var gap = i.running ? RUN_GAP : WALK_GAP;
    var t = (s.t || gap * 0.5) + (dt > 0 ? Math.min(dt, 0.25) : 0);
    if (t < gap) return { state: { t: t, n: s.n }, event: null };
    var name = RECIPE[i.surface] || RECIPE.ground;
    return { state: { t: t - gap, n: s.n + 1 }, event: { sfx: name, rate: RATES[s.n % RATES.length], volume: VOLUME } };
  }

  // Landing (AS-0119): the one sound per hop when SA.jump reports event 'land'. Soft thump on the ground, a quieter splash in water,
  // a leafy brush in a canopy. Unknown surfaces count as ground.
  var LAND = { ground: { sfx: 'land', volume: 1 }, water: { sfx: 'splash', volume: 0.5 }, canopy: { sfx: 'stepLeaf', volume: 1 } };
  function landSound(surface) { var l = LAND[surface] || LAND.ground; return { sfx: l.sfx, volume: l.volume }; }

  SA.footsteps = { landSound: landSound, LAND: LAND, create: create, step: step, WALK_GAP: WALK_GAP, RUN_GAP: RUN_GAP, RECIPE: RECIPE, RATES: RATES };
})(typeof window !== 'undefined' ? window : globalThis);
