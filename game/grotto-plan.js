/* SA.grottoPlan: the hidden grotto behind each waterfall (AS-0174). Pure (no THREE, no DOM; node:vm tested).
 * Load after game/mountain-plan.js and game/jungle-plan.js (it reads their waterfall sites). Each waterfall hides a short tunnel through the
 * middle cliff block (the water curtain is its door) that opens into a small round cave with crystals and an old chest (el cofre).
 * Everything is in the waterfall's LOCAL frame, origin at the sheet (x along the fall, +x = out toward the pond / downhill, z across the face),
 * turned into the world by the site's yaw (the montaña's is 0, the selva's turns it back toward the pond).
 *
 *   SA.grottoPlan.sites()      -> [{ id: 'montana'|'selva', biome, yaw, origin: {x, z}, chamber: { lx, x, z, r }, chest: { lx, x, z, yaw },
 *                                    tunnel: { halfW, len, top }, ring: [[x, z, r, 99]], reach, r }]   (one per waterfall that exists)
 *       The cave floor is the terrain; `ring` are the rock walls round the cave (a gap faces the tunnel), `r` the footprint radius round the
 *       chamber centre that scenery, animals and pickups keep out of, `reach` how close the player stands to open the chest.
 *   SA.grottoPlan.get(id)      -> one site or null            SA.grottoPlan.solids()  every site's ring walls (scene.js adds them to the obstacles)
 *   SA.grottoPlan.near(x, z, pad?)    true within pad of a chamber footprint (decor-plan, plans' near() use it)
 *   SA.grottoPlan.zone(x, z)   -> { site, lx, lz, zone } for the nearest site within 14 m: zone 'sheet' (in the water curtain), 'tunnel',
 *                                 'chamber' or 'outside'; null when no grotto is near.   SA.grottoPlan.nearChest(x, z) -> the site whose chest is in reach, or null
 *   SA.grottoPlan.toWorld(site, lx, lz) -> { x, z }
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  var HALF_W = 0.8, TUNNEL_LEN = 2.4, TUNNEL_H = 2.4;     // the tunnel through the middle cliff block (its width is the block's 1.6 m)
  var CH_X = -4.6, CH_R = 2.2, RING_R = 3.1, RING_SOLID = 0.9, RING_N = 12, GAP = 0.95;   // the cave: centre, visible radius, wall ring
  var CHEST_DX = -1.2, REACH = 1.9, NEAR_ZONE = 14;
  var cached = null, cachedSolids = null;

  function toWorld(origin, yaw, lx, lz) {
    var c = Math.cos(yaw), s = Math.sin(yaw);
    return { x: origin.x + lx * c + lz * s, z: origin.z - lx * s + lz * c };
  }

  /** The wall ring of a cave centred at local (CH_X, off): `open` is the local angle from its centre toward the tunnel's inner end, where the gap is. */
  function ringFor(wp, cx, off, open, k) {
    var ring = [];
    for (var i = 0; i < RING_N; i++) {
      var a = i / RING_N * Math.PI * 2, d = Math.abs(((a - open + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < GAP) continue;   // the gap leaves the entrance open
      var p = wp(cx + Math.cos(a) * RING_R * k, off + Math.sin(a) * RING_R * k);
      ring.push([p.x, p.z, RING_SOLID * k, 99]);
    }
    return ring;
  }

  /** How much room the cave's walls leave to the montaña's trail and boulders (bigger is better; the selva has neither). */
  function trailRoom(ring, ctr, k) {
    var T = SA.mountainTrail, MP = SA.mountainPlan, room = Infinity;
    if (T && T.distance) room = ring.concat([[ctr.x, ctr.z]]).reduce(function (m, p) { return Math.min(m, T.distance(p[0], p[1]) - 0.9 - (p.length > 2 ? p[2] : RING_R * k * 0.5)); }, Infinity);   // a walker on the trail's centre line (body 0.6 + a little) never touches a wall
    if (MP) MP.get().boulders.forEach(function (b) {   // no boulder inside the cave (one under a wall is just part of the rock)
      room = Math.min(room, Math.hypot(b.x - ctr.x, b.z - ctr.z) - b.r - CH_R * k - 0.6);
    });
    if (SA.peaks && SA.peaks.LIST) SA.peaks.LIST.forEach(function (pk) {   // and off the climbable peaks' bases
      ring.forEach(function (p) { room = Math.min(room, Math.hypot(pk.x - p[0], pk.z - p[1]) - SA.peaks.BASE_R - p[2]); });
    });
    return room;
  }

  function build(id, biome, W, origin, yaw) {
    var M = SA.map, wp = function (lx, lz) { return toWorld(origin, yaw, lx, lz); }, top = -Infinity, best = null;
    // The cave sits straight behind the fall at full size unless the trail, a boulder or a peak is in the way: then it shrinks (k) and/or bends aside.
    [1, 0.82, 0.68].forEach(function (k) {
      [0.3, 1.0, 1.8].forEach(function (gap) {
        var cx = -TUNNEL_LEN - CH_R * k - gap;
        [0, 1.5, -1.5, 3, -3, 4.5, -4.5].forEach(function (off) {
          var open = Math.atan2(-off, -TUNNEL_LEN - cx), ring = ringFor(wp, cx, off, open, k), room = trailRoom(ring, wp(cx, off), k);
          var score = Math.min(room, 0.4) * 3 - Math.abs(off) * 0.08 - gap * 0.05 - (1 - k) * 0.6;   // clear first, then big and straight behind the fall
          if (!best || score > best.score) best = { k: k, cx: cx, off: off, open: open, ring: ring, room: room, score: score };
        });
      });
    });
    var k = best.k, cx = best.cx, off = best.off, open = best.open, ctr = wp(cx, off), dx = CHEST_DX * k;
    var chest = wp(cx + Math.cos(open) * dx, off + Math.sin(open) * dx);
    for (var u = 0; u <= 4; u++) { var q = wp(-u * TUNNEL_LEN / 4, 0), gh = M.groundHeight(q.x, q.z); if (gh > top) top = gh; }
    return { id: id, biome: biome, yaw: yaw, origin: origin, scale: k, chamber: { lx: cx, lz: off, x: ctr.x, z: ctr.z, r: CH_R * k, ringR: RING_R * k, open: open },
      chest: { lx: cx + Math.cos(open) * dx, lz: off + Math.sin(open) * dx, x: chest.x, z: chest.z, yaw: yaw }, tunnel: { halfW: HALF_W, len: TUNNEL_LEN, top: top + TUNNEL_H },
      ring: best.ring, reach: REACH, r: (RING_R + RING_SOLID) * k + 0.4, room: best.room, pool: W };
  }

  function sites() {
    if (cached) return cached;
    var out = [], MP = SA.mountainPlan, JP = SA.junglePlan, w;
    w = MP && MP.get().waterfall;
    if (w) out.push(build('montana', 'montana', w, { x: w.fx, z: w.z }, 0));
    w = JP && JP.get().waterfall;
    if (w) out.push(build('selva', 'selva', w, { x: w.x, z: w.z }, w.yaw || 0));
    return (cached = out);
  }

  function get(id) { var s = sites(); for (var i = 0; i < s.length; i++) if (s[i].id === id) return s[i]; return null; }

  function solids() {
    if (cachedSolids) return cachedSolids;
    var out = [];
    sites().forEach(function (s) { Array.prototype.push.apply(out, s.ring); });
    return (cachedSolids = out);
  }

  function near(x, z, pad) {
    var s = sites(), p = pad || 0;
    for (var i = 0; i < s.length; i++) if (Math.hypot(x - s[i].chamber.x, z - s[i].chamber.z) < s[i].r + p) return true;
    return false;
  }

  function toLocal(site, x, z) {
    var c = Math.cos(site.yaw), s = Math.sin(site.yaw), dx = x - site.origin.x, dz = z - site.origin.z;
    return { lx: dx * c - dz * s, lz: dx * s + dz * c };
  }

  function zone(x, z) {
    var s = sites(), best = null, bd = NEAR_ZONE;
    for (var i = 0; i < s.length; i++) {
      var d = Math.hypot(x - s[i].origin.x, z - s[i].origin.z);
      if (d < bd) { bd = d; best = s[i]; }
    }
    if (!best) return null;
    var l = toLocal(best, x, z), name = 'outside';
    if (Math.abs(l.lz) < HALF_W + 0.3 && l.lx > -0.5 && l.lx < 0.5) name = 'sheet';
    else if (Math.abs(l.lz) < HALF_W + 0.3 && l.lx <= -0.5 && l.lx > -TUNNEL_LEN) name = 'tunnel';
    else if (Math.hypot(l.lx - best.chamber.lx, l.lz - best.chamber.lz) < best.chamber.ringR) name = 'chamber';
    return { site: best, lx: l.lx, lz: l.lz, zone: name };
  }

  function nearChest(x, z) {
    var s = sites();
    for (var i = 0; i < s.length; i++) if (Math.hypot(x - s[i].chest.x, z - s[i].chest.z) < s[i].reach) return s[i];
    return null;
  }

  SA.grottoPlan = { sites: sites, get: get, solids: solids, near: near, zone: zone, nearChest: nearChest, toLocal: toLocal,
    toWorld: function (site, lx, lz) { return toWorld(site.origin, site.yaw, lx, lz); },
    TUNNEL_LEN: TUNNEL_LEN, TUNNEL_H: TUNNEL_H, HALF_W: HALF_W, RING_R: RING_R, CH_R: CH_R };
})(typeof window !== 'undefined' ? window : globalThis);
