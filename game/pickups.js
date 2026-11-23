/* SA.pickups: pure, seeded collectable finds scattered around the world (no THREE, no DOM; node:vm tested).
 * Load after game/map.js, game/perch.js, game/inventory.js and game/data/pickups.js.
 *
 *   SA.pickups.layout({ trees, avoid?, seed? }) -> [{ id, rule, item, where, biome, x, y, z }]
 *       Deterministic for the same input. Rules come from game/data/pickups.js: 'tree' pickups hang on canopy branch spots
 *       (SA.perch.spots, y = canopy height, climb to reach), 'ground' ones lie on dry land, 'water' ones on the bank near
 *       the river/pond. `trees` = [{ x, z, y?, scale?, kind? }], `avoid` = [[x, z], ...] decor to keep clear of.
 *   SA.pickups.create({ trees, avoid, seed }) -> world
 *       world.list()                       every spot, each with `available` (false while it is growing back)
 *       world.nearest(player, radius?)     nearest available spot the player can pick up, or null
 *       world.collect(id)                  -> { id, item, spot } after adding 1 item to SA.inventory, or null (unknown, already
 *                                          taken, or the inventory refused); starts that spot's respawn timer (rule.respawn s)
 *       world.collectNear(player, radius?) nearest + collect in one go (walking into one: default WALK_RADIUS;
 *                                          pressing Space next to one: pass SPACE_RADIUS)
 *       world.update(dt)                   -> [spot, ...] that grew back this step (dt clamped to 1 s)
 * player = { x, z, y? }. Ground/water pickups only need to be close horizontally; tree pickups also need the player's hands
 * (y + 1) within REACH_VERTICAL of the branch, so you climb up for them. Nothing is persisted (the world refills on reload).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var WALK_RADIUS = 1.3;
  var SPACE_RADIUS = 2.4;
  var REACH_VERTICAL = 2.5;
  var HOVER = 0.6;          // ground/water finds float this far above the terrain so they read and bob
  var GAP = 1.6;            // min distance between a find and decor / another find
  var MAX_DT = 1;

  function hash(str, seed) {
    var h = (seed === undefined ? 1 : seed) >>> 0 ^ 2166136261;
    for (var i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    return h;
  }

  function clear(x, z, taken) {
    for (var i = 0; i < taken.length; i++) {
      var dx = taken[i][0] - x, dz = taken[i][1] - z;
      if (dx * dx + dz * dz < GAP * GAP) return false;
    }
    return true;
  }

  function onLand(M, x, z, where) {
    var y = M.groundHeight(x, z);
    if (SA.player && SA.player.inSpawnZone(x, z)) return false;       // the spawn stays clear (AS-0105)
    if (SA.station && SA.station.inFootprint(x, z, 1)) return false;  // and so does the research station's footprint
    if (where === 'water') return y >= M.WATER_LEVEL + 0.15 && M.nearWater(x, z, 3.5);
    return y >= M.WATER_LEVEL + 0.45;
  }

  // Quadrant of a strip: bit 0 = east half, bit 1 = south half. Finds are dealt round-robin into the four so none stays empty (AS-0248).
  function quad(range, x, z) { return (x >= (range.lo + range.hi) / 2 ? 1 : 0) | (z >= 0 ? 2 : 0); }

  // A random point on the bank of the river or pond that lies in this biome strip (null when it has no water).
  function bankPoint(M, rand, range) {
    var pond = M.POND.x >= range.lo && M.POND.x < range.hi, river = M.RIVER.centerX >= range.lo && M.RIVER.centerX < range.hi;
    if (!pond && !river) return null;
    if (pond && (!river || rand() < 0.5)) {
      var a = rand() * Math.PI * 2, r = M.POND.radius + 1 + rand() * 2;
      return [M.POND.x + Math.cos(a) * r, M.POND.z + Math.sin(a) * r];
    }
    var z = M.BOUNDS.minZ + 2 + rand() * (M.BOUNDS.maxZ - M.BOUNDS.minZ - 4), side = rand() < 0.5 ? -1 : 1;
    return [M.riverX(z) + side * (M.RIVER.halfWidth + 1 + rand() * 2), z];
  }

  function layout(opts) {
    var M = SA.map, out = [], taken = (opts.avoid || []).map(function (a) { return [a[0], a[1]]; });
    var seed = opts.seed === undefined ? 1 : opts.seed, canopy = {};
    SA.data.all('pickups').forEach(function (rule) {
      rule.biomes.forEach(function (biome) {
        var rand = M.rng(hash(rule.id + '/' + biome, seed)), range = M.biomeRange(biome);
        if (rule.where === 'tree' && !canopy[biome]) canopy[biome] = SA.perch.spots(opts.trees, biome, seed);
        var free = rule.where === 'tree' ? canopy[biome].slice() : null;
        for (var n = 0, made = 0; made < rule.count && n < rule.count * 60; n++) {
          var x, y, z;
          if (free) {
            if (!free.length) break;
            var want = made % 4, pool = free.filter(function (f) { return quad(range, f.x, f.z) === want; });
            var pick = pool.length ? pool[Math.floor(rand() * pool.length)] : free[Math.floor(rand() * free.length)];
            var s = free.splice(free.indexOf(pick), 1)[0];
            x = s.x; y = s.y; z = s.z;
          } else if (rule.where === 'water') {
            var bp = bankPoint(M, rand, range);
            if (!bp) break;
            x = bp[0]; z = bp[1];
            if (!onLand(M, x, z, 'water') || !clear(x, z, taken)) continue;
            y = M.groundHeight(x, z) + HOVER;
            taken.push([x, z]);
          } else {
            var q = made % 4, cx = (range.lo + range.hi) / 2, xa = q & 1 ? cx : range.lo + 2, xb = q & 1 ? range.hi - 2 : cx;
            var za = q & 2 ? 0 : M.BOUNDS.minZ + 2, zb = q & 2 ? M.BOUNDS.maxZ - 2 : 0;
            x = xa + rand() * (xb - xa);
            z = za + rand() * (zb - za);
            if (!onLand(M, x, z, rule.where) || !clear(x, z, taken)) continue;
            y = M.groundHeight(x, z) + HOVER;
            taken.push([x, z]);
          }
          out.push({ id: rule.id + '#' + biome + '#' + made, rule: rule.id, item: rule.item, where: rule.where, biome: biome, x: x, y: y, z: z });
          made++;
        }
      });
    });
    return out;
  }

  function within(player, spot, radius) {
    var dx = spot.x - player.x, dz = spot.z - player.z;
    if (dx * dx + dz * dz > radius * radius) return false;
    if (spot.where !== 'tree') return true;
    return Math.abs(spot.y - ((player.y || 0) + 1)) <= REACH_VERTICAL;
  }

  function create(opts) {
    var spots = layout(opts), wait = {}, byId = {};
    var respawn = {};
    SA.data.all('pickups').forEach(function (r) { respawn[r.id] = r.respawn; });
    spots.forEach(function (s) { byId[s.id] = s; });

    function nearest(player, radius) {
      if (!player || typeof player.x !== 'number' || typeof player.z !== 'number') return null;
      var r = typeof radius === 'number' ? radius : WALK_RADIUS, best = null, bd = Infinity;
      spots.forEach(function (s) {
        if (wait[s.id] !== undefined || !within(player, s, r)) return;
        var d = Math.hypot(s.x - player.x, s.z - player.z);
        if (d < bd) { bd = d; best = s; }
      });
      return best;
    }

    function collect(id) {
      var s = byId[id];
      if (!s || wait[id] !== undefined || !SA.inventory.add(s.item, 1)) return null;
      wait[id] = respawn[s.rule];
      return { id: id, item: s.item, spot: s };
    }

    function update(dt) {
      var back = [];
      dt = Math.max(0, Math.min(typeof dt === 'number' && isFinite(dt) ? dt : 0, MAX_DT));
      Object.keys(wait).forEach(function (id) {
        wait[id] -= dt;
        if (wait[id] <= 0) { delete wait[id]; back.push(byId[id]); }
      });
      return back;
    }

    return {
      list: function () { return spots.map(function (s) { var c = {}; for (var k in s) c[k] = s[k]; c.available = wait[s.id] === undefined; return c; }); },
      nearest: nearest,
      collect: collect,
      /** Fill `out` (cleared first, reused, no allocation) with the available spots within `radius` of the player; returns it. */
      reachable: function (player, radius, out) {
        out.length = 0;
        if (!player || typeof player.x !== 'number' || typeof player.z !== 'number') return out;
        for (var i = 0; i < spots.length; i++) if (wait[spots[i].id] === undefined && within(player, spots[i], radius)) out.push(spots[i]);
        return out;
      },
      collectNear: function (player, radius) { var s = nearest(player, radius); return s ? collect(s.id) : null; },
      update: update
    };
  }

  SA.pickups = { WALK_RADIUS: WALK_RADIUS, SPACE_RADIUS: SPACE_RADIUS, REACH_VERTICAL: REACH_VERTICAL, layout: layout, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
