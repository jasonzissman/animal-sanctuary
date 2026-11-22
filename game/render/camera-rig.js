/* SA.render.createCameraRig(THREE, canvas, camera): input -> SA.camera math -> THREE camera.
 * Pointer events cover mouse AND touch: one pointer drags (pan), two pointers pinch (zoom).
 * Arrows/WASD pan, wheel zooms. Everything is clamped inside the map by SA.camera.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var KEYS = {
    ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
  };

  SA.render.createCameraRig = function (THREE, canvas, camera, initial) {
    var C = SA.camera, B = SA.map.BOUNDS;
    var state = C.clampState(initial || { x: 0, z: 5, dist: 40 }, B);
    var pointers = {};            // id -> { x, y }
    var held = {};                // key -> true
    var pinchDist = 0;
    var focus = null;             // { x, z, dist }: while set the camera eases there and drags/zoom are ignored

    function viewH() { return canvas.clientHeight || 600; }
    function ids() { return Object.keys(pointers); }
    function spread() {
      var k = ids(), a = pointers[k[0]], b = pointers[k[1]];
      return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    }

    function apply() {
      var p = C.position(state);
      camera.position.set(p.x, p.y, p.z);
      camera.lookAt(state.x, 0, state.z);
    }

    function onDown(e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      if (ids().length === 2) pinchDist = spread();
    }
    function onMove(e) {
      var p = pointers[e.pointerId];
      if (!p || focus) return;
      var n = ids().length;
      if (n === 1) {
        state = C.panByPixels(state, e.clientX - p.x, e.clientY - p.y, viewH(), B);
        p.x = e.clientX; p.y = e.clientY;
      } else if (n === 2) {
        p.x = e.clientX; p.y = e.clientY;
        var d = spread();
        if (pinchDist > 0 && d > 0) state = C.zoomByScale(state, d / pinchDist, B);
        pinchDist = d;
      }
    }
    function onUp(e) {
      delete pointers[e.pointerId];
      pinchDist = ids().length === 2 ? spread() : 0;
    }
    function onWheel(e) {
      e.preventDefault();
      if (focus) return;
      state = C.zoomByWheel(state, e.deltaY, B);
    }
    function onKeyDown(e) { if (KEYS[e.key]) { held[e.key] = true; e.preventDefault(); } }
    function onKeyUp(e) { delete held[e.key]; }

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('blur', function () { held = {}; pointers = {}; });

    return {
      /** Call once per frame (dt in seconds). */
      update: function (dt) {
        var ax = 0, az = 0;
        Object.keys(held).forEach(function (k) { ax += KEYS[k][0]; az += KEYS[k][1]; });
        if (focus) state = C.easeToward(state, focus, dt, 4, B);
        else if (ax || az) state = C.panByKeys(state, ax, az, dt, B);
        apply();
      },
      /** Ease in on a ground point (care tasks); drags are ignored until release(). */
      focusOn: function (x, z, dist) { focus = C.clampState({ x: x, z: z, dist: dist }, B); },
      release: function () { focus = null; },
      getState: function () { return { x: state.x, z: state.z, dist: state.dist }; },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
