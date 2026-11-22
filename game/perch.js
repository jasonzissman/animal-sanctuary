/* SA.perch: pure, seeded perching for tree-dwelling animals (animal data `perch: "tree"`). No THREE, no DOM; node:vm tested.
 * Perchers sit on canopy branches of the procedural trees in their biome and hop between nearby trees, so they stay
 * out of reach from the ground (SA.reach compares heights).
 *
 *   SA.perch.KINDS                 { jungle: {height, radius}, pine: {...} }  canopy size per tree kind (tree scale 1)
 *   SA.perch.spots(trees, biome, seed?) -> [{ x, y, z, tree }]  branch spots (y = world height of the perch) on every
 *       tree { x, z, y?, scale?, kind? } standing in `biome`; a few seeded points on a ring at canopy height.
 *   SA.perch.create({ biome, trees, seed, home?, hopRange? }) -> hopper
 *       hopper.update(dt) -> { x, y, z, heading, hopping, perched }   y is the world height of the animal's feet
 *       hopper.hold(seconds?) / release()  stay put (a seconds-less hold lasts until release)
 *       hopper.state() -> { x, y, z, heading, mode, held, spot }
 *   SA.perch.hopsOk(spotA, spotB, range) -> boolean   whether a hop between two spots is short enough
 * Hops are short arcs (HOP_TIME seconds) to a spot within `hopRange` (default 7) horizontally; when no other spot is in
 * range the animal stays and shuffles to another branch of the same tree. Speed is gentle so a child can follow it.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var KINDS = { jungle: { height: 5.2, radius: 0.9 }, pine: { height: 3.2, radius: 0.55 } };
  var DEFAULT_KIND = 'jungle';
  var PER_TREE = 3;            // branch spots per tree
  var HOP_RANGE = 7;
  var HOP_TIME = 0.9;          // seconds per hop
  var HOP_ARC = 0.9;           // extra height at the top of a hop
  var SIT = [1.5, 4];          // seconds perched between hops
  var MAX_DT = 0.1;

  function spots(trees, biome, seed) {
    var M = SA.map, rand = M.rng(seed === undefined ? 1 : seed), out = [];
    (trees || []).forEach(function (t, ti) {
      if (!t || typeof t.x !== 'number' || typeof t.z !== 'number' || M.biomeAt(t.x) !== biome) return;
      var k = KINDS[t.kind] || KINDS[DEFAULT_KIND], s = typeof t.scale === 'number' && t.scale > 0 ? t.scale : 1;
      var ground = typeof t.y === 'number' ? t.y : M.groundHeight(t.x, t.z), a0 = rand() * Math.PI * 2;
      for (var i = 0; i < PER_TREE; i++) {
        var a = a0 + (i * Math.PI * 2) / PER_TREE + (rand() - 0.5) * 0.4, r = k.radius * s * (0.55 + 0.35 * rand());
        out.push({ x: t.x + Math.cos(a) * r, z: t.z + Math.sin(a) * r, y: ground + k.height * s, tree: ti });
      }
    });
    return out;
  }

  function hopsOk(a, b, range) { return !!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) <= (range === undefined ? HOP_RANGE : range); }

  function create(opts) {
    var M = SA.map, rand = M.rng(opts.seed === undefined ? 1 : opts.seed), range = opts.hopRange === undefined ? HOP_RANGE : opts.hopRange;
    var all = spots(opts.trees, opts.biome, opts.seed);
    var home = opts.home || { x: 0, z: 0 };
    var cur = 0, from = null, to = null, k = 0, held = 0;
    var s = { mode: 'sit', timer: 0.5 + rand() * 2, heading: rand() * Math.PI * 2 - Math.PI };
    for (var i = 1; i < all.length; i++) {          // start on the spot nearest home
      if (Math.hypot(all[i].x - home.x, all[i].z - home.z) < Math.hypot(all[cur].x - home.x, all[cur].z - home.z)) cur = i;
    }
    var pos = all.length ? { x: all[cur].x, y: all[cur].y, z: all[cur].z } : { x: home.x, y: M.groundHeight(home.x, home.z), z: home.z };

    function pickNext() {
      var best = [], i;
      for (i = 0; i < all.length; i++) if (i !== cur && hopsOk(all[cur], all[i], range)) best.push(i);
      if (!best.length) { s.timer = SIT[0] + rand() * (SIT[1] - SIT[0]); return; }
      to = best[Math.floor(rand() * best.length)];
      from = { x: pos.x, y: pos.y, z: pos.z };
      s.heading = Math.atan2(all[to].x - pos.x, all[to].z - pos.z);
      k = 0; s.mode = 'hop';
    }

    function update(dt) {
      dt = Math.max(0, Math.min(dt, MAX_DT));
      var hopping = false;
      if (!all.length || held === Infinity || held > 0) {
        if (held !== Infinity && held > 0) held = Math.max(0, held - dt);
        if (s.mode === 'hop') hopping = advance(dt);   // finish a hop in progress so it always lands on a branch
      } else if (s.mode === 'sit') {
        s.timer -= dt;
        if (s.timer <= 0) pickNext();
      } else {
        hopping = advance(dt);
      }
      return { x: pos.x, y: pos.y, z: pos.z, heading: s.heading, hopping: hopping, perched: s.mode === 'sit' };
    }

    function advance(dt) {
      k = Math.min(1, k + dt / HOP_TIME);
      var e = all[to];
      pos.x = from.x + (e.x - from.x) * k;
      pos.z = from.z + (e.z - from.z) * k;
      pos.y = from.y + (e.y - from.y) * k + HOP_ARC * Math.sin(Math.PI * k);
      if (k >= 1) {
        cur = to; pos.x = e.x; pos.y = e.y; pos.z = e.z;
        s.mode = 'sit'; s.timer = SIT[0] + rand() * (SIT[1] - SIT[0]);
        return false;
      }
      return true;
    }

    return {
      update: update,
      hold: function (seconds) {
        if (seconds === undefined) held = Infinity;
        else if (held !== Infinity) held = Math.max(held, seconds);
      },
      release: function () { held = 0; },
      state: function () { return { x: pos.x, y: pos.y, z: pos.z, heading: s.heading, mode: s.mode, held: held > 0, spot: cur }; },
    };
  }

  SA.perch = { KINDS: KINDS, HOP_RANGE: HOP_RANGE, HOP_TIME: HOP_TIME, spots: spots, hopsOk: hopsOk, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
