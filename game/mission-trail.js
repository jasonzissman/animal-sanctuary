/* SA.missionTrail: Mission 8's footprints (las huellas) and strawberry crumbs from the empty basket at the station, through the bosque and under a
 * log, to the hollow tree (AS-0347, slice 2 of AS-0187). Pure (no THREE, no DOM; unit-tested in node:vm). It needs SA.missionPantry (where the tree
 * is). A mission row declares  pantry.trail: { id, say?: { start } }  and a step { kind: 'trail', trail: id }  (game/data/missions.js).
 * The trail is shown only while that step is active; the basket stands at the station for the whole mission. Nothing here knows a mission id.
 * Never punishing: wandering off keeps every print where it is; walking straight to the tree finishes the step too.
 *
 *   SA.missionTrail.build(from, tree, seed) -> { points: [{ x, z, rot, side }], crumbs: [{ x, z, n }], log: { x, z, rotY, len, h }, end: { x, z } } PURE, same
 *                            seed -> same trail. `points` are the paw prints from the basket to the tree's doorstep (`end`, in front of its opening),
 *                            wobbling gently side to side; `rot` is the heading of the way on (0 = +z), `side` -1 / +1 the foot; a few strawberry
 *                            `crumbs` lie beside it; the `log` lies across the path part-way, raised so you walk under it. The way is found by
 *                            SA.trailRoute (game/trail-route.js: through the river's ford, round the station); a print never lies in water.
 *   SA.missionTrail.reached(points, player, prev?) -> the highest print index within reach of the player (never goes back below prev; -1 = none yet)
 *   SA.missionTrail.basket() -> { x, z } the empty strawberry basket beside the station door
 *   SA.missionTrail.sync() / update(player) / target(step) / locate(id) / view() / current() / onChange(fn) / create({ missions?, pantry?, audio?, report?, track? })
 *       update(player)   polled each frame (SA.missionRuntime calls it): tracks progress, speaks `say.start` once at the step, and reports
 *                        { type: 'trailed', trail } when you are within FINISH of the tree
 *       target(step)     compass: a few prints ahead of your progress (so the arrow points along the trail), the tree once close to its end
 *       view()           -> { active, reached, ahead: [indexes of the next prints to glow], basket } | null
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var STEP = 1.9, FOOT = 0.24, WIGGLE = 1.2, REACH = 3.4, FINISH = 6.6, END_GAP = 6, LOOK = 5, GLOW = 3, CRUMB_EVERY = 4, LOG_AT = 0.72, LOG_LEN = 5.5, LOG_H = 2.6, TRIES = 6;
  var BASKET_OFF = { x: 2.4, z: 0.4 };

  function basket() {
    var s = { x: 0, z: 0 };
    try { if (SA.station && SA.station.spawn) s = SA.station.spawn(); } catch (e) { /* fall through */ }
    return { x: s.x + BASKET_OFF.x, z: s.z + BASKET_OFF.z };
  }

  function skip(x, z) {
    var M = SA.map;
    try {
      if (M && M.isWater && M.isWater(x, z)) return true;
      if (SA.station && SA.station.inFootprint && SA.station.inFootprint(x, z, 0.6)) return true;
    } catch (e) { /* keep the point */ }
    return false;
  }

  function build(from, tree, seed) {
    var rng = SA.map && SA.map.rng ? SA.map.rng(((typeof seed === 'number' ? seed : 1) >>> 0) + 8191) : function () { return 0.5; };
    var end = { x: tree.x + Math.sin(tree.face) * END_GAP, z: tree.z + Math.cos(tree.face) * END_GAP };
    var way = waypoints(from, end), segs = [], total = 0, k;
    for (k = 1; k < way.length; k++) { var l = Math.hypot(way[k].x - way[k - 1].x, way[k].z - way[k - 1].z); segs.push(l); total += l; }
    var n = Math.max(2, Math.round(total / STEP)), best = null;
    // Try a few different wobbles and keep the one that crosses the least water (a print never lies in a pond).
    for (var attempt = 0; attempt < TRIES && (!best || best.skipped); attempt++) {
      var r = route(way, segs, total, n, rng() * 6.28, 2 + Math.floor(rng() * 2), WIGGLE * (1 - attempt / TRIES), rng);
      if (!best || r.skipped < best.skipped) best = r;
    }
    best.end = end;
    return best;
  }

  // The way on: dry ground only (SA.trailRoute bends through the river's ford and round the station), else the straight line.
  function waypoints(from, end) {
    try { if (SA.trailRoute) return SA.trailRoute.find(from, end); } catch (e) { /* fall back to the straight line */ }
    return [from, end];
  }

  function route(way, segs, total, n, phase, waves, amp, rng) {
    var base = [], i, end = way[way.length - 1];
    for (i = 0; i <= n; i++) {
      var s = Math.min(total, (i / n) * total), k = 0;
      while (k < segs.length - 1 && s > segs[k]) { s -= segs[k]; k++; }
      var a0 = way[k], b0 = way[k + 1], t = segs[k] ? s / segs[k] : 1, ux = (b0.x - a0.x) / (segs[k] || 1), uz = (b0.z - a0.z) / (segs[k] || 1);
      var off = Math.sin(t * Math.PI * waves + phase) * amp * Math.sin(t * Math.PI);    // no wobble at the basket, the ford or the doorstep
      base.push({ x: a0.x + (b0.x - a0.x) * t - uz * off, z: a0.z + (b0.z - a0.z) * t + ux * off });
    }
    var points = [], crumbs = [], log = null, skipped = 0;
    for (i = 1; i <= n; i++) {
      var a = base[i - 1], b = base[Math.min(n, i + 1)], hx = b.x - a.x, hz = b.z - a.z, hl = Math.hypot(hx, hz) || 1;
      var side = i % 2 ? -1 : 1, px = base[i].x + (hz / hl) * FOOT * side, pz = base[i].z - (hx / hl) * FOOT * side;
      if (!log && i >= Math.round(n * LOG_AT) && !skip(base[i].x, base[i].z)) log ={ x: base[i].x, z: base[i].z, rotY: Math.atan2(hx, hz), len: LOG_LEN, h: LOG_H };
      if (skip(px, pz)) { skipped++; continue; }
      points.push({ x: px, z: pz, rot: Math.atan2(hx, hz), side: side });
      if (i % CRUMB_EVERY === 0) {
        var cx = base[i].x - (hz / hl) * (0.7 + rng() * 0.5), cz = base[i].z + (hx / hl) * (0.7 + rng() * 0.5);
        if (!skip(cx, cz)) crumbs.push({ x: cx, z: cz, n: 2 + Math.floor(rng() * 2) });
      }
    }
    return { points: points, crumbs: crumbs, log: log || { x: end.x, z: end.z, rotY: 0, len: LOG_LEN, h: LOG_H }, skipped: skipped };
  }

  function reached(points, player, prev) {
    var r = typeof prev === 'number' ? prev : -1;
    if (!points || !player) return r;
    for (var i = points.length - 1; i > r; i--) {
      if (Math.hypot(points[i].x - player.x, points[i].z - player.z) <= REACH) return i;
    }
    return r;
  }

  function create(opts) {
    opts = opts || {};
    var cur = null, listeners = [];
    function missions() { return opts.missions || SA.missions; }
    function pantry() { return opts.pantry || SA.missionPantry; }
    function audio() { return opts.audio || SA.audio; }
    function emit() { listeners.slice().forEach(function (f) { try { f(cur); } catch (e) { /* a view never breaks the loop */ } }); }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }
    function report(ev) { return opts.report ? opts.report(ev) : (SA.missionRuntime ? SA.missionRuntime.report(ev) : { status: 'none' }); }
    function say(keys) {
      [].concat(keys || []).forEach(function (k, i) {
        try {
          var a = audio();
          if (!k || !a || !a.say) return;
          if (root.setTimeout && !opts.audio) root.setTimeout(function () { a.say(k); }, 1500 + i * 1200);   // after the step line the pill speaks
          else a.say(k);
        } catch (e) { /* sound is best effort */ }
      });
    }
    function stepOf() { var a = null; try { a = missions().active(); } catch (e) { a = null; } return a && a.stepData; }
    function isStep(s) { return !!(cur && s && s.kind === 'trail' && s.trail === cur.spec.id); }

    function sync() {
      var pa = null, p = null;
      try { p = pantry(); if (p && p.sync) p.sync(); pa = p && p.current(); } catch (e) { pa = null; }
      var spec = pa && pa.spec && pa.spec.trail;
      var key = spec ? pa.key : null;
      if ((cur && cur.key) === key) return cur;
      var a = null;
      try { a = missions().active(); } catch (e) { a = null; }
      var from = basket(), t = spec ? build(from, pa.tree, a ? a.seed : 1) : null;
      cur = t ? { key: key, spec: spec, tree: pa.tree, from: from, points: t.points, crumbs: t.crumbs, log: t.log, end: t.end, reached: -1, said: false } : null;
      emit();
      return cur;
    }

    function update(player) {
      sync();
      if (!cur || !player) return cur;
      var s = stepOf();
      if (!isStep(s)) { cur.said = false; return cur; }
      if (!cur.said) { cur.said = true; say(cur.spec.say && cur.spec.say.start); track('trail.start', { trail: cur.spec.id }); }
      cur.reached = reached(cur.points, player, cur.reached);
      if (Math.hypot(player.x - cur.tree.x, player.z - cur.tree.z) <= FINISH) {
        track('trail.end', { trail: cur.spec.id, reached: cur.reached, total: cur.points.length });
        report({ type: 'trailed', trail: cur.spec.id });
      }
      return cur;
    }

    // The compass looks a few prints ahead of where you have got to, so the arrow follows the trail; the doorstep (the tree) is the last stop.
    function target(step) {
      if (!isStep(step) || !cur.points.length) return null;
      var i = cur.reached + LOOK;
      if (i >= cur.points.length) return { x: cur.tree.x, z: cur.tree.z, role: 'trail', id: cur.spec.id };
      return { x: cur.points[i].x, z: cur.points[i].z, role: 'trail', id: cur.spec.id };
    }

    function view() {
      if (!cur) return null;
      var active = isStep(stepOf()), ahead = [];
      if (active) for (var i = cur.reached + 1; i <= cur.reached + GLOW && i < cur.points.length; i++) ahead.push(i);
      return { active: active, reached: cur.reached, ahead: ahead, basket: cur.from };
    }

    var api = { sync: sync, update: update, target: target, view: view, locate: function () { return null; }, current: function () { return cur; },
      onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      create: create, build: build, reached: reached, basket: basket, FINISH: FINISH, REACH: REACH };
    return api;
  }

  var api = create();
  SA.missionTrail = api;
})(typeof window !== 'undefined' ? window : globalThis);
