/* SA.missionSpawn: where a story mission's animals stand (AS-0233, slice 2 of AS-0173). Pure (no THREE, no DOM; node:vm tested).
 * A mission row declares `spawn: { baby: 'cerdito', mama: 'cerda', minApart: 14 }` (animal ids from game/data/animals.js; a replay
 * or another mission can name other species). Nothing here special-cases an animal id: the biome comes from the mamá's data row.
 * Each step may carry `at: 'baby' | 'mama'`: which spawned animal that step's world target is (the compass, AS-0228, points at it).
 *
 *   SA.missionSpawn.place(spec, seed, opts?)   -> { baby: {id,x,z,y,rotY}, mama: {...} } | null   PURE and deterministic from the seed.
 *       Both spots are inside the map, in the mamá's biome, on dry flat ground (not water, not near the river/pond), outside every
 *       solid (opts.solids: [[x, z, r(, h)], ...], the same list the player collides with), outside the station and the spawn
 *       circle, and at least `minApart` (default 14) apart, so finding mamá takes a walk.
 *   SA.missionSpawn.sync(opts?)  -> the current spawn { key, id, seed, baby, mama } | null. Reads SA.missions.active(): places on a
 *       new mission/seed (opts.solids is a function returning the list), clears when none runs; the same run keeps the same spots
 *       (a reload re-places them identically). Listeners get the change (onChange).
 *   SA.missionSpawn.current()    the spawn without re-reading the mission;  onChange(fn) -> unsubscribe
 *   SA.missionSpawn.target(stepData, spawn?) -> { x, z, role, id } | null   the step's world target (`at` role), or null
 *   SA.missionSpawn.locate(id)   -> { x, z, r } | null   where a spawned animal is, by animal id (feeds the runtime's 'find' step)
 *   SA.missionSpawn.waiting(stepData) -> true while the baby is still to be found (it cries): the step is a 'find' step
 *   SA.missionSpawn.create({ missions? })     a separate instance (tests)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var MIN_APART = 14, MARGIN = 1.2, EDGE = 4, TRIES = 600, REACH = 2.5;

  function mapOf() { return SA.map; }

  function solidOk(x, z, solids) {
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (Math.hypot(s[0] - x, s[1] - z) < s[2] + MARGIN) return false;
    }
    return true;
  }

  function spotOk(x, z, biome, solids, strict) {
    var M = mapOf(), B = M.BOUNDS;
    if (x < B.minX + EDGE || x > B.maxX - EDGE || z < B.minZ + EDGE || z > B.maxZ - EDGE) return false;
    if (M.biomeAt(x) !== biome || M.isWater(x, z)) return false;
    if (M.groundHeight(x, z) < M.WATER_LEVEL + 0.45 || M.nearWater(x, z, 1.5)) return false;
    if (strict) {      // flat enough to stand on: no step of more than 0.6 within 1 unit
      var h = M.groundHeight(x, z);
      if (Math.abs(M.groundHeight(x + 1, z) - h) > 0.6 || Math.abs(M.groundHeight(x, z + 1) - h) > 0.6) return false;
    }
    if (SA.station && SA.station.inFootprint(x, z, 2.5)) return false;
    if (SA.player && SA.player.inSpawnZone && SA.player.inSpawnZone(x, z, 2)) return false;
    return solidOk(x, z, solids);
  }

  function pick(rand, strip, biome, solids, far) {
    var M = mapOf(), half = (strip.hi - strip.lo) / 2 - EDGE;
    function ok(x, z, strict) { return spotOk(x, z, biome, solids, strict) && (!far || far(x, z)); }
    for (var t = 0; t < TRIES; t++) {
      var x = strip.centerX + (rand() * 2 - 1) * half, z = M.BOUNDS.minZ + EDGE + rand() * (M.BOUNDS.maxZ - M.BOUNDS.minZ - 2 * EDGE);
      if (ok(x, z, t < TRIES * 0.7)) return [x, z];
    }
    for (var gx = strip.lo + EDGE; gx <= strip.hi - EDGE; gx += 2) {         // a deterministic scan when luck ran out
      for (var gz = M.BOUNDS.minZ + EDGE; gz <= M.BOUNDS.maxZ - EDGE; gz += 2) if (ok(gx, gz, false)) return [gx, gz];
    }
    return null;
  }

  function place(spec, seed, opts) {
    var M = mapOf(), solids = (opts && opts.solids) || [];
    var mama = spec && SA.data.get('animals', spec.mama), baby = spec && SA.data.get('animals', spec.baby);
    if (!mama || !baby) return null;
    var strip = M.biomeRange(mama.biome);
    if (!strip) return null;
    var apart = typeof spec.minApart === 'number' ? spec.minApart : MIN_APART;
    var rand = M.rng(((typeof seed === 'number' ? seed : 1) >>> 0) + 4001);
    var b = pick(rand, strip, mama.biome, solids, null);
    if (!b) return null;
    var m = pick(rand, strip, mama.biome, solids, function (x, z) { return Math.hypot(x - b[0], z - b[1]) >= apart; });
    if (!m) return null;
    function at(id, p, face) { return { id: id, x: p[0], z: p[1], y: M.groundHeight(p[0], p[1]), rotY: face }; }
    return { baby: at(baby.id, b, (rand() - 0.5) * 6.28), mama: at(mama.id, m, (rand() - 0.5) * 6.28) };
  }

  function target(step, spawn) {
    var role = step && step.at;
    var s = spawn && (role === 'baby' || role === 'mama') ? spawn[role] : null;
    return s ? { x: s.x, z: s.z, role: role, id: s.id } : null;
  }

  function create(opts) {
    opts = opts || {};
    var cur = null, listeners = [];
    function missions() { return opts.missions || SA.missions; }
    function emit() { listeners.slice().forEach(function (f) { try { f(cur); } catch (e) { /* a view never breaks the loop */ } }); }
    function sync(o) {
      var a = null;
      try { a = missions().active(); } catch (e) { a = null; }
      var spec = a && a.mission && a.mission.spawn;
      var key = spec ? a.id + ':' + a.seed : null;
      if ((cur && cur.key) === key) return cur;
      var solids = o && typeof o.solids === 'function' ? o.solids() : (o && o.solids) || [];
      var spots = spec ? place(spec, a.seed, { solids: solids }) : null;
      cur = spots ? { key: key, id: a.id, seed: a.seed, baby: spots.baby, mama: spots.mama } : null;
      emit();
      return cur;
    }
    function locate(id) {
      if (!cur) return null;
      var s = cur.baby.id === id ? cur.baby : cur.mama.id === id ? cur.mama : null;
      return s ? { x: s.x, z: s.z, r: REACH } : null;
    }
    return {
      sync: sync, locate: locate, current: function () { return cur; },
      target: function (step, spawn) { return target(step, spawn || cur); },
      waiting: function (step) { return !!cur && !!step && step.kind === 'find' && step.at === 'baby'; },
      onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      create: create
    };
  }

  var api = create();
  api.place = place;
  api.MIN_APART = MIN_APART;
  SA.missionSpawn = api;
})(typeof window !== 'undefined' ? window : globalThis);
