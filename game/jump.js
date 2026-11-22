/* SA.jump: pure hop physics for the kid avatar (no THREE, no DOM; node:vm tested). Space jumps (AS-0112/0113).
 *
 * A jump is only a vertical offset on top of walking: it never changes x/z, so walking or running keeps its forward
 * momentum and SA.player.step still blocks on trees and rocks in the air. It is NOT a climb: the offset is `lift`, kept
 * apart from the player's standing height `y` (which SA.reach compares), so a hop never reaches canopy animals.
 * The avatar is drawn at y + lift; it lands exactly back on y (the terrain under the new spot).
 *
 *   SA.jump.create()                          -> { lift, vy, air, armed, event }  (on the ground, armed)
 *   SA.jump.step(state, input, dt, allowed?, floor?)  -> new state (the input state is never mutated)
 *     input    { jump }  truthy while Space is held. A takeoff needs the key to have been released since the last one,
 *              so holding Space never chains hops; it must be pressed again. A fresh press in the air (AS-0126) gives ONE more
 *              full hop (a double jump: vy = TAKEOFF_SPEED again from the current height); a third does nothing until landing.
 *     allowed  false blocks a takeoff and the double jump (e.g. up a tree); an airborne hop just continues.
 *     floor    optional lift of the surface under the avatar (a low rock's top, AS-0176; SA.player.floorAt): it lands on it
 *              (and stands there), steps up onto it, and walking off its edge makes it fall back down. 0 = the ground.
 *     event    'takeoff' | 'double' | 'land' | null: what happened this step (for the boing SFX and the squash-and-stretch)
 *     jumps    state field 0..MAX_JUMPS: hops used since the last landing (reset by landing and cancel)
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
  var MAX_JUMPS = 2;                                  // takeoff + one double jump per landing
  var STEP = 1 / 120;                                // integration step: the arc is the same at any frame rate

  function create() { return { lift: 0, vy: 0, air: false, armed: true, jumps: 0, event: null }; }

  function step(state, input, dt, allowed, floor) {
    var s = state || create();
    var want = !!(input && input.jump);
    dt = typeof dt === 'number' && isFinite(dt) ? Math.max(0, Math.min(MAX_DT, dt)) : 0;
    var lift = s.lift || 0, vy = s.vy || 0, air = !!s.air, armed = s.armed !== false, jumps = s.jumps || 0, event = null;
    floor = typeof floor === 'number' && isFinite(floor) && floor > 0 ? floor : 0;
    if (!want) armed = true;
    if (!air && lift < floor) lift = floor;                      // stepped up onto a low solid
    if (!air && lift > floor + 1e-6) { air = true; vy = 0; jumps = Math.max(jumps, 1); }    // walked off its edge: fall (one air hop left)
    if (!air && want && armed && allowed !== false) {
      air = true; vy = TAKEOFF_SPEED; armed = false; jumps = 1; event = 'takeoff';
    } else if (air && want && armed && jumps < MAX_JUMPS && allowed !== false) {   // fresh press in mid-air: one more hop
      vy = TAKEOFF_SPEED; armed = false; jumps += 1; event = 'double';
    }
    while (air && dt > 0) {
      var h = Math.min(STEP, dt);
      lift += vy * h - 0.5 * GRAVITY * h * h;
      vy -= GRAVITY * h;
      dt -= h;
      if (lift <= floor && vy < 0) { lift = floor; vy = 0; air = false; jumps = 0; event = event === 'takeoff' ? 'takeoff' : 'land'; break; }
    }
    return { lift: lift, vy: vy, air: air, armed: armed, jumps: jumps, event: event };
  }

  function cancel(state) {
    var s = state || create();
    return { lift: 0, vy: 0, air: false, armed: s.armed !== false, jumps: 0, event: null };
  }

  SA.jump = { HEIGHT: HEIGHT, DURATION: DURATION, GRAVITY: GRAVITY, TAKEOFF_SPEED: TAKEOFF_SPEED, MAX_JUMPS: MAX_JUMPS, create: create, step: step, cancel: cancel };
})(typeof window !== 'undefined' ? window : globalThis);
