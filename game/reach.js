/* SA.reach: pure "are you close enough?" rule for inspecting, cleaning, feeding and healing (no THREE, no DOM; node:vm tested).
 *
 *   SA.reach.canReach(player, animal, part?, opts?) -> boolean
 *       player  { x, z, y? }   y = height the player stands at (0 on the ground; raised when up a tree)
 *       animal  { x, z, y? }   y = height of the animal's feet (raised for birds/monkeys in a canopy)
 *       part    { y? }|null    optional world height of the tapped part; defaults to the animal's own height + MID_HEIGHT
 *       opts    { horizontal?, vertical?, ignoreHeight? } override the generous defaults; ignoreHeight skips the height
 *               check (canopy perchers until the player can climb: standing under the tree is enough)
 *   SA.reach.check(...) -> { ok, dist, dy }   the numbers behind canReach
 *   SA.reach.cue() -> { es: '¡Acércate!', icon: '🚶' }   the friendly get-closer cue (never a wrong pick)
 *   SA.reach.speakCue(nowMs?) -> true when it spoke 'phrase:acercate' via SA.audio.say (false while throttled: once per cue)
 *   SA.reach.onFar(cb) -> unsubscribe;  SA.reach.notifyFar(info) tells listeners (cue UI, hint arrow) a tap was too far.
 * Generous on purpose: a 7-year-old should not have to fight to stand in exactly the right spot.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var HORIZONTAL = 5;    // world units on the ground plane (animals are ~1.3 radius, the avatar ~0.6)
  var VERTICAL = 2.5;    // height difference between the player's hands and the part
  var MID_HEIGHT = 0.6;  // default part height above the animal's feet
  var REACH_UP = 1;      // how high the player's hands reach above where they stand

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  function check(player, animal, part, opts) {
    if (!player || !animal) return { ok: false, dist: Infinity, dy: Infinity };
    var H = num(opts && opts.horizontal, HORIZONTAL), V = num(opts && opts.vertical, VERTICAL);
    var dx = num(animal.x, 0) - num(player.x, 0), dz = num(animal.z, 0) - num(player.z, 0);
    var dist = Math.sqrt(dx * dx + dz * dz);
    var partY = part && typeof part.y === 'number' && isFinite(part.y) ? part.y : num(animal.y, 0) + MID_HEIGHT;
    var dy = Math.abs(partY - (num(player.y, 0) + REACH_UP));
    return { ok: dist <= H && (dy <= V || !!(opts && opts.ignoreHeight)), dist: dist, dy: dy };
  }

  function canReach(player, animal, part, opts) { return check(player, animal, part, opts).ok; }

  var listeners = [];
  function onFar(cb) {
    if (typeof cb !== 'function') throw new Error('SA.reach.onFar: callback must be a function');
    listeners.push(cb);
    return function () { var i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
  }
  function notifyFar(info) {
    listeners.slice().forEach(function (cb) {
      try { cb(info); } catch (e) { if (root.SAT && root.SAT.error) root.SAT.error(e); }
    });
  }

  // Speak the cue once per appearance: calls inside CUE_MS of the last spoken one (the bubble is still up) are ignored.
  var CUE_KEY = 'phrase:acercate', CUE_MS = 1800, lastSpoken = -Infinity;
  function speakCue(now) {
    var t = num(now, Date.now());
    if (t - lastSpoken < CUE_MS) return false;
    lastSpoken = t;
    if (SA.audio && typeof SA.audio.say === 'function') {
      try { SA.audio.say(CUE_KEY); } catch (e) { /* speech is best effort */ }
    }
    return true;
  }

  SA.reach = { HORIZONTAL: HORIZONTAL, VERTICAL: VERTICAL, CUE_KEY: CUE_KEY, CUE_MS: CUE_MS, check: check, canReach: canReach,
    onFar: onFar, notifyFar: notifyFar, speakCue: speakCue,
    cue: function () { return { es: '¡Acércate!', icon: '🚶' }; } };
})(typeof window !== 'undefined' ? window : globalThis);
