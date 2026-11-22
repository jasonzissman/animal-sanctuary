/* SA.turn: pure eased turn of a heading (radians) toward a target, by the shortest way round (AS-0089).
 * No THREE, no DOM; node:vm tested. The camera rig uses it so the hint arrow / easter-egg reveal turns the avatar smoothly
 * instead of snapping it.
 *
 *   SA.turn.shortest(from, to)       -> signed delta in (-PI, PI] to add to `from` to face `to` (handles the ±PI wrap)
 *   SA.turn.ease(t)                  -> smoothstep of t clamped to 0..1
 *   SA.turn.start(from, to, dur?)    -> { from, delta, t, dur }  (dur defaults to DURATION seconds)
 *   SA.turn.step(turn, dt)           -> { turn, heading, done }  heading is in [0, 2PI); `turn` is the advanced state (the input is never mutated)
 *   SA.turn.heading(turn)            -> the heading at the turn's current time
 * Junk numbers are treated as 0 / the default duration, never NaN.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var TAU = Math.PI * 2;
  var DURATION = 0.3;   // seconds
  var MAX_DT = 0.1;     // a long frame never skips the whole turn in one go

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function norm(a) { return a - TAU * Math.floor(a / TAU); }

  function shortest(from, to) {
    var d = norm(num(to, 0) - num(from, 0));   // 0..2PI
    return d > Math.PI ? d - TAU : d;
  }
  function ease(t) {
    t = Math.max(0, Math.min(1, num(t, 0)));
    return t * t * (3 - 2 * t);
  }
  function start(from, to, dur) {
    dur = num(dur, DURATION);
    return { from: num(from, 0), delta: shortest(from, to), t: 0, dur: dur > 0 ? dur : DURATION };
  }
  function heading(turn) { return norm(turn.from + turn.delta * ease(turn.t / turn.dur)); }
  function step(turn, dt) {
    var t = Math.min(turn.dur, turn.t + Math.max(0, Math.min(MAX_DT, num(dt, 0))));
    var next = { from: turn.from, delta: turn.delta, t: t, dur: turn.dur };
    return { turn: next, heading: heading(next), done: t >= turn.dur };
  }

  SA.turn = { DURATION: DURATION, shortest: shortest, ease: ease, start: start, step: step, heading: heading };
})(typeof window !== 'undefined' ? window : globalThis);
