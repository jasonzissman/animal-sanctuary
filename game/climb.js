/* SA.climb (also SA.player.climb): pure climbing state machine for the walking player (no THREE, no DOM; node:vm tested).
 * Needs SA.map, SA.player and SA.perch (canopy heights per tree kind).
 *
 * A climb TARGET is plain data (AS-0192), the same for trees, peaks and buildings:
 *   { kind: 'tree'|'peak'|'building', x, z, radius | footprint: { w, d }, topY, top: { shape: 'circle'|'rect', size } }
 *   footprint/radius = the solid base you stand next to (range is measured to its edge, not its centre); topY = the flat
 *   standing height; top.size = radius for a circle, a side (or { w, d }) for an axis-aligned rect (centred on x, z).
 * Trees keep their old shape { x, z, y?, scale?, kind? }: SA.climb.fromTree adapts them (SA.perch canopy height and radius),
 * so every existing caller that passes trees works unchanged. nearest/start return the object the caller passed in.
 *
 * Player state grows two fields: { x, z, heading, y, climb }.  y = height the player stands at (the terrain height,
 * SA.map.groundHeight, eased as they walk; the top height up a target: SA.reach compares it with perched animals). climb = null
 * on the ground, else { mode: 'up'|'top'|'canopy'|'down', t, dur, tree, target, from:{x,z,y}, to:{x,z,y}, safe:{x,z}, fall? }
 * (plain data, never mutated). On top the mode is 'canopy' for trees (alias kept for tree code) and 'top' for everything else;
 * SA.climb.onTop(state) is true for both.
 *
 *   SA.climb.nearest(state, targets)  -> the climbable target within EDGE_RANGE of its edge, or null
 *   SA.climb.prompt(state, targets)   -> 'up' (show the climb button) | 'down' (show the down button) | null
 *   SA.climb.start(state, target)     -> state climbing up the target (unchanged when already climbing or too far)
 *   SA.climb.stop(state)              -> state heading back down to the ground (unchanged on the ground / already down)
 *   SA.climb.toggle(state, targets)   -> start when prompt is 'up', stop when 'down'; else unchanged
 *   SA.climb.step(state, input, dt, obstacles?) -> new state. On the ground this is SA.player.step (plus y). On top you walk
 *       freely on the flat top (y = topY, obstacles ignored, map-clamped); walking off its edge starts a short FALL arc
 *       (mode 'down', fall: true) to dry in-bounds ground just beyond the edge, no damage. The frame it lands the state
 *       carries land: { x, z, y, kind } (one frame only; SA.climb.landed(state)) so the caller can track it.
 *       5th arg `targets` (AS-0166, optional): walking off a top then asks SA.climb.landAssist (game/climb-assist.js) for a tree/peak/roof
 *       roughly ahead (~7 units, ~40 degrees, not much higher than you): a short hop (mode 'down', fall + assist) that lands ON its top
 *       (mode 'canopy' / 'top', same `land` frame). input.lift (the jump lift) raises the reachable height. No target = the fall above.
 *   SA.climb.edgeDistance(target, x, z) -> distance from the point to the target's base edge (0 inside): the one "in reach" measure.
 *       Infinity inside one of the target's optional `noClimb: [{ x0, x1, z0, z1 }]` ground zones (AS-0165: the station doorway and its
 *       room never climb), so nearest/start/auto-climb and the Space chooser all skip the target from there.
 *       Optional `top.solids: [[x, z, r], ...]` are circles you cannot walk through on the flat top (the station's dish and antenna).
 *   SA.climb.focusPoint(target, x, z) -> { x, z }: where the Space chooser measures "facing" to: the nearest point of a rectangular
 *       base, else the centre (so a wall beside the doorway is nearer than the building's middle and beats the door)
 *   SA.climb.autoStep(timer, before, after, input, targets, dtMs) -> { ms, tree, progress, climb }: the AS-0157 push timer
 *   SA.climb.active(state) -> true while up, on or coming down a target
 * Coming down (button or fall) always ends on dry, in-bounds ground outside the base, never damage: the landing is the point
 * just beyond the edge, or the spot you started climbing from when that is water / out of bounds.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var EDGE_RANGE = 2.2;     // stand within this distance of a target's edge to climb it (trunk obstacle 1 + body 0.6 + slack)
  var TREE_BASE_R = 1;      // a tree's solid base radius (decor obstacle)
  var RANGE = TREE_BASE_R + EDGE_RANGE;   // from a tree's centre (kept for callers)
  var UP_TIME = 1.4;        // seconds to climb up
  var DOWN_TIME = 0.9;      // seconds to climb down
  var TRUNK_R = 1.1;        // where you stand on a tree's canopy / hug the trunk, from the tree centre
  var EDGE_PAD = 1.2;       // canopy walkable radius = canopy radius * scale + this
  var LAND_PAD = 0.6;       // land this far beyond the edge
  var MAX_DT = 0.1;
  var ASSIST_ARC = 0.9;     // extra height at the middle of the landing-assist hop between two tops

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function ease(k) { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  // Ground height under the avatar: the single terrain source, SA.map.groundHeight.
  function groundAt(x, z) { return SA.player.heightAt ? SA.player.heightAt(x, z) : SA.map.groundHeight(x, z); }

  // ---- Shapes: { round, r, hw, hd }, centred on the target ----
  function circle(r) { return { round: true, r: r, hw: r, hd: r }; }
  function rect(hw, hd) { return { round: false, r: Math.max(hw, hd), hw: hw, hd: hd }; }
  /** Distance from the shape's edge to the point (0 inside). */
  function edgeDist(sh, tx, tz, x, z) {
    if (sh.round) return Math.max(0, Math.hypot(x - tx, z - tz) - sh.r);
    return Math.hypot(Math.max(0, Math.abs(x - tx) - sh.hw), Math.max(0, Math.abs(z - tz) - sh.hd));
  }
  /** Distance from the centre to the edge along the unit direction (ux, uz). */
  function extent(sh, ux, uz) {
    if (sh.round) return sh.r;
    var ax = Math.abs(ux), az = Math.abs(uz);
    return Math.min(ax > 1e-9 ? sh.hw / ax : Infinity, az > 1e-9 ? sh.hd / az : Infinity);
  }
  function topShape(top, fallback) {
    var size = top && top.size;
    if (top && top.shape === 'rect') {
      if (typeof size === 'number' && size > 0) return rect(size / 2, size / 2);
      if (size && size.w > 0 && size.d > 0) return rect(size.w / 2, size.d / 2);
      return null;
    }
    return typeof size === 'number' && size > 0 ? circle(size) : fallback;
  }

  // ---- Trees: the small adapter into target data ----
  function kindOf(tree) { var K = SA.perch && SA.perch.KINDS; return (K && (K[tree.kind] || K.jungle)) || { height: 4, radius: 0.8 }; }
  function scaleOf(tree) { return num(tree.scale, 1) > 0 ? num(tree.scale, 1) : 1; }
  /** Tree { x, z, y?, scale?, kind? } -> climb target data (plain, JSON-serialisable). */
  function fromTree(tree) {
    var k = kindOf(tree), sc = scaleOf(tree);
    return { kind: 'tree', x: tree.x, z: tree.z, radius: TREE_BASE_R,
      topY: num(tree.y, SA.map.groundHeight(tree.x, tree.z)) + k.height * sc, top: { shape: 'circle', size: k.radius * sc + EDGE_PAD } };
  }

  var cache = typeof WeakMap === 'function' ? new WeakMap() : null;
  /** Anything the callers hand in -> { kind, x, z, topY, foot, top, inset } (shapes normalised) or null for junk. Cached per object. */
  function norm(t) {
    if (!t || typeof t !== 'object' || !isFinite(t.x) || !isFinite(t.z)) return null;
    var hit = cache && cache.get(t);
    if (hit) return hit;
    var generic = typeof t.topY === 'number' && isFinite(t.topY), d = generic ? t : fromTree(t), foot;
    if (d.footprint && d.footprint.w > 0 && d.footprint.d > 0) foot = rect(d.footprint.w / 2, d.footprint.d / 2);
    else foot = circle(num(d.radius, 1) > 0 ? num(d.radius, 1) : 1);
    var top = topShape(d.top, circle(Math.max(1.5, foot.r)));
    if (!top) return null;
    var n = { kind: d.kind || 'tree', x: d.x, z: d.z, topY: d.topY, foot: foot, top: top, inset: generic && d.kind !== 'tree' ? 0 : TRUNK_R,
      solids: d.top && Array.isArray(d.top.solids) ? d.top.solids : [], noClimb: Array.isArray(d.noClimb) ? d.noClimb : [] };
    if (cache) cache.set(t, n);
    return n;
  }

  function topOf(t) { var n = norm(t); return n ? n.topY : 0; }
  function edgeOf(t) { var n = norm(t); return n ? n.top.r : 0; }

  /** Distance from the (x, z) point to the target's solid base edge (0 inside it); Infinity for junk. The one "in reach" measure. */
  function edgeDistance(t, x, z) { var n = norm(t); return n ? reach(n, x, z) : Infinity; }

  /** Reach measure on normalised data: the edge distance, Infinity inside a noClimb zone (AS-0165: the station doorway and its room). */
  function reach(n, x, z) {
    for (var i = 0; i < n.noClimb.length; i++) { var b = n.noClimb[i]; if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return Infinity; }
    return edgeDist(n.foot, n.x, n.z, x, z);
  }

  /** Where "facing" is measured to: the nearest point of a rectangular base, else the target's centre. */
  function focusPoint(t, x, z) {
    var n = norm(t);
    if (!n || n.foot.round) return { x: t && t.x, z: t && t.z };
    return { x: Math.max(n.x - n.foot.hw, Math.min(n.x + n.foot.hw, x)), z: Math.max(n.z - n.foot.hd, Math.min(n.z + n.foot.hd, z)) };
  }

  function copy(s, patch) {
    var o = { x: s.x, z: s.z, heading: s.heading, y: num(s.y, 0), climb: s.climb || null };
    for (var k in patch) o[k] = patch[k];
    return o;
  }

  function active(state) { return !!(state && state.climb); }
  function onTop(state) { var c = state && state.climb; return !!c && (c.mode === 'top' || c.mode === 'canopy'); }
  function landed(state) { return state && state.land || null; }

  function nearest(state, targets) {
    if (!state || active(state) || !targets) return null;
    var best = null, bd = EDGE_RANGE;
    targets.forEach(function (t) {
      var n = norm(t);
      if (!n) return;
      var d = reach(n, state.x, state.z);
      if (d <= bd) { best = t; bd = d; }
    });
    return best;
  }

  function prompt(state, targets) {
    if (!state) return null;
    if (state.climb) return state.climb.mode === 'down' ? null : 'down';
    return nearest(state, targets) ? 'up' : null;
  }

  function start(state, target) {
    var n = norm(target);
    if (!state || !n || active(state)) return state;
    if (reach(n, state.x, state.z) > EDGE_RANGE) return state;
    var dx = state.x - n.x, dz = state.z - n.z, d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = -Math.sin(state.heading || 0); dz = -Math.cos(state.heading || 0); d = 1; }
    var ux = dx / d, uz = dz / d;
    var inset = n.inset || Math.min(TRUNK_R, 0.6 * extent(n.top, ux, uz));   // trees stand TRUNK_R out; others well inside the top
    var to = { x: n.x + ux * inset, z: n.z + uz * inset, y: n.topY };
    return copy(state, { y: num(state.y, 0), climb: {
      mode: 'up', t: 0, dur: UP_TIME, tree: target, target: n, from: { x: state.x, z: state.z, y: num(state.y, 0) }, to: to, safe: { x: state.x, z: state.z },
    } });
  }

  /** Landing point for a climb down or fall: just past the edge on the side the player is on, else the safe start spot. */
  function landing(state, c) {
    var n = c.target, dx = state.x - n.x, dz = state.z - n.z, d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = c.safe.x - n.x; dz = c.safe.z - n.z; d = Math.hypot(dx, dz) || 1; }
    var ux = dx / d, uz = dz / d, r = Math.max(extent(n.top, ux, uz), extent(n.foot, ux, uz)) + LAND_PAD;
    var p = { x: n.x + ux * r, z: n.z + uz * r };
    var B = SA.map.BOUNDS, ok = p.x > B.minX + 1 && p.x < B.maxX - 1 && p.z > B.minZ + 1 && p.z < B.maxZ - 1;
    return ok && !SA.map.isWater(p.x, p.z) ? p : { x: c.safe.x, z: c.safe.z };
  }

  function down(state, c, fall) {
    var to = landing(state, c), gy = groundAt(to.x, to.z), h = Math.max(0, num(state.y, 0) - gy);
    return copy(state, { climb: {
      mode: 'down', t: 0, dur: fall ? Math.min(0.8, 0.35 + 0.05 * h) : DOWN_TIME, fall: !!fall, tree: c.tree, target: c.target,
      from: { x: state.x, z: state.z, y: state.y }, to: { x: to.x, z: to.z, y: gy }, safe: c.safe,
    } });
  }

  function stop(state) {
    var c = state && state.climb;
    if (!c || c.mode === 'down') return state;
    return down(state, c, false);
  }

  function toggle(state, targets) {
    var p = prompt(state, targets);
    return p === 'up' ? start(state, nearest(state, targets)) : p === 'down' ? stop(state) : state;
  }

  function face(from, to, heading) {
    var dx = to.x - from.x, dz = to.z - from.z;
    return Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : heading;
  }

  /** Walking off a top (jumping or not): with a climb target roughly ahead (SA.climb.landAssist) fly to its top, else fall to the ground. */
  function leave(walked, c, input, targets) {
    var a = targets && SA.climb.landAssist ? SA.climb.landAssist(walked, targets, input && input.lift) : null, nn = a && norm(a.target);
    if (!nn) return down(walked, c, true);
    var from = { x: walked.x, z: walked.z, y: walked.y + Math.max(0, num(input && input.lift, 0)) };   // the avatar's drawn height: no pop
    return copy(walked, { y: from.y, climb: { mode: 'down', t: 0, dur: a.dur, fall: true, assist: true, tree: a.target, target: nn,
      from: from, to: a.to, safe: c.safe } });
  }

  function step(state, input, dt, obstacles, targets) {
    state = state || SA.player.spawn();
    var c = state.climb;
    if (!c) {
      var g = SA.player.step(state, input, dt, obstacles);
      // Feet follow the terrain, eased so slopes feel natural (no prior y, e.g. at spawn, snaps straight to the ground).
      return { x: g.x, z: g.z, heading: g.heading, y: SA.map.followHeight(state.y, groundAt(g.x, g.z), dt), climb: null };
    }
    dt = Math.max(0, Math.min(MAX_DT, num(dt, 0)));
    var n = c.target;
    if (c.mode === 'canopy' || c.mode === 'top') {
      var w = SA.player.step(state, input, dt, n.solids);   // the flat top is open, bar its solids (the station's dish and antenna)
      var walked = copy(state, { x: w.x, z: w.z, heading: w.heading, y: n.topY });
      if (edgeDist(n.top, n.x, n.z, w.x, w.z) > 0) return leave(walked, c, input, targets);   // walked off the edge: a fall, or the landing assist
      return walked;
    }
    var dur = c.dur || (c.mode === 'up' ? UP_TIME : DOWN_TIME), t = Math.min(1, c.t + dt / dur), k = ease(t);
    var move = ease(Math.min(1, t * 3));   // slide to / from the base quickly, then it is mostly a vertical climb
    var next = { mode: c.mode, t: t, dur: c.dur, fall: c.fall, assist: c.assist, tree: c.tree, target: n, from: c.from, to: c.to, safe: c.safe };
    var heading = c.mode === 'up' ? face(c.from, n, state.heading) : c.fall ? state.heading : face(n, c.to, state.heading);
    if (c.assist) {   // the landing assist (AS-0166): a hop over to the next top, landing ON it (standing at its topY)
      if (t >= 1) {
        return copy(state, { x: c.to.x, z: c.to.z, y: n.topY, heading: heading, land: { x: c.to.x, z: c.to.z, y: n.topY, kind: n.kind },
          climb: { mode: n.kind === 'tree' ? 'canopy' : 'top', t: 1, dur: c.dur, tree: c.tree, target: n, from: c.from, to: c.to, safe: c.safe } });
      }
      return copy(state, { x: lerp(c.from.x, c.to.x, k), z: lerp(c.from.z, c.to.z, k), y: lerp(c.from.y, c.to.y, k) + ASSIST_ARC * Math.sin(Math.PI * t),
        heading: heading, climb: next });
    }
    if (t >= 1) {
      if (c.mode === 'up') {
        return copy(state, { x: c.to.x, z: c.to.z, y: c.to.y, heading: heading,
          climb: { mode: n.kind === 'tree' ? 'canopy' : 'top', t: 1, dur: c.dur, tree: c.tree, target: n, from: c.from, to: c.to, safe: c.safe } });
      }
      var land = SA.player.step({ x: c.to.x, z: c.to.z, heading: state.heading }, {}, 0, obstacles);   // push out of props, clamp to the map
      var out = { x: land.x, z: land.z, heading: land.heading, y: groundAt(land.x, land.z), climb: null };
      if (c.fall) out.land = { x: out.x, z: out.z, y: out.y, kind: n.kind };
      return out;
    }
    if (c.fall) {   // gravity-like arc: drops slowly then quickly while drifting out to the landing spot
      return copy(state, { x: lerp(c.from.x, c.to.x, ease(t)), z: lerp(c.from.z, c.to.z, ease(t)), y: lerp(c.from.y, c.to.y, t * t), heading: heading, climb: next });
    }
    var m = c.mode === 'up' ? move : ease(Math.min(1, t * 1.5));
    return copy(state, { x: lerp(c.from.x, c.to.x, m), z: lerp(c.from.z, c.to.z, m), y: lerp(c.from.y, c.to.y, k), heading: heading, climb: next });
  }

  // ---- Auto-climb (AS-0157): keep pushing forward into a climb target and you climb it. Pure timer, the rig feeds it each frame. ----
  var AUTO_CLIMB_MS = 600;     // data constant: how long a blocked forward push lasts before the climb starts
  var AUTO_TURN_AWAY = Math.PI / 4;   // facing more than ~45 degrees away from the target resets the push
  var AUTO_PUSH_RANGE = 1.2;   // only a push against the base itself (edge distance: body 0.6 + slack), not a target 3 units away
  var AUTO_BLOCKED = 0.35;     // moved less than this fraction of the free-walk distance = blocked

  var AUTO_IDLE = { ms: 0, tree: null, progress: 0, climb: false };

  function angleBetween(a, b) {
    var d = Math.abs(a - b) % (Math.PI * 2);
    return d > Math.PI ? Math.PI * 2 - d : d;
  }

  /** One frame of the push timer. `timer` is the previous result (or null), `before`/`after` the player state either side of
   *  SA.climb.step, `input` the walking input that frame (forward > 0 = held, joystick forward counts), dtMs the frame time in
   *  milliseconds. -> { ms, tree, progress 0..1, climb } where climb is true on the frame the push is long enough: the caller
   *  then calls SA.climb.start(after, tree) (`tree` is the target object that was in `targets`). Anything else (released, turned
   *  away, moved freely, already climbing, no target, or only a cactus/rock nearby: those are never in `targets`) gives the idle timer. */
  function autoStep(timer, before, after, input, targets, dtMs) {
    if (!before || !after || active(before) || active(after) || !input || !(input.forward > 0.3)) return AUTO_IDLE;
    var tree = nearest(after, targets), n = norm(tree);
    if (!n || reach(n, after.x, after.z) > AUTO_PUSH_RANGE) return AUTO_IDLE;
    var px = n.foot.round ? n.x : Math.max(n.x - n.foot.hw, Math.min(n.x + n.foot.hw, after.x));   // nearest point of the base
    var pz = n.foot.round ? n.z : Math.max(n.z - n.foot.hd, Math.min(n.z + n.foot.hd, after.z));
    var aim = Math.atan2(px - after.x, pz - after.z);
    if (angleBetween(num(after.heading, 0), aim) > AUTO_TURN_AWAY) return AUTO_IDLE;
    var dt = Math.max(0, num(dtMs, 0)) / 1000, speed = input.run ? SA.player.RUN_SPEED : SA.player.SPEED;
    var moved = Math.hypot(after.x - before.x, after.z - before.z);
    if (dt > 0 && moved > AUTO_BLOCKED * speed * Math.min(1, input.forward) * dt) return AUTO_IDLE;   // still moving freely
    var ms = (timer && timer.tree === tree ? timer.ms : 0) + Math.max(0, num(dtMs, 0));
    var done = ms >= AUTO_CLIMB_MS;
    return { ms: ms, tree: tree, progress: Math.min(1, ms / AUTO_CLIMB_MS), climb: done };
  }

  SA.climb = { RANGE: RANGE, EDGE_RANGE: EDGE_RANGE, UP_TIME: UP_TIME, DOWN_TIME: DOWN_TIME, TRUNK_R: TRUNK_R, nearest: nearest, prompt: prompt,
    start: start, stop: stop, toggle: toggle, step: step, active: active, onTop: onTop, landed: landed, fromTree: fromTree,
    edgeRadius: edgeOf, edgeDistance: edgeDistance, focusPoint: focusPoint, topOf: topOf, AUTO_CLIMB_MS: AUTO_CLIMB_MS, autoStep: autoStep };
  if (SA.player) SA.player.climb = SA.climb;
})(typeof window !== 'undefined' ? window : globalThis);
