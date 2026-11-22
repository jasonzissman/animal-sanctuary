/* SA.clickOutcome: pure decision for what a click or tap on the scene should do (no THREE, no DOM; node:vm tested).
 *
 *   SA.clickOutcome.decide({ hit, inReach, paused, farVisible }) -> { kind, ripple, cue }
 *       hit        a picked animal part (or any truthy value) or null/undefined when the click landed on nothing
 *                  (empty ground, sky, the player's own avatar: the avatar is never a pick volume, so it never blocks)
 *       inReach    the hit part is within the player's reach (only read when there is a hit)
 *       paused     the sandbox/album owns clicks: nothing to do unless a part was hit
 *       farVisible an animal is on screen but out of the player's reach (see farVisible below)
 *     kind 'pick'   in-reach part: the normal pick path (no ripple, the part's own reaction is the feedback)
 *          'far'    part of an out-of-reach animal: friendly ¡Acércate! (the pick path shows the cue itself) + ripple
 *          'ripple' nothing picked: a small ripple at the click, plus ¡Acércate! when an animal is visible but far
 *          'none'   ignored (paused with nothing hit)
 *     Never a wrong answer: no kind ever counts as a miss.
 *   SA.clickOutcome.farVisible(player, animals) -> boolean: any animal { x, y?, z, onScreen, ignoreHeight? } that is on
 *       screen and not reachable by SA.reach.canReach.
 *   SA.clickOutcome.ripplePose(t) -> { scale, opacity }|null: the ripple ring over RIPPLE_SECONDS (null when finished).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var RIPPLE_SECONDS = 0.55;

  function decide(c) {
    c = c || {};
    if (c.hit) {
      if (c.inReach) return { kind: 'pick', ripple: false, cue: false };
      return { kind: 'far', ripple: true, cue: true };
    }
    if (c.paused) return { kind: 'none', ripple: false, cue: false };
    return { kind: 'ripple', ripple: true, cue: !!c.farVisible };
  }

  function farVisible(player, animals) {
    if (!player || !animals || !SA.reach) return false;
    var p = { x: player.x, y: player.y || 0, z: player.z };
    return animals.some(function (a) {
      if (!a || !a.onScreen) return false;
      return !SA.reach.canReach(p, { x: a.x, y: a.y || 0, z: a.z }, null, { ignoreHeight: !!a.ignoreHeight });
    });
  }

  function ripplePose(t) {
    if (!(t >= 0) || t >= RIPPLE_SECONDS) return null;
    var k = t / RIPPLE_SECONDS;
    return { scale: 0.4 + 1.1 * k, opacity: 0.7 * (1 - k) };
  }

  SA.clickOutcome = { RIPPLE_SECONDS: RIPPLE_SECONDS, decide: decide, farVisible: farVisible, ripplePose: ripplePose };
})(typeof window !== 'undefined' ? window : globalThis);
