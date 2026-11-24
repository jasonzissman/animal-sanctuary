/* SA.missionHome: Mission 9's build spot and the new rabbit family waiting beside it (AS-0350, slice 1 of AS-0188: Construir un hogar).
 * Pure (no THREE, no DOM; unit-tested in node:vm). A mission row declares
 *   home: { place, family: { adult, baby, babies }, biome?, say?: { arrive?, photo? } }                 (game/data/missions.js)
 * `place` is the id a 'goTo' step names, `family` the animal ids (game/data/animals.js) of the adult and its `babies` (1..5) kits, `biome` where the
 * scientist chose the spot (default 'bosque'), `say` vocab keys spoken once. While that mission runs a build spot stands on dry, flat, clear ground
 * (the render draws a ground marker and a glow ring, game/render/mission-home.js) and the family waits right beside it, facing it. The steps are the
 * generic kinds: 'goTo' { place } (walk onto the spot) and 'photo' { target: place } (a tap on the family with la cámara; a place, so a wild
 * rabbit photo never completes it). Nothing exists while another mission, or none, runs. Nothing here knows a mission id or an animal id.
 *
 *   SA.missionHome.place(spec, seed, opts?) -> { spot: { x, y, z, r, face }, family: [{ role, animal, x, y, z, rotY, scale }] } | null
 *                                              PURE, deterministic from the seed; opts.solids [[x, z, r], ...] are kept clear
 *   SA.missionHome.sync(opts?)     the current state | null; reads SA.missions.active(): places on a new mission/seed, clears when none runs
 *   SA.missionHome.update(player)  polled each frame (SA.missionRuntime calls it): says `say.arrive` once when you reach the spot on the goTo step
 *   SA.missionHome.locate(id)      -> { x, z, r } | null   the spot (the goTo place)
 *   SA.missionHome.target(step)    -> { x, z, role, id } | null   compass: the spot on the goTo and photo steps
 *   SA.missionHome.snap(player?)   a tap on the family with la cámara on the 'photo' step (render/mission-home.js), from near the spot:
 *                                  { status: 'none' | 'nocamera' | 'far' | 'complete' | 'step' }. It goes into the album (SA.photo.record), completes the
 *                                  mission (stars) and logs one rescue row { kind: 'home' } -> the sticker 'hogar-nuevo' (onSticker hook for main.js)
 *   AS-0352 (slice 3): 'place' steps { item, n?, layer: 'abajo'|'encima'|'dentro', place } (after the goTo). When one becomes current update() puts its
 *   item in hand and speaks the direction ('construir' first, then the layer word: abajo / encima / dentro). SA.missionHome.put(player?) is a tap on the
 *   build spot (render/mission-home.js): with the right item in hand it takes `n` of it out of the bag and reports { type: 'placed' } (the render adds the next
 *   layer of the home); the last one speaks `say.built`. The wrong item (or empty hands) only wobbles the home with a boing and loses nothing. A bag that came up
 *   short still counts, so nobody is ever stuck. Once every layer is on, view().built is true and the family walks into the home (each family entry has
 *   an `inside` slot).
 *   SA.missionHome.put(player?)    -> { ok, layer? } | { ok: false, reason: 'step' | 'far' | 'wrong' }
 *   SA.missionHome.view()          -> { photo, arrived, place, placed, total, layers: [layer ids on], built, wobbles } | null     current() / onChange(fn) / setSolids(listOrFn)
 *   SA.missionHome.create({ missions?, audio?, report?, track?, solids?, photo?, rescueLog?, inventory? })   a separate instance (tests)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var SPOT_R = 3.2, PHOTO_REACH = 11, EDGE = 8, TRIES = 900, MIN_FROM_START = 16, MAX_FROM_START = 60, FLAT = 0.4, SOLID_GAP = 6;
  // Where the family waits, in the spot's own frame (x = right, z = out toward the way you come from): the adult beside the spot, the kits around her.
  var SLOTS = { adult: [3.9, 0.4], baby: [[3.0, 1.9], [4.9, 1.7], [2.9, -1.1], [5.0, -0.6], [3.9, 2.8]] };
  var SCALE = { adult: 0.8, baby: 0.8 };      // the kits are already small (babyParts)
  // Where each one settles once the home is built (AS-0352), same frame, round the spot's centre inside the walls (open toward `face`, so the camera sees them).
  var INSIDE = { adult: [0, -0.1], baby: [[-0.6, 0.55], [0.6, 0.55], [0, -0.75], [-0.75, -0.2], [0.75, -0.2]] };
  var PUT_REACH = 7, LAYER_SAY = { abajo: 'phrase:abajo', encima: 'phrase:encima', dentro: 'phrase:dentro' };

  function startPoint() {
    try { if (SA.station && SA.station.spawn) return SA.station.spawn(); } catch (e) { /* fall through */ }
    return { x: 0, z: 0 };
  }

  function spotOk(x, z, biome, solids) {
    var M = SA.map, B = M.BOUNDS;
    if (x < B.minX + EDGE || x > B.maxX - EDGE || z < B.minZ + EDGE || z > B.maxZ - EDGE || M.biomeAt(x) !== biome) return false;
    var h = M.groundHeight(x, z);
    if (M.isWater(x, z) || M.nearWater(x, z, 4) || h < M.WATER_LEVEL + 0.6) return false;
    for (var k = 0; k < 8; k++) {         // the spot and the family's corner are flat
      var a = k * Math.PI / 4;
      if (Math.abs(M.groundHeight(x + Math.cos(a) * 2.4, z + Math.sin(a) * 2.4) - h) > FLAT) return false;
      if (Math.abs(M.groundHeight(x + Math.cos(a) * 5.2, z + Math.sin(a) * 5.2) - h) > FLAT + 0.3) return false;
    }
    if (SA.station && SA.station.inFootprint && SA.station.inFootprint(x, z, 8)) return false;
    if (SA.player && SA.player.inSpawnZone && SA.player.inSpawnZone(x, z)) return false;
    for (var i = 0; i < solids.length; i++) if (Math.hypot(solids[i][0] - x, solids[i][1] - z) < solids[i][2] + SOLID_GAP) return false;
    return true;
  }

  // Local (right, out) -> world, for a spot whose "out" faces `face` (the same heading rule as an animal's rotY: 0 = +z).
  function toWorld(t, lx, lz) {
    return { x: t.x + lx * Math.cos(t.face) + lz * Math.sin(t.face), z: t.z - lx * Math.sin(t.face) + lz * Math.cos(t.face) };
  }

  function validSpec(s) {
    var f = s && s.family;
    return !!(f && typeof s.place === 'string' && f.adult && f.baby && Number.isInteger(f.babies) && f.babies >= 1 && f.babies <= SLOTS.baby.length);
  }

  function place(spec, seed, opts) {
    var M = SA.map;
    if (!M || !M.biomeRange || !validSpec(spec)) return null;
    var biome = spec.biome || 'bosque', range = M.biomeRange(biome), solids = (opts && opts.solids) || [], S = startPoint();
    var rand = M.rng(((typeof seed === 'number' ? seed : 1) >>> 0) + 9173);
    for (var t = 0; t < TRIES; t++) {
      var x = range.lo + EDGE + rand() * (range.hi - range.lo - 2 * EDGE), z = M.BOUNDS.minZ + EDGE + rand() * (M.BOUNDS.maxZ - M.BOUNDS.minZ - 2 * EDGE);
      var d = Math.hypot(x - S.x, z - S.z);
      if (d < MIN_FROM_START || (t < TRIES / 2 && d > MAX_FROM_START) || !spotOk(x, z, biome, solids)) continue;
      var spot = { x: x, y: M.groundHeight(x, z), z: z, r: SPOT_R, face: Math.atan2(S.x - x, S.z - z) };
      var f = spec.family, family = [];
      var add = function (role, animal, slot, inside) {
        var w = toWorld(spot, slot[0], slot[1]), n = toWorld(spot, inside[0], inside[1]);
        family.push({ role: role, animal: animal, x: w.x, y: M.groundHeight(w.x, w.z), z: w.z, rotY: Math.atan2(spot.x - w.x, spot.z - w.z), scale: SCALE[role],
          inside: { x: n.x, y: spot.y, z: n.z, rotY: spot.face } });
      };
      add('adult', f.adult, SLOTS.adult, INSIDE.adult);
      for (var b = 0; b < f.babies; b++) add('baby', f.baby, SLOTS.baby[b], INSIDE.baby[b]);
      return { spot: spot, family: family };
    }
    return null;
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
    function sfx(n) { try { var a = audio(); if (a && a.sfx) a.sfx(n); } catch (e) { /* sound is best effort */ } }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }
    function report(ev) { return opts.report ? opts.report(ev) : (SA.missionRuntime ? SA.missionRuntime.report(ev) : { status: 'none' }); }
    function active() { var a = null; try { a = missions().active(); } catch (e) { a = null; } return a; }
    function stepOf() { var a = active(); return a && a.stepData; }
    function sayOf(k) { return cur && cur.spec.say ? cur.spec.say[k] : null; }
    function isGoTo(s) { return !!(cur && s && s.kind === 'goTo' && s.place === cur.spec.place); }
    function isPhoto(s) { return !!(cur && s && s.kind === 'photo' && s.target === cur.spec.place); }
    function isPlace(s) { return !!(cur && s && s.kind === 'place' && s.place === cur.spec.place); }
    // The home's layers from the mission's own steps (so a reload mid-build restores them): [{ layer, index }] and how many are already on.
    function layers() {
      var a = active(), out = [], on = [];
      if (!cur || !a || !a.mission) return { all: out, on: on };
      a.mission.steps.forEach(function (s, i) { if (isPlace(s)) { out.push(s.layer); if (i < a.step) on.push(s.layer); } });
      return { all: out, on: on };
    }

    function sync(o) {
      var a = active();
      var spec = a && a.mission && a.mission.home;
      var key = spec ? a.id + ':' + a.seed : null;
      if ((cur && cur.key) === key) return cur;
      var src = (o && o.solids) || solidsSrc;
      var p = spec ? place(spec, a.seed, { solids: typeof src === 'function' ? src() : src || [] }) : null;
      cur = p ? { key: key, spec: spec, spot: p.spot, family: p.family, said: {}, snapped: false, wobbles: 0, told: {} } : null;
      emit();
      return cur;
    }

    function update(player, o) {
      sync(o);
      if (player) last = { x: player.x, z: player.z };
      if (!cur || !player) return cur;
      if (isGoTo(stepOf()) && Math.hypot(player.x - cur.spot.x, player.z - cur.spot.z) <= cur.spot.r && !cur.said.arrive) {
        cur.said.arrive = true;
        say(sayOf('arrive'));
        track('home.arrived', { place: cur.spec.place });
      }
      var s = stepOf(), a = active();
      if (isPlace(s) && !cur.told[a.step]) {      // a new layer step: the item is put in hand and the direction is spoken (construir first, then abajo / encima / dentro)
        cur.told[a.step] = true;
        try { var inv = opts.inventory || SA.inventory; if (inv && inv.has(s.item)) inv.equip(s.item); } catch (e) { /* the bag never breaks the loop */ }
        say((layers().on.length ? [] : ['phrase:construir']).concat(LAYER_SAY[s.layer] || []));
      }
      return cur;
    }

    function locate(id) { return cur && id === cur.spec.place ? { x: cur.spot.x, z: cur.spot.z, r: cur.spot.r } : null; }

    function target(step) {
      if (!cur || !step || !(isGoTo(step) || isPhoto(step) || isPlace(step))) return null;
      return { x: cur.spot.x, z: cur.spot.z, role: 'place', id: cur.spec.place };
    }

    // Building (AS-0352): a tap on the build spot on a 'place' step, from near it. The right item in hand goes from the bag onto the home (the next layer); anything
    // else gets a gentle boing and a wobble of the home, keeps everything and leaves the step current. Never stuck: an item that is gone from the bag still counts.
    function put(player) {
      sync();
      var s = stepOf(), p = player || last;
      if (!isPlace(s)) return { ok: false, reason: 'step' };
      if (p && Math.hypot(p.x - cur.spot.x, p.z - cur.spot.z) > PUT_REACH) { say('phrase:acercate'); return { ok: false, reason: 'far' }; }
      var iv = opts.inventory || SA.inventory, held = null, have = 0;
      try { held = iv.equipped(); have = iv.count(s.item); } catch (e) { /* an unreadable bag still lets the step go on */ }
      if (have > 0 && held !== s.item) {
        cur.wobbles++;
        sfx('boing');
        track('home.wrong', { layer: s.layer, item: held || '' });
        emit();
        return { ok: false, reason: 'wrong' };
      }
      var n = typeof s.n === 'number' && s.n >= 1 ? Math.floor(s.n) : 1;
      try { if (have > 0) iv.remove(s.item, Math.min(have, n)); } catch (e) { /* the bag never breaks the loop */ }
      sfx('pop');
      track('home.placed', { layer: s.layer, item: s.item });
      var r = report({ type: 'placed', item: s.item, place: s.place });
      var ly = layers();
      if (ly.all.length && ly.on.length >= ly.all.length) {     // the last layer: the home is finished and the family moves in
        sfx('sparkle');
        say(sayOf('built'));
        track('home.built', { place: cur.spec.place });
      }
      emit();
      return { ok: !!r && r.status !== 'none', layer: s.layer };
    }

    // The family photo (a tap on the rabbits with la cámara in hand, from near the spot). Never punishing: a far or camera-less tap just returns a status.
    function snap(player) {
      sync();
      var s = stepOf();
      if (!isPhoto(s) || cur.snapped) return { status: 'none' };
      var inv = opts.inventory || SA.inventory;
      if (!inv || inv.equipped() !== 'camara') return { status: 'nocamera' };
      var p = player || last;
      if (p && Math.hypot(p.x - cur.spot.x, p.z - cur.spot.z) > PHOTO_REACH) return { status: 'far' };
      try { var au = audio(); if (au && au.sfx) au.sfx('shutter'); } catch (e) { /* sound is best effort */ }
      var a = active();
      var r = report({ type: 'photo', target: s.target });
      if (!r || (r.status !== 'complete' && r.status !== 'step')) return r || { status: 'none' };
      cur.snapped = true;
      say(sayOf('photo'));
      track('home.photo', { place: cur.spec.place });
      try { (opts.photo || SA.photo).record(cur.spec.family.adult); } catch (e) { /* the album never blocks play */ }
      var rec = { earned: [] };
      try { rec = (opts.rescueLog || SA.rescueLog).record({ kind: 'home', mission: a ? a.id : '', animal: cur.spec.family.adult, key: a ? a.id : '' }) || rec; } catch (e) { /* the log never blocks play */ }
      if (api.onSticker) { try { api.onSticker({ mission: a ? a.id : '', badges: rec.earned || [] }); } catch (e) { /* the view never breaks play */ } }
      return r;
    }

    function view() {
      if (!cur) return null;
      var ly = layers();
      return { photo: isPhoto(stepOf()), arrived: !!cur.said.arrive, place: isPlace(stepOf()), placed: ly.on.length, total: ly.all.length, layers: ly.on,
        built: ly.all.length > 0 && ly.on.length >= ly.all.length, wobbles: cur.wobbles };
    }

    var api = { sync: sync, update: update, locate: locate, target: target, snap: snap, put: put, view: view, onSticker: null, current: function () { return cur; },
      setSolids: function (s) { solidsSrc = s; },
      onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      create: create, SPOT_R: SPOT_R, PHOTO_REACH: PHOTO_REACH };
    return api;
  }

  var api = create();
  api.place = place;
  SA.missionHome = api;
})(typeof window !== 'undefined' ? window : globalThis);
