/* SA.missionCarry: where a mission's carried thing (an egg) and its drop-off (a nest) stand, and picking it up (AS-0313, slice 1 of
 * AS-0181). Pure (no THREE, no DOM; unit-tested in node:vm). A mission row declares `carry: { item, to, near? }`: `item` is the
 * carried thing's id, `to` the drop-off id, `near` an anchor in SA.map ('pond' by default). Both sit on dry ground by the anchor, the
 * thing a short walk from the drop-off. Nothing here special-cases a mission id; the 'carry' / 'deliver' steps are the generic kinds
 * (game/data/step-kinds.js) and SA.carry holds and drops the item (the 'deliver' step drops it at `to`).
 *
 *   SA.missionCarry.place(spec, seed, opts?)  -> { item: {id,x,z,y}, to: {id,x,z,y} } | null   PURE, deterministic from the seed;
 *                                                opts.solids [[x, z, r], ...] (the player's obstacle list) are kept clear
 *   SA.missionCarry.sync(opts?)   -> the current { key, spec, item, to, phase } | null; reads SA.missions.active(): places on a new
 *                                    mission/seed, clears (and lets go of a held item) when none runs. phase: 'ground' | 'held' | 'placed'
 *   SA.missionCarry.update(player) polled each frame: while the current step is the 'carry' of this item and the player is within
 *                                    PICK_REACH of it, picks it up (SA.carry.pickUp) and says "el huevo"; once the kid lets go at the
 *                                    drop-off the phase is 'placed' and "el nido" is said. -> the phase
 *   SA.missionCarry.locate(id)    -> { x, z, r } | null  the item (until picked up) or the drop-off, for SA.missionRuntime
 *   SA.missionCarry.target(step)  -> { x, z, role, id } | null  where the step's world target is (the compass): the item for 'carry',
 *                                    the drop-off for 'deliver'
 *   SA.missionCarry.current()     the state without re-reading the mission;  onChange(fn) -> unsubscribe
 *   SA.missionCarry.setSolids(listOrFn)  the walk list kept clear when placing (scene.js sets it; the default is none)
 *   SA.missionCarry.create({ missions?, carry?, audio?, track?, solids? })   a separate instance (tests)
 * After the last step the egg stays in the nest (phase 'placed') until another mission with a carry spec starts.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var PICK_REACH = 2.0, DROP_REACH = 2.5, NEST_RING = 3.6, APART = 5, EDGE = 3, TRIES = 300;

  function anchorOf(name) {
    var M = SA.map;
    if (!M) return null;
    if (name === 'pond' && M.POND) return { x: M.POND.x, z: M.POND.z, r: M.POND.radius };
    return null;
  }

  function dryOk(x, z, solids) {
    var M = SA.map, B = M.BOUNDS;
    if (x < B.minX + EDGE || x > B.maxX - EDGE || z < B.minZ + EDGE || z > B.maxZ - EDGE) return false;
    if (M.isWater(x, z) || M.nearWater(x, z, 0.8) || M.groundHeight(x, z) < M.WATER_LEVEL + 0.45) return false;
    var h = M.groundHeight(x, z);
    if (Math.abs(M.groundHeight(x + 1, z) - h) > 0.6 || Math.abs(M.groundHeight(x, z + 1) - h) > 0.6) return false;
    if (SA.station && SA.station.inFootprint(x, z, 2.5)) return false;
    for (var i = 0; i < solids.length; i++) if (Math.hypot(solids[i][0] - x, solids[i][1] - z) < solids[i][2] + 1) return false;
    return true;
  }

  function place(spec, seed, opts) {
    var M = SA.map, a = spec && anchorOf(spec.near || 'pond');
    if (!M || !a) return null;
    var solids = (opts && opts.solids) || [];
    var rand = M.rng(((typeof seed === 'number' ? seed : 1) >>> 0) + 5003);
    function at(id, p) { return { id: id, x: p[0], z: p[1], y: M.groundHeight(p[0], p[1]) }; }
    for (var t = 0; t < TRIES; t++) {
      var ang = rand() * Math.PI * 2, rr = a.r + NEST_RING + rand() * 1.5;
      var n = [a.x + Math.cos(ang) * rr, a.z + Math.sin(ang) * rr];
      if (!dryOk(n[0], n[1], solids)) continue;
      for (var k = 0; k < 12; k++) {
        var ea = rand() * Math.PI * 2, d = APART + rand() * 2;
        var e = [n[0] + Math.cos(ea) * d, n[1] + Math.sin(ea) * d];
        if (dryOk(e[0], e[1], solids)) return { item: at(spec.item, e), to: at(spec.to, n) };
      }
    }
    return null;
  }

  function create(opts) {
    opts = opts || {};
    var cur = null, listeners = [], solidsSrc = opts.solids || null;
    function missions() { return opts.missions || SA.missions; }
    function carry() { return opts.carry || SA.carry; }
    function audio() { return opts.audio || SA.audio; }
    function emit() { listeners.slice().forEach(function (f) { try { f(cur); } catch (e) { /* a view never breaks the loop */ } }); }
    function say(key) { try { var a = audio(); if (a && a.say) a.say(key); } catch (e) { /* sound is best effort */ } }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }

    function sync(o) {
      var a = null;
      try { a = missions().active(); } catch (e) { a = null; }
      var spec = a && a.mission && a.mission.carry;
      var key = spec ? a.id + ':' + a.seed : null;
      if ((cur && cur.key) === key) return cur;
      if (cur && cur.phase === 'held' && !carry().holds(cur.spec.item)) finish();   // dropped at the nest on the very step that ended the mission
      if (!a && cur && cur.phase === 'placed') return cur;                           // a finished mission leaves the egg resting in its nest
      if (cur && cur.phase === 'held') { try { carry().drop(); } catch (e) { /* nothing to drop */ } }
      var src = (o && o.solids) || solidsSrc;
      var solids = typeof src === 'function' ? src() : src || [];
      var spots = spec ? place(spec, a.seed, { solids: solids }) : null;
      cur = spots ? { key: key, spec: spec, item: spots.item, to: spots.to, phase: 'ground' } : null;
      emit();
      return cur;
    }

    function setPhase(p) { cur.phase = p; emit(); }
    function finish() {
      setPhase('placed');
      say('thing:' + cur.spec.to);
      track('carry.placed', { item: cur.spec.item, to: cur.spec.to });
    }

    function update(player, o) {
      sync(o);
      if (!cur) return null;
      var a = null;
      try { a = missions().active(); } catch (e) { a = null; }
      var s = a && a.stepData;
      if (cur.phase === 'ground' && s && s.kind === 'deliver' && s.item === cur.spec.item) {
        // Resumed (a reload) on the deliver step: the hand is not saved, so the egg is back in hand at once (never stuck, AS-0238).
        if (carry().pickUp(cur.spec.item, {})) { setPhase('held'); track('carry.resume', { item: cur.spec.item }); }
      } else if (cur.phase === 'ground' && player && s && s.kind === 'carry' && s.item === cur.spec.item &&
          Math.hypot(player.x - cur.item.x, player.z - cur.item.z) <= PICK_REACH) {
        if (carry().pickUp(cur.spec.item, { fragile: !!s.fragile })) {
          setPhase('held');
          say('thing:' + cur.spec.item);
          track('carry.pickup', { item: cur.spec.item });
        }
      } else if (cur.phase === 'held' && !carry().holds(cur.spec.item)) {
        finish();         // let go at the drop-off (the 'deliver' step dropped it): it now rests in the nest
      }
      return cur.phase;
    }

    function locate(id) {
      if (!cur) return null;
      if (id === cur.to.id) return { x: cur.to.x, z: cur.to.z, r: DROP_REACH };
      if (id === cur.item.id && cur.phase === 'ground') return { x: cur.item.x, z: cur.item.z, r: PICK_REACH };
      return null;
    }

    function target(step) {
      if (!cur || !step) return null;
      if (step.kind === 'carry' && step.item === cur.item.id && cur.phase === 'ground') return { x: cur.item.x, z: cur.item.z, role: 'item', id: cur.item.id };
      if (step.kind === 'deliver' && step.to === cur.to.id) return { x: cur.to.x, z: cur.to.z, role: 'to', id: cur.to.id };
      return null;
    }

    return { sync: sync, update: update, locate: locate, target: target, current: function () { return cur; },
      setSolids: function (s) { solidsSrc = s; },
      onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      create: create, PICK_REACH: PICK_REACH, DROP_REACH: DROP_REACH };
  }

  var api = create();
  api.place = place;
  SA.missionCarry = api;
})(typeof window !== 'undefined' ? window : globalThis);
