/* SA.missionDoctor: the sick animal and its bucket of water (AS-0331, slice 1 of AS-0184: Doctor del santuario). Pure (no THREE, no DOM;
 * unit-tested in node:vm). A mission row declares `doctor: { animal, part, item, say? }` (game/data/missions.js): the sick animal (an id from
 * game/data/animals.js) stands on dry ground in its own biome near the oasis, and the bucket `item` lies at the oasis pool's edge, ONLY
 * while that mission runs. The steps are generic kinds (game/data/step-kinds.js): 'touch' {animal, part} (tap the animal's forehead),
 * 'carry' {item} (the bucket is picked up by walking up to it), 'fill' {item} (walk to the pool holding it) and 'deliver' {item, to}
 * (SA.carry drops it at the animal). Nothing here knows a mission id or an animal id.
 *
 *   SA.missionDoctor.place(spec, seed, opts?) -> { animal: {id,x,z,y,rotY}, bucket: {id,x,z,y}, pool: {x,z,r} } | null   PURE, deterministic
 *                                                from the seed; opts.solids [[x, z, r], ...] are kept clear
 *   SA.missionDoctor.sync(opts?)   the current { key, spec, animal, bucket, pool, phase, checked } | null; reads SA.missions.active():
 *                                  places on a new mission/seed, clears (and lets go of a held bucket) when none runs.
 *                                  phase: 'ground' | 'held' (empty) | 'full' | 'given'
 *   SA.missionDoctor.update(player) polled each frame (SA.missionRuntime calls it): picks the bucket up near it on the 'carry' step, fills it near
 *                                  the pool on the 'fill' step (reports { type: 'filled', item }, says `say.fill`), and notices the delivery.
 *                                  A reload resumes with the bucket in hand on the 'fill' / 'deliver' steps (the hand is not saved).
 *   SA.missionDoctor.touch(player, part?) a tap on the sick animal's pick volume (render/mission-doctor.js): on the 'touch' step and close
 *                                  enough it reports { type: 'touched', animal, part } and says `say.touch` -> { ok, reason? }
 *   SA.missionDoctor.view()        -> { sick, checked, phase } what the renderer shows (droopy pose, thermometer, water in the bucket)
 *   SA.missionDoctor.locate(id)    -> { x, z, r } | null   the animal (for the 'deliver' step) or the loose bucket
 *   SA.missionDoctor.target(step)  -> { x, z, role, id } | null   compass: the animal (touch / deliver), the bucket (carry), the pool (fill)
 *   SA.missionDoctor.current() / onChange(fn) / setSolids(listOrFn) / create({ missions?, carry?, audio?, report?, track?, solids? })
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var PICK_REACH = 2.0, FILL_REACH = 2.0, TOUCH_REACH = 4.2, GIVE_REACH = 3.4, ANIMAL_RING_MIN = 11, ANIMAL_RING_MAX = 17, EDGE = 4, TRIES = 500;

  function oasisOf() {
    var o = SA.desertPlan && SA.desertPlan.get ? SA.desertPlan.get().oasis : null;
    return o ? { x: o.x, z: o.z, r: o.poolR } : null;
  }

  function dryOk(x, z, biome, solids) {
    var M = SA.map, B = M.BOUNDS;
    if (x < B.minX + EDGE || x > B.maxX - EDGE || z < B.minZ + EDGE || z > B.maxZ - EDGE) return false;
    if (biome && M.biomeAt(x) !== biome) return false;
    var h = M.groundHeight(x, z);
    if (M.isWater(x, z) || M.nearWater(x, z, 1.2) || h < M.WATER_LEVEL + 0.45) return false;
    if (Math.abs(M.groundHeight(x + 1, z) - h) > 0.6 || Math.abs(M.groundHeight(x, z + 1) - h) > 0.6) return false;
    if (SA.station && SA.station.inFootprint(x, z, 2.5)) return false;
    for (var i = 0; i < solids.length; i++) if (Math.hypot(solids[i][0] - x, solids[i][1] - z) < solids[i][2] + 1.2) return false;
    return true;
  }

  function place(spec, seed, opts) {
    var M = SA.map, pool = spec && M ? oasisOf() : null, sick = spec && SA.data.get('animals', spec.animal);
    if (!pool || !sick) return null;
    var solids = (opts && opts.solids) || [], rand = M.rng(((typeof seed === 'number' ? seed : 1) >>> 0) + 6113);
    function at(id, x, z, extra) { var o = { id: id, x: x, z: z, y: M.groundHeight(x, z) }; if (extra) o.rotY = extra; return o; }
    var bAng = rand() * Math.PI * 2, bucket = null;
    for (var k = 0; k < 24 && !bucket; k++) {           // the bucket stands on the pool's rim, on ground you can walk
      var a = bAng + k * 0.5, bx = pool.x + Math.cos(a) * (pool.r + 1.1), bz = pool.z + Math.sin(a) * (pool.r + 1.1);
      var blocked = solids.some(function (s) { return Math.hypot(s[0] - bx, s[1] - bz) < s[2] + 0.6; });
      if (!blocked) bucket = at(spec.item, bx, bz);
    }
    if (!bucket) return null;
    for (var t = 0; t < TRIES; t++) {
      var ang = rand() * Math.PI * 2, rr = ANIMAL_RING_MIN + rand() * (ANIMAL_RING_MAX - ANIMAL_RING_MIN);
      var x = pool.x + Math.cos(ang) * rr, z = pool.z + Math.sin(ang) * rr;
      if (!dryOk(x, z, sick.biome, solids)) continue;
      return { animal: at(sick.id, x, z, rand() * Math.PI * 2), bucket: bucket, pool: pool };
    }
    return null;
  }

  function create(opts) {
    opts = opts || {};
    var cur = null, listeners = [], solidsSrc = opts.solids || null, last = null;
    function missions() { return opts.missions || SA.missions; }
    function carry() { return opts.carry || SA.carry; }
    function audio() { return opts.audio || SA.audio; }
    function emit() { listeners.slice().forEach(function (f) { try { f(cur); } catch (e) { /* a view never breaks the loop */ } }); }
    function say(key) { try { var a = audio(); if (key && a && a.say) a.say(key); } catch (e) { /* sound is best effort */ } }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }
    function report(ev) { return opts.report ? opts.report(ev) : (SA.missionRuntime ? SA.missionRuntime.report(ev) : { status: 'none' }); }
    function stepOf() { var a = null; try { a = missions().active(); } catch (e) { a = null; } return a && a.stepData; }
    function sayOf(k) { return cur && cur.spec.say ? cur.spec.say[k] : null; }
    function hold(phase) { cur.phase = phase; emit(); }
    function given() {
      cur.phase = 'given';
      say(sayOf('give'));
      track('doctor.give', { animal: cur.animal.id });
    }

    function sync(o) {
      var a = null;
      try { a = missions().active(); } catch (e) { a = null; }
      var spec = a && a.mission && a.mission.doctor;
      var key = spec ? a.id + ':' + a.seed : null;
      if ((cur && cur.key) === key) return cur;
      if (cur && cur.phase === 'full' && !carry().holds(cur.spec.item)) given();   // delivered on the very step that ended the mission
      else if (cur && (cur.phase === 'held' || cur.phase === 'full')) { try { carry().drop(); } catch (e) { /* nothing to drop */ } }
      var src = (o && o.solids) || solidsSrc;
      var spots = spec ? place(spec, a.seed, { solids: typeof src === 'function' ? src() : src || [] }) : null;
      cur = spots ? { key: key, spec: spec, animal: spots.animal, bucket: spots.bucket, pool: spots.pool, phase: 'ground', checked: false } : null;
      emit();
      return cur;
    }

    function update(player, o) {
      sync(o);
      if (player) last = { x: player.x, z: player.z };
      if (!cur) return null;
      var s = stepOf(), item = cur.spec.item, c = carry();
      if (s && s.kind !== 'touch') cur.checked = true;      // the fever was found (a reload past the touch step keeps the thermometer up)
      if (cur.phase === 'ground' && s && (s.kind === 'fill' || s.kind === 'deliver') && s.item === item) {
        // Resumed (a reload) after the bucket was picked up: the hand is not saved, so it is back in hand at once (never stuck, AS-0238).
        if (c.pickUp(item, {})) { hold(s.kind === 'deliver' ? 'full' : 'held'); track('doctor.resume', { item: item }); }
      } else if (cur.phase === 'ground' && player && s && s.kind === 'carry' && s.item === item &&
          Math.hypot(player.x - cur.bucket.x, player.z - cur.bucket.z) <= PICK_REACH) {
        if (c.pickUp(item, {})) { hold('held'); say('thing:' + item); track('doctor.pickup', { item: item }); }
      } else if (cur.phase === 'held' && player && s && s.kind === 'fill' && s.item === item &&
          Math.hypot(player.x - cur.pool.x, player.z - cur.pool.z) <= cur.pool.r + FILL_REACH) {
        hold('full');
        say(sayOf('fill'));
        track('doctor.fill', { item: item });
        report({ type: 'filled', item: item });
      } else if (cur.phase === 'full' && !c.holds(item)) {
        given();                                              // let go at the animal (the 'deliver' step dropped it)
        emit();
      }
      return cur.phase;
    }

    function touch(player, part) {
      sync();
      var s = stepOf();
      if (!cur || !s || s.kind !== 'touch' || s.animal !== cur.animal.id) return { ok: false, reason: 'step' };
      if (typeof part === 'string' && part !== s.part) return { ok: false, reason: 'part' };
      var p = player || last;
      if (p && Math.hypot(p.x - cur.animal.x, p.z - cur.animal.z) > TOUCH_REACH) { say('phrase:acercate'); return { ok: false, reason: 'far' }; }
      cur.checked = true;
      emit();
      say(sayOf('touch'));
      track('doctor.touch', { animal: cur.animal.id, part: s.part });
      report({ type: 'touched', animal: s.animal, part: s.part });
      return { ok: true };
    }

    function view() { return cur ? { sick: true, checked: cur.checked, phase: cur.phase } : { sick: false, checked: false, phase: 'none' }; }

    function locate(id) {
      if (!cur) return null;
      if (id === cur.animal.id) return { x: cur.animal.x, z: cur.animal.z, r: GIVE_REACH };
      if (id === cur.spec.item && cur.phase === 'ground') return { x: cur.bucket.x, z: cur.bucket.z, r: PICK_REACH };
      return null;
    }

    function target(step) {
      if (!cur || !step) return null;
      if ((step.kind === 'touch' && step.animal === cur.animal.id) || (step.kind === 'deliver' && step.to === cur.animal.id)) return { x: cur.animal.x, z: cur.animal.z, role: 'animal', id: cur.animal.id };
      if (step.kind === 'carry' && step.item === cur.spec.item && cur.phase === 'ground') return { x: cur.bucket.x, z: cur.bucket.z, role: 'item', id: cur.spec.item };
      if (step.kind === 'fill' && step.item === cur.spec.item) return { x: cur.pool.x, z: cur.pool.z, role: 'water', id: 'pool' };
      return null;
    }

    return { sync: sync, update: update, touch: touch, view: view, locate: locate, target: target, current: function () { return cur; },
      setSolids: function (s) { solidsSrc = s; },
      onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      create: create, PICK_REACH: PICK_REACH, TOUCH_REACH: TOUCH_REACH };
  }

  var api = create();
  api.place = place;
  SA.missionDoctor = api;
})(typeof window !== 'undefined' ? window : globalThis);
