/* SA.jump: pure hop physics for the kid avatar (no THREE, no DOM; node:vm tested). Space jumps (AS-0112/0113).
 *
 * A jump is only a vertical offset on top of walking: it never changes x/z, so walking or running keeps its forward
 * momentum and SA.player.step still blocks on trees and rocks in the air. It is NOT a climb: the offset is `lift`, kept
 * apart from the player's standing height `y` (which SA.reach compares), so a hop never reaches canopy animals.
 * The avatar is drawn at y + lift; it lands exactly back on y (the terrain under the new spot).
 *
 *   SA.jump.create()                          -> { lift, vy, air, armed, event }  (on the ground, armed)
 *   SA.jump.step(state, input, dt, allowed?)  -> new state (the input state is never mutated)
 *     input    { jump }  truthy while Space is held. A takeoff needs the key to have been released since the last one,
 *              so holding Space never chains hops (and never re-jumps in the air); it must be pressed again.
 *     allowed  false blocks a takeoff (e.g. up a tree); an airborne hop just continues.
 *     event    'takeoff' | 'land' | null: what happened this step (for the boing SFX and the squash-and-stretch)
 *   SA.jump.cancel(state)                     -> a grounded state (keeps `armed` so a held key does not re-jump)
 * Constants: HEIGHT (peak, world units), DURATION (seconds in the air), GRAVITY, TAKEOFF_SPEED (derived: a symmetric arc).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var HEIGHT = 1.2;                                   // peak lift above the ground
  var DURATION = 0.6;                                 // seconds from takeoff to landing
  var GRAVITY = 8 * HEIGHT / (DURATION * DURATION);   // lift(t) = v t - g t^2 / 2 peaks at HEIGHT and returns to 0 at DURATION
  var TAKEOFF_SPEED = 4 * HEIGHT / DURATION;
  var MAX_DT = 0.1;
  var STEP = 1 / 120;                                 // integration step: the arc is the same at any frame rate

  function create() { return { lift: 0, vy: 0, air: false, armed: true, event: null }; }

  function step(state, input, dt, allowed) {
    var s = state || create();
    var want = !!(input && input.jump);
    dt = typeof dt === 'number' && isFinite(dt) ? Math.max(0, Math.min(MAX_DT, dt)) : 0;
    var lift = s.lift || 0, vy = s.vy || 0, air = !!s.air, armed = s.armed !== false, event = null;
    if (!want) armed = true;
    if (!air && want && armed && allowed !== false) {
      air = true; vy = TAKEOFF_SPEED; armed = false; event = 'takeoff';
    }
    while (air && dt > 0) {
      var h = Math.min(STEP, dt);
      lift += vy * h - 0.5 * GRAVITY * h * h;
      vy -= GRAVITY * h;
      dt -= h;
      if (lift <= 0 && vy < 0) { lift = 0; vy = 0; air = false; event = event === 'takeoff' ? 'takeoff' : 'land'; break; }
    }
    return { lift: lift, vy: vy, air: air, armed: armed, event: event };
  }

  function cancel(state) {
    var s = state || create();
    return { lift: 0, vy: 0, air: false, armed: s.armed !== false, event: null };
  }

  SA.jump = { HEIGHT: HEIGHT, DURATION: DURATION, GRAVITY: GRAVITY, TAKEOFF_SPEED: TAKEOFF_SPEED, create: create, step: step, cancel: cancel };
})(typeof window !== 'undefined' ? window : globalThis);
