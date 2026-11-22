/* SA.climb (also SA.player.climb): pure tree-climbing state machine for the walking player (no THREE, no DOM; node:vm tested).
 * Needs SA.map, SA.player and SA.perch (canopy heights per tree kind).
 *
 * Player state grows two fields: { x, z, heading, y, climb }.  y = height the player stands at (the terrain height,
 * SA.map.groundHeight, eased as they walk; the canopy height up a tree: SA.reach compares it with perched animals). climb = null on the ground, else
 * { mode: 'up'|'canopy'|'down', t, tree, from:{x,z,y}, to:{x,z,y}, safe:{x,z} } (plain data, never mutated).
 *
 *   SA.climb.nearest(state, trees)    -> the climbable tree { x, z, y?, scale?, kind? } within RANGE, or null
 *   SA.climb.prompt(state, trees)     -> 'up' (show the climb button) | 'down' (show the down button) | null
 *   SA.climb.start(state, tree)       -> state climbing up the tree (unchanged when already climbing or too far)
 *   SA.climb.stop(state)              -> state heading back down to the ground (unchanged on the ground / already down)
 *   SA.climb.toggle(state, trees)     -> start when prompt is 'up', stop when 'down'; else unchanged
 *   SA.climb.step(state, input, dt, obstacles?) -> new state. On the ground this is SA.player.step (plus y 0). Up a
 *       tree you walk on the canopy (obstacles ignored, map-clamped); walking off its edge starts the climb down.
 *   SA.climb.active(state) -> true while up, on or coming down a tree
 * Climbing down always ends on dry, in-bounds ground outside the trunk (never a fall, never damage): the landing is
 * the point just beyond the canopy edge, or the spot you started climbing from when that is water.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var RANGE = 3.2;          // stand within this distance of a trunk to climb it (trunk obstacle ~1 + body 0.6)
  var UP_TIME = 1.4;        // seconds to climb up
  var DOWN_TIME = 0.9;      // seconds to climb down
  var TRUNK_R = 1.1;        // where you stand on the canopy / hug the trunk, from the tree centre
  var EDGE_PAD = 1.2;       // canopy walkable radius = canopy radius * scale + this
  var LAND_PAD = 0.6;       // land this far beyond the canopy edge
  var MAX_DT = 0.1;

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function ease(k) { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  // Ground height under the avatar: the single terrain source, SA.map.groundHeight.
  function groundAt(x, z) { return SA.map.groundHeight(x, z); }

  function kindOf(tree) { var K = SA.perch && SA.perch.KINDS; return (K && (K[tree.kind] || K.jungle)) || { height: 4, radius: 0.8 }; }
  function scaleOf(tree) { return num(tree.scale, 1) > 0 ? num(tree.scale, 1) : 1; }
  function topOf(tree) { return num(tree.y, SA.map.groundHeight(tree.x, tree.z)) + kindOf(tree).height * scaleOf(tree); }
  function edgeOf(tree) { return kindOf(tree).radius * scaleOf(tree) + EDGE_PAD; }

  function copy(s, patch) {
    var o = { x: s.x, z: s.z, heading: s.heading, y: num(s.y, 0), climb: s.climb || null };
    for (var k in patch) o[k] = patch[k];
    return o;
  }

  function active(state) { return !!(state && state.climb); }

  function nearest(state, trees) {
    if (!state || active(state) || !trees) return null;
    var best = null, bd = RANGE;
    trees.forEach(function (t) {
      if (!t || !isFinite(t.x) || !isFinite(t.z)) return;
      var d = Math.hypot(t.x - state.x, t.z - state.z);
      if (d <= bd) { best = t; bd = d; }
    });
    return best;
  }

  function prompt(state, trees) {
    if (!state) return null;
    if (state.climb) return state.climb.mode === 'down' ? null : 'down';
    return nearest(state, trees) ? 'up' : null;
  }

  function start(state, tree) {
    if (!state || !tree || active(state) || !isFinite(tree.x) || !isFinite(tree.z)) return state;
    var dx = state.x - tree.x, dz = state.z - tree.z, d = Math.hypot(dx, dz);
    if (d > RANGE) return state;
    if (d < 1e-6) { dx = -Math.sin(state.heading || 0); dz = -Math.cos(state.heading || 0); d = 1; }
    var to = { x: tree.x + (dx / d) * TRUNK_R, z: tree.z + (dz / d) * TRUNK_R, y: topOf(tree) };
    return copy(state, { y: num(state.y, 0), climb: {
      mode: 'up', t: 0, tree: tree, from: { x: state.x, z: state.z, y: num(state.y, 0) }, to: to, safe: { x: state.x, z: state.z },
    } });
  }

  /** Landing point for a climb down: just past the canopy edge on the side the player is on, else the safe start spot. */
  function landing(state, c) {
    var tree = c.tree, dx = state.x - tree.x, dz = state.z - tree.z, d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = c.safe.x - tree.x; dz = c.safe.z - tree.z; d = Math.hypot(dx, dz) || 1; }
    var r = edgeOf(tree) + LAND_PAD, p = { x: tree.x + (dx / d) * r, z: tree.z + (dz / d) * r };
    var B = SA.map.BOUNDS, inside = p.x > B.minX + 1 && p.x < B.maxX - 1 && p.z > B.minZ + 1 && p.z < B.maxZ - 1;
    return inside && !SA.map.isWater(p.x, p.z) ? p : { x: c.safe.x, z: c.safe.z };
  }

  function stop(state) {
    var c = state && state.climb;
    if (!c || c.mode === 'down') return state;
    var to = landing(state, c);
    return copy(state, { climb: {
      mode: 'down', t: 0, tree: c.tree, from: { x: state.x, z: state.z, y: state.y }, to: { x: to.x, z: to.z, y: groundAt(to.x, to.z) }, safe: c.safe,
    } });
  }

  function toggle(state, trees) {
    var p = prompt(state, trees);
    return p === 'up' ? start(state, nearest(state, trees)) : p === 'down' ? stop(state) : state;
  }

  function face(from, to, heading) {
    var dx = to.x - from.x, dz = to.z - from.z;
    return Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : heading;
  }

  function step(state, input, dt, obstacles) {
    state = state || SA.player.spawn();
    var c = state.climb;
    if (!c) {
      var g = SA.player.step(state, input, dt, obstacles);
      // Feet follow the terrain, eased so slopes feel natural (no prior y, e.g. at spawn, snaps straight to the ground).
      return { x: g.x, z: g.z, heading: g.heading, y: SA.map.followHeight(state.y, groundAt(g.x, g.z), dt), climb: null };
    }
    dt = Math.max(0, Math.min(MAX_DT, num(dt, 0)));
    if (c.mode === 'canopy') {
      var w = SA.player.step(state, input, dt, []);
      var walked = copy(state, { x: w.x, z: w.z, heading: w.heading });
      if (Math.hypot(w.x - c.tree.x, w.z - c.tree.z) > edgeOf(c.tree)) return stop(walked);   // walked off the edge: climb down
      return walked;
    }
    var dur = c.mode === 'up' ? UP_TIME : DOWN_TIME, t = Math.min(1, c.t + dt / dur), k = ease(t);
    var move = ease(Math.min(1, t * 3));   // slide to / from the trunk quickly, then it is mostly a vertical climb
    var next = { mode: c.mode, t: t, tree: c.tree, from: c.from, to: c.to, safe: c.safe };
    var heading = c.mode === 'up' ? face(c.from, c.tree, state.heading) : face(c.tree, c.to, state.heading);
    if (t >= 1) {
      if (c.mode === 'up') return copy(state, { x: c.to.x, z: c.to.z, y: c.to.y, heading: heading, climb: { mode: 'canopy', t: 1, tree: c.tree, from: c.from, to: c.to, safe: c.safe } });
      var land = SA.player.step({ x: c.to.x, z: c.to.z, heading: state.heading }, {}, 0, obstacles);   // push out of props, clamp to the map
      return { x: land.x, z: land.z, heading: land.heading, y: groundAt(land.x, land.z), climb: null };
    }
    var m = c.mode === 'up' ? move : ease(Math.min(1, t * 1.5));
    return copy(state, { x: lerp(c.from.x, c.to.x, m), z: lerp(c.from.z, c.to.z, m), y: lerp(c.from.y, c.to.y, k), heading: heading, climb: next });
  }

  SA.climb = { RANGE: RANGE, UP_TIME: UP_TIME, DOWN_TIME: DOWN_TIME, TRUNK_R: TRUNK_R, nearest: nearest, prompt: prompt,
    start: start, stop: stop, toggle: toggle, step: step, active: active, edgeRadius: edgeOf, topOf: topOf };
  if (SA.player) SA.player.climb = SA.climb;
})(typeof window !== 'undefined' ? window : globalThis);
