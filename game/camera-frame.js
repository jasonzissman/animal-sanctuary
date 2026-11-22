/* SA.camera.frameAbove: pure "what is above me?" framing for the chase camera (AS-0116). No THREE, no DOM. Load after game/camera.js.
 * Standard third-person automatic framing, not a mode: near a perched animal above the player, or up in a canopy, the
 * chase camera eases back, drops a little, raises its look-at point and widens the view slightly so the treetop and the
 * animal are on screen. On open ground every offset is 0 and the normal chase view returns.
 *
 *   SA.camera.frameAbove(player, points, o?) -> { weight, addDist, addPitch, addLookY, addFov }
 *       player { x, z, y?, climb? }  points [{ x, y, z }] (perched animals, canopy pickups: world positions)
 *       Offsets are for the full weight scaled by weight (0..1): add them to the chase dist / pitch (degrees, negative =
 *       lower camera) / look-at height / fov (degrees). Never throws, ignores junk points.
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
    addDist: 4, addPitch: -6, addFov: 8, canopyLook: 1.5, lookPerUnit: 0.5, maxLook: 3.5,
  };
  var NO_FRAME = { weight: 0, addDist: 0, addPitch: 0, addLookY: 0, addFov: 0 };

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  function frameAbove(player, points, o) {
    o = o || F;
    var px = num(player && player.x, 0), pz = num(player && player.z, 0), py = num(player && player.y, 0);
    var inCanopy = !!(player && player.climb);
    var bestW = 0, bestUp = 0, list = points || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || typeof p.x !== 'number' || typeof p.z !== 'number' || typeof p.y !== 'number' || !isFinite(p.x + p.y + p.z)) continue;
      var up = p.y - py;
      if (up < (inCanopy ? -o.canopyBelow : o.minAbove)) continue;
      var d = Math.hypot(p.x - px, p.z - pz);
      if (d > o.range) continue;
      var w = d <= o.fullRange ? 1 : 1 - (d - o.fullRange) / (o.range - o.fullRange);
      if (w > bestW || (w === bestW && up > bestUp)) { bestW = w; bestUp = Math.max(0, up); }
    }
    if (inCanopy) bestW = 1;   // up a tree you always see the canopy around you
    if (!(bestW > 0)) return { weight: 0, addDist: 0, addPitch: 0, addLookY: 0, addFov: 0 };
    var look = Math.max(inCanopy ? o.canopyLook : 0, Math.min(o.maxLook, bestUp * o.lookPerUnit));
    return { weight: bestW, addDist: o.addDist * bestW, addPitch: o.addPitch * bestW, addLookY: look * bestW, addFov: o.addFov * bestW };
  }

  function easeFrame(cur, target, dt, rate) {
    var k = 1 - Math.exp(-(rate || 6) * Math.max(0, num(dt, 0))), c = cur || NO_FRAME, t = target || NO_FRAME, r = {};
    Object.keys(NO_FRAME).forEach(function (f) { r[f] = num(c[f], 0) + (num(t[f], 0) - num(c[f], 0)) * k; });
    return r;
  }

  C.frameAbove = frameAbove;
  C.easeFrame = easeFrame;
  C.NO_FRAME = NO_FRAME;
  C.FRAME_DEFAULTS = F;
})(typeof window !== 'undefined' ? window : globalThis);
