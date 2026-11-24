/* SA.missionLog: mission 3's river rescue (AS-0319, slice 2 of AS-0182): a rock in the river with the puppy on it, and a fallen log on
 * the bank that the kid pushes across to bridge the water. Pure (no THREE, no DOM; unit-tested in node:vm). A mission row declares
 * `river: { animal, rock, log }` (the stranded animal's id and the ids of the rock and the log). Nothing here names an animal or a mission.
 * The steps are the generic 'push' step kind (event 'pushed', item = the log id) and 'goTo' (place = the rock id).
 *
 *   SA.missionLog.place(spec, seed, opts?)  -> { rock, log, pup, z } | null   PURE, deterministic from the seed. The river's centre line
 *       (SA.map.riverX) carries the rock; the log lies on the west bank along x (across the river) with its east end by the water and
 *       slides east along a straight path from log.x0 to log.x1 (the bridged position, overlapping the rock). opts.solids [[x, z, r], ...]
 *       are kept clear. Everything lies on dry flat ground or in the river, away from the ford, the bridges, the station and the spawn.
 *   SA.missionLog.sync(opts?)     -> the current { key, spec, rock, log, pup, t, phase, arrived } | null. Reads SA.missions.active():
 *       places on a new mission/seed, clears when none runs (a finished mission leaves the bridge in place until another one with a
 *       `river` spec starts). phase: 'ready' (t 0..1, still sliding) | 'locked' (t = 1, a walkable deck).
 *   SA.missionLog.update(player, dt?)  once per frame: while 'ready', a player touching the log's west end and facing east (heading
 *       within ~66 degrees of +x) pushes it at PUSH_SPEED. At t = 1 it snaps to the bridged position, locks, becomes a walkable deck
 *       (SA.surfaces, so the kid stands on it above the water), says "el tronco" and reports 'pushed'. Reaching the rock over the
 *       locked log says "el perrito" then its bark ("phrase:guau"). A reload on a later step locks the log at once (never stuck).
 *   SA.missionLog.solids()        -> [[x, z, r], ...] the sliding log's footprint as circles (none once locked: you walk ON it)
 *   SA.missionLog.logX()          -> the log centre's x now          SA.missionLog.logSpan() the west and east end x
 *   SA.missionLog.locate(id)      -> { x, z, r } | null   the rock, only once the log is locked (wading to it does not count)
 *   SA.missionLog.target(step)    -> { x, z, role, id } | null   where the step points the compass: the log (push), the rock (goTo)
 *   SA.missionLog.current()       the state without re-reading the mission;  onChange(fn) -> unsubscribe
 *   SA.missionLog.setSolids(listOrFn)  the walk list kept clear when placing (scene.js sets it)
 *   SA.missionLog.create({ missions?, audio?, track?, runtime?, surfaces?, solids?, later? })   a separate instance (tests)
 * Rendering: game/render/mission-log.js.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var HALF = 2.7, R = 0.4;                    // the log: half length along x, trunk radius (a trunk 5.4 long)
  var LOG_TOP = 0.45, ROCK_TOP = 0.55;        // standing heights above the world's y = 0 (the water level is -0.3)
  var ROCK_R = 1.3, DECK_HALF_WID = 0.8, ROCK_DECK = 1.1;
  var WEST = 7.7, EAST = 3.0;                 // the log centre starts this far west of the rock's centre and ends this far west of it
  var PUSH_SPEED = 2.2, TOUCH_BACK = 1.15, TOUCH_FWD = 0.25, TOUCH_SIDE = R + 0.65, FACING = 0.4;
  var ROCK_REACH = ROCK_R + 0.5, TRIES = 400;

  function ok(spec) { return !!spec && typeof spec.rock === 'string' && typeof spec.log === 'string' && typeof spec.animal === 'string'; }

  function dry(x, z, lo, hi) {
    var M = SA.map, h = M.groundHeight(x, z);
    return h >= M.WATER_LEVEL + lo && h <= hi;
  }

  function clearOf(x, z, pad, solids) {
    if (SA.station && SA.station.inFootprint(x, z, pad + 1)) return false;
    if (SA.player && SA.player.inSpawnZone && SA.player.inSpawnZone(x, z, pad)) return false;
    if (SA.fallenLogs && SA.fallenLogs.near && SA.fallenLogs.near(x, z, pad + 0.6)) return false;
    if (SA.forestStreams && SA.forestStreams.inWater && SA.forestStreams.inWater(x, z, pad)) return false;
    for (var i = 0; i < solids.length; i++) if (Math.hypot(solids[i][0] - x, solids[i][1] - z) < solids[i][2] + pad + 0.8) return false;
    return true;
  }

  // One candidate z: the river there must hold the rock in deep water; the log's whole path and the approach on the west bank are dry,
  // low and clear of everything; the span over the water lies away from the ford and the bridges.
  function fits(z, solids, surf) {
    var M = SA.map, cx = M.riverX(z), x;
    if (Math.abs(z - M.FORD.z) < 12 || z < M.BOUNDS.minZ + 8 || z > M.BOUNDS.maxZ - 8) return false;
    if (!M.isWater(cx, z) || M.groundHeight(cx, z) > M.WATER_LEVEL - 0.15 || !M.isWater(cx - EAST, z)) return false;
    for (x = cx - WEST - HALF - 1.2; x <= cx - WEST + HALF; x += 1.2) if (!dry(x, z, 0.2, 0.8) || !clearOf(x, z, 1, solids)) return false;
    if (!dry(cx - WEST + HALF, z, 0.15, 0.9)) return false;
    var zs = [-1, 0, 1];
    for (var i = 0; i < zs.length; i++) {
      for (x = cx - WEST - HALF; x <= cx + ROCK_R; x += 1.5) {
        if (surf && surf.near && surf.near(x, z + zs[i] * 1.5, 3)) return false;
        if (SA.ropeBridge && SA.ropeBridge.near && SA.ropeBridge.near(x, z, 3)) return false;
      }
    }
    return true;
  }

  function place(spec, seed, opts) {
    var M = SA.map, solids = (opts && opts.solids) || [], surf = opts && opts.surfaces ? opts.surfaces : SA.surfaces;
    if (!M || !ok(spec)) return null;
    var rand = M.rng(((typeof seed === 'number' ? seed : 1) >>> 0) + 6007), z = null, t;
    for (t = 0; t < TRIES && z === null; t++) {
      var c = M.BOUNDS.minZ + 8 + rand() * (M.BOUNDS.maxZ - M.BOUNDS.minZ - 16);
      if (fits(c, solids, surf)) z = c;
    }
    for (var s = M.BOUNDS.minZ + 8; z === null && s <= M.BOUNDS.maxZ - 8; s += 1) if (fits(s, solids, surf)) z = s;   // luck ran out: a deterministic scan
    if (z === null) return null;
    var cx = M.riverX(z);
    return {
      z: z,
      rock: { id: spec.rock, x: cx, z: z, y: ROCK_TOP, r: ROCK_R },
      log: { id: spec.log, z: z, half: HALF, r: R, x0: cx - WEST, x1: cx - EAST, y: LOG_TOP },
      pup: { id: spec.animal, x: cx, z: z, y: ROCK_TOP, rotY: Math.PI / 2 }
    };
  }

  function create(opts) {
    opts = opts || {};
    var cur = null, listeners = [], solidsSrc = opts.solids || null, decks = [], cache = null;
    function missions() { return opts.missions || SA.missions; }
    function surfaces() { return opts.surfaces || SA.surfaces; }
    function emit() { listeners.slice().forEach(function (f) { try { f(cur); } catch (e) { /* a view never breaks the loop */ } }); }
    function say(k) { try { var a = opts.audio || SA.audio; if (a && a.say) a.say(k); } catch (e) { /* sound is best effort */ } }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }
    function report(ev) { try { var r = opts.runtime || SA.missionRuntime; if (r && r.report) r.report(ev); } catch (e) { /* the mission never breaks the loop */ } }
    function active() { try { return missions().active(); } catch (e) { return null; } }

    function dropDecks() {
      var s = surfaces();
      if (decks.length && s && s.removeFixed) s.removeFixed(decks);
      decks = [];
    }
    function addDeck(d) {
      var s = surfaces();
      if (s && s.addFixed) { s.addFixed([d]); decks.push(d); }
    }
    function logDeck() {
      return { id: cur.log.id + '-deck', x: logX(), z: cur.log.z, dx: 1, dz: 0, halfLen: HALF, halfWid: DECK_HALF_WID, y: LOG_TOP, ramp: 0, railR: 0.1 };
    }
    function logX() { return cur ? cur.log.x0 + (cur.log.x1 - cur.log.x0) * cur.t : 0; }

    function sync(o) {
      var a = active(), spec = a && a.mission && a.mission.river, key = ok(spec) ? a.id + ':' + a.seed : null;
      if ((cur && cur.key) === key) return cur;
      if (!key && cur && cur.phase === 'locked') return cur;          // a finished mission leaves the bridge and the rock in place
      dropDecks();
      cache = null;
      var src = (o && o.solids) || solidsSrc, solids = typeof src === 'function' ? src() : src || [];
      var spots = key ? place(spec, a.seed, { solids: solids, surfaces: surfaces() }) : null;
      cur = spots ? { key: key, spec: spec, rock: spots.rock, log: spots.log, pup: spots.pup, t: 0, phase: 'ready', arrived: false } : null;
      if (cur) addDeck({ id: cur.rock.id + '-deck', x: cur.rock.x, z: cur.rock.z, dx: 1, dz: 0, halfLen: ROCK_DECK, halfWid: ROCK_DECK, y: ROCK_TOP, ramp: 0, railR: 0.1 });
      emit();
      return cur;
    }

    function lock(resumed) {
      cur.t = 1; cur.phase = 'locked'; cache = null;
      addDeck(logDeck());
      emit();
      if (resumed) return;
      say('thing:' + cur.spec.log);
      track('log.locked', { log: cur.spec.log });
      report({ type: 'pushed', item: cur.spec.log });
    }

    function touching(p) {
      var u = p.x - (logX() - HALF), dz = Math.abs(p.z - cur.log.z);
      return u >= -TOUCH_BACK && u <= TOUCH_FWD && dz <= TOUCH_SIDE && Math.sin(typeof p.heading === 'number' ? p.heading : 0) >= FACING;
    }

    function update(player, dt) {
      sync();
      if (!cur) return null;
      var a = active(), s = a && a.stepData;
      if (cur.phase === 'ready') {
        if (s && s.kind !== 'push') lock(true);             // resumed (a reload) after the push: the log is already across
        else if (player && dt > 0 && s && touching(player)) {
          cur.t = Math.min(1, cur.t + PUSH_SPEED * Math.min(dt, 0.1) / (cur.log.x1 - cur.log.x0));
          cache = null;
          cur.pushing = true;
          if (cur.t >= 1) lock(false);
        } else cur.pushing = false;
      }
      if (cur.phase === 'locked' && !cur.arrived && player && Math.hypot(player.x - cur.rock.x, player.z - cur.rock.z) <= ROCK_REACH) {
        cur.arrived = true;
        say('animal:' + cur.spec.animal);
        (opts.later || setTimeout)(function () { say('phrase:guau'); }, 900);   // the bark follows the name (opts.later: tests)
        track('log.crossed', { animal: cur.spec.animal });
      }
      return cur.phase;
    }

    function solids() {
      if (!cur || cur.phase !== 'ready') return [];
      if (cache) return cache;
      var out = [], step = R * 1.4, n = Math.ceil((2 * HALF - 2 * R) / step), x0 = logX() - HALF + R;
      for (var i = 0; i <= n; i++) out.push([x0 + (2 * HALF - 2 * R) * i / n, cur.log.z, R]);
      return (cache = out);
    }

    function locate(id) {
      if (!cur || cur.phase !== 'locked' || id !== cur.rock.id) return null;
      return { x: cur.rock.x, z: cur.rock.z, r: ROCK_REACH };
    }

    function target(step) {
      if (!cur || !step) return null;
      if (step.kind === 'push' && step.item === cur.log.id && cur.phase === 'ready') return { x: logX(), z: cur.log.z, role: 'log', id: cur.log.id };
      if (step.kind === 'goTo' && step.place === cur.rock.id) return { x: cur.rock.x, z: cur.rock.z, role: 'rock', id: cur.rock.id };
      return null;
    }

    return { sync: sync, update: update, solids: solids, locate: locate, target: target, current: function () { return cur; }, logX: logX,
      logSpan: function () { return cur ? [logX() - HALF, logX() + HALF] : null; },
      setSolids: function (s) { solidsSrc = s; },
      onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      place: place, create: create, PUSH_SPEED: PUSH_SPEED, HALF: HALF, ROCK_REACH: ROCK_REACH };
  }

  SA.missionLog = create();
})(typeof window !== 'undefined' ? window : globalThis);
