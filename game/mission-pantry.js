/* SA.missionPantry: the hidden hollow tree, its strawberry pantry and the mouse family (AS-0346, slice 1 of AS-0187: Los ladrones de fresas).
 * Pure (no THREE, no DOM; unit-tested in node:vm). A mission row declares
 *   pantry: { tree, place, family: { mama, papa, baby, babies }, say?: { arrive?, photo? } }          (game/data/missions.js)
 * `tree` is the id of a mission prop (game/data/props.js, drawn by game/render/hollow-tree.js), `place` the id a 'goTo' step names, `family`
 * the animal ids (game/data/animals.js) of mamá, papá and the `babies` (1..5) of the family that sits inside, `say` vocab keys spoken once.
 * While that mission runs the tree stands somewhere hidden in the bosque (dry, flat, away from the station, the water and the other solids) and
 * the family waits in its hollow, facing the opening. The steps are the generic kinds: 'goTo' { place } (walk up to the tree) and 'photo'
 * { target: place } (a tap on the family with la cámara; a place, so a wild mouse photo never completes it). Nothing here knows a mission id
 * or an animal id.
 *
 *   SA.missionPantry.place(spec, seed, opts?) -> { tree: { x, y, z, r, face }, family: [{ role, animal, x, y, z, rotY }] } | null
 *                                                PURE, deterministic from the seed; opts.solids [[x, z, r], ...] are kept clear
 *   SA.missionPantry.sync(opts?)     the current state | null; reads SA.missions.active(): places on a new mission/seed, clears when none runs
 *   SA.missionPantry.update(player)  polled each frame (SA.missionRuntime calls it): says `say.arrive` once when you reach the tree on the goTo step
 *   SA.missionPantry.locate(id)      -> { x, z, r } | null   the tree (the goTo place)
 *   SA.missionPantry.target(step)    -> { x, z, role, id } | null   compass: the tree on the goTo step, the family on the photo step
 *   SA.missionPantry.snap(player?)   a tap on the family with la cámara on the 'photo' step (render/mission-pantry.js), from near the tree:
 *                                    { status: 'none' | 'nocamera' | 'far' | 'complete' | 'step' }. It goes into the album (SA.photo.record), completes the
 *                                    mission (stars) and logs one rescue row { kind: 'pantry' } -> the sticker 'despensa-secreta' (onSticker hook for main.js)
 *   SA.missionPantry.view()          -> { photo, arrived } | null     current() / onChange(fn) / setSolids(listOrFn)
 *   SA.missionPantry.create({ missions?, audio?, report?, track?, solids?, photo?, rescueLog? })   a separate instance (tests)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var TREE_R = 3.2, PHOTO_REACH = 11, EDGE = 6, TRIES = 900, MIN_FROM_START = 22, MAX_FROM_START = 70, FLAT = 0.35, SOLID_GAP = 3;
  // Where the family sits inside the hollow, in the tree's own frame (x = right, z = out through the opening): mamá and papá in the middle,
  // the babies in a row in front of them. The pantry shelves stand at the back (render/hollow-tree.js).
  var SLOTS = { mama: [-0.55, 0.15], papa: [0.55, 0.15], baby: [[-0.85, 0.85], [0, 0.95], [0.85, 0.85], [-0.4, 1.4], [0.4, 1.4]] };
  var SCALE = { mama: 0.7, papa: 0.78, baby: 0.7 };      // the adults' size in the hollow; the babies are already small (babyParts)

  function startPoint() {
    try { if (SA.station && SA.station.spawn) return SA.station.spawn(); } catch (e) { /* fall through */ }
    return { x: 0, z: 0 };
  }

  function spotOk(x, z, solids) {
    var M = SA.map, B = M.BOUNDS;
    if (x < B.minX + EDGE || x > B.maxX - EDGE || z < B.minZ + EDGE || z > B.maxZ - EDGE || M.biomeAt(x) !== 'bosque') return false;
    var h = M.groundHeight(x, z);
    if (M.isWater(x, z) || M.nearWater(x, z, 4) || h < M.WATER_LEVEL + 0.6) return false;
    for (var k = 0; k < 8; k++) {         // the floor of the hollow (and its doorstep) is flat
      var a = k * Math.PI / 4;
      if (Math.abs(M.groundHeight(x + Math.cos(a) * 2.4, z + Math.sin(a) * 2.4) - h) > FLAT) return false;
    }
    if (SA.station && SA.station.inFootprint && SA.station.inFootprint(x, z, 4)) return false;
    if (SA.player && SA.player.inSpawnZone && SA.player.inSpawnZone(x, z)) return false;
    for (var i = 0; i < solids.length; i++) if (Math.hypot(solids[i][0] - x, solids[i][1] - z) < solids[i][2] + SOLID_GAP) return false;
    return true;
  }

  // Local (right, out) -> world, for a tree whose opening faces `face` (the same heading rule as an animal's rotY: 0 = +z).
  function toWorld(t, lx, lz) {
    return { x: t.x + lx * Math.cos(t.face) + lz * Math.sin(t.face), z: t.z - lx * Math.sin(t.face) + lz * Math.cos(t.face) };
  }

  function validSpec(s) {
    var f = s && s.family;
    return !!(f && typeof s.tree === 'string' && typeof s.place === 'string' && f.mama && f.papa && f.baby && Number.isInteger(f.babies) && f.babies >= 1 && f.babies <= SLOTS.baby.length);
  }

  function place(spec, seed, opts) {
    var M = SA.map;
    if (!M || !M.biomeRange || !validSpec(spec)) return null;
    var range = M.biomeRange('bosque'), solids = (opts && opts.solids) || [], S = startPoint(), rand = M.rng(((typeof seed === 'number' ? seed : 1) >>> 0) + 6151);
    for (var t = 0; t < TRIES; t++) {
      var x = range.lo + EDGE + rand() * (range.hi - range.lo - 2 * EDGE), z = M.BOUNDS.minZ + EDGE + rand() * (M.BOUNDS.maxZ - M.BOUNDS.minZ - 2 * EDGE);
      var d = Math.hypot(x - S.x, z - S.z);
      if (d < MIN_FROM_START || (t < TRIES / 2 && d > MAX_FROM_START) || !spotOk(x, z, solids)) continue;
      var tree = { x: x, y: M.groundHeight(x, z), z: z, r: TREE_R, face: Math.atan2(S.x - x, S.z - z) };   // the opening faces the way you come from
      var f = spec.family, family = [];
      function add(role, animal, slot) {
        var w = toWorld(tree, slot[0], slot[1]);
        family.push({ role: role, animal: animal, x: w.x, y: tree.y, z: w.z, rotY: tree.face, scale: SCALE[role] });
      }
      add('mama', f.mama, SLOTS.mama);
      add('papa', f.papa, SLOTS.papa);
      for (var b = 0; b < f.babies; b++) add('baby', f.baby, SLOTS.baby[b]);
      return { tree: tree, family: family };
    }
    return null;
  }

  function create(opts) {
    opts = opts || {};
    var cur = null, listeners = [], solidsSrc = opts.solids || null, last = null;
    function missions() { return opts.missions || SA.missions; }
    function audio() { return opts.audio || SA.audio; }
    function emit() { listeners.slice().forEach(function (f) { try { f(cur); } catch (e) { /* a view never breaks the loop */ } }); }
    function say(key) { try { var a = audio(); if (key && a && a.say) a.say(key); } catch (e) { /* sound is best effort */ } }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }
    function report(ev) { return opts.report ? opts.report(ev) : (SA.missionRuntime ? SA.missionRuntime.report(ev) : { status: 'none' }); }
    function stepOf() { var a = null; try { a = missions().active(); } catch (e) { a = null; } return a && a.stepData; }
    function sayOf(k) { return cur && cur.spec.say ? cur.spec.say[k] : null; }
    function isGoTo(s) { return !!(cur && s && s.kind === 'goTo' && s.place === cur.spec.place); }

    function sync(o) {
      var a = null;
      try { a = missions().active(); } catch (e) { a = null; }
      var spec = a && a.mission && a.mission.pantry;
      var key = spec ? a.id + ':' + a.seed : null;
      if ((cur && cur.key) === key) return cur;
      var src = (o && o.solids) || solidsSrc;
      var p = spec ? place(spec, a.seed, { solids: typeof src === 'function' ? src() : src || [] }) : null;
      cur = p ? { key: key, spec: spec, tree: p.tree, family: p.family, said: {}, snapped: false } : null;
      emit();
      return cur;
    }

    function update(player, o) {
      sync(o);
      if (player) last = { x: player.x, z: player.z };
      if (!cur || !player) return cur;
      if (isGoTo(stepOf()) && Math.hypot(player.x - cur.tree.x, player.z - cur.tree.z) <= cur.tree.r && !cur.said.arrive) {
        cur.said.arrive = true;
        say(sayOf('arrive'));
        track('pantry.arrived', { tree: cur.spec.tree });
      }
      return cur;
    }

    function locate(id) { return cur && id === cur.spec.place ? { x: cur.tree.x, z: cur.tree.z, r: cur.tree.r } : null; }

    function target(step) {
      if (!cur || !step) return null;
      if (isGoTo(step) || (step.kind === 'photo' && step.target === cur.spec.place)) return { x: cur.tree.x, z: cur.tree.z, role: 'place', id: cur.spec.place };
      return null;
    }

    // The family photo (a tap on the mice with la cámara in hand, from near the tree). Never punishing: a far or camera-less tap just returns a status.
    function snap(player) {
      sync();
      var s = stepOf();
      if (!cur || !s || s.kind !== 'photo' || s.target !== cur.spec.place || cur.snapped) return { status: 'none' };
      var inv = opts.inventory || SA.inventory;
      if (!inv || inv.equipped() !== 'camara') return { status: 'nocamera' };
      var p = player || last;
      if (p && Math.hypot(p.x - cur.tree.x, p.z - cur.tree.z) > PHOTO_REACH) return { status: 'far' };
      try { var au = audio(); if (au && au.sfx) au.sfx('shutter'); } catch (e) { /* sound is best effort */ }
      var a = null;
      try { a = missions().active(); } catch (e) { a = null; }
      var r = report({ type: 'photo', target: s.target });
      if (!r || (r.status !== 'complete' && r.status !== 'step')) return r || { status: 'none' };
      cur.snapped = true;
      say(sayOf('photo'));
      track('pantry.photo', { tree: cur.spec.tree });
      try { (opts.photo || SA.photo).record(cur.spec.family.mama); } catch (e) { /* the album never blocks play */ }
      var rec = { earned: [] };
      try { rec = (opts.rescueLog || SA.rescueLog).record({ kind: 'pantry', mission: a ? a.id : '', animal: cur.spec.family.mama, key: a ? a.id : '' }) || rec; } catch (e) { /* the log never blocks play */ }
      if (api.onSticker) { try { api.onSticker({ mission: a ? a.id : '', badges: rec.earned || [] }); } catch (e) { /* the view never breaks play */ } }
      return r;
    }

    function view() {
      if (!cur) return null;
      var s = stepOf();
      return { photo: !!(s && s.kind === 'photo'), arrived: !!cur.said.arrive };
    }

    var api = { sync: sync, update: update, locate: locate, target: target, snap: snap, view: view, onSticker: null, current: function () { return cur; },
      setSolids: function (s) { solidsSrc = s; },
      onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      create: create, TREE_R: TREE_R, PHOTO_REACH: PHOTO_REACH };
    return api;
  }

  var api = create();
  api.place = place;
  SA.missionPantry = api;
})(typeof window !== 'undefined' ? window : globalThis);
