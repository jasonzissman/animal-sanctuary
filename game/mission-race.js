/* SA.missionRace: Mission 10's race course: the rabbit at the start, a path of small flags and the big tree at the end (AS-0354, slice 1 of AS-0189: La carrera).
 * Pure (no THREE, no DOM; unit-tested in node:vm). A mission row declares
 *   race: { place, rabbit, biome?, flags?, say?: { talk?, flag?, arrive?, photo? } }                    (game/data/missions.js)
 * `place` is the id a 'goTo' step names (the big tree), `rabbit` the animal id (game/data/animals.js) that waits at the start, `biome` where the start is
 * (default 'bosque'), `flags` how many small flags mark the way (3..10, default 6), `say` vocab keys spoken once. While that mission runs a start point
 * (with the rabbit beside it), a path of flags and the big tree exist (game/render/mission-race.js draws them); nothing exists while another mission, or none, runs.
 * The steps are the generic kinds: 'talk' { who: rabbit id } (tap the rabbit), 'goTo' { place } (walk into the goal circle; the flags are a guide, not a rail:
 * any shortcut over rocks or round the pond counts) and 'photo' { target: place } (a tap on the big tree with la cámara; a place, so a wild rabbit photo never
 * completes it). No opponent yet. Nothing here knows a mission id or an animal id.
 *
 *   SA.missionRace.place(spec, seed, opts?) -> { start: { x, y, z, r, face }, goal: { x, y, z, r }, flags: [{ x, y, z, rotY }], rabbit: { animal, x, y, z, rotY, scale } } | null
 *                                              PURE, deterministic from the seed; opts.solids [[x, z, r], ...] are kept clear
 *   SA.missionRace.reached(goal, player)   -> true when the player is inside the goal circle (the goal check; pure)
 *   SA.missionRace.passedFlags(flags, player, passed?) -> the (sorted) indexes of flags the player came within FLAG_R of, plus the ones already passed
 *   SA.missionRace.sync(opts?)     the current state | null; reads SA.missions.active(): places on a new mission/seed, clears when none runs
 *   SA.missionRace.update(player)  polled each frame (SA.missionRuntime calls it): lights the flags you pass, says `say.flag` / `say.arrive` once
 *   SA.missionRace.locate(id)      -> { x, z, r } | null   the big tree (the goTo place); the runtime reports 'arrived' from it
 *   SA.missionRace.target(step)    -> { x, z, role, id } | null   compass: the rabbit on the talk step, the big tree on the goTo and photo steps
 *   SA.missionRace.talk(player?)   a tap on the rabbit on the 'talk' step, from near it: { status: 'none' | 'far' | 'step' | ... }; speaks `say.talk` (la carrera)
 *   SA.missionRace.snap(player?)   a tap on the big tree with la cámara on the 'photo' step, from near it: { status: 'none' | 'nocamera' | 'far' | 'complete' | 'step' }.
 *                                  It goes into the album (SA.photo.record), completes the mission (stars) and logs one rescue row { kind: 'race' } -> the sticker
 *                                  'buen-corredor' (onSticker hook for main.js)
 *   SA.missionRace.view()          -> { talk, photo, arrived, passed: [flag indexes] } | null     current() / onChange(fn) / setSolids(listOrFn)
 *   SA.missionRace.create({ missions?, audio?, report?, track?, solids?, photo?, rescueLog?, inventory? })   a separate instance (tests)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var START_R = 3, GOAL_R = 4.5, FLAG_R = 3.2, TALK_REACH = 6, PHOTO_REACH = 14, EDGE = 10, TRIES = 4000, BEARINGS = 10, MIN_FROM_START = 16, MAX_FROM_START = 60;
  var DIST_MIN = 42, DIST_MAX = 56, FLAT = 0.45, SOLID_GAP = 6, SLOPE = 1.6;

  function startPoint() {
    try { if (SA.station && SA.station.spawn) return SA.station.spawn(); } catch (e) { /* fall through */ }
    return { x: 0, z: 0 };
  }

  function inBounds(x, z) {
    var B = SA.map.BOUNDS;
    return x >= B.minX + EDGE && x <= B.maxX - EDGE && z >= B.minZ + EDGE && z <= B.maxZ - EDGE;
  }

  // Dry, flat, clear ground for the start line and for the big tree.
  function groundOk(x, z, solids) {
    var M = SA.map;
    if (!inBounds(x, z) || M.isWater(x, z) || M.nearWater(x, z, 4)) return false;
    var h = M.groundHeight(x, z);
    if (h < M.WATER_LEVEL + 0.6) return false;
    for (var k = 0; k < 8; k++) {
      var a = k * Math.PI / 4;
      if (Math.abs(M.groundHeight(x + Math.cos(a) * 2.6, z + Math.sin(a) * 2.6) - h) > FLAT) return false;
    }
    if (SA.station && SA.station.inFootprint && SA.station.inFootprint(x, z, 8)) return false;
    if (SA.player && SA.player.inSpawnZone && SA.player.inSpawnZone(x, z)) return false;
    for (var i = 0; i < solids.length; i++) if (Math.hypot(solids[i][0] - x, solids[i][1] - z) < solids[i][2] + SOLID_GAP) return false;
    return true;
  }

  // The straight line start -> goal is dry and walkable: no water and no steep step every 3 m (the player may still take any other way).
  function lineOk(a, b) {
    var M = SA.map, d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 3), prev = M.groundHeight(a.x, a.z);
    for (var i = 1; i <= n; i++) {
      var x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
      if (M.isWater(x, z) || (SA.station && SA.station.inFootprint && SA.station.inFootprint(x, z, 3))) return false;
      var h = M.groundHeight(x, z);
      if (Math.abs(h - prev) > SLOPE) return false;
      prev = h;
    }
    return true;
  }

  function validSpec(s) { return !!(s && typeof s.place === 'string' && typeof s.rabbit === 'string' && s.rabbit); }
  function flagCount(s) { return Number.isInteger(s.flags) && s.flags >= 3 && s.flags <= 10 ? s.flags : 6; }

  function place(spec, seed, opts) {
    var M = SA.map;
    if (!M || !M.biomeRange || !validSpec(spec)) return null;
    var biome = spec.biome || 'bosque', range = M.biomeRange(biome), solids = (opts && opts.solids) || [], S = startPoint();
    var rand = M.rng(((typeof seed === 'number' ? seed : 1) >>> 0) + 4421), n = flagCount(spec);
    for (var t = 0; t < TRIES; t++) {
      var x = range.lo + EDGE + rand() * (range.hi - range.lo - 2 * EDGE), z = M.BOUNDS.minZ + EDGE + rand() * (M.BOUNDS.maxZ - M.BOUNDS.minZ - 2 * EDGE);
      var d = Math.hypot(x - S.x, z - S.z);
      if (d < MIN_FROM_START || (t < TRIES / 2 && d > MAX_FROM_START) || M.biomeAt(x) !== biome || !groundOk(x, z, solids)) continue;
      for (var b = 0; b < BEARINGS; b++) {
        var ang = rand() * Math.PI * 2, len = DIST_MIN + rand() * (DIST_MAX - DIST_MIN);
        var gx = x + Math.sin(ang) * len, gz = z + Math.cos(ang) * len;
        if (!groundOk(gx, gz, solids) || !lineOk({ x: x, z: z }, { x: gx, z: gz })) continue;
        var dx = gx - x, dz = gz - z, face = Math.atan2(dx, dz), px = Math.cos(face), pz = -Math.sin(face);   // (px, pz): to the runner's right
        var flags = [], wet = false;
        for (var i = 1; i <= n; i++) {
          var u = i / (n + 1), side = (i % 2 ? 1 : -1) * 1.1, fx = x + dx * u + px * side, fz = z + dz * u + pz * side;
          if (M.isWater(fx, fz)) { wet = true; break; }   // a flag never stands in the water (the line is only sampled every 3 m)
          flags.push({ x: fx, y: M.groundHeight(fx, fz), z: fz, rotY: face });
        }
        if (wet) continue;
        var rx = x + px * 2.4, rz = z + pz * 2.4;
        return { start: { x: x, y: M.groundHeight(x, z), z: z, r: START_R, face: face }, goal: { x: gx, y: M.groundHeight(gx, gz), z: gz, r: GOAL_R },
          flags: flags, rabbit: { animal: spec.rabbit, x: rx, y: M.groundHeight(rx, rz), z: rz, rotY: face, scale: 1 } };
      }
    }
    return null;
  }

  function reached(goal, p) { return !!(goal && p && Math.hypot(p.x - goal.x, p.z - goal.z) <= (goal.r || GOAL_R)); }

  function passedFlags(flags, p, passed) {
    var out = (passed || []).slice();
    (flags || []).forEach(function (f, i) { if (p && out.indexOf(i) < 0 && Math.hypot(p.x - f.x, p.z - f.z) <= FLAG_R) out.push(i); });
    return out.sort(function (a, b) { return a - b; });
  }

  function create(opts) {
    opts = opts || {};
    var cur = null, listeners = [], solidsSrc = opts.solids || null, last = null;
    function missions() { return opts.missions || SA.missions; }
    function audio() { return opts.audio || SA.audio; }
    function emit() { listeners.slice().forEach(function (f) { try { f(cur); } catch (e) { /* a view never breaks the loop */ } }); }
    function say(key) { try { var a = audio(); if (key && a && a.say) a.say(key); } catch (e) { /* sound is best effort */ } }
    function sfx(n) { try { var a = audio(); if (a && a.sfx) a.sfx(n); } catch (e) { /* sound is best effort */ } }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }
    function report(ev) { return opts.report ? opts.report(ev) : (SA.missionRuntime ? SA.missionRuntime.report(ev) : { status: 'none' }); }
    function active() { var a = null; try { a = missions().active(); } catch (e) { a = null; } return a; }
    function stepOf() { var a = active(); return a && a.stepData; }
    function sayOf(k) { return cur && cur.spec.say ? cur.spec.say[k] : null; }
    function isTalk(s) { return !!(cur && s && s.kind === 'talk' && s.who === cur.spec.rabbit); }
    function isGoTo(s) { return !!(cur && s && s.kind === 'goTo' && s.place === cur.spec.place); }
    function isPhoto(s) { return !!(cur && s && s.kind === 'photo' && s.target === cur.spec.place); }

    function sync(o) {
      var a = active();
      var spec = a && a.mission && a.mission.race;
      var key = spec ? a.id + ':' + a.seed : null;
      if ((cur && cur.key) === key) return cur;
      var src = (o && o.solids) || solidsSrc;
      var p = spec ? place(spec, a.seed, { solids: typeof src === 'function' ? src() : src || [] }) : null;
      cur = p ? { key: key, spec: spec, start: p.start, goal: p.goal, flags: p.flags, rabbit: p.rabbit, said: {}, passed: [], snapped: false } : null;
      emit();
      return cur;
    }

    function update(player, o) {
      sync(o);
      if (player) last = { x: player.x, z: player.z };
      if (!cur || !player) return cur;
      var s = stepOf();
      if (isGoTo(s)) {      // the flags you run past light up (any order: you may take a shortcut)
        var now = passedFlags(cur.flags, player, cur.passed);
        if (now.length !== cur.passed.length) {
          cur.passed = now;
          if (!cur.said.flag) { cur.said.flag = true; say(sayOf('flag')); }
          sfx('pop');
          emit();
        }
        if (reached(cur.goal, player) && !cur.said.arrive) {
          cur.said.arrive = true;
          say(sayOf('arrive'));
          track('race.arrived', { place: cur.spec.place, flags: cur.passed.length });
        }
      }
      return cur;
    }

    function locate(id) { return cur && id === cur.spec.place ? { x: cur.goal.x, z: cur.goal.z, r: cur.goal.r } : null; }

    function target(step) {
      if (!cur || !step) return null;
      if (isTalk(step)) return { x: cur.rabbit.x, z: cur.rabbit.z, role: 'animal', id: cur.spec.rabbit };
      if (isGoTo(step) || isPhoto(step)) return { x: cur.goal.x, z: cur.goal.z, role: 'place', id: cur.spec.place };
      return null;
    }

    // Talking to the rabbit at the start line (a tap on it from near): "¡La carrera!" and the first step is done. Never punishing: a far tap only says "acércate".
    function talk(player) {
      sync();
      var s = stepOf(), p = player || last;
      if (!isTalk(s)) return { status: 'none' };
      if (p && Math.hypot(p.x - cur.rabbit.x, p.z - cur.rabbit.z) > TALK_REACH) { say('phrase:acercate'); return { status: 'far' }; }
      sfx('pop');
      say(sayOf('talk'));
      track('race.talk', { rabbit: cur.spec.rabbit });
      return report({ type: 'talked', who: cur.spec.rabbit }) || { status: 'none' };
    }

    // The finish photo (a tap on the big tree with la cámara in hand, from near it). Never punishing: a far or camera-less tap just returns a status.
    function snap(player) {
      sync();
      var s = stepOf();
      if (!isPhoto(s) || cur.snapped) return { status: 'none' };
      var inv = opts.inventory || SA.inventory;
      if (!inv || inv.equipped() !== 'camara') return { status: 'nocamera' };
      var p = player || last;
      if (p && Math.hypot(p.x - cur.goal.x, p.z - cur.goal.z) > PHOTO_REACH) return { status: 'far' };
      sfx('shutter');
      var a = active();
      var r = report({ type: 'photo', target: s.target });
      if (!r || (r.status !== 'complete' && r.status !== 'step')) return r || { status: 'none' };
      cur.snapped = true;
      say(sayOf('photo'));
      track('race.photo', { place: cur.spec.place });
      try { (opts.photo || SA.photo).record(cur.spec.rabbit); } catch (e) { /* the album never blocks play */ }
      var rec = { earned: [] };
      try { rec = (opts.rescueLog || SA.rescueLog).record({ kind: 'race', mission: a ? a.id : '', animal: cur.spec.rabbit, key: a ? a.id : '' }) || rec; } catch (e) { /* the log never blocks play */ }
      if (api.onSticker) { try { api.onSticker({ mission: a ? a.id : '', badges: rec.earned || [] }); } catch (e) { /* the view never breaks play */ } }
      return r;
    }

    function view() {
      if (!cur) return null;
      var s = stepOf();
      return { talk: isTalk(s), photo: isPhoto(s), arrived: !!cur.said.arrive, passed: cur.passed.slice() };
    }

    var api = { sync: sync, update: update, locate: locate, target: target, talk: talk, snap: snap, view: view, onSticker: null, current: function () { return cur; },
      setSolids: function (s) { solidsSrc = s; },
      onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      create: create, GOAL_R: GOAL_R, PHOTO_REACH: PHOTO_REACH, TALK_REACH: TALK_REACH };
    return api;
  }

  var api = create();
  api.place = place;
  api.reached = reached;
  api.passedFlags = passedFlags;
  SA.missionRace = api;
})(typeof window !== 'undefined' ? window : globalThis);
