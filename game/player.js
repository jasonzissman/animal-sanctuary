/* SA.player: pure walking model for the kid avatar (no THREE, no DOM; node:vm tested). Needs SA.map (BOUNDS).
 *
 *   SA.player.spawn()                 -> { x, z, heading } in the first biome (bosque), on dry land
 *   SA.player.step(state, input, dt, obstacles?) -> new state (the input state is never mutated)
 *     state     { x, z, heading }  heading in radians; forward = (sin heading, cos heading) on the (x, z) plane, so a
 *               chase camera behind the player uses yaw = heading + PI (see SA.camera: camera sits at +(sin yaw, cos yaw))
 *     input     { forward, back, left, right, strafe? }  numbers/booleans (any truthy or +/-1 axis value); W/Up = forward,
 *               S/Down = back. left/right TURN the player; with strafe: true they side-step instead.
 *     dt        seconds (clamped to 0.1 so a stalled tab cannot teleport the player)
 *     obstacles [[x, z, radius], ...] circles for animals and placed props (same shape as SA.propAvoid.points)
 * Obstacles push the player out along the line from their centre (so walking into one slides around it) and the
 * result is clamped to SA.map.BOUNDS, so the player can never get stuck. Nothing is persisted.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SPEED = 4;          // world units / second: a brisk kid-friendly walk
  var BACK_SPEED = 2.4;   // backing up is slower
  var TURN_RATE = 2.4;    // radians / second
  var RADIUS = 0.6;       // player body circle, added to each obstacle radius
  var MAX_DT = 0.1;
  var EDGE = 0.5;         // stay this far inside the map bounds
  var SPAWN = { x: -9, z: 14, heading: Math.PI };   // bosque, dry land, facing the map centre (-z)

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function axis(v) { return typeof v === 'number' ? Math.max(-1, Math.min(1, num(v, 0))) : v ? 1 : 0; }

  function clampToMap(p) {
    var B = SA.map.BOUNDS;
    p.x = Math.max(B.minX + EDGE, Math.min(B.maxX - EDGE, p.x));
    p.z = Math.max(B.minZ + EDGE, Math.min(B.maxZ - EDGE, p.z));
  }

  /** Push p out of every overlapping circle (a few passes, since pushes can overlap or hit the map edge). */
  function pushOut(p, obstacles, fx, fz) {
    for (var pass = 0; pass < 4; pass++) {
      var moved = false;
      for (var i = 0; i < obstacles.length; i++) {
        var o = obstacles[i];
        if (!o || !isFinite(o[0]) || !isFinite(o[1]) || !(o[2] > 0)) continue;
        var dx = p.x - o[0], dz = p.z - o[1], min = o[2] + RADIUS, d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        var d = Math.sqrt(d2);
        if (d < 1e-6) { dx = -fx; dz = -fz; d = 1; }   // dead centre: step back out the way we came
        p.x = o[0] + (dx / d) * min;
        p.z = o[1] + (dz / d) * min;
        moved = true;
      }
      clampToMap(p);
      if (!moved) break;
    }
  }

  function step(state, input, dt, obstacles) {
    state = state || SPAWN;
    input = input || {};
    var h = num(state.heading, 0), p = { x: num(state.x, SPAWN.x), z: num(state.z, SPAWN.z) };
    dt = Math.max(0, Math.min(MAX_DT, num(dt, 0)));
    var fwd = axis(input.forward) - axis(input.back), side = axis(input.right) - axis(input.left);
    var fx = Math.sin(h), fz = Math.cos(h);
    if (input.strafe) {
      // Seen from behind the player, right = (-cos h, sin h) = (-fz, fx) (heading 0 faces +z, so right is -x).
      p.x += (-fz * side) * SPEED * dt; p.z += (fx * side) * SPEED * dt;
    } else {
      h -= side * TURN_RATE * dt;   // right = clockwise seen from above = decreasing heading
      fx = Math.sin(h); fz = Math.cos(h);
    }
    var v = fwd > 0 ? SPEED : BACK_SPEED;
    p.x += fx * fwd * v * dt;
    p.z += fz * fwd * v * dt;
    clampToMap(p);
    pushOut(p, obstacles || [], fx, fz);
    var TAU = Math.PI * 2;
    h = h - TAU * Math.floor(h / TAU);   // keep heading in [0, 2π)
    return { x: p.x, z: p.z, heading: h };
  }

  function spawn() { return { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading }; }

  SA.player = { step: step, spawn: spawn, SPEED: SPEED, BACK_SPEED: BACK_SPEED, TURN_RATE: TURN_RATE, RADIUS: RADIUS };
})(typeof window !== 'undefined' ? window : globalThis);
