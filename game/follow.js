/* SA.follow: pure follower logic (no THREE, no DOM; node:vm tested). An animal trails behind the player: the baby that
 * walks to mamá (AS-0173), the animal friend (AS-0175). Needs SA.map (BOUNDS, isWater, groundHeight).
 *
 *   var f = SA.follow.create({ x, z, heading? })          a follower { x, z, heading, lift, moving, pop, ... }
 *   SA.follow.step(f, leader, solids, dt)  -> f           advances ONE follower (mutates and returns it)
 *   SA.follow.stepAll(followers, player, solids, dt)      a line of followers: the first follows the player, each next one
 *                                                         follows the one ahead; they never overlap each other
 *   SA.follow.stepGroup(followers, player, solids, dt)    a group (AS-0327): EVERY follower follows the player on its own trail, so
 *                                                         each waits at the water and follows again when the player returns; they
 *                                                         treat each other as solids and never overlap
 *     leader   { x, z, heading, lift? }   the player (or the follower ahead); lift > 0 = airborne (SA.jump)
 *     solids   [[x, z, r(, h)], ...]      same shape as SA.blocking.obstacles; a low solid (h <= HOP_HEIGHT) can be hopped
 *     dt       seconds (clamped to 0.1)
 *   Result fields for the renderer: x, z, heading (rotation.y, forward = (sin, cos)), lift (hop height above the ground),
 *   moving (walk anim), and `pop`: null, or { fromX, fromZ, x, z } for the one step it popped (puff of sparkles at both).
 *
 * Rules: it records the leader's breadcrumb trail (a crumb every CRUMB units; none while the leader wades or stands in a
 * solid) and walks it, cutting corners only where the straight line is clear. It starts walking when farther than GAP_START
 * (2) from the leader, stops at GAP_STOP (1.75) and turns to face them, and steps back if pushed closer than GAP_MIN (1.5).
 * It walks around solids and never enters water. When the leader jumps a gap (> HOP_GAP of travel in the air) it hops the
 * same gap. Farther than POP_DIST (15) behind, or stuck for STUCK_SECONDS (3) while it wants to move, it pops to a free
 * dry spot just behind the leader, but never across water: then it waits at the edge facing them. When the leader
 * comes back within GAP_START its old footprints are cleared and it follows fresh ones. It always ends on dry ground outside every solid.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var GAP_MIN = 1.5, GAP_STOP = 1.75, GAP_START = 2;   // distances to the leader (arm's length rule)
  var POP_DIST = 15, STUCK_SECONDS = 3, STUCK_PROGRESS = 0.3;   // stuck: under 0.3 units of net progress toward the target
  var BODY = 0.4;             // follower body radius (added to each solid's radius; two followers keep 2 x BODY apart)
  var CRUMB = 0.5;            // spacing of the leader's breadcrumbs
  var REACH = 0.4;            // a crumb this close counts as reached
  var MAX_TRAIL = 120, MAX_DT = 0.1, EDGE = 0.5;
  var MIN_SPEED = 3.5, MAX_SPEED = 9, CATCH_UP = 1.2, BACK_SPEED = 2.5, TURN_RATE = 8;
  var HOP_HEIGHT = 1, HOP_GAP = 1.5, AIR_LIFT = 0.05;
  var STEER = [0, 0.5, 1, 1.6, 2.2];   // radians the walking direction may turn (either side) to get around something

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function angleDiff(a, b) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function inMap(x, z) {
    var B = SA.map.BOUNDS;
    return x >= B.minX + EDGE && x <= B.maxX - EDGE && z >= B.minZ + EDGE && z <= B.maxZ - EDGE;
  }

  /** True when a follower may stand at (x, z): on the map, on dry ground, outside every solid. */
  function free(x, z, solids) {
    if (!inMap(x, z) || SA.map.isWater(x, z)) return false;
    for (var i = 0; i < solids.length; i++) {
      if (Math.hypot(x - solids[i][0], z - solids[i][1]) < solids[i][2] + BODY - 1e-6) return false;
    }
    return true;
  }

  /** Walking from f to (x, z) is allowed: dry, on the map, and not deeper into any solid than f already is (so a follower
   *  that a prop landed on can still walk out). */
  function canStep(f, x, z, solids) {
    if (!inMap(x, z)) return false;
    if (SA.map.isWater(x, z) && !(SA.map.isWater(f.x, f.z) && SA.map.groundHeight(x, z) > SA.map.groundHeight(f.x, f.z))) return false;
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i], lim = s[2] + BODY, d = Math.hypot(x - s[0], z - s[1]);
      if (d < lim - 1e-6 && d < Math.hypot(f.x - s[0], f.z - s[1]) - 1e-6) return false;
    }
    return true;
  }

  /** Straight line from a to b is walkable (sampled every ~0.4 units). */
  function lineClear(a, b, solids) {
    var n = Math.max(1, Math.ceil(dist(a, b) / 0.4));
    for (var i = 1; i <= n; i++) {
      if (!free(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n, solids)) return false;
    }
    return true;
  }

  function create(o) {
    o = o || {};
    return { x: num(o.x, 0), z: num(o.z, 0), heading: num(o.heading, 0), lift: 0, moving: false, pop: null,
      trail: [], hop: null, pendingHop: false, stuck: 0, mark: null, side: 1, hold: null };
  }

  function turnTo(f, want, dt) {
    var d = angleDiff(f.heading, want), m = TURN_RATE * dt;
    f.heading += Math.abs(d) <= m ? d : (d > 0 ? m : -m);
  }
  function faceLeader(f, leader, dt) {
    if (dist(f, leader) > 0.01) turnTo(f, Math.atan2(leader.x - f.x, leader.z - f.z), dt);
  }

  /** Leader breadcrumb trail. A jump that travels more than HOP_GAP leaves one `hop` crumb at the landing spot. */
  function record(f, leader, solids) {
    if (num(leader.lift, 0) > AIR_LIFT) { f.pendingHop = true; return; }
    var last = f.trail.length ? f.trail[f.trail.length - 1] : null;
    var far = !last || dist(last, leader) >= CRUMB;
    if (!far && !f.pendingHop) return;
    if (!free(leader.x, leader.z, solids)) return;   // wading or inside a solid: leave no crumb (the jump stays pending)
    var from = last || f;
    f.trail.push({ x: leader.x, z: leader.z, hop: f.pendingHop && dist(from, leader) > HOP_GAP });
    f.pendingHop = false;
    if (f.trail.length > MAX_TRAIL) f.trail.shift();
  }

  /** Any water on the straight line from a to b (sampled every ~0.4 units). */
  function waterBetween(a, b) {
    var n = Math.max(1, Math.ceil(dist(a, b) / 0.4));
    for (var i = 1; i < n; i++) {
      if (SA.map.isWater(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n)) return true;
    }
    return false;
  }

  /** Pop to a free dry spot just behind the leader (puff of sparkles: `f.pop` holds where from and to).
   *  With `dry` it never pops across water: it returns null (nothing changed) so the follower waits at the edge instead. */
  function popBehind(f, leader, solids, dry) {
    var from = { x: f.x, z: f.z }, h = num(leader.heading, 0), spot = null;
    for (var r = GAP_STOP; r <= 4 && !spot; r += 0.75) {
      for (var k = 0; k < 12 && !spot; k++) {
        var off = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.55;
        var x = leader.x - Math.sin(h + off) * r, z = leader.z - Math.cos(h + off) * r;
        if (free(x, z, solids)) spot = { x: x, z: z };
      }
    }
    if (!spot && free(leader.x, leader.z, solids)) spot = { x: leader.x, z: leader.z };
    if (dry && spot && waterBetween(from, spot)) return null;
    if (spot) { f.x = spot.x; f.z = spot.z; }
    f.trail = []; f.hop = null; f.pendingHop = false; f.stuck = 0; f.mark = null; f.lift = 0; f.moving = false; f.hold = null;
    f.heading = Math.atan2(leader.x - f.x, leader.z - f.z);
    f.pop = { fromX: from.x, fromZ: from.z, x: f.x, z: f.z };
    return f;
  }

  function startHop(f, to) {
    var d = dist(f, to);
    f.hop = { t: 0, dur: clamp(d / 7, 0.4, 0.9), fx: f.x, fz: f.z, tx: to.x, tz: to.z };
    f.moving = true;
  }

  function advanceHop(f, leader, solids, dt) {
    var h = f.hop;
    h.t += dt;
    var u = Math.min(1, h.t / h.dur);
    f.x = h.fx + (h.tx - h.fx) * u;
    f.z = h.fz + (h.tz - h.fz) * u;
    f.lift = 4 * HOP_HEIGHT * u * (1 - u);
    if (Math.hypot(h.tx - h.fx, h.tz - h.fz) > 0.01) turnTo(f, Math.atan2(h.tx - h.fx, h.tz - h.fz), dt);
    if (u < 1) return f;
    f.hop = null; f.lift = 0; f.x = h.tx; f.z = h.tz;
    return free(f.x, f.z, solids) ? f : popBehind(f, leader, solids);   // landing spot got taken: pop instead
  }

  /** Cut corners: drop the first crumb while the straight line to the second is clear (never past a hop crumb). */
  function smooth(f, solids) {
    var t = f.trail, guard = 0;
    while (t.length > 1 && guard++ < 6 && !t[0].hop && !t[1].hop && lineClear(f, t[1], solids)) t.shift();
  }

  /** Walk up to `len` toward (tx, tz), steering around solids and water. Returns the distance moved. */
  function walk(f, tx, tz, len, solids) {
    var base = Math.atan2(tx - f.x, tz - f.z);
    for (var i = 0; i < STEER.length; i++) {
      for (var j = 0; j < (i === 0 ? 1 : 2); j++) {
        var off = STEER[i] * (j === 0 ? f.side : -f.side), a = base + off;
        var nx = f.x + Math.sin(a) * len, nz = f.z + Math.cos(a) * len;
        if (!canStep(f, nx, nz, solids)) continue;
        if (i > 0) f.side = j === 0 ? f.side : -f.side;
        var moved = Math.hypot(nx - f.x, nz - f.z);
        f.x = nx; f.z = nz;
        return { moved: moved, angle: a };
      }
    }
    return { moved: 0, angle: base };
  }

  function step(f, leader, solids, dt) {
    dt = clamp(num(dt, 0), 0, MAX_DT);
    solids = solids || [];
    f.pop = null;
    // The leader is back within reach: old footprints (e.g. from the far bank of a river) are stale, so follow fresh from here.
    if (dist(f, leader) <= GAP_START && !f.hop && !f.pendingHop && num(leader.lift, 0) <= AIR_LIFT) f.trail = [];
    record(f, leader, solids);
    var d = dist(f, leader);
    if (d > POP_DIST && popBehind(f, leader, solids, true)) return f;   // water in the way: keep walking / waiting instead
    if (f.hop) return advanceHop(f, leader, solids, dt);

    if (f.hold !== null) {                                   // waiting at the water's edge for the leader to come back
      if (d <= GAP_START || d < f.hold - 1) f.hold = null;   // they are back (or clearly closer): follow again, fresh
      else { f.stuck = 0; f.lift = 0; f.moving = false; faceLeader(f, leader, dt); return f; }
    }
    var want = d > GAP_START || (f.moving && d > GAP_STOP);
    if (!want) {
      f.stuck = 0; f.lift = 0; f.mark = null;
      if (d < GAP_MIN) {                                   // pushed too close: step back to arm's length
        var r = walk(f, 2 * f.x - leader.x, 2 * f.z - leader.z, Math.min(BACK_SPEED * dt, GAP_MIN - d + 0.05), solids);
        f.moving = r.moved > 0;
      } else f.moving = false;
      faceLeader(f, leader, dt);
      return f;
    }

    while (f.trail.length && !f.trail[0].hop && dist(f, f.trail[0]) < REACH) f.trail.shift();
    smooth(f, solids);
    var target = f.trail.length ? f.trail[0] : leader;
    if (target.hop) { f.trail.shift(); startHop(f, target); return advanceHop(f, leader, solids, dt); }

    var speed = clamp(MIN_SPEED + CATCH_UP * (d - GAP_STOP), MIN_SPEED, MAX_SPEED);
    var before = dist(f, target);
    var m = f.mark;
    if (!m || m.target !== target) {                  // a new target (e.g. a crumb was reached) counts as progress
      m = f.mark = { x: f.x, z: f.z, ux: (target.x - f.x) / Math.max(before, 0.001), uz: (target.z - f.z) / Math.max(before, 0.001), target: target };
      f.stuck = 0;
    }
    var r2 = walk(f, target.x, target.z, Math.min(speed * dt, Math.max(before, 0.001)), solids);
    f.moving = r2.moved > 0;
    // stuck = no progress toward the target: net movement along the way to it (shuffling or sliding along a bank is not progress)
    if ((f.x - m.x) * m.ux + (f.z - m.z) * m.uz > STUCK_PROGRESS) f.mark = null; else f.stuck += dt;
    if (!f.mark) f.stuck = 0;
    turnTo(f, r2.moved > 0 ? r2.angle : Math.atan2(target.x - f.x, target.z - f.z), dt);
    if (f.stuck > STUCK_SECONDS) {
      if (popBehind(f, leader, solids, true)) return f;
      // water between us: no teleport. Drop the footprints and wait at the edge facing the leader.
      f.trail = []; f.stuck = 0; f.mark = null; f.moving = false; f.hold = d;
      faceLeader(f, leader, dt);
    }
    return f;
  }

  /** A line of followers: followers[0] trails the player, each next one trails the one ahead and avoids the others. */
  function stepAll(followers, player, solids, dt) {
    for (var i = 0; i < followers.length; i++) {
      var s = (solids || []).slice();
      for (var j = 0; j < followers.length; j++) if (j !== i) s.push([followers[j].x, followers[j].z, BODY]);
      step(followers[i], i === 0 ? player : followers[i - 1], s, dt);
    }
    return followers;
  }

  /** A group of followers (AS-0327): each one trails the player itself (own breadcrumbs, own wait at the water) and avoids the others. */
  function stepGroup(followers, player, solids, dt) {
    for (var i = 0; i < followers.length; i++) {
      var s = (solids || []).slice();
      for (var j = 0; j < followers.length; j++) if (j !== i) s.push([followers[j].x, followers[j].z, BODY]);
      step(followers[i], player, s, dt);
    }
    return followers;
  }

  SA.follow = { GAP_MIN: GAP_MIN, GAP_STOP: GAP_STOP, GAP_START: GAP_START, POP_DIST: POP_DIST, STUCK_SECONDS: STUCK_SECONDS,
    BODY: BODY, HOP_HEIGHT: HOP_HEIGHT, create: create, step: step, stepAll: stepAll, stepGroup: stepGroup, free: free };
})(typeof window !== 'undefined' ? window : globalThis);
