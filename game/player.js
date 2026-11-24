/* SA.player: pure walking model for the kid avatar (no THREE, no DOM; node:vm tested). Needs SA.map (BOUNDS).
 *
 *   SA.player.spawn()                 -> { x, z, heading } in the first biome (bosque), on dry land; just outside the
 *                                        research station's door when SA.station is loaded (AS-0145), else a fixed spot
 *   SA.player.step(state, input, dt, obstacles?) -> new state (the input state is never mutated)
 *     state     { x, z, heading }  heading in radians; forward = (sin heading, cos heading) on the (x, z) plane, so a
 *               chase camera behind the player uses yaw = heading + PI (see SA.camera: camera sits at +(sin yaw, cos yaw))
 *     input     { forward, back, left, right, strafe? }  numbers/booleans (any truthy or +/-1 axis value); W/Up = forward,
 *               S/Down = back. left/right TURN the player; with strafe: true they side-step instead.
 *               run: true moves forward at RUN_SPEED instead of SPEED (backing up stays at BACK_SPEED).
 *     dt        seconds (clamped to 0.1 so a stalled tab cannot teleport the player)
 *     input.lift  optional jump lift above the ground (SA.jump); obstacles with a 4th number h (low rocks, AS-0176) are ignored
 *               while lift + CLEAR_MARGIN >= h, so one jump clears a normal rock and the biggest need more height
 *     obstacles [[x, z, radius(, height)], ...] circles for animals and placed props (same shape as SA.propAvoid.points)
 *   SA.player.floorAt(x, z, obstacles, lift) -> lift of the low solid under the player (0 = ground), for SA.jump.step's floor
 * The move is sub-stepped (each piece at most RADIUS long) so running or a slow frame never tunnels through a thin obstacle.
 * Obstacles push the player out along the line from their centre (so walking into one slides around it) and the
 * result is clamped to SA.map.BOUNDS. Never stuck: if the player starts overlapping obstacles (wedged between two trees
 * and an animal) and the plain push-out would pin them in place, they may still move so they do not go deeper into
 * any overlapped obstacle (walk away or slide), and as a last resort when wedged by 2+ obstacles those are ignored
 * until the player is clear of them. Nothing is persisted.
 *
 * Terrain never blocks (AS-0109): the player walks on any ground, dips and water included (they wade, and the avatar may
 * sink below the surface for a moment; heightAt is the floor and SA.map.cameraHeight keeps the camera above the water).
 *
 *   SA.player.heightAt(x, z)           height under the feet: SA.map.groundHeight, or a bridge deck's top over it (SA.surfaces, AS-0158); SA.climb.step eases y toward it
 *   SA.player.inWater(x, z)            in the river/pond water (false on a bridge deck): wading splashes
 *   SA.player.SPAWN_CLEAR             radius (world units) around the spawn kept free of decor and animals
 *   SA.player.inSpawnZone(x, z, pad?)  true when (x, z) is within SPAWN_CLEAR + pad of the spawn
 *   SA.player.spawnZone()              [x, z, SPAWN_CLEAR] avoid point (same shape as SA.propAvoid.points)
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SPEED = 4;          // world units / second: a brisk kid-friendly walk
  var RUN_SPEED = 10;     // while input.run (Shift held / joystick at its edge): 2.5x SPEED
  var BACK_SPEED = 2.4;   // backing up is slower (and never faster, even while running)
  var TURN_RATE = 2.4;    // radians / second
  var RADIUS = 0.6;       // player body circle, added to each obstacle radius
  var MAX_DT = 0.1;
  var EDGE = 0.5;         // stay this far inside the map bounds
  var SPAWN_CLEAR = 5;    // nothing seeded (decor, animals) within this distance of the spawn at load
  var SLACK = 0.02;       // overlap smaller than this is just float noise from the last push-out
  var CLEAR_MARGIN = 0.1; // a jump this close to a low solid's top still clears it (and steps up onto it)
  var SPAWN = { x: -9, z: 14, heading: Math.PI };   // bosque, dry land, facing the map centre (-z)

  /** Where the game starts: just outside the research station's door (SA.station, AS-0145), else the fixed fallback above. */
  function spawnPoint() { return SA.station && SA.station.spawn ? SA.station.spawn() : SPAWN; }

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function axis(v) { return typeof v === 'number' ? Math.max(-1, Math.min(1, num(v, 0))) : v ? 1 : 0; }

  function clampToMap(p) {
    var B = SA.map.BOUNDS;
    p.x = Math.max(B.minX + EDGE, Math.min(B.maxX - EDGE, p.x));
    p.z = Math.max(B.minZ + EDGE, Math.min(B.maxZ - EDGE, p.z));
  }

  /** True when a player lifted `lift` above the ground passes over obstacle o (it has a height h and lift is within the margin of it). */
  function cleared(o, lift) { return o.length > 3 && o[3] > 0 && lift + CLEAR_MARGIN >= o[3]; }

  /**
   * Lift of the highest low solid the player stands over at (x, z) (0 = the ground): an obstacle counts while the player is
   * over its blocking circle and clears it. SA.jump.step(..., floor) lands on it, so a jump never ends inside a rock.
   */
  function floorAt(x, z, obstacles, lift) {
    var best = 0, list = obstacles || [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!valid(o) || !cleared(o, num(lift, 0)) || o[3] <= best) continue;
      if (Math.hypot(x - o[0], z - o[1]) < o[2] + RADIUS) best = o[3];
    }
    return best;
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
  function heightAt(x, z) {
    var g = SA.map.groundHeight(x, z), d = SA.surfaces ? SA.surfaces.heightAt(x, z) : null;   // a bridge deck (AS-0158) lifts you above the water
    return d !== null && d > g ? d : g;
  }

  /** In the river/pond water, but not while standing on a bridge deck over it. */
  function inWater(x, z) { return SA.map.isWater(x, z) && !(SA.surfaces && SA.surfaces.onDeck(x, z)); }

  function step(state, input, dt, obstacles) {
    var S = spawnPoint();
    state = state || S;
    input = input || {};
    var h = num(state.heading, 0), p = { x: num(state.x, S.x), z: num(state.z, S.z) };
    dt = Math.max(0, Math.min(MAX_DT, num(dt, 0)));
    var fwd = axis(input.forward) - axis(input.back), side = axis(input.right) - axis(input.left);
    var fx = Math.sin(h), fz = Math.cos(h), dx = 0, dz = 0;
    if (input.strafe) {
      // Seen from behind the player, right = (-cos h, sin h) = (-fz, fx) (heading 0 faces +z, so right is -x).
      var sv = input.run ? RUN_SPEED : SPEED;
      dx += (-fz * side) * sv * dt; dz += (fx * side) * sv * dt;
    } else {
      h -= side * TURN_RATE * dt;   // right = clockwise seen from above = decreasing heading
      fx = Math.sin(h); fz = Math.cos(h);
    }
    var v = fwd > 0 ? (input.run ? RUN_SPEED : SPEED) : BACK_SPEED;   // run only speeds up going forward
    dx += fx * fwd * v * dt;
    dz += fz * fwd * v * dt;
    // Sub-step: no single move is longer than RADIUS, so a fast run or a long (low frame rate) frame cannot hop over a
    // thin obstacle. Each sub-step is clamped to the map and resolved against the obstacles on its own.
    var n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / RADIUS - 1e-9)), obs = obstacles || [], lift = num(input.lift, 0);
    if (lift > 0) obs = obs.filter(function (o) { return !cleared(o, lift); });   // hopping over low solids
    for (var i = 0; i < n; i++) {
      var q = { x: p.x + dx / n, z: p.z + dz / n };
      clampToMap(q);
      p = resolve(p, q, obs, fx, fz);   // only solid obstacles and the map edge stop the player; water and dips never do
    }
    var TAU = Math.PI * 2;
    h = h - TAU * Math.floor(h / TAU);   // keep heading in [0, 2π)
    return { x: p.x, z: p.z, heading: h };
  }

  function spawn() { var S = spawnPoint(); return { x: S.x, z: S.z, heading: S.heading }; }
  function inSpawnZone(x, z, pad) { var S = spawnPoint(); return Math.hypot(x - S.x, z - S.z) < SPAWN_CLEAR + (pad || 0); }
  function spawnZone() { var S = spawnPoint(); return [S.x, S.z, SPAWN_CLEAR]; }

  SA.player = { step: step, floorAt: floorAt, CLEAR_MARGIN: CLEAR_MARGIN, heightAt: heightAt, inWater: inWater, spawn: spawn, SPEED: SPEED, RUN_SPEED: RUN_SPEED, BACK_SPEED: BACK_SPEED, TURN_RATE: TURN_RATE, RADIUS: RADIUS,
    SPAWN_CLEAR: SPAWN_CLEAR, inSpawnZone: inSpawnZone, spawnZone: spawnZone };
})(typeof window !== 'undefined' ? window : globalThis);
