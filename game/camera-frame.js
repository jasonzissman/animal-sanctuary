/* SA.camera.frameAbove: pure "what is above me?" framing for the chase camera (AS-0116, AS-0216). No THREE, no DOM. Load after game/camera.js.
 * Standard third-person automatic framing, not a mode: when the player stands still facing a perched animal above them (and has
 * nothing to use on the ground), the chase camera eases back, drops a little, raises its look-at point only enough to keep the
 * player's feet AND the animal on screen, and widens the view slightly. Up a canopy it frames the branches around you.
 * On open ground every offset is 0 and the normal chase view returns.
 *
 *   SA.camera.frameAbove(player, points, o?, ctx?) -> { weight, addDist, addPitch, addLookY, addFov }
 *       player { x, z, y?, heading?, climb? }  points [{ x, y, z }] (perched animals, canopy pickups: world positions)
 *       ctx { ground, still, dist, pitch, fov }: ground = a Use target (animal, pickup, NPC) is in reach on the ground -> no
 *       framing (the animal at the foot of the tree wins); still = seconds standing still (framing waits for 0.6 s; default: no
 *       wait); dist/pitch/fov = the chase view being framed (default: the chase defaults).
 *       A perched animal counts only inside a +-50 deg cone of player.heading (0 faces +z, like SA.player).
 *       Offsets are for the full weight scaled by weight (0..1): add them to the chase dist / pitch (degrees, negative =
 *       lower camera) / look-at height / fov (degrees). Never throws, ignores junk points.
 *   SA.camera.frameHold(hold, speed, dt) -> seconds standing still (0 the moment the player moves; feed it every frame)
 *   SA.camera.easeFrame(cur, target, dt, rate?) -> frame   frame-rate independent ease of every field (~0.5 s at rate 6)
 *   SA.camera.NO_FRAME                                      the all-zero frame
 */
(function (root) {
  'use strict';
  var SA = root.SA, C = SA.camera;

  var F = {
    range: 10,        // horizontal reach (units) within which an animal above counts
    fullRange: 6,     // weight is 1 inside this, fading to 0 at `range`
    minAbove: 1.5,    // an animal this much higher than the player counts as "above" (on the ground)
    canopyBelow: 3,   // up a tree: branches down to this far below still count
    addDist: 4, addPitch: -6, addFov: 8, canopyLook: 1.5, lookPerUnit: 0.5, maxLook: 4,
    coneDeg: 50,      // a perched animal counts only within this angle either side of the player's heading
    holdSec: 0.6,     // stand (nearly) still this long before the camera tilts up to a perched animal
    stillSpeed: 0.3,  // units/s: slower than this counts as standing still
    animalTop: 0.6,   // the animal's centre is its perch y + this (so its body, not just its feet, is framed)
    margin: 0.85,     // keep both the feet and the animal inside this fraction of the half-fov
  };
  var NO_FRAME = { weight: 0, addDist: 0, addPitch: 0, addLookY: 0, addFov: 0 };
  var RAD = Math.PI / 180;

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  function frameHold(hold, speed, dt, o) {
    o = o || F;
    return num(speed, 0) > o.stillSpeed ? 0 : num(hold, 0) + Math.max(0, num(dt, 0));
  }

  /** Raise the look-at point just enough to keep the player's feet AND the animal (up `up`, `d` ahead) inside the view. */
  function lookFor(up, d, o, ctx) {
    var D = C.DEFAULTS;
    var dist = num(ctx.dist, D.chaseDist) + o.addDist, pitch = Math.max(D.minPitch, num(ctx.pitch, D.chasePitch) + o.addPitch);
    var cy = dist * Math.sin(pitch * RAD), h = dist * Math.cos(pitch * RAD);   // camera height above the feet, horizontal distance to the player
    var vm = (num(ctx.fov, D.fovDeg) + o.addFov) / 2 * RAD * o.margin;
    var feet = -Math.atan2(cy, h), top = Math.atan2(up + o.animalTop - cy, h + d);   // angles above the horizon, seen from the camera
    var l = Math.max(top - vm, Math.min(feet + vm, (top + feet) / 2));             // view-axis angle that fits both whenever possible
    return Math.max(0, Math.min(o.maxLook, cy + h * Math.tan(l) - D.lookY));
  }

  function frameAbove(player, points, o, ctx) {
    o = o || F; ctx = ctx || {};
    var px = num(player && player.x, 0), pz = num(player && player.z, 0), py = num(player && player.y, 0);
    var heading = player && typeof player.heading === 'number' && isFinite(player.heading) ? player.heading : null;
    var inCanopy = !!(player && player.climb);
    if (!inCanopy && (ctx.ground || num(ctx.still, Infinity) < o.holdSec)) return { weight: 0, addDist: 0, addPitch: 0, addLookY: 0, addFov: 0 };
    var bestW = 0, bestUp = 0, bestD = 0, list = points || [], cone = Math.cos(o.coneDeg * RAD);
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || typeof p.x !== 'number' || typeof p.z !== 'number' || typeof p.y !== 'number' || !isFinite(p.x + p.y + p.z)) continue;
      var up = p.y - py;
      if (up < (inCanopy ? -o.canopyBelow : o.minAbove)) continue;
      var d = Math.hypot(p.x - px, p.z - pz);
      if (d > o.range) continue;
      // Only frame what you face: outside the forward cone never tilts the camera (right overhead has no direction: it counts).
      if (!inCanopy && heading !== null && d > 0.8 && (Math.sin(heading) * (p.x - px) + Math.cos(heading) * (p.z - pz)) / d < cone) continue;
      var w = d <= o.fullRange ? 1 : 1 - (d - o.fullRange) / (o.range - o.fullRange);
      if (w > bestW || (w === bestW && up > bestUp)) { bestW = w; bestUp = Math.max(0, up); bestD = d; }
    }
    if (inCanopy) bestW = 1;   // up a tree you always see the canopy around you
    if (!(bestW > 0)) return { weight: 0, addDist: 0, addPitch: 0, addLookY: 0, addFov: 0 };
    var look = inCanopy ? Math.max(o.canopyLook, Math.min(o.maxLook, bestUp * o.lookPerUnit)) : lookFor(bestUp, bestD, o, ctx);
    return { weight: bestW, addDist: o.addDist * bestW, addPitch: o.addPitch * bestW, addLookY: look * bestW, addFov: o.addFov * bestW };
  }

  function easeFrame(cur, target, dt, rate) {
    var k = 1 - Math.exp(-(rate || 6) * Math.max(0, num(dt, 0))), c = cur || NO_FRAME, t = target || NO_FRAME, r = {};
    Object.keys(NO_FRAME).forEach(function (f) { r[f] = num(c[f], 0) + (num(t[f], 0) - num(c[f], 0)) * k; });
    return r;
  }

  C.frameAbove = frameAbove;
  C.frameHold = frameHold;
  C.easeFrame = easeFrame;
  C.NO_FRAME = NO_FRAME;
  C.FRAME_DEFAULTS = F;
})(typeof window !== 'undefined' ? window : globalThis);
