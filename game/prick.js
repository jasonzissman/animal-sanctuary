/* SA.prick: the cactus prick (AS-0156). Pure logic (no THREE, no DOM; node:vm tested). Touching a cactus (a decor item with
 * `prick: true`) knocks the player back about 1.5 units, straight away from it, over ~0.25 s (eased out) with a small hop and a
 * brief red flash. It is only a bounce: no health, no penalty. Other solids (rocks, trunks) still just block.
 *
 *   SA.prick.create()                                   -> idle state
 *   SA.prick.step(state, pos, cacti, solids, dt)        -> new state (the input state is never mutated)
 *     pos     { x, z }   where the walking step left the player (it already pushed them out of every solid)
 *     cacti   [[x, z, r], ...]  the prickly solids (SA.blocking.pricklies)
 *     solids  [[x, z, r(, h)], ...]  every blocking circle (SA.blocking.obstacles); the knockback never ends inside one,
 *             never passes through one, and never leaves the map (it is shortened until the path is clear)
 *   state   { active, x, z, lift, hurt, hit, ouch, t, cool, ... }
 *     active  true while control is taken (~0.25 s): the caller moves the player to (x, z) instead of walking
 *     lift    small hop height above the standing height (the avatar is drawn at y + lift)
 *     hurt    1 -> 0 over ~0.5 s: the red flash / shake strength
 *     hit     true on the step the prick starts; ouch: true when the 'ouch' SFX + '¡Ay! ¡Pica!' should play (at most once per 2 s)
 * Constants: DISTANCE, DURATION, FLASH, HOP, OUCH_GAP, OUCH_KEY, OUCH_SFX.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var DISTANCE = 1.5;     // world units knocked back
  var DURATION = 0.25;    // seconds of lost control
  var FLASH = 0.5;        // seconds the red flash lasts
  var HOP = 0.35;         // peak lift of the little hop
  var OUCH_GAP = 2;       // seconds between two ouch sounds / phrases
  var CONTACT = 0.1;      // touching = within this of the blocking distance
  var BODY = 0.6;         // player body circle (SA.player.RADIUS)
  var EDGE = 0.5;         // stay inside the map bounds (SA.player's EDGE)
  var TOL = 0.05;         // float noise: the start spot is a push-out and sits on the circle
  var SAMPLE = 0.1;       // path check spacing
  var OUCH_KEY = 'phrase:ay', OUCH_SFX = 'ouch';

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function body() { return SA.player && typeof SA.player.RADIUS === 'number' ? SA.player.RADIUS : BODY; }

  function create() { return { active: false, x: 0, z: 0, lift: 0, hurt: 0, hit: false, ouch: false, t: -1, cool: 0, fx: 0, fz: 0, tx: 0, tz: 0 }; }

  function free(x, z, solids) {
    var B = SA.map && SA.map.BOUNDS, R = body();
    if (B && (x < B.minX + EDGE - 1e-6 || x > B.maxX - EDGE + 1e-6 || z < B.minZ + EDGE - 1e-6 || z > B.maxZ - EDGE + 1e-6)) return false;
    for (var i = 0; i < solids.length; i++) {
      var o = solids[i];
      if (o && o[2] > 0 && Math.hypot(x - o[0], z - o[1]) < o[2] + R - TOL) return false;
    }
    return true;
  }

  /** How far (0..DISTANCE) the player can be knocked along (ux, uz) with every sampled point on the way clear. */
  function reach(px, pz, ux, uz, solids) {
    var best = 0;
    for (var d = SAMPLE; d <= DISTANCE + 1e-9; d += SAMPLE) {
      if (!free(px + ux * d, pz + uz * d, solids)) break;
      best = d;
    }
    return best;
  }

  function touching(pos, cacti) {
    var best = null, bestGap = Infinity, R = body();
    for (var i = 0; i < cacti.length; i++) {
      var c = cacti[i];
      if (!c || !(c[2] > 0)) continue;
      var gap = Math.hypot(pos.x - c[0], pos.z - c[1]) - (c[2] + R);
      if (gap <= CONTACT && gap < bestGap) { best = c; bestGap = gap; }
    }
    return best;
  }

  function step(state, pos, cacti, solids, dt) {
    var s = state || create();
    dt = Math.max(0, Math.min(0.1, num(dt, 0)));
    var out = { active: s.active, x: s.x, z: s.z, lift: 0, hurt: 0, hit: false, ouch: false, t: s.t, cool: Math.max(0, s.cool - dt),
      fx: s.fx, fz: s.fz, tx: s.tx, tz: s.tz };
    if (out.t >= 0) {   // a prick is under way: ease out along the line, hop, fade the flash
      out.t = s.t + dt;
      var k = Math.min(1, out.t / DURATION), e = 1 - (1 - k) * (1 - k);
      out.active = out.t < DURATION;
      out.x = s.fx + (s.tx - s.fx) * e; out.z = s.fz + (s.tz - s.fz) * e;
      out.lift = out.active ? HOP * Math.sin(Math.PI * k) : 0;
      out.hurt = Math.max(0, 1 - out.t / FLASH);
      if (out.t >= FLASH) out.t = -1;
      return out;
    }
    out.active = false;
    var c = pos ? touching(pos, cacti || []) : null;
    if (!c) return out;
    var dx = pos.x - c[0], dz = pos.z - c[1], d = Math.hypot(dx, dz);
    var ux = d > 1e-6 ? dx / d : 0, uz = d > 1e-6 ? dz / d : 1;   // dead centre: any way out
    var edge = Math.max(d, c[2] + body());   // (degenerate) already inside the cactus: start from its edge
    var sx = c[0] + ux * edge, sz = c[1] + uz * edge;
    if (!free(sx, sz, [])) { sx = pos.x; sz = pos.z; }   // that edge is off the map: stay put (wedged against the map edge)
    var r = reach(sx, sz, ux, uz, solids || []);
    out.hit = true; out.ouch = out.cool <= 0;
    if (out.ouch) out.cool = OUCH_GAP;
    out.t = 0; out.active = true; out.hurt = 1;
    out.fx = sx; out.fz = sz; out.tx = sx + ux * r; out.tz = sz + uz * r;
    out.x = sx; out.z = sz;
    return out;
  }

  SA.prick = { DISTANCE: DISTANCE, DURATION: DURATION, FLASH: FLASH, HOP: HOP, OUCH_GAP: OUCH_GAP, OUCH_KEY: OUCH_KEY, OUCH_SFX: OUCH_SFX,
    create: create, step: step };
})(typeof window !== 'undefined' ? window : globalThis);
