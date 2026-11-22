/* SA.camera: pure camera math (no THREE, no DOM). State is a plain { x, z, dist, yaw, pitch } object:
 * the ground point the camera looks at, its distance, and the orbit angles in degrees (yaw 0 = camera
 * "south" of the target; pitch = elevation above the ground, from minPitch (near-horizontal, so feet and
 * underside show) up to maxPitch (almost top-down)). All functions return NEW state objects and always
 * clamp to the map, zoom limits and pitch range, whatever (even non-finite) numbers they are given.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var DEFAULTS = {
    minDist: 4, maxDist: 55, tiltDeg: 55, fovDeg: 45, keySpeed: 0.9, wheelK: 0.0012,
    minPitch: 10, maxPitch: 89, yawPerPx: 0.3, pitchPerPx: 0.2, yawKeySpeed: 90, pitchKeySpeed: 45,
    // Third-person chase camera: a few metres behind and slightly above the player, looking ahead at animal height.
    chaseDist: 7, chasePitch: 16, lookAhead: 3, lookY: 1, followRate: 8, turnRate: 6, offsetDecay: 1.5,
  };
  var RAD = Math.PI / 180;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function finite(v, fallback) { return typeof v === 'number' && isFinite(v) ? v : fallback; }

  /** Yaw wrapped into (-180, 180]; non-finite input gives 0. */
  function wrapYaw(deg) {
    var w = finite(deg, 0) % 360;
    if (w > 180) w -= 360;
    else if (w <= -180) w += 360;
    return w;
  }

  /** Pitch clamped to [minPitch, maxPitch]; non-finite input gives the default tilt. */
  function clampPitch(deg, o) {
    o = o || DEFAULTS;
    if (typeof deg !== 'number' || deg !== deg) deg = o.tiltDeg;   // NaN / junk -> default; +-Infinity clamps
    return clamp(deg, o.minPitch, o.maxPitch);
  }

  /** Pure orbit clamp: any yaw/pitch in, a valid { yaw, pitch } out. */
  function clampOrbit(yaw, pitch, o) { return { yaw: wrapYaw(yaw), pitch: clampPitch(pitch, o) }; }

  function clampState(s, bounds, o) {
    o = o || DEFAULTS;
    var orbit = clampOrbit(s.yaw, s.pitch, o);
    return {
      x: clamp(finite(s.x, 0), bounds.minX, bounds.maxX),
      z: clamp(finite(s.z, 0), bounds.minZ, bounds.maxZ),
      dist: clamp(finite(s.dist, o.maxDist), o.minDist, o.maxDist),
      yaw: orbit.yaw,
      pitch: orbit.pitch,
    };
  }

  /** Rotate a screen-relative ground move (right, down) into world x/z for the current yaw. */
  function groundMove(s, right, down) {
    var y = finite(s.yaw, 0) * RAD, c = Math.cos(y), n = Math.sin(y);
    // position() puts the camera at (sin yaw, cos yaw): screen-right is (cos, -sin), screen-down is (sin, cos).
    return { x: right * c + down * n, z: -right * n + down * c };
  }

  function moved(s, x, z, dist) { return { x: x, z: z, dist: dist, yaw: s.yaw, pitch: s.pitch }; }

  /** World units covered by one screen pixel (horizontally) at this distance. */
  function worldPerPixel(dist, fovDeg, viewH) {
    return (2 * dist * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(1, viewH);
  }

  /** Pan (two-finger or shift/right drag): the ground follows the pointer. dx, dy are pixels moved. */
  function panByPixels(s, dx, dy, viewH, bounds, o) {
    o = o || DEFAULTS;
    var wpp = worldPerPixel(s.dist, o.fovDeg, viewH);
    var sinT = Math.max(0.35, Math.sin(clampPitch(s.pitch, o) * RAD));   // cap vertical-pan speed-up (~2.9x) at low angles
    var m = groundMove(s, -dx * wpp, -(dy * wpp) / sinT);
    return clampState(moved(s, s.x + m.x, s.z + m.z, s.dist), bounds, o);
  }

  /** Keyboard pan. ax: +1 right / -1 left; az: +1 down (toward viewer) / -1 up. Follows the yaw. dt in seconds. */
  function panByKeys(s, ax, az, dt, bounds, o) {
    o = o || DEFAULTS;
    var len = Math.sqrt(ax * ax + az * az);
    if (!len) return clampState(s, bounds, o);
    var step = o.keySpeed * s.dist * dt;
    var m = groundMove(s, (ax / len) * step, (az / len) * step);
    return clampState(moved(s, s.x + m.x, s.z + m.z, s.dist), bounds, o);
  }

  /** Drag orbit: dragging right swings the view right (yaw); dragging down looks more from above (pitch). */
  function orbitByPixels(s, dx, dy, bounds, o) {
    o = o || DEFAULTS;
    return clampState({ x: s.x, z: s.z, dist: s.dist, yaw: finite(s.yaw, 0) - finite(dx, 0) * o.yawPerPx,
      pitch: clampPitch(s.pitch, o) + finite(dy, 0) * o.pitchPerPx }, bounds, o);
  }

  /** Keyboard orbit (Q/E, R/F). ayaw: +1 = E / -1 = Q; apitch: +1 = R (higher) / -1 = F (lower). */
  function orbitByKeys(s, ayaw, apitch, dt, bounds, o) {
    o = o || DEFAULTS;
    return clampState({ x: s.x, z: s.z, dist: s.dist, yaw: finite(s.yaw, 0) - finite(ayaw, 0) * o.yawKeySpeed * dt,
      pitch: clampPitch(s.pitch, o) + finite(apitch, 0) * o.pitchKeySpeed * dt }, bounds, o);
  }

  /** Mouse wheel: deltaY > 0 zooms out. */
  function zoomByWheel(s, deltaY, bounds, o) {
    o = o || DEFAULTS;
    return clampState(moved(s, s.x, s.z, s.dist * Math.exp(deltaY * o.wheelK)), bounds, o);
  }

  /** Pinch: scale > 1 means fingers moved apart, so zoom in. */
  function zoomByScale(s, scale, bounds, o) {
    o = o || DEFAULTS;
    if (!(scale > 0)) return clampState(s, bounds, o);
    return clampState(moved(s, s.x, s.z, s.dist / scale), bounds, o);
  }

  /** Where the camera sits for a state (it looks at { x, 0, z }). */
  function position(s, o) {
    o = o || DEFAULTS;
    var t = clampPitch(s.pitch, o) * RAD, y = finite(s.yaw, 0) * RAD, h = s.dist * Math.cos(t);
    return { x: s.x + h * Math.sin(y), y: s.dist * Math.sin(t), z: s.z + h * Math.cos(y) };
  }

  /** Frame-rate independent ease of the state toward `target` ({x,z,dist}); rate ~4 settles in about a second. */
  function easeToward(s, target, dt, rate, bounds, o) {
    var k = 1 - Math.exp(-(rate || 4) * Math.max(0, dt));
    return clampState(moved(s, s.x + (target.x - s.x) * k, s.z + (target.z - s.z) * k,
      s.dist + (target.dist - s.dist) * k), bounds, o);
  }

  /** Shortest-way ease of an angle (degrees) toward `target`; frame-rate independent. */
  function easeAngle(cur, target, dt, rate) {
    var k = 1 - Math.exp(-(rate || 6) * Math.max(0, finite(dt, 0)));
    return wrapYaw(finite(cur, 0) + wrapYaw(finite(target, 0) - finite(cur, 0)) * k);
  }

  /** Where a chase camera wants to look for player { x, z, heading (rad) }: a point ahead of them, seen from behind
   * (yaw = heading + 180 deg) plus the player's swing `offset` in degrees (Q/E, drag). Returns { x, z, yaw }. */
  function chaseTarget(p, offset, o) {
    o = o || DEFAULTS;
    var h = finite(p.heading, 0);
    return { x: finite(p.x, 0) + Math.sin(h) * o.lookAhead, z: finite(p.z, 0) + Math.cos(h) * o.lookAhead,
      yaw: wrapYaw(h / RAD + 180 + finite(offset, 0)) };
  }

  /** Camera state sitting exactly behind the player (no easing): used at start-up. */
  function chaseStart(p, bounds, o) {
    o = o || DEFAULTS;
    var t = chaseTarget(p, 0, o);
    return clampState({ x: t.x, z: t.z, dist: o.chaseDist, yaw: t.yaw, pitch: o.chasePitch }, bounds, o);
  }

  /** One smoothing step of the chase camera toward the player; keeps the current dist and pitch. */
  function chaseFollow(s, p, offset, dt, bounds, o) {
    o = o || DEFAULTS;
    var t = chaseTarget(p, offset, o), k = 1 - Math.exp(-o.followRate * Math.max(0, finite(dt, 0)));
    return clampState({ x: s.x + (t.x - s.x) * k, z: s.z + (t.z - s.z) * k, dist: s.dist,
      yaw: easeAngle(s.yaw, t.yaw, dt, o.turnRate), pitch: s.pitch }, bounds, o);
  }

  /** Swing offset (degrees) drifts back behind the player while they walk, and is kept as-is while they stand. */
  function decayOffset(offset, moving, dt, o) {
    o = o || DEFAULTS;
    var w = wrapYaw(offset);
    return moving ? wrapYaw(w * Math.exp(-o.offsetDecay * Math.max(0, finite(dt, 0)))) : w;
  }

  SA.camera = {
    easeAngle: easeAngle, chaseTarget: chaseTarget, chaseStart: chaseStart, chaseFollow: chaseFollow, decayOffset: decayOffset,
    easeToward: easeToward, DEFAULTS: DEFAULTS, clampState: clampState, worldPerPixel: worldPerPixel, panByPixels: panByPixels,
    panByKeys: panByKeys, orbitByPixels: orbitByPixels, orbitByKeys: orbitByKeys, clampOrbit: clampOrbit,
    wrapYaw: wrapYaw, clampPitch: clampPitch, zoomByWheel: zoomByWheel, zoomByScale: zoomByScale, position: position,
  };
})(typeof window !== 'undefined' ? window : globalThis);
