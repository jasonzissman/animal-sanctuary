/* SA.flight: the eagle chick's first flight as pure path / timing math (AS-0337, slice 2 of AS-0185). No THREE, no DOM; unit-tested in node:vm.
 * The renderer (game/render/mission-nest.js) only asks "where is the chick at time t?" and places the model there.
 *
 * Timeline (seconds): 'flap' (on the spot, hovering up while the wings beat) -> 'fly' (one small loop round mamá, up and back down) ->
 * 'land' (settles into the nest, wings slowing) -> 'done'. The loop starts and ends exactly at the chick's home spot, so the chick never jumps.
 *
 *   SA.flight.PHASES                 { flap, fly, land } seconds; SA.flight.DURATION the total
 *   SA.flight.sample(spec, t)        spec { home: {x,y,z}, mama: {x,z}, radius?, height? } -> { phase, u, x, y, z, heading, flap }
 *                                    t seconds since the flight began (clamped to 0..DURATION). `flap` is the wing-beat strength 0..1,
 *                                    `heading` the way the chick faces (radians, 0 = +z), `u` 0..1 progress inside the phase.
 *   SA.flight.phaseAt(t)             'flap' | 'fly' | 'land' | 'done'
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var PHASES = { flap: 1.4, fly: 3.8, land: 0.9 };
  var DURATION = PHASES.flap + PHASES.fly + PHASES.land;
  var RADIUS = 1.7, HEIGHT = 1.1, HOVER = 0.35, FADE = 0.2;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function smooth(a, b, v) { var k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); }

  function phaseAt(t) {
    if (!(t >= 0)) return 'flap';
    if (t < PHASES.flap) return 'flap';
    if (t < PHASES.flap + PHASES.fly) return 'fly';
    if (t < DURATION) return 'land';
    return 'done';
  }

  // The loop: a circle round mamá that passes through the chick's home, blended in and out so the path starts and ends at home.
  function flyPoint(spec, u) {
    var h = spec.home, m = spec.mama, r = spec.radius || RADIUS, hh = spec.height || HEIGHT;
    var a0 = Math.atan2(h.z - m.z, h.x - m.x), a = a0 + u * Math.PI * 2;
    var w = smooth(0, FADE, u) * (1 - smooth(1 - FADE, 1, u));
    var cx = m.x + Math.cos(a) * r, cz = m.z + Math.sin(a) * r;
    return { x: h.x + (cx - h.x) * w, z: h.z + (cz - h.z) * w, y: h.y + HOVER + Math.sin(Math.PI * u) * hh * w };
  }

  function sample(spec, t) {
    t = clamp(typeof t === 'number' && isFinite(t) ? t : 0, 0, DURATION);
    var h = spec.home, ph = phaseAt(t), u, x = h.x, y = h.y, z = h.z, flapAmt = 1;
    if (ph === 'flap') {
      u = t / PHASES.flap;
      y = h.y + HOVER * smooth(0, 1, u);              // lifts off the twigs while flapping hard
    } else if (ph === 'fly') {
      u = (t - PHASES.flap) / PHASES.fly;
      var p = flyPoint(spec, u);
      x = p.x; y = p.y; z = p.z;
    } else if (ph === 'land') {
      u = (t - PHASES.flap - PHASES.fly) / PHASES.land;
      y = h.y + HOVER * (1 - smooth(0, 1, u));        // settles back down into the nest
      flapAmt = 1 - 0.7 * smooth(0, 1, u);
    } else {
      u = 1; flapAmt = 0;
    }
    // Facing: along the direction of travel in the loop, towards mamá while hovering / settling.
    var heading = Math.atan2(spec.mama.x - h.x, spec.mama.z - h.z);
    if (ph === 'fly') {
      var q = flyPoint(spec, clamp(u + 0.01, 0, 1)), p0 = flyPoint(spec, clamp(u - 0.01, 0, 1));
      if (Math.hypot(q.x - p0.x, q.z - p0.z) > 1e-6) heading = Math.atan2(q.x - p0.x, q.z - p0.z);
    }
    return { phase: ph, u: u, x: x, y: y, z: z, heading: heading, flap: flapAmt };
  }

  SA.flight = { PHASES: PHASES, DURATION: DURATION, sample: sample, phaseAt: phaseAt };
})(typeof window !== 'undefined' ? window : globalThis);
