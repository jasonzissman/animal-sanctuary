/* SA.camera: pure camera math (no THREE, no DOM). State is a plain { x, z, dist } object:
 * the ground point the camera looks at plus its distance. The camera sits "south" of the target at a
 * fixed tilt. All functions return NEW state objects and always clamp to the map and zoom limits.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var DEFAULTS = { minDist: 14, maxDist: 55, tiltDeg: 55, fovDeg: 45, keySpeed: 0.9, wheelK: 0.0012 };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function clampState(s, bounds, o) {
    o = o || DEFAULTS;
    return {
      x: clamp(s.x, bounds.minX, bounds.maxX),
      z: clamp(s.z, bounds.minZ, bounds.maxZ),
      dist: clamp(s.dist, o.minDist, o.maxDist),
    };
  }

  /** World units covered by one screen pixel (horizontally) at this distance. */
  function worldPerPixel(dist, fovDeg, viewH) {
    return (2 * dist * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(1, viewH);
  }

  /** Drag/touch pan: the ground follows the pointer. dx, dy are pointer movement in pixels. */
  function panByPixels(s, dx, dy, viewH, bounds, o) {
    o = o || DEFAULTS;
    var wpp = worldPerPixel(s.dist, o.fovDeg, viewH);
    var sinT = Math.sin((o.tiltDeg * Math.PI) / 180);
    return clampState({ x: s.x - dx * wpp, z: s.z - (dy * wpp) / sinT, dist: s.dist }, bounds, o);
  }

  /** Keyboard pan. ax: +1 right / -1 left; az: +1 down (toward viewer) / -1 up. dt in seconds. */
  function panByKeys(s, ax, az, dt, bounds, o) {
    o = o || DEFAULTS;
    var len = Math.sqrt(ax * ax + az * az);
    if (!len) return clampState(s, bounds, o);
    var step = o.keySpeed * s.dist * dt;
    return clampState({ x: s.x + (ax / len) * step, z: s.z + (az / len) * step, dist: s.dist }, bounds, o);
  }

  /** Mouse wheel: deltaY > 0 zooms out. */
  function zoomByWheel(s, deltaY, bounds, o) {
    o = o || DEFAULTS;
    return clampState({ x: s.x, z: s.z, dist: s.dist * Math.exp(deltaY * o.wheelK) }, bounds, o);
  }

  /** Pinch: scale > 1 means fingers moved apart, so zoom in. */
  function zoomByScale(s, scale, bounds, o) {
    o = o || DEFAULTS;
    if (!(scale > 0)) return clampState(s, bounds, o);
    return clampState({ x: s.x, z: s.z, dist: s.dist / scale }, bounds, o);
  }

  /** Where the camera sits for a state (it looks at { x, 0, z }). */
  function position(s, o) {
    o = o || DEFAULTS;
    var t = (o.tiltDeg * Math.PI) / 180;
    return { x: s.x, y: s.dist * Math.sin(t), z: s.z + s.dist * Math.cos(t) };
  }

  /** Frame-rate independent ease of the state toward `target` ({x,z,dist}); rate ~4 settles in about a second. */
  function easeToward(s, target, dt, rate, bounds, o) {
    var k = 1 - Math.exp(-(rate || 4) * Math.max(0, dt));
    return clampState({ x: s.x + (target.x - s.x) * k, z: s.z + (target.z - s.z) * k,
      dist: s.dist + (target.dist - s.dist) * k }, bounds, o);
  }

  SA.camera = {
    easeToward: easeToward, DEFAULTS: DEFAULTS, clampState: clampState, worldPerPixel: worldPerPixel, panByPixels: panByPixels,
    panByKeys: panByKeys, zoomByWheel: zoomByWheel, zoomByScale: zoomByScale, position: position,
  };
})(typeof window !== 'undefined' ? window : globalThis);
