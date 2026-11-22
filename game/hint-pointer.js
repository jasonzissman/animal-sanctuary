/* SA.hintPointer: pure logic for the gentle off-screen arrow in Scout & Spot (no THREE, no DOM; unit-tested in node:vm).
 *
 *   SA.hintPointer.locate(target, camState, aspect, opts?) -> { visible, angle, ex, ey }
 *       Projects a world point { x, y?, z } through the orbit camera described by SA.camera state { x, z, dist, yaw, pitch }.
 *       visible: the point is inside the view (in front of the camera and within +-1 NDC).
 *       angle:   radians toward the target on screen, 0 = right, PI/2 = up (screen y grows upward).
 *       ex, ey:  where the arrow sits, in NDC (-1..1, y up), pushed in from the screen edge so it stays tappable
 *                and clear of the prompt bar (top) and the star badge (bottom).
 *   SA.hintPointer.controlRects({ w, h }) -> pixel rects of the fixed buttons (mute, habitat, gear, orbit pad)
 *   SA.hintPointer.avoid({ w, h }, rects, ex, ey) -> { ex, ey }: the arrow slid along the screen edge to clear those rects
 *   SA.hintPointer.create({ delaySeconds?, onHint?, glide? }) -> pointer
 *       pointer.start()         a new round began: restart the idle clock, forget the "used" flag
 *       pointer.stop()          the round ended (correct pick): hide
 *       pointer.nudge()         skip the rest of the idle delay (used when a tap was too far away: the arrow points the way)
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
  var ARROW_SIZE = 72, MARGIN = 8, STEP = 4;   // px: arrow button size (see ui/hint-arrow.js), gap kept to controls, search step

  function finite(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  function locate(target, cam, aspect, opts) {
    var D = SA.camera.DEFAULTS, fov = (opts && opts.fovDeg) || D.fovDeg;
    var edge = (opts && opts.edge) || EDGE;
    var a = finite(aspect, 1) > 0 ? finite(aspect, 1) : 1;
    var lookY = Math.max(0, Math.min(3, finite(cam && cam.lookY, 0)));   // chase camera aims at animal height, not the ground
    cam = SA.camera.clampState(cam || {}, SA.map.BOUNDS);   // junk camera numbers become a valid state
    var P = SA.camera.position(cam);
    var T = { x: finite(cam.x, 0), y: lookY, z: finite(cam.z, 0) };
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

  // Fixed controls the arrow must not cover, as pixel rects {left, top, right, bottom} (origin top-left) for a viewport
  // { w, h }. Mirrors the CSS of the mute (top-right), habitat (below it), gear and orbit pad (bottom-right) buttons.
  function controlRects(vp) {
    var w = finite(vp && vp.w, 0), h = finite(vp && vp.h, 0);
    function box(rt, tp, bw, bh) { return { left: w - rt - bw, top: tp, right: w - rt, bottom: tp + bh }; }
    return [
      box(12, 12, 64, 64),                       // mute
      box(12, 84, 76, 76),                       // habitat toggle
      box(12, h - 12 - 48, 48, 48),              // gear
      box(12, h - 72 - 120, 120, 120),           // orbit pad (2x2 buttons)
    ];
  }

  // Pure: slide the arrow (centre at NDC ex, ey; ARROW_SIZE px square) along the inset screen-edge rectangle until its
  // box clears every reserved rect (plus MARGIN). Returns { ex, ey } in NDC; the caller keeps the original angle, so the
  // arrow still points at the target. Unchanged when already clear (or no viewport); stays fully on-screen.
  function avoid(vp, rects, ex, ey, opts) {
    var w = finite(vp && vp.w, 0), h = finite(vp && vp.h, 0);
    var out = { ex: ex, ey: ey };
    if (!(w > 0 && h > 0) || !rects || !rects.length) return out;
    opts = opts || {};
    var half = (opts.size || ARROW_SIZE) / 2, margin = finite(opts.margin, MARGIN), edge = opts.edge || EDGE;
    var x0 = Math.max(half, (edge.left + 1) / 2 * w), x1 = Math.min(w - half, (edge.right + 1) / 2 * w);
    var y0 = Math.max(half, (1 - edge.top) / 2 * h), y1 = Math.min(h - half, (1 - edge.bottom) / 2 * h);
    function clear(x, y) {
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (x + half > r.left - margin && x - half < r.right + margin && y + half > r.top - margin && y - half < r.bottom + margin) return false;
      }
      return true;
    }
    var px = Math.min(x1, Math.max(x0, (ex + 1) / 2 * w)), py = Math.min(y1, Math.max(y0, (1 - ey) / 2 * h));
    var best = null, bestD = Infinity;
    function consider(x, y) {
      if (!clear(x, y)) return;
      var d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < bestD) { bestD = d; best = { x: x, y: y }; }
    }
    if (clear(px, py)) return out;   // already clear: leave it exactly where locate() put it
    else {
      for (var x = x0; x <= x1; x += STEP) { consider(x, y0); consider(x, y1); }
      for (var y = y0; y <= y1; y += STEP) { consider(x0, y); consider(x1, y); }
      consider(x1, y1); consider(x1, y0);
    }
    if (!best) return out;   // nowhere free (absurdly tiny viewport): keep the original spot rather than hide the hint
    return { ex: best.x / w * 2 - 1, ey: 1 - best.y / h * 2 };
  }

  function create(o) {
    o = o || {};
    var delay = typeof o.delaySeconds === 'number' ? o.delaySeconds : DELAY_SECONDS;
    var idle = 0, active = false, used = false;
    return {
      start: function () { idle = 0; active = true; used = false; },
      stop: function () { active = false; idle = 0; },
      nudge: function () { if (active) idle = Math.max(idle, delay); },   // a too-far tap ("¡Acércate!"): show the arrow now
      update: function (dt, target, cam, aspect, vp) {
        if (!active || !target) return null;
        idle += Math.max(0, finite(dt, 0));
        if (idle < delay) return null;
        var l = locate(target, cam, aspect);
        if (l.visible) return null;
        var p = vp ? avoid(vp, controlRects(vp), l.ex, l.ey) : l;   // with a viewport, keep clear of mute/habitat/gear
        return { angle: l.angle, ex: p.ex, ey: p.ey };
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

  SA.hintPointer = { DELAY_SECONDS: DELAY_SECONDS, EDGE: EDGE, locate: locate, controlRects: controlRects, avoid: avoid, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
