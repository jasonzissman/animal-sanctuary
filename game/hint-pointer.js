/* SA.hintPointer: pure logic for the gentle off-screen arrow in Scout & Spot (no THREE, no DOM; unit-tested in node:vm).
 *
 *   SA.hintPointer.locate(target, camState, aspect, opts?) -> { visible, angle, ex, ey }
 *       Projects a world point { x, y?, z } through the orbit camera described by SA.camera state { x, z, dist, yaw, pitch }.
 *       visible: the point is inside the view (in front of the camera and within +-1 NDC).
 *       angle:   radians toward the target on screen, 0 = right, PI/2 = up (screen y grows upward).
 *       ex, ey:  where the arrow sits, in NDC (-1..1, y up), pushed in from the screen edge so it stays tappable
 *                and clear of the prompt bar (top) and the star badge (bottom).
 *   SA.hintPointer.create({ delaySeconds?, onHint?, glide? }) -> pointer
 *       pointer.start()         a new round began: restart the idle clock, forget the "used" flag
 *       pointer.stop()          the round ended (correct pick): hide
 *       pointer.update(dt, target, camState, aspect) -> null | { angle, ex, ey }   (dt in seconds)
 *           Only returns an arrow after the idle delay AND while the target is off-screen. Never fails a round.
 *       pointer.tap(target)     the arrow was tapped: glides the camera toward the target and counts one hint per round.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var RAD = Math.PI / 180;
  var DELAY_SECONDS = 10;
  var EDGE = { left: -0.88, right: 0.88, bottom: -0.82, top: 0.66 };

  function finite(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  function locate(target, cam, aspect, opts) {
    var D = SA.camera.DEFAULTS, fov = (opts && opts.fovDeg) || D.fovDeg;
    var edge = (opts && opts.edge) || EDGE;
    var a = finite(aspect, 1) > 0 ? finite(aspect, 1) : 1;
    cam = SA.camera.clampState(cam || {}, SA.map.BOUNDS);   // junk camera numbers become a valid state
    var P = SA.camera.position(cam);
    var T = { x: finite(cam.x, 0), y: 0, z: finite(cam.z, 0) };
    var fx = T.x - P.x, fy = T.y - P.y, fz = T.z - P.z, fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    var rx = -fz, rz = fx, rl = Math.sqrt(rx * rx + rz * rz) || 1;      // right = forward x worldUp
    rx /= rl; rz /= rl;
    var ux = -fy * rz, uy = rz * fx - rx * fz, uz = fy * rx;            // up = right x forward
    var dx = finite(target.x, 0) - P.x, dy = finite(target.y, 0) - P.y, dz = finite(target.z, 0) - P.z;
    var cx = dx * rx + dz * rz, cy = dx * ux + dy * uy + dz * uz, cz = dx * fx + dy * fy + dz * fz;
    var th = Math.tan(fov * RAD / 2), nx, ny;
    if (cz > 0.01) {
      nx = cx / (cz * th * a); ny = cy / (cz * th);
      if (Math.abs(nx) <= 1 && Math.abs(ny) <= 1) return { visible: true, angle: Math.atan2(ny, nx), ex: nx, ey: ny };
    }
    var sx = cx, sy = cy;               // behind the camera or outside the frustum: point along the screen-plane direction
    if (cz > 0.01) { sx = nx; sy = ny; }   // in front: use the true projected direction
    if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) { sx = 0; sy = -1; }
    var len = Math.sqrt(sx * sx + sy * sy);
    sx /= len; sy /= len;
    var k = Math.min(
      Math.abs(sx) < 1e-9 ? Infinity : (sx > 0 ? edge.right : -edge.left) / Math.abs(sx),
      Math.abs(sy) < 1e-9 ? Infinity : (sy > 0 ? edge.top : -edge.bottom) / Math.abs(sy));
    return { visible: false, angle: Math.atan2(sy, sx), ex: sx * k, ey: sy * k };
  }

  function create(o) {
    o = o || {};
    var delay = typeof o.delaySeconds === 'number' ? o.delaySeconds : DELAY_SECONDS;
    var idle = 0, active = false, used = false;
    return {
      start: function () { idle = 0; active = true; used = false; },
      stop: function () { active = false; idle = 0; },
      update: function (dt, target, cam, aspect) {
        if (!active || !target) return null;
        idle += Math.max(0, finite(dt, 0));
        if (idle < delay) return null;
        var l = locate(target, cam, aspect);
        return l.visible ? null : { angle: l.angle, ex: l.ex, ey: l.ey };
      },
      tap: function (target) {
        if (!active || !target) return false;
        if (!used) { used = true; if (o.onHint) o.onHint(); }
        if (o.glide) o.glide(target.x, target.z);
        return true;
      },
      isActive: function () { return active; },
    };
  }

  SA.hintPointer = { DELAY_SECONDS: DELAY_SECONDS, EDGE: EDGE, locate: locate, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
