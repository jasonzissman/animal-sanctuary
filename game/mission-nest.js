/* SA.missionNest: the feather, the grey peak and the eagle's nest across the rope bridge (AS-0336, slice 1 of AS-0185: El nido del águila).
 * Pure (no THREE, no DOM; unit-tested in node:vm). A mission row declares `nest: { item, summit, peak, summitPlace, nestPlace, chick, mama, say? }`
 * (game/data/missions.js). While that mission runs: the feather `item` lies beside the montaña's trail (game/mountain-trail.js), the peak
 * `summit` (an id in game/peaks.js) is the one to climb, and the peak `peak` holds the nest with the chick and mamá (animal ids from
 * game/data/animals.js), reached over the rope bridge (game/rope-bridge.js). The steps are generic kinds: 'collect' { item, n: 1 } (walk up to
 * the feather: it goes into the inventory) and two 'goTo' places (the summit's flat top, then the nest peak, which only counts once you walked
 * ACROSS the bridge). Nothing here knows a mission id or an animal id.
 *
 *   SA.missionNest.place(spec, seed, opts?) -> { feather: {id,x,z,y,taken}, summit: {x,z,y,r}, nest: {x,z,y,r}, bridge: {x,z} | null } | null
 *                                              PURE, deterministic from the seed; opts.solids [[x, z, r], ...] are kept clear
 *   SA.missionNest.sync(opts?)     the current state | null; reads SA.missions.active(): places on a new mission/seed, clears when none runs
 *   SA.missionNest.update(player)  polled each frame (SA.missionRuntime calls it, with { x, z, y? }): picks the feather up on the collect step
 *                                  (inventory add, { type: 'collected', item }, says `say.feather`); says `say.summit` once on the top of
 *                                  the summit peak and `say.bridge` once when you are out over the bridge; says `say.nest` at the nest
 *   SA.missionNest.locate(id)      -> { x, z, r } | null   the summit (summitPlace) or, once you crossed the bridge, the nest (nestPlace)
 *   SA.missionNest.target(step)    -> { x, z, role, id } | null   compass: the feather, the summit, then the bridge until you crossed, then the nest
 *   SA.missionNest.current() / onChange(fn) / setSolids(listOrFn) / create({ missions?, audio?, inventory?, report?, track?, solids? })
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var PICK_REACH = 1.6, EDGE = 4, SIDE = 2.0, AT_S = [9, 12, 7, 15, 5, 18], MID_REACH = 2.5, ABOVE_GROUND = 2;

  function peakById(id) {
    var list = SA.peaks ? SA.peaks.LIST : [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function topOf(p) {
    var r = SA.peaks.targets().filter(function (t) { return t.id === p.id; })[0];
    return { x: p.x, z: p.z, y: SA.map.groundHeight(p.x, p.z), r: r ? r.top.size : 1.4 };
  }

  function dryOk(x, z, solids) {
    var M = SA.map, B = M.BOUNDS;
    if (x < B.minX + EDGE || x > B.maxX - EDGE || z < B.minZ + EDGE || z > B.maxZ - EDGE) return false;
    var h = M.groundHeight(x, z);
    if (M.isWater(x, z) || M.nearWater(x, z, 1.2) || h < M.WATER_LEVEL + 0.45) return false;
    if (Math.abs(M.groundHeight(x + 1, z) - h) > 0.8 || Math.abs(M.groundHeight(x, z + 1) - h) > 0.8) return false;
    for (var i = 0; i < solids.length; i++) if (Math.hypot(solids[i][0] - x, solids[i][1] - z) < solids[i][2] + 1) return false;
    return true;
  }

  // The feather lies a step off the trail's lower leg (on the shoulder, never on a rock or in water), on a seeded side.
  function featherSpot(seed, solids) {
    var T = SA.mountainTrail, M = SA.map;
    if (!T || !T.pointAt) return null;
    var a = {}, b = {}, side = (((seed >>> 0) % 2) ? 1 : -1);
    for (var k = 0; k < AT_S.length * 2; k++) {
      var s = AT_S[k % AT_S.length], sd = k < AT_S.length ? side : -side;
      T.pointAt(s, a); T.pointAt(s + 1, b);
      var len = Math.hypot(b.x - a.x, b.z - a.z) || 1, x = a.x - (b.z - a.z) / len * SIDE * sd, z = a.z + (b.x - a.x) / len * SIDE * sd;
      if (dryOk(x, z, solids)) return { x: x, z: z, y: M.groundHeight(x, z) };
    }
    return null;
  }

  function place(spec, seed, opts) {
    var a = spec && SA.map && SA.peaks ? peakById(spec.summit) : null, b = spec && SA.map && SA.peaks ? peakById(spec.peak) : null;
    if (!a || !b) return null;
    var f = featherSpot(typeof seed === 'number' ? seed : 1, (opts && opts.solids) || []);
    if (!f) return null;
    var br = SA.ropeBridge && SA.ropeBridge.get ? SA.ropeBridge.get() : null;
    return { feather: { id: spec.item + '-1', x: f.x, z: f.z, y: f.y, taken: false }, summit: topOf(a), nest: topOf(b), bridge: br ? { x: br.x, z: br.z, y: br.y } : null };
  }

  function create(opts) {
    opts = opts || {};
    var cur = null, listeners = [], solidsSrc = opts.solids || null, last = null;
    function missions() { return opts.missions || SA.missions; }
    function audio() { return opts.audio || SA.audio; }
    function emit() { listeners.slice().forEach(function (f) { try { f(cur); } catch (e) { /* a view never breaks the loop */ } }); }
    function say(keys) {
      [].concat(keys || []).forEach(function (k, i) {
        try { var a = audio(); if (k && a && a.say) { if (i && root.setTimeout && !opts.audio) root.setTimeout(function () { a.say(k); }, i * 1200); else a.say(k); } } catch (e) { /* sound is best effort */ }
      });
    }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }
    function report(ev) { return opts.report ? opts.report(ev) : (SA.missionRuntime ? SA.missionRuntime.report(ev) : { status: 'none' }); }
    function stepOf() { var a = null; try { a = missions().active(); } catch (e) { a = null; } return a && a.stepData; }
    function sayOf(k) { return cur && cur.spec.say ? cur.spec.say[k] : null; }
    function inv() { return opts.inventory || SA.inventory; }

    function sync(o) {
      var a = null;
      try { a = missions().active(); } catch (e) { a = null; }
      var spec = a && a.mission && a.mission.nest;
      var key = spec ? a.id + ':' + a.seed : null;
      if ((cur && cur.key) === key) return cur;
      var src = (o && o.solids) || solidsSrc;
      var p = spec ? place(spec, a.seed, { solids: typeof src === 'function' ? src() : src || [] }) : null;
      cur = p ? { key: key, spec: spec, feather: p.feather, summit: p.summit, nest: p.nest, bridge: p.bridge, said: {}, crossed: false } : null;
      emit();
      return cur;
    }

    function isCollect(s) { return !!(cur && s && s.kind === 'collect' && s.item === cur.spec.item); }
    function isGoTo(s, place) { return !!(s && s.kind === 'goTo' && s.place === place); }
    function once(k, keys) { if (cur.said[k]) return; cur.said[k] = true; say(keys); }
    function onTop(p, at) { return Math.hypot(p.x - at.x, p.z - at.z) <= at.r && !(isFinite(p.y) && p.y < at.y - 1.5); }

    // Out over the rope bridge: near its middle and well above the ground under it (never someone walking below it).
    function onBridge(p) {
      if (!cur.bridge) return false;
      var near = Math.hypot(p.x - cur.bridge.x, p.z - cur.bridge.z) <= MID_REACH;
      if (!near) return false;
      return !isFinite(p.y) || !SA.map || p.y >= SA.map.groundHeight(p.x, p.z) + ABOVE_GROUND;
    }

    function update(player, o) {
      sync(o);
      if (player) last = { x: player.x, z: player.z };
      if (!cur) return null;
      var s = stepOf();
      if (!isCollect(s) && !cur.feather.taken) { cur.feather.taken = true; emit(); }          // a reload past the feather: none is left lying
      if (!player) return cur;
      if (isCollect(s) && !cur.feather.taken && Math.hypot(player.x - cur.feather.x, player.z - cur.feather.z) <= PICK_REACH) {
        cur.feather.taken = true;
        try { var iv = inv(); if (iv && iv.add && !(iv.has && iv.has(cur.spec.item))) iv.add(cur.spec.item); } catch (e) { /* the bag never breaks the loop */ }
        emit();
        say(sayOf('feather'));
        track('nest.feather', { item: cur.spec.item });
        report({ type: 'collected', item: cur.spec.item });
      } else if (isGoTo(s, cur.spec.summitPlace) && onTop(player, cur.summit)) {
        once('summit', sayOf('summit'));
        track('nest.summit', { peak: cur.spec.summit });
      } else if (isGoTo(s, cur.spec.nestPlace)) {
        if (!cur.crossed && onBridge(player)) {
          cur.crossed = true;
          once('bridge', sayOf('bridge'));
          track('nest.bridge', { peak: cur.spec.peak });
          emit();
        } else if (cur.crossed && onTop(player, cur.nest)) {
          once('nest', sayOf('nest'));
          track('nest.arrived', { peak: cur.spec.peak });
        }
      }
      return cur;
    }

    function locate(id) {
      if (!cur) return null;
      if (id === cur.spec.summitPlace) return { x: cur.summit.x, z: cur.summit.z, r: cur.summit.r };
      if (id === cur.spec.nestPlace && (cur.crossed || !cur.bridge)) return { x: cur.nest.x, z: cur.nest.z, r: cur.nest.r };
      return null;
    }

    function target(step) {
      if (!cur || !step) return null;
      if (isCollect(step)) return cur.feather.taken ? null : { x: cur.feather.x, z: cur.feather.z, role: 'item', id: cur.feather.id };
      if (isGoTo(step, cur.spec.summitPlace)) return { x: cur.summit.x, z: cur.summit.z, role: 'place', id: cur.spec.summitPlace };
      if (isGoTo(step, cur.spec.nestPlace)) {
        var at = !cur.crossed && cur.bridge ? cur.bridge : cur.nest;       // the rope bridge first, then the nest across it
        return { x: at.x, z: at.z, role: 'place', id: cur.spec.nestPlace };
      }
      return null;
    }

    function view() { return cur ? { feather: cur.feather.taken ? null : cur.feather, crossed: cur.crossed } : null; }

    return { sync: sync, update: update, locate: locate, target: target, view: view, current: function () { return cur; },
      setSolids: function (s) { solidsSrc = s; },
      onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      create: create, PICK_REACH: PICK_REACH };
  }

  var api = create();
  api.place = place;
  SA.missionNest = api;
})(typeof window !== 'undefined' ? window : globalThis);
