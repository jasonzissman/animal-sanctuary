/* SA.player: pure walking model for the kid avatar (no THREE, no DOM; node:vm tested). Needs SA.map (BOUNDS).
 *
 *   SA.player.spawn()                 -> { x, z, heading } in the first biome (bosque), on dry land
 *   SA.player.step(state, input, dt, obstacles?) -> new state (the input state is never mutated)
 *     state     { x, z, heading }  heading in radians; forward = (sin heading, cos heading) on the (x, z) plane, so a
 *               chase camera behind the player uses yaw = heading + PI (see SA.camera: camera sits at +(sin yaw, cos yaw))
 *     input     { forward, back, left, right, strafe? }  numbers/booleans (any truthy or +/-1 axis value); W/Up = forward,
 *               S/Down = back. left/right TURN the player; with strafe: true they side-step instead.
 *               run: true moves forward at RUN_SPEED instead of SPEED (backing up stays at BACK_SPEED).
 *     dt        seconds (clamped to 0.1 so a stalled tab cannot teleport the player)
 *     obstacles [[x, z, radius], ...] circles for animals and placed props (same shape as SA.propAvoid.points)
 * Obstacles push the player out along the line from their centre (so walking into one slides around it) and the
 * result is clamped to SA.map.BOUNDS. Never stuck: if the player starts overlapping obstacles (wedged between two trees
 * and an animal) and the plain push-out would pin them in place, they may still move so they do not go deeper into
 * any overlapped obstacle (walk away or slide), and as a last resort when wedged by 2+ obstacles those are ignored
 * until the player is clear of them. Nothing is persisted.
 *
 * Terrain never blocks (AS-0109): the player walks on any ground, dips and water included (they wade, and the avatar may
 * sink below the surface for a moment; heightAt is the floor and SA.map.cameraHeight keeps the camera above the water).
 *
 *   SA.player.heightAt(x, z)           terrain height under the feet (SA.map.groundHeight); SA.climb.step eases y toward it
 *   SA.player.SPAWN_CLEAR             radius (world units) around the spawn kept free of decor and animals
 *   SA.player.inSpawnZone(x, z, pad?)  true when (x, z) is within SPAWN_CLEAR + pad of the spawn
 *   SA.player.spawnZone()              [x, z, SPAWN_CLEAR] avoid point (same shape as SA.propAvoid.points)
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SPEED = 4;          // world units / second: a brisk kid-friendly walk
  var RUN_SPEED = 7;      // while input.run (Shift held / joystick at its edge): about 1.8x SPEED
  var BACK_SPEED = 2.4;   // backing up is slower (and never faster, even while running)
  var TURN_RATE = 2.4;    // radians / second
  var RADIUS = 0.6;       // player body circle, added to each obstacle radius
  var MAX_DT = 0.1;
  var EDGE = 0.5;         // stay this far inside the map bounds
  var SPAWN_CLEAR = 5;    // nothing seeded (decor, animals) within this distance of the spawn at load
  var SLACK = 0.02;       // overlap smaller than this is just float noise from the last push-out
  var SPAWN = { x: -9, z: 14, heading: Math.PI };   // bosque, dry land, facing the map centre (-z)

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function axis(v) { return typeof v === 'number' ? Math.max(-1, Math.min(1, num(v, 0))) : v ? 1 : 0; }

  function clampToMap(p) {
    var B = SA.map.BOUNDS;
    p.x = Math.max(B.minX + EDGE, Math.min(B.maxX - EDGE, p.x));
    p.z = Math.max(B.minZ + EDGE, Math.min(B.maxZ - EDGE, p.z));
  }

  function valid(o) { return o && isFinite(o[0]) && isFinite(o[1]) && o[2] > 0; }

  /**
   * Push p out of every overlapping circle (a few passes, since pushes can overlap or hit the map edge).
   * floors (optional, indexed like obstacles): a smaller keep-out distance for that obstacle (0 ignores it).
   */
  function pushOut(p, obstacles, fx, fz, floors) {
    for (var pass = 0; pass < 4; pass++) {
      var moved = false;
      for (var i = 0; i < obstacles.length; i++) {
        var o = obstacles[i];
        if (!valid(o)) continue;
        var dx = p.x - o[0], dz = p.z - o[1], min = o[2] + RADIUS, d2 = dx * dx + dz * dz;
        if (floors && floors[i] !== undefined) min = Math.min(min, floors[i]);
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

  /** Where the player ends up after moving to `moved` from `start`; never pinned inside overlapped obstacles. */
  function resolve(start, moved, obstacles, fx, fz) {
    var p = { x: moved.x, z: moved.z };
    pushOut(p, obstacles, fx, fz);
    var ix = moved.x - start.x, iz = moved.z - start.z, want = ix * ix + iz * iz;
    if (want < 1e-12) return p;
    var inside = [];   // obstacles the player already overlapped before moving
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (valid(o) && Math.hypot(start.x - o[0], start.z - o[1]) < o[2] + RADIUS - SLACK) inside.push(i);
    }
    if (!inside.length) return p;
    var stuck = function (q) { return ((q.x - start.x) * ix + (q.z - start.z) * iz) / want < 0.25; };
    if (!stuck(p)) return p;
    // 1) Do not get deeper into what we overlap, but allow walking away / sliding along it.
    var floors = [];
    inside.forEach(function (k) { floors[k] = Math.hypot(start.x - obstacles[k][0], start.z - obstacles[k][1]); });
    var q = { x: moved.x, z: moved.z };
    pushOut(q, obstacles, fx, fz, floors);
    if (!stuck(q) || inside.length < 2) return q;
    // 2) Wedged between several: ignore them until clear (each pushes again once we are outside its circle).
    floors = [];
    inside.forEach(function (k) { floors[k] = 0; });
    q = { x: moved.x, z: moved.z };
    pushOut(q, obstacles, fx, fz, floors);
    return q;
  }

  /** Terrain height under the player's feet at (x, z): the single source is SA.map.groundHeight. */
  function heightAt(x, z) { return SA.map.groundHeight(x, z); }

  function step(state, input, dt, obstacles) {
    state = state || SPAWN;
    input = input || {};
    var h = num(state.heading, 0), p = { x: num(state.x, SPAWN.x), z: num(state.z, SPAWN.z) };
    dt = Math.max(0, Math.min(MAX_DT, num(dt, 0)));
    var p0 = { x: p.x, z: p.z };
    var fwd = axis(input.forward) - axis(input.back), side = axis(input.right) - axis(input.left);
    var fx = Math.sin(h), fz = Math.cos(h);
    if (input.strafe) {
      // Seen from behind the player, right = (-cos h, sin h) = (-fz, fx) (heading 0 faces +z, so right is -x).
      var sv = input.run ? RUN_SPEED : SPEED;
      p.x += (-fz * side) * sv * dt; p.z += (fx * side) * sv * dt;
    } else {
      h -= side * TURN_RATE * dt;   // right = clockwise seen from above = decreasing heading
      fx = Math.sin(h); fz = Math.cos(h);
    }
    var v = fwd > 0 ? (input.run ? RUN_SPEED : SPEED) : BACK_SPEED;   // run only speeds up going forward
    p.x += fx * fwd * v * dt;
    p.z += fz * fwd * v * dt;
    clampToMap(p);
    p = resolve(p0, p, obstacles || [], fx, fz);   // only solid obstacles and the map edge stop the player; water and dips never do
    var TAU = Math.PI * 2;
    h = h - TAU * Math.floor(h / TAU);   // keep heading in [0, 2π)
    return { x: p.x, z: p.z, heading: h };
  }

  function spawn() { return { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading }; }
  function inSpawnZone(x, z, pad) { return Math.hypot(x - SPAWN.x, z - SPAWN.z) < SPAWN_CLEAR + (pad || 0); }
  function spawnZone() { return [SPAWN.x, SPAWN.z, SPAWN_CLEAR]; }

  SA.player = { step: step, heightAt: heightAt, spawn: spawn, SPEED: SPEED, RUN_SPEED: RUN_SPEED, BACK_SPEED: BACK_SPEED, TURN_RATE: TURN_RATE, RADIUS: RADIUS,
    SPAWN_CLEAR: SPAWN_CLEAR, inSpawnZone: inSpawnZone, spawnZone: spawnZone };
})(typeof window !== 'undefined' ? window : globalThis);
