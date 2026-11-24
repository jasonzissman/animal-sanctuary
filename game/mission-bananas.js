/* SA.missionBananas: the collectable pickups of a counted mission step (AS-0326, slice 1 of AS-0183: the monkey's birthday). Pure (no THREE,
 * no DOM; unit-tested in node:vm). A mission row declares `bananas: { item, n, biome? }`: `n` pickups of `item` stand on dry ground in
 * `biome` ('selva' by default) ONLY while that mission runs, and are gone the moment it ends or is abandoned. The 'collect' step
 * { kind: 'collect', item, n } is the generic counted kind (game/data/step-kinds.js); this module only places and picks up. Nothing here
 * knows a mission or an animal id.
 *
 *   SA.missionBananas.place(spec, seed, opts?) -> [{ id, x, z, y, taken:false }] | null   PURE, deterministic from the seed; opts.solids
 *                                                  [[x, z, r], ...] (the walk list) are kept clear. Spots are spread apart, in the biome only.
 *   SA.missionBananas.sync(opts?)   -> the current { key, spec, items } | null; reads SA.missions.active(): places on a new mission/seed,
 *                                      clears when none runs
 *   SA.missionBananas.update(player) polled each frame (SA.missionRuntime calls it): while the current step is the 'collect' of this item
 *                                      and the player walks within PICK_REACH of an untaken one, it is taken, the runtime gets
 *                                      { type: 'collected', item } and the count is spoken (number:1 / number:2 / number:3). A step past the
 *                                      collect (a reload on the next step) takes the rest silently so none are left standing.
 *   SA.missionBananas.locate(id)    -> { x, z, r } | null   the nearest untaken pickup when id is the item
 *   SA.missionBananas.target(step)  -> { x, z, role, id } | null   the compass target of the collect step: the next banana (nearest to `from`)
 *   SA.missionBananas.visible()     -> the untaken pickups that exist right now (the renderer draws these)
 *   AS-0348: `bananas.bag: true` also puts each pickup into the inventory (Mission 8's strawberries); the pickups wait (shown() false) until their
 *   'collect' step is current, which need not be the first step. SA.missionBananas.shown() -> the collect step is current (the renderer draws only then).
 *   SA.missionBananas.current()     the state; onChange(fn) -> unsubscribe; setSolids(listOrFn) the walk list kept clear
 *   SA.missionBananas.create({ missions?, audio?, report?, track?, solids? })   a separate instance (tests)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var PICK_REACH = 1.6, APART = 9, EDGE = 4, TRIES = 400, MIN_FROM_START = 10, MAX_FROM_START = 42;

  function startPoint() {
    try { if (SA.station && SA.station.spawn) return SA.station.spawn(); } catch (e) { /* fall through */ }
    return { x: 0, z: 0 };
  }

  function dryOk(x, z, solids, range) {
    var M = SA.map, B = M.BOUNDS;
    if (x < range.lo + EDGE || x > range.hi - EDGE || z < B.minZ + EDGE || z > B.maxZ - EDGE) return false;
    var h = M.groundHeight(x, z);
    if (M.isWater(x, z) || M.nearWater(x, z, 1.2) || h < M.WATER_LEVEL + 0.45) return false;
    if (Math.abs(M.groundHeight(x + 1, z) - h) > 0.6 || Math.abs(M.groundHeight(x, z + 1) - h) > 0.6) return false;
    if (SA.station && SA.station.inFootprint(x, z, 2.5)) return false;
    if (SA.player && SA.player.inSpawnZone && SA.player.inSpawnZone(x, z)) return false;
    for (var i = 0; i < solids.length; i++) if (Math.hypot(solids[i][0] - x, solids[i][1] - z) < solids[i][2] + 1) return false;
    return true;
  }

  function place(spec, seed, opts) {
    var M = SA.map, range = spec && M && M.biomeRange ? M.biomeRange(spec.biome || 'selva') : null;
    if (!range) return null;
    var solids = (opts && opts.solids) || [], S = startPoint();
    var rand = M.rng(((typeof seed === 'number' ? seed : 1) >>> 0) + 7121);
    var out = [];
    for (var t = 0; t < TRIES && out.length < spec.n; t++) {
      var x = range.lo + EDGE + rand() * (range.hi - range.lo - 2 * EDGE), z = M.BOUNDS.minZ + EDGE + rand() * (M.BOUNDS.maxZ - M.BOUNDS.minZ - 2 * EDGE);
      var d = Math.hypot(x - S.x, z - S.z);
      if (d < MIN_FROM_START || d > MAX_FROM_START || !dryOk(x, z, solids, range)) continue;
      if (out.some(function (o) { return Math.hypot(o.x - x, o.z - z) < APART; })) continue;
      out.push({ id: spec.item + '-' + (out.length + 1), x: x, z: z, y: M.groundHeight(x, z), taken: false });
    }
    return out.length === spec.n ? out : null;
  }

  function create(opts) {
    opts = opts || {};
    var cur = null, listeners = [], solidsSrc = opts.solids || null, last = null;
    function missions() { return opts.missions || SA.missions; }
    function audio() { return opts.audio || SA.audio; }
    function emit() { listeners.slice().forEach(function (f) { try { f(cur); } catch (e) { /* a view never breaks the loop */ } }); }
    function say(key) { try { var a = audio(); if (a && a.say) a.say(key); } catch (e) { /* sound is best effort */ } }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }
    function report(ev) {
      if (opts.report) return opts.report(ev);
      return SA.missionRuntime ? SA.missionRuntime.report(ev) : { status: 'none' };
    }

    function sync(o) {
      var a = null;
      try { a = missions().active(); } catch (e) { a = null; }
      var spec = a && a.mission && a.mission.bananas;
      var key = spec ? a.id + ':' + a.seed : null;
      if ((cur && cur.key) === key) return cur;
      var src = (o && o.solids) || solidsSrc;
      var items = spec ? place(spec, a.seed, { solids: typeof src === 'function' ? src() : src || [] }) : null;
      cur = items ? { key: key, spec: spec, items: items } : null;
      emit();
      return cur;
    }

    function visible() { return cur ? cur.items.filter(function (i) { return !i.taken; }) : []; }
    function stepOf() { var a = null; try { a = missions().active(); } catch (e) { a = null; } return a && a.stepData; }
    function isCollect(s) { return !!(cur && s && s.kind === 'collect' && s.item === cur.spec.item); }

    // Is the mission's step list past its collect step (a reload on a later step)? Before it (AS-0348: the collect is not the first step) the pickups wait.
    function pastCollect() {
      var a = null;
      try { a = missions().active(); } catch (e) { a = null; }
      var steps = a && a.mission ? a.mission.steps : [];
      for (var k = 0; k < steps.length; k++) if (steps[k].kind === 'collect' && steps[k].item === cur.spec.item) return a.step > k;
      return true;
    }
    // Only drawn / reachable while their collect step is the current one.
    function shown() { return isCollect(stepOf()); }

    function update(player, o) {
      sync(o);
      if (player) last = { x: player.x, z: player.z };
      if (!cur) return null;
      var s = stepOf();
      if (!isCollect(s)) {
        var left = visible();
        if (left.length && pastCollect()) { left.forEach(function (i) { i.taken = true; }); emit(); }   // past the collect step: nothing is left standing
        return cur;
      }
      if (!player) return cur;
      var hit = visible().filter(function (i) { return Math.hypot(player.x - i.x, player.z - i.z) <= PICK_REACH; })[0];
      if (!hit) return cur;
      hit.taken = true;
      if (cur.spec.bag) { try { var iv = opts.inventory || SA.inventory; if (iv && iv.add) iv.add(cur.spec.item, 1); } catch (e) { /* the bag never breaks the loop */ } }   // AS-0348: kept for the share step
      emit();
      var r = report({ type: 'collected', item: cur.spec.item });
      var have = r && r.status === 'progress' ? r.have : cur.spec.n;
      say('number:' + have);
      track('collect.pickup', { item: cur.spec.item, have: have });
      return cur;
    }

    function locate(id) {
      if (!cur || id !== cur.spec.item) return null;
      var v = visible()[0];
      return v ? { x: v.x, z: v.z, r: PICK_REACH } : null;
    }

    function target(step, from) {
      if (!isCollect(step)) return null;
      var v = visible();
      if (!v.length) return null;
      var p = from || last || startPoint();
      v.sort(function (a, b) { return Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z); });
      return { x: v[0].x, z: v[0].z, role: 'item', id: v[0].id };
    }

    return { sync: sync, update: update, locate: locate, target: target, visible: visible, shown: shown, current: function () { return cur; },
      setSolids: function (s) { solidsSrc = s; },
      onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      create: create, PICK_REACH: PICK_REACH };
  }

  var api = create();
  api.place = place;
  SA.missionBananas = api;
})(typeof window !== 'undefined' ? window : globalThis);
