/* SA.render.createCameraRig(THREE, canvas, camera, initial, hooks): input -> SA.camera math -> THREE camera.
 * Pointer events cover mouse AND touch. One pointer drag orbits (left/right = yaw, up/down = pitch); a
 * shift- or right/middle-button drag pans; two pointers pinch (zoom) and drag together (pan).
 * A press that never travels past the tap threshold does nothing, so tapping an animal never turns the view.
 * Keys: arrows/WASD pan, Q/E rotate, R/F tilt, wheel zooms. Everything is clamped by SA.camera.
 * hooks.chase = { obstacles } switches on third person (see below): the avatar walks, the camera chases it.
 * hooks.canOrbit(event) -> false lets a press start something else (e.g. rubbing a muddy part) without orbiting.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var KEYS = {
    ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
  };
  var ORBIT_KEYS = { q: [-1, 0], Q: [-1, 0], e: [1, 0], E: [1, 0], r: [0, 1], R: [0, 1], f: [0, -1], F: [0, -1] };

  SA.render.createCameraRig = function (THREE, canvas, camera, initial, hooks) {
    var C = SA.camera, B = SA.map.BOUNDS;
    var threshold = (SA.picking && SA.picking.DRAG_THRESHOLD) || 10;
    // hooks.chase = { obstacles() -> [[x, z, r], ...] } turns on the third-person mode: WASD/arrows walk the SA.player
    // avatar (up/down = walk, left/right = turn), the camera follows from behind, Q/E/R/F and drags swing it round the
    // player, and pan gestures (shift/right drag, two fingers) walk the player so touch screens can still move.
    var chase = !!(hooks && hooks.chase);
    var player = chase ? SA.player.spawn() : null, moving = false, offset = 0;   // offset: swing from directly behind (deg)
    var state = chase ? C.chaseStart(player, B) : C.clampState(initial || { x: 0, z: 5, dist: 40 }, B);
    var pointers = {};            // id -> { x, y, sx, sy, mode, moved }
    var held = {};                // key -> true
    var padYaw = 0, padPitch = 0; // on-screen rotate/tilt buttons (-1..1): the same axes as Q/E and F/R
    var pinchDist = 0, mid = null;
    var glide = false;            // true while `focus` is a glideTo that ends by itself
    var focus = null;            // { x, z, dist }: while set the camera eases there; only orbit input is accepted

    function viewH() { return canvas.clientHeight || 600; }
    function ids() { return Object.keys(pointers); }
    function spread() {
      var k = ids(), a = pointers[k[0]], b = pointers[k[1]];
      return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    }
    function midpoint() {
      var k = ids(), a = pointers[k[0]], b = pointers[k[1]];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    function apply() {
      var p = C.position(state);
      camera.position.set(p.x, p.y, p.z);
      camera.lookAt(state.x, chase ? C.DEFAULTS.lookY : 0, state.z);   // chase: look at about animal height
    }
    function obstacles() { return chase && hooks.chase.obstacles ? hooks.chase.obstacles() : []; }
    // Orbit input swings the offset around the player (chase) or the state itself (focused on a care task / classic).
    function orbitWith(fn) {
      if (!chase || focus) { state = fn(state); return; }
      var r = fn({ x: state.x, z: state.z, dist: state.dist, yaw: offset, pitch: state.pitch });
      offset = r.yaw; state = { x: state.x, z: state.z, dist: state.dist, yaw: state.yaw, pitch: r.pitch };
    }
    function panWith(dx, dy) {
      if (!chase) { state = C.panByPixels(state, dx, dy, viewH(), B); return; }
      var m = C.panByPixels({ x: player.x, z: player.z, dist: state.dist, yaw: state.yaw, pitch: state.pitch }, dx, dy, viewH(), B);
      player = SA.player.step({ x: m.x, z: m.z, heading: player.heading }, {}, 0, obstacles());
    }

    function modeFor(e) {
      if (hooks && hooks.canOrbit && !hooks.canOrbit(e)) return 'none';
      return e.button === 1 || e.button === 2 || e.shiftKey ? 'pan' : 'orbit';
    }
    function onDown(e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, mode: modeFor(e), moved: false };
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      if (ids().length === 2) { pinchDist = spread(); mid = midpoint(); }
    }
    function onMove(e) {
      var p = pointers[e.pointerId];
      if (!p) return;
      var n = ids().length;
      if (n === 1) {
        if (!p.moved) {
          if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) <= threshold) return;   // still a tap: do not turn the view
          p.moved = true;
          p.x = e.clientX; p.y = e.clientY;
          return;
        }
        var dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (p.mode === 'orbit') orbitWith(function (s) { return C.orbitByPixels(s, dx, dy, B); });
        else if (p.mode === 'pan' && !focus) panWith(dx, dy);
      } else if (n === 2) {
        p.x = e.clientX; p.y = e.clientY;
        var d = spread(), m = midpoint();
        if (!focus) {
          if (pinchDist > 0 && d > 0) state = C.zoomByScale(state, d / pinchDist, B);
          if (mid) panWith(m.x - mid.x, m.y - mid.y);
        }
        pinchDist = d; mid = m;
      }
    }
    function onUp(e) {
      delete pointers[e.pointerId];
      var two = ids().length === 2;
      pinchDist = two ? spread() : 0;
      mid = two ? midpoint() : null;
    }
    function onWheel(e) {
      e.preventDefault();
      if (focus) return;
      state = C.zoomByWheel(state, e.deltaY, B);
    }
    function isKey(k) { return KEYS[k] || ORBIT_KEYS[k]; }
    function onKeyDown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || !isKey(e.key)) return;
      held[e.key] = true; e.preventDefault();
    }
    function onKeyUp(e) { delete held[e.key]; }

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('blur', function () { held = {}; pointers = {}; padYaw = 0; padPitch = 0; });

    return {
      /** Call once per frame (dt in seconds). */
      update: function (dt) {
        var ax = 0, az = 0, ayaw = 0, apitch = 0;
        Object.keys(held).forEach(function (k) {
          if (KEYS[k]) { ax += KEYS[k][0]; az += KEYS[k][1]; } else { ayaw += ORBIT_KEYS[k][0]; apitch += ORBIT_KEYS[k][1]; }
        });
        if (focus) {
          state = C.easeToward(state, focus, dt, 4, B);
          if (glide && Math.hypot(state.x - focus.x, state.z - focus.z) < 0.4) { focus = null; glide = false; }
        }
        else if (!chase && (ax || az)) state = C.panByKeys(state, ax, az, dt, B);
        ayaw += padYaw; apitch += padPitch;
        if (ayaw || apitch) orbitWith(function (s) { return C.orbitByKeys(s, ayaw, apitch, dt, B); });
        if (chase) {
          var before = player;
          player = SA.player.step(player, { forward: az < 0, back: az > 0, left: ax < 0, right: ax > 0 }, dt, obstacles());
          moving = Math.hypot(player.x - before.x, player.z - before.z) > 1e-4 || player.heading !== before.heading;
          if (!focus) {
            offset = C.decayOffset(offset, az < 0, dt);
            state = C.chaseFollow(state, player, offset, dt, B);
          }
        }
        apply();
      },
      /** Third-person mode only: the avatar's { x, z, heading } and whether it moved this frame (null / false otherwise). */
      getPlayer: function () { return player ? { x: player.x, z: player.z, heading: player.heading, moving: moving } : null; },
      /** On-screen buttons hold yaw/pitch axes (-1, 0, 1); update() runs them through the same clamped orbitByKeys path as the keys. */
      setOrbitAxes: function (yaw, pitch) { padYaw = yaw > 0 ? 1 : yaw < 0 ? -1 : 0; padPitch = pitch > 0 ? 1 : pitch < 0 ? -1 : 0; },
      /** Ease in on a ground point (care tasks); pan/zoom are ignored until release(), orbit still works. */
      focusOn: function (x, z, dist) { glide = false; focus =C.clampState({ x: x, z: z, dist: dist }, B); },
      release: function () { focus = null; glide = false; },
      /** Ease the view over to a ground point keeping the zoom, then hand control back (arrow hint). */
      glideTo: function (x, z) {
        if (chase) {   // third person: turn the avatar toward the spot and the chase camera swings round with it
          if (isFinite(x) && isFinite(z)) player = { x: player.x, z: player.z, heading: Math.atan2(x - player.x, z - player.z) };
          offset = 0;
          return;
        }
        focus = C.clampState({ x: x, z: z, dist: state.dist }, B); glide = true;
      },
      getState: function () { return { x: state.x, z: state.z, dist: state.dist, yaw: state.yaw, pitch: state.pitch }; },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
