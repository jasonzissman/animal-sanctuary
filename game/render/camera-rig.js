/* SA.render.createCameraRig(THREE, canvas, camera, hooks): input -> SA.camera math -> THREE camera.
 * Pointer events cover mouse AND touch. One pointer drag orbits (left/right = yaw, up/down = pitch); a
 * shift- or right/middle-button drag pans; two pointers pinch (zoom) and drag together (pan).
 * A press that never travels past the tap threshold does nothing, so tapping an animal never turns the view.
 * Keys: arrows/WASD pan, hold Shift to run, Space hops (SA.jump: a vertical `lift` only, never a climb), Q/T rotate, R/F tilt, wheel zooms. Everything is clamped by SA.camera.
 * Third person only (one camera, always the chase camera): the avatar walks, the camera chases it. There is no
 * overhead, close-up or focus view; to draw attention somewhere glideTo() turns the player toward it (eased ~300 ms with
 * SA.turn, the short way round; any walking input cancels the turn).
 * Automatic framing (AS-0116, SA.camera.frameAbove): hooks.chase.above() -> [{ x, y, z }] perched animals; near one above the
 * player, or up a canopy, the chase camera eases back, lowers and looks higher (and widens the fov a little); a drag overrides.
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
  // E is the "use" key (AS-0111, SA.spaceUse) so it no longer orbits: swing right is T now (Q left, R/F tilt); drag and the pad also orbit.
  var ORBIT_KEYS = { q: [-1, 0], Q: [-1, 0], t: [1, 0], T: [1, 0], r: [0, 1], R: [0, 1], f: [0, -1], F: [0, -1] };

  SA.render.createCameraRig = function (THREE, canvas, camera, hooks) {
    var C = SA.camera, B = SA.map.BOUNDS;
    var threshold = (SA.picking && SA.picking.DRAG_THRESHOLD) || 10;
    // hooks.chase = { obstacles() -> [[x, z, r], ...] }: WASD/arrows walk the SA.player avatar (up/down = walk,
    // left/right = turn), the camera follows from behind, Q/E/R/F and drags swing it round the player, and pan gestures
    // (shift/right drag, two fingers) walk the player so touch screens can still move.
    // hooks.chase.pricklies() -> [[x, z, r], ...]: the cacti (SA.blocking.pricklies); touching one knocks the player back (SA.prick).
    // hooks.chase.trees() -> [{ x, z, y?, scale?, kind? }]: the climbable trees (SA.climb); the player state carries y and climb.
    var player = SA.climb.step(SA.player.spawn(), {}, 0), moving = false, offset = 0, camY = player.y;   // offset: swing from directly behind (deg)
    var state = C.chaseStart(player, B);
    var pointers = {};            // id -> { x, y, sx, sy, mode, moved }
    var held = {};                // key -> true
    var padYaw = 0, padPitch = 0; // on-screen rotate/tilt buttons (-1..1): the same axes as Q/E and F/R
    var stickX = 0, stickY = 0;   // on-screen joystick (unit disc, +y down): walks the player like the arrow keys
    var pinchDist = 0, mid = null;
    var isRunning = false;        // moved forward at run speed this frame (the avatar plays a faster stride)
    var jumpHeld = false;       // Space held (SA.jump needs a release between hops)
    var hop = SA.jump ? SA.jump.create() : null;   // { lift, vy, air, ... }: the avatar is drawn at y + lift; reach still uses y
    var prick = SA.prick ? SA.prick.create() : { lift: 0, hurt: 0 };   // cactus knockback (SA.prick): its lift/hurt ride on the avatar
    var jumpTap = false;       // the on-screen jump button was tapped: one frame of "Space pressed" (same one-hop-per-landing rule)
    var run = false;            // Shift held: the avatar runs (SA.player RUN_SPEED) while moving forward
    var clearK = 1;             // smoothed fraction (0..1) of the camera's reach kept by SA.camera.clearPath
    var frame = C.NO_FRAME || { weight: 0, addDist: 0, addPitch: 0, addLookY: 0, addFov: 0 };   // eased SA.camera.frameAbove offsets (AS-0116)
    var autoTimer = null;       // SA.climb.autoStep push timer (AS-0157): pushing forward into a tree for AUTO_CLIMB_MS climbs it
    var turn = null;           // eased avatar turn from glideTo (SA.turn); any walking/turning input cancels it (AS-0089)
    var baseFov = typeof camera.fov === 'number' ? camera.fov : C.DEFAULTS.fovDeg, lastFov = baseFov;

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

    // The orbit state with the automatic "look up" framing added: farther, a little lower, never past the pitch limits.
    function framed() {
      return { x: state.x, z: state.z, dist: state.dist + frame.addDist, yaw: state.yaw, pitch: C.clampPitch(state.pitch + frame.addPitch) };
    }
    function apply() {
      var p = C.position(framed());
      // Pull the camera in along the line from the player when a tree/prop/big animal would be between them (or around it).
      var px = player.x + (p.x - player.x) * clearK, pz = player.z + (p.z - player.z) * clearK;
      // camY: the chase camera rises with the player (up a tree, up a hill); it never dips below the terrain under it.
      camera.position.set(px, SA.map.cameraHeight(p.y + camY, px, pz), pz);
      camera.lookAt(state.x, C.DEFAULTS.lookY + frame.addLookY + camY, state.z);   // look at about animal height (higher near treetops)
      if (typeof camera.fov === 'number' && Math.abs(baseFov + frame.addFov - lastFov) > 0.01) {
        lastFov = baseFov + frame.addFov; camera.fov = lastFov;
        if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
      }
    }
    function obstacles() { return hooks && hooks.chase && hooks.chase.obstacles ? hooks.chase.obstacles() : []; }
    // Orbit input swings the offset around the player.
    function orbitWith(fn) {
      var r = fn({ x: state.x, z: state.z, dist: state.dist, yaw: offset, pitch: state.pitch });
      offset = r.yaw; state = { x: state.x, z: state.z, dist: state.dist, yaw: state.yaw, pitch: r.pitch };
    }
    /** True during the climb up/down animation (no hopping then); standing in the canopy is not "climbing". */
    function climbing() { return !!player.climb && !SA.climb.onTop(player); }
    function trees() { return hooks && hooks.chase && hooks.chase.trees ? hooks.chase.trees() : []; }
    function panWith(dx, dy) {
      if (player.climb) return;   // up a tree you walk with the keys / stick only
      turn = null;
      var m = C.panByPixels({ x: player.x, z: player.z, dist: state.dist, yaw: state.yaw, pitch: state.pitch }, dx, dy, viewH(), B);
      player = SA.climb.step({ x: m.x, z: m.z, heading: player.heading }, {}, 0, obstacles());
    }
    /** Climb up when next to a tree, down when up one (the climb button, Space and C). Returns the new prompt. */
    function toggleClimb() {
      player = SA.climb.toggle(player, trees());
      return SA.climb.prompt(player, trees());
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
        else if (p.mode === 'pan') panWith(dx, dy);
      } else if (n === 2) {
        p.x = e.clientX; p.y = e.clientY;
        var d = spread(), m = midpoint();
        if (pinchDist > 0 && d > 0) state = C.zoomByScale(state, d / pinchDist, B);
        if (mid) panWith(m.x - mid.x, m.y - mid.y);
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
      state = C.zoomByWheel(state, e.deltaY, B);
    }
    function isKey(k) { return KEYS[k] || ORBIT_KEYS[k]; }
    // Shift (either side) = run. Holding it turns "w" into "W", so letters are stored lower-case: releasing Shift before
    // the letter must not leave the old key stuck. Shift itself does nothing else (the key event is left alone).
    function keyOf(k) { return k && k.length === 1 ? k.toLowerCase() : k; }
    // Space hops (Shift+Space too: a running jump). A focused button/input keeps its own Space; Ctrl/Meta/Alt combos are not ours.
    function isSpace(e) { return !!e && (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space'); }
    function isJumpKey(e) {
      if (!isSpace(e) || e.ctrlKey || e.metaKey || e.altKey) return false;
      var t = e.target && e.target.tagName;
      return !(t === 'BUTTON' || t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || t === 'A');
    }
    function onKeyDown(e) {
      run = !!e.shiftKey;
      if (isJumpKey(e)) { e.preventDefault(); jumpHeld = true; if (hop && !e.repeat && !hop.air) hop.armed = true; return; }   // a fresh press (not key auto-repeat) re-arms on the ground   // preventDefault: Space must not scroll the page
      // C climbs up when next to a tree and down when up one (E / Enter go through SA.spaceUse); otherwise it does nothing here.
      if ((e.key === 'c' || e.key === 'C') &&!e.ctrlKey && !e.metaKey && !e.altKey && SA.climb.prompt(player, trees())) {
        e.preventDefault();
        if (!e.repeat) toggleClimb();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || !isKey(e.key)) return;
      held[keyOf(e.key)] = true; e.preventDefault();
    }
    function onKeyUp(e) {
      if (isSpace(e)) jumpHeld = false;
      run = !!e.shiftKey; delete held[keyOf(e.key)];
    }

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('blur', function () { held = {}; run = false; jumpHeld = false; pointers = {}; padYaw = 0; padPitch = 0; stickX = 0; stickY = 0; });

    return {
      /** Call once per frame (dt in seconds). */
      update: function (dt) {
        var ax = 0, az = 0, ayaw = 0, apitch = 0;
        Object.keys(held).forEach(function (k) {
          if (KEYS[k]) { ax += KEYS[k][0]; az += KEYS[k][1]; } else { ayaw += ORBIT_KEYS[k][0]; apitch += ORBIT_KEYS[k][1]; }
        });
        ayaw += padYaw; apitch += padPitch;
        if (ayaw || apitch) orbitWith(function (s) { return C.orbitByKeys(s, ayaw, apitch, dt, B); });
        var before = player, obs = obstacles();   // one list per frame: walking, the hop's landing surface and the camera share it
        var J = SA.joystick ? SA.joystick.toInput({ x: stickX, y: stickY }) : { forward: 0, back: 0, left: 0, right: 0, run: false };
        if (turn) {   // the eased glideTo turn: walking input (or a climb) hands control straight back, from the current heading
          if (ax || az || J.forward || J.back || J.left || J.right || player.climb) turn = null;
          else {
            var tr = SA.turn.step(turn, dt);
            player = { x: player.x, z: player.z, heading: tr.heading, y: player.y, climb: player.climb };
            turn = tr.done ? null : tr.turn;
          }
        }
        var running = (run && az < 0) || !!J.run;   // Shift only speeds up walking forward; the stick runs at its edge
        var walk = { forward: (az < 0 ? 1 : 0) + J.forward, back: (az > 0 ? 1 : 0) + J.back,
          left: (ax < 0 ? 1 : 0) + J.left, right: (ax > 0 ? 1 : 0) + J.right, run: running, lift: hop ? hop.lift : 0 };
        player = SA.climb.step(player, walk, dt, obs);
        if (SA.climb.autoStep) {   // pushing forward into a trunk for 0.6 s starts the same climb as C / E
          autoTimer = SA.climb.autoStep(autoTimer, before, player, walk, trees(), dt * 1000);
          if (autoTimer.climb) { player = SA.climb.start(player, autoTimer.tree); autoTimer = null; }
        }
        if (SA.prick && !player.climb) {   // a cactus bounces the player back (AS-0156): walking is overridden for ~0.25 s
          var pricklies = hooks && hooks.chase && hooks.chase.pricklies ? hooks.chase.pricklies() : [];
          prick = SA.prick.step(prick, player, pricklies, obs, dt);
          if (prick.active) player = { x: prick.x, z: prick.z, heading: player.heading, y: player.y, climb: player.climb };
          if (prick.ouch) {
            if (SA.audio && SA.audio.sfx) SA.audio.sfx(SA.prick.OUCH_SFX);
            if (SA.audio && SA.audio.say) { try { SA.audio.say(SA.prick.OUCH_KEY); } catch (e) { /* speech is best effort */ } }
          }
        }
        if (hop) {   // the hop is a lift on top of the standing height (ground or canopy); none during the climb up/down animation
          hop = climbing() ? SA.jump.cancel(hop) : SA.jump.step(hop, { jump: jumpHeld || jumpTap }, dt, true,
            player.climb ? 0 : SA.player.floorAt(player.x, player.z, obs, hop.lift));   // lands / stands on a low rock
          jumpTap = false;
          if (hop.event === 'takeoff' && SA.audio && SA.audio.sfx) SA.audio.sfx('hop');
        }
        camY += (player.y - camY) * (1 - Math.exp(-5 * Math.min(dt, 0.1)));
        moving = Math.hypot(player.x - before.x, player.z - before.z) > 1e-4 || player.heading !== before.heading;
        isRunning = moving && running;
        offset = C.decayOffset(offset, az < 0 || J.forward > 0, dt);
        state = C.chaseFollow(state, player, offset, dt, B);
        // Automatic framing: perched animals above / being up a canopy pull the camera back and tilt it up; a drag or the
        // orbit keys override it (the offsets ease to 0), then it eases back in. Open ground eases to the normal chase view.
        if (C.frameAbove) {
          var dragging = !!(ayaw || apitch) || ids().some(function (k) { return pointers[k].moved && pointers[k].mode === 'orbit'; });
          var above = hooks && hooks.chase && hooks.chase.above ? hooks.chase.above() : [];
          frame = C.easeFrame(frame, dragging ? C.NO_FRAME : C.frameAbove(player, above), dt, 6);
        }
        var want = C.position(framed()), full = Math.hypot(want.x - player.x, want.z - player.z);
        var kept = full > 1e-6 ? C.clearPath(player, want, player.climb ? [] : obs) / full : 1;   // up a tree: nothing in the way
        clearK = C.easeClearance(clearK, kept, dt);
        apply();
      },
      /** The avatar's { x, z, y, heading, climb } (climb: null | 'up' | 'canopy' | 'down'), whether it moved this frame, and the
       *  hop: `lift` (height above y; y itself, which SA.reach uses, never includes it) and `jump` ('takeoff' | 'land' | null). */
      getPlayer: function () {
        return { x: player.x, z: player.z, y: player.y || 0, heading: player.heading, moving: moving, running: isRunning,
          climb: player.climb ? player.climb.mode : null, lift: (hop ? hop.lift : 0) + prick.lift, hurt: prick.hurt, jump: hop ? hop.event : null };
      },
      /** 'up' | 'down' | null: which climb button to show right now (the icon-only UI polls this each frame). */
      climbPrompt: function () { return SA.climb.prompt(player, trees()); },
      toggleClimb: toggleClimb,
      /** { tree, progress 0..1 } while the player pushes into a climbable trunk (the filling ring), else null. */
      autoClimb: function () { return autoTimer && autoTimer.tree && autoTimer.progress > 0 ? { tree: autoTimer.tree, progress: autoTimer.progress } : null; },
      /** The touch jump button: a fresh Space press. Only a grounded avatar hops (no buffering in the air, none up a tree). */
      jump: function () {
        if (!hop || hop.air || climbing()) return false;
        hop = { lift: hop.lift, vy: hop.vy, air: false, armed: true, event: hop.event };
        jumpTap = true;
        return true;
      },
      /** Climb a specific tree (the one Space chose); no-op when out of range or already up a tree. */
      climbTree: function (tree) { player = SA.climb.start(player, tree); },
      /** On-screen buttons hold yaw/pitch axes (-1, 0, 1); update() runs them through the same clamped orbitByKeys path as the keys. */
      setOrbitAxes: function (yaw, pitch) { padYaw = yaw > 0 ? 1 : yaw < 0 ? -1 : 0; padPitch = pitch > 0 ? 1 : pitch < 0 ? -1 : 0; },
      /** The on-screen joystick (unit disc, +y down). update() feeds it to SA.player.step with the keys. */
      setStick: function (x, y) {
        var c = function (v) { return typeof v === 'number' && isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; };
        stickX = c(x); stickY = c(y);
      },
      /** Turn the player toward a ground point (hint arrow, easter-egg reveal); the chase camera swings round with
       *  them. The camera never leaves the player. */
      glideTo: function (x, z) {
        if (isFinite(x) && isFinite(z)) {
          var aim = Math.atan2(x - player.x, z - player.z);
          if (SA.turn && !player.climb) turn = SA.turn.start(player.heading, aim);   // ease over ~300 ms, the short way round
          else player = { x: player.x, z: player.z, heading: aim, y: player.y, climb: player.climb };
        }
        offset = 0;
      },
      getState: function () {
        // lookY: the chase camera looks at about animal height, not the ground
        var e = framed();
        return { x: e.x, z: e.z, dist: e.dist, yaw: e.yaw, pitch: e.pitch, lookY: C.DEFAULTS.lookY + frame.addLookY };
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
