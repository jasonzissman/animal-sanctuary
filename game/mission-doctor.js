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
 *   SA.missionDoctor.view()        -> { sick, checked, phase, med, shade, rested, umbrella } what the renderer shows (droopy pose, thermometer,
 *                                  water in the bucket, the medicine / umbrella on the station bench, the camel resting under the umbrella)
 *   AS-0332 (slice 2): after the water the same steps go on in strict order (game/data/missions.js): carry the medicine from the station
 *   bench, deliver it to the animal, carry the umbrella from the bench, deliver it: it stands beside the animal (la sombra), the animal
 *   lies down and rests and says one line (`say.rest`, '¡Mañana estaré mejor!'). The scene lingers ~9 s after the mission ends.
 *   AS-0333 (slice 3): after the umbrella the mission sits on a 'recover' step (SA.missions parks it in the save, see game/missions.js `settle`):
 *   the camel stays poorly (droop, thermometer) while it rests, and is healthy on the next session load or once another mission is finished.
 *   Then the 'photo' step: SA.missionDoctor.snap(player?) (a tap on the healthy camel with la cámara, render/mission-doctor.js) takes the
 *   picture -> album, completes the mission and logs one rescue row { kind: 'doctor' } for the sticker (badge 'camello-sano'); onSticker hook.
 *   view() also carries `healthy`. `say.healthy` is the camel's line when it is well ('¡Estoy sano!').
 *   SA.missionDoctor.locate(id)  -> { x, z, r } | null   the animal (for the 'deliver' step) or the loose bucket
 *   SA.missionDoctor.target(step)  -> { x, z, role, id } | null   compass: the animal (touch / deliver), the bucket (carry), the pool (fill)
 *   SA.missionDoctor.current() / onChange(fn) / setSolids(listOrFn) / create({ missions?, carry?, audio?, report?, track?, solids? })
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var SNAP_REACH = 14, PICK_REACH = 2.0, FILL_REACH = 2.0, TOUCH_REACH = 4.2, GIVE_REACH = 3.4, ANIMAL_RING_MIN = 11, ANIMAL_RING_MAX = 17, EDGE = 4, TRIES = 500;
  var BENCH_TOP = 0.55, SHADE_SIDE = 1.5, LINGER_MS = 9000;    // the bench top height, umbrella offset, how long the resting camel stays after the mission ends

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

  // The medicine and the umbrella lie on the station's bench (AS-0332): two spots side by side, on the bench top.
  function shelfOf(spec) {
    var L = SA.station && SA.station.layout ? SA.station.layout() : null, out = {};
    if (!L || !L.bench) return out;
    [spec.medicine, spec.shade].forEach(function (id, i) {
      if (id) out[id] = { id: id, x: L.bench.x + (i ? 0.45 : -0.45) * (L.bench.w / 1.7), z: L.bench.z, y: L.floorY + BENCH_TOP };
    });
    return out;
  }

  // Where the umbrella stands: just beside the animal (to its side, whichever way it faces).
  function shadeSpot(animal) {
    var r = animal.rotY || 0, x = animal.x + Math.cos(r) * SHADE_SIDE, z = animal.z - Math.sin(r) * SHADE_SIDE;
    return { x: x, z: z, y: SA.map ? SA.map.groundHeight(x, z) : animal.y };
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
      return { animal: at(sick.id, x, z, rand() * Math.PI * 2), bucket: bucket, pool: pool, shelf: shelfOf(spec) };
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
    function now() { return opts.now ? opts.now() : Date.now(); }
    function later(fn, ms) { return opts.later ? opts.later(fn, ms) : root.setTimeout(fn, ms); }
    function hold(phase) { cur.phase = phase; emit(); }
    function given() {
      cur.phase = 'given';
      say(sayOf('give'));
      track('doctor.give', { animal: cur.animal.id });
    }

    // Step order of the whole mission: touch 0, bucket 1-3, medicine 4-5 (carry, deliver), umbrella 6-7. Used to settle a reload.
    function rank(s) {
      var sp = cur.spec;
      if (!s) return -1;
      if (sp.medicine && s.item === sp.medicine) return s.kind === 'deliver' ? 5 : 4;
      if (sp.shade && s.item === sp.shade) return s.kind === 'deliver' ? 7 : 6;
      if (s.kind === 'recover') return 8;                  // AS-0333: resting, waiting for tomorrow
      if (s.kind === 'photo') return 9;                    // ... and healthy again: the photo
      return 0;
    }

    // The camel got well (the 'recover' step is over): it stands up, the umbrella and the thermometer go, it says it is fine.
    function recovered() {
      if (cur.healthy) return;
      cur.healthy = true;
      cur.rested = false;
      cur.umbrella = null;
      say(sayOf('healthy'));
      track('doctor.recovered', { animal: cur.animal.id });
      emit();
    }

    function speak(words) {
      var seq = opts.wordSeq || SA.wordSeq, a = audio();
      words = words.filter(Boolean);
      try {
        if (seq && seq.play && a && a.say) seq.play(words, { say: function (k, done) { return a.say(k, done); }, later: later });
        else words.forEach(function (k, i) { if (i) later(function () { say(k); }, i * 1400); else say(k); });
      } catch (e) { /* sound is best effort */ }
    }

    // The medicine or the umbrella was dropped at the animal. The medicine is just spoken; the umbrella goes up beside the animal (la sombra),
    // the animal lies down and rests, and says in one short line that it will be better mañana.
    function handed(role) {
      var it = cur.stock[role];
      it.phase = 'given';
      if (role === 'medicine') {
        say(sayOf('med'));
        track('doctor.medicine', { animal: cur.animal.id });
      } else {
        cur.umbrella = shadeSpot(cur.animal);
        cur.rested = true;
        speak([sayOf('shade'), sayOf('rest')]);
        track('doctor.rest', { animal: cur.animal.id });
      }
      emit();
    }

    function stockHeld() { return cur && Object.keys(cur.stock).some(function (r) { return cur.stock[r].phase === 'held'; }); }

    function sync(o) {
      var a = null;
      try { a = missions().active(); } catch (e) { a = null; }
      var spec = a && a.mission && a.mission.doctor;
      var key = spec ? a.id + ':' + a.seed : null;
      if ((cur && cur.key) === key) return cur;
      if (cur && !carry().holds(cur.spec.item) && cur.phase === 'full') given();   // delivered on the very step that ended the mission
      if (cur) Object.keys(cur.stock).forEach(function (r) { if (cur.stock[r].phase === 'held' && !carry().holds(cur.stock[r].id)) handed(r); });
      if (cur && (cur.rested || cur.healthy) && !spec) {   // the camel keeps resting (or smiling, well again) a while after the mission ended
        if (!cur.until) cur.until = now() + LINGER_MS;
        if (now() < cur.until) return cur;
      }
      if (cur && (cur.phase === 'held' || cur.phase === 'full' || stockHeld())) { try { carry().drop(); } catch (e) { /* nothing to drop */ } }
      var src = (o && o.solids) || solidsSrc;
      var spots = spec ? place(spec, a.seed, { solids: typeof src === 'function' ? src() : src || [] }) : null;
      cur = spots ? { key: key, spec: spec, animal: spots.animal, bucket: spots.bucket, pool: spots.pool, phase: 'ground', checked: false,
        stock: stockOf(spec, spots.shelf), umbrella: null, rested: false, healthy: false } : null;
      emit();
      return cur;
    }

    function stockOf(spec, shelf) {
      var out = {};
      [['medicine', spec.medicine], ['shade', spec.shade]].forEach(function (p) {
        if (p[1] && shelf && shelf[p[1]]) out[p[0]] = { id: p[1], x: shelf[p[1]].x, z: shelf[p[1]].z, y: shelf[p[1]].y, phase: 'shelf' };
      });
      return out;
    }

    function update(player, o) {
      try { var m = missions(); if (m.settle) m.settle(); } catch (e) { /* a waiting mission is settled on the next frame */ }   // AS-0333: recover on a new session
      sync(o);
      if (player) last = { x: player.x, z: player.z };
      if (!cur) return null;
      var s = stepOf(), item = cur.spec.item, c = carry();
      if (s && s.kind !== 'touch') cur.checked = true;      // the fever was found (a reload past the touch step keeps the thermometer up)
      var rk = rank(s), stk = cur.stock;
      if (cur.phase === 'ground' && rk >= 4) cur.phase = 'given';                       // a reload past the water: the bucket rests by the animal
      if (stk.medicine && stk.medicine.phase === 'shelf' && rk >= 6) stk.medicine.phase = 'given';
      Object.keys(stk).forEach(function (role) {            // the medicine and the umbrella on the station bench
        var it = stk[role], c = carry();
        if (it.phase === 'held' && !c.holds(it.id)) handed(role);
        else if (it.phase === 'shelf' && s && s.item === it.id && s.kind === 'deliver') {
          if (c.pickUp(it.id, {})) { it.phase = 'held'; emit(); track('doctor.resume', { item: it.id }); }   // resumed: back in hand (AS-0238)
        } else if (it.phase === 'shelf' && player && s && s.item === it.id && s.kind === 'carry' && Math.hypot(player.x - it.x, player.z - it.z) <= PICK_REACH) {
          if (c.pickUp(it.id, {})) { it.phase = 'held'; emit(); say('thing:' + it.id); track('doctor.pickup', { item: it.id }); }
        }
      });
      if (rk >= 8 && !cur.rested && !cur.healthy) {         // a reload while it rests: it lies under its umbrella again
        cur.rested = true;
        cur.umbrella = shadeSpot(cur.animal);
        if (stk.shade) stk.shade.phase = 'given';
      }
      if (rk >= 9) recovered();
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

    // med / shade: 'shelf' (on the station bench) | 'held' | 'given' (the umbrella then stands at `umbrella`), '' when the mission has none
    function view() {
      if (!cur) return { sick: false, healthy: false, checked: false, phase: 'none', med: '', shade: '', rested: false, umbrella: null };
      var st = cur.stock;
      return { sick: !cur.healthy, healthy: cur.healthy, checked: cur.checked, phase: cur.phase, med: st.medicine ? st.medicine.phase : '',
        shade: st.shade ? st.shade.phase : '', rested: cur.rested, umbrella: cur.umbrella };
    }

    // The photo of the healthy camel (AS-0333): a tap on it with la cámara in hand while the 'photo' step is current. It goes into the album,
    // completes the mission (stars) and logs one rescue row { kind: 'doctor' } for the sticker (badge 'camello-sano', once).
    function snap(player) {
      sync();
      var s = stepOf();
      if (!cur || !cur.healthy || !s || s.kind !== 'photo' || (s.target && s.target !== cur.animal.id) || cur.snapped) return { status: 'none' };
      var inv = opts.inventory || SA.inventory;
      if (!inv || inv.equipped() !== 'camara') return { status: 'nocamera' };
      var p = player || last;
      if (p && Math.hypot(p.x - cur.animal.x, p.z - cur.animal.z) > SNAP_REACH) return { status: 'far' };
      try { var au = audio(); if (au && au.sfx) au.sfx('shutter'); } catch (e) { /* sound is best effort */ }
      var a = null;
      try { a = missions().active(); } catch (e) { a = null; }
      var r = report({ type: 'photo', target: cur.animal.id });
      if (!r || (r.status !== 'complete' && r.status !== 'step')) return r || { status: 'none' };
      cur.snapped = true;
      track('doctor.photo', { animal: cur.animal.id });
      try { (opts.photo || SA.photo).record(cur.animal.id); } catch (e) { /* the album never blocks play */ }
      var rec = { earned: [] };
      try { rec = (opts.rescueLog || SA.rescueLog).record({ kind: 'doctor', mission: a ? a.id : '', animal: cur.animal.id, key: a ? a.id : '' }) || rec; } catch (e) { /* the log never blocks play */ }
      say(sayOf('healthy'));
      if (api.onSticker) { try { api.onSticker({ mission: a ? a.id : '', badges: rec.earned || [] }); } catch (e) { /* the view never breaks play */ } }
      return r;
    }

    function locate(id) {
      if (!cur) return null;
      if (id === cur.animal.id) return { x: cur.animal.x, z: cur.animal.z, r: GIVE_REACH };
      if (id === cur.spec.item && cur.phase === 'ground') return { x: cur.bucket.x, z: cur.bucket.z, r: PICK_REACH };
      return null;
    }

    function target(step) {
      if (!cur || !step) return null;
      if ((step.kind === 'touch' && step.animal === cur.animal.id) || (step.kind === 'deliver' && step.to === cur.animal.id) ||
          (step.kind === 'photo' && step.target === cur.animal.id)) return { x: cur.animal.x, z: cur.animal.z, role: 'animal', id: cur.animal.id };
      if (step.kind === 'carry' && step.item === cur.spec.item && cur.phase === 'ground') return { x: cur.bucket.x, z: cur.bucket.z, role: 'item', id: cur.spec.item };
      if (step.kind === 'carry') {                            // the medicine / umbrella on the station bench
        var it = (cur.stock.medicine && cur.stock.medicine.id === step.item && cur.stock.medicine) || (cur.stock.shade && cur.stock.shade.id === step.item && cur.stock.shade);
        if (it && it.phase === 'shelf') return { x: it.x, z: it.z, role: 'item', id: it.id };
      }
      if (step.kind === 'fill' && step.item === cur.spec.item) return { x: cur.pool.x, z: cur.pool.z, role: 'water', id: 'pool' };
      return null;
    }

    var api = { sync: sync, update: update, touch: touch, snap: snap, view: view, locate: locate, target: target, onSticker: null, current: function () { return cur; },
      setSolids: function (s) { solidsSrc = s; },
      onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      create: create, PICK_REACH: PICK_REACH, TOUCH_REACH: TOUCH_REACH };
    return api;
  }

  var api = create();
  api.place = place;
  SA.missionDoctor = api;
})(typeof window !== 'undefined' ? window : globalThis);
