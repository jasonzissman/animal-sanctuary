/* SA.climb.landAssist (AS-0166): the treetop-to-treetop "cheat" for the walking player (pure; no THREE, no DOM; node:vm tested).
 * Loaded right after game/climb.js, which calls it when the player leaves a flat top (walks off the edge, with or without a jump).
 *
 *   SA.climb.landAssist(state, targets, lift?) -> { target, to: { x, z, y }, dur } | null
 *     state    { x, z, heading, y, climb? }: where the player left the top (y = the standing height they left from)
 *     targets  climb targets (trees / peaks / buildings, same list as SA.climb.nearest); the top they stand on is ignored
 *     lift     the jump lift above y at that moment (a hop 1.2, a double jump 2.4); 0 / missing = just walked off
 *   A target qualifies when its top centre is within ASSIST_RANGE (horizontal), within AIM_ANGLE of the heading, and its top is
 *   not higher than the player's current height (y + lift) plus a little (HEIGHT_SLACK): it never lifts anyone up a taller tree.
 *   The best one (closest to the aim line, then nearest) wins; `to` is its top centre at topY and `dur` the flight time in seconds.
 *   null means "no tree there": SA.climb.step then does the normal safe fall to the ground.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var K = SA && SA.climb;
  if (!K) return;

  var ASSIST_RANGE = 7;                       // world units from the player to the top centre
  var AIM_ANGLE = 40 * Math.PI / 180;         // how far off the heading a tree may be
  var HEIGHT_SLACK = 0.6;                     // a top may be this much above the player's current height
  var MIN_FLIGHT = 0.5, MAX_FLIGHT = 0.9;     // seconds

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function angleBetween(a, b) {
    var d = Math.abs(a - b) % (Math.PI * 2);
    return d > Math.PI ? Math.PI * 2 - d : d;
  }

  function landAssist(state, targets, lift) {
    if (!state || !targets || !targets.length || !isFinite(state.x) || !isFinite(state.z)) return null;
    var cur = state.climb && state.climb.target, height = num(state.y, 0) + Math.max(0, num(lift, 0));
    var heading = num(state.heading, 0), best = null, bestScore = Infinity;
    targets.forEach(function (t) {
      if (!t || !isFinite(t.x) || !isFinite(t.z) || !(K.edgeRadius(t) > 0)) return;
      if (cur && cur.x === t.x && cur.z === t.z) return;                  // not the top you just left
      var top = K.topOf(t);
      if (top > height + HEIGHT_SLACK) return;                            // never pulled up much higher than the jump
      var dx = t.x - state.x, dz = t.z - state.z, d = Math.hypot(dx, dz);
      if (d > ASSIST_RANGE || d < 1e-6) return;
      var off = angleBetween(heading, Math.atan2(dx, dz));
      if (off > AIM_ANGLE) return;
      var score = off / AIM_ANGLE + d / ASSIST_RANGE;
      if (score < bestScore) { bestScore = score; best = { target: t, d: d, top: top }; }
    });
    if (!best) return null;
    return { target: best.target, to: { x: best.target.x, z: best.target.z, y: best.top },
      dur: Math.max(MIN_FLIGHT, Math.min(MAX_FLIGHT, 0.4 + best.d * 0.07)) };
  }

  K.landAssist = landAssist;
  K.ASSIST_RANGE = ASSIST_RANGE;
  K.ASSIST_ANGLE = AIM_ANGLE;
  K.ASSIST_HEIGHT_SLACK = HEIGHT_SLACK;
})(typeof window !== 'undefined' ? window : globalThis);
