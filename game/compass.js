/* SA.compass: the mission compass (AS-0228). Pure direction logic (no THREE, no DOM; unit-tested in node:vm); the arrow itself
 * is the view in game/ui/compass-view.js. One big arrow on the HUD points from the player toward the current mission step's
 * world target, relative to the camera, so turning the camera or walking turns it every frame. No numbers, no text.
 * The target comes from the step engine (SA.missionRuntime.target(): a step's `at`), never from a mission or animal id here.
 *
 *   SA.compass.angle(player, target, yawDeg) -> radians on screen (0 = right, PI/2 = up = straight ahead of the camera)
 *   SA.compass.evaluate({ target, player, cam, aspect, wasShown? })
 *       -> { show, angle, dist, scale, pulse, reason }
 *       show    false when there is no target, the player has reached it (dist < REACHED), or it is near (dist < NEAR) AND on
 *               screen. wasShown adds hysteresis: once hidden for being near it stays hidden until dist >= NEAR + SLACK (or it is
 *               off-screen), so the arrow never flickers at the boundary.
 *       scale   1 far away, shrinking gently to 0.7 as the target gets close (CLOSE .. NEAR); pulse is true inside CLOSE
 *       reason  'none' | 'reached' | 'near' | 'far' | 'close' (why it is hidden / shown)
 *   SA.compass.place(vp, size?) -> { left, top, size }: pixel box for the arrow, top-centre, slid clear of the prompt pill, the
 *       star badge, the menu column, the hotbar, the joystick, the touch buttons and SA.hintPointer.controlRects (via avoid)
 *   SA.compass.create({ track?, now? }) -> tracker
 *       tracker.update(dt, input) -> the evaluate() result; fires telemetry on a change of shown/hidden (at most one event per
 *       TRACK_GAP seconds, so a camera swing near the boundary never floods): compass.shown { role }, compass.hidden { reason }
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var REACHED = 2.5, NEAR = 8, SLACK = 2, CLOSE = 22, MIN_SCALE = 0.7, TRACK_GAP = 3;
  var SIZE = { regular: 96, compact: 64 };
  var RAD = Math.PI / 180;

  function finite(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  function angle(player, target, yawDeg) {
    var dx = finite(target.x, 0) - finite(player.x, 0), dz = finite(target.z, 0) - finite(player.z, 0);
    var y = finite(yawDeg, 0) * RAD, s = Math.sin(y), c = Math.cos(y);
    // position() puts the camera at (sin yaw, cos yaw) from the look-at: screen-right is (cos, -sin), forward is (-sin, -cos).
    var right = dx * c - dz * s, ahead = -dx * s - dz * c;
    return Math.atan2(ahead, right);
  }

  function onScreen(target, cam, aspect) {
    try { return !!(SA.hintPointer && cam && SA.hintPointer.locate(target, cam, aspect).visible); } catch (e) { return false; }
  }

  function evaluate(o) {
    var t = o && o.target, p = o && o.player;
    if (!t || !p || !isFinite(t.x) || !isFinite(t.z) || !isFinite(p.x) || !isFinite(p.z)) return { show: false, angle: 0, dist: Infinity, scale: 1, pulse: false, reason: 'none' };
    var dist = Math.hypot(t.x - p.x, t.z - p.z), cam = o.cam || {};
    var a = angle(p, t, cam.yaw);
    var out = { show: true, angle: a, dist: dist, scale: 1, pulse: false, reason: 'far' };
    if (dist < REACHED) { out.show = false; out.reason = 'reached'; return out; }
    if (dist < NEAR + (o.wasShown === false ? SLACK : 0) && onScreen({ x: t.x, y: 0.5, z: t.z }, cam, o.aspect)) { out.show = false; out.reason = 'near'; return out; }
    if (dist < CLOSE) {
      out.pulse = true; out.reason = 'close';
      out.scale = MIN_SCALE + (1 - MIN_SCALE) * Math.max(0, Math.min(1, (dist - NEAR) / (CLOSE - NEAR)));
    }
    return out;
  }

  // Everything the arrow must stay clear of: the HUD layout's fixed elements (not the short-lived toasts) and the old fixed buttons.
  function rectsFor(vp) {
    var rects = SA.hintPointer && SA.hintPointer.controlRects ? SA.hintPointer.controlRects({ w: vp.width, h: vp.height }) : [];
    if (SA.hud && SA.hud.layout) {
      var lay = SA.hud.layout({ width: vp.width, height: vp.height }), skip = { toast: 1, pickupsToast: 1, hotbarChip: 1, pickingChip: 1, reachCue: 1, hintArrow: 1, clickFx: 1 };
      Object.keys(lay).forEach(function (id) {
        var r = lay[id];
        if (!skip[id] && r && r.width > 0) rects.push({ left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height });
      });
    }
    return rects;
  }

  function place(vp, size) {
    var w = finite(vp && vp.width, 1280), h = finite(vp && vp.height, 800);
    var mode = SA.hud && SA.hud.mode ? SA.hud.mode({ width: w, height: h }) : (w < 560 ? 'compact' : 'regular');
    var s = size || SIZE[mode], top = SA.hintPointer.EDGE.top;
    var p = SA.hintPointer.avoid({ w: w, h: h }, rectsFor({ width: w, height: h }), 0, top, { size: s });
    return { left: Math.round((p.ex + 1) / 2 * w - s / 2), top: Math.round((1 - p.ey) / 2 * h - s / 2), size: s };
  }

  function create(o) {
    o = o || {};
    var shown = null, since = 0, clock = 0, hold = TRACK_GAP;   // `hold` starts open: the first change is reported at once
    function track(type, fields) {
      try {
        if (o.track) o.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }
    return {
      update: function (dt, input) {
        clock += Math.max(0, finite(dt, 0));
        var r = evaluate({ target: input && input.target, player: input && input.player, cam: input && input.cam, aspect: input && input.aspect,
          wasShown: shown === null ? undefined : shown });
        if (shown !== r.show) {
          var role = input && input.target && input.target.role;
          if ((shown !== null || r.show) && (clock - since >= hold || shown === null)) {
            track(r.show ? 'compass.shown' : 'compass.hidden', r.show ? { role: role || 'target' } : { reason: r.reason });
            since = clock;
          }
          shown = r.show;
        }
        return r;
      },
      shown: function () { return !!shown; },
    };
  }

  SA.compass = { REACHED: REACHED, NEAR: NEAR, SLACK: SLACK, CLOSE: CLOSE, MIN_SCALE: MIN_SCALE, SIZE: SIZE, angle: angle, evaluate: evaluate, place: place, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
