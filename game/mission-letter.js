/* SA.missionLetter: Mission 11's lost message: the scientist's letter, spoken directions and the lookout tower (AS-0364, slice 1 of AS-0190).
 * Pure (no THREE, no DOM; unit-tested in node:vm). A mission row declares
 *   letter: { item, place, box, legs: [{ place, at, side?, near? }], biome?, say?: { give?, photo? } }                 (game/data/missions.js)
 * The steps are the generic kinds: 'talk' { who: 'scientist', gives } (the letter), one 'goTo' { place } per leg, 'goTo' { place: letter.place } (the tower's
 * platform; it only counts once you stand on top), 'give' { item, to: letter.box } and 'photo' { target: letter.place }. The kid only HEARS each leg: the prompt
 * pill speaks the leg's short line when it starts and its 🔊 repeats it (SA.missionPill), and the steps carry `noArrow: true`, so the compass is hidden.
 * Nothing exists unless this mission runs; nothing here knows a mission id or an animal id.
 *
 *   SA.missionLetter.place(spec, seed, opts?) -> { tower: { id, x, z, topY, r }, legs: [{ place, x, z, r }], box: { x, y, z, r } } | null
 *                                         PURE, deterministic from the seed. The legs are dry waypoints along the way from the station to the tower, each at
 *                                         least GAP m from the last (`at` 0..1 along the way, `side` -2 left .. 2 right of it, `near: 'water'` prefers the bank)
 *   SA.missionLetter.onTop(tower, p)      -> true when p stands on the tower platform (inside its half-width, feet above topY - 1.5)
 *   SA.missionLetter.sync(opts?)          the current state | null; reads SA.missions.active() and places on a new mission/seed
 *   SA.missionLetter.update(player)       polled each frame (SA.missionRuntime calls it): once the letter is handed over by the scientist it is put in the hand
 *                                         (and again after a reload, never stuck); on the 'give' step the letter goes into the mailbox when the kid is on top
 *                                         and near it ("la carta")
 *   SA.missionLetter.locate(id)           -> { x, z, r } | null   a leg waypoint, or the tower once you are on top of it
 *   SA.missionLetter.snap(player?)        the tower-top photo (a tap on the mailbox with la cámara): { status: 'none' | 'nocamera' | 'far' | 'complete' | 'step' }.
 *                                         It completes the mission and logs one rescue row { kind: 'letter' } -> the sticker 'cartero-valiente' (onSticker hook)
 *   SA.missionLetter.view()               -> { box: {x,y,z}, give, photo, given } | null   what the renderer draws (the mailbox + its glow on the platform)
 *   SA.missionLetter.create({ missions?, audio?, report?, track?, carry?, inventory?, rescueLog? })   a separate instance (tests)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var LEG_R = 4, GAP = 10, SIDE = 9, EDGE = 6, GIVE_REACH = 2.4, PHOTO_REACH = 5, BOX_BACK = 1.2, RINGS = [0, 3, 6, 9, 12, 16], ANGLES = 12;

  function startPoint() {
    try { if (SA.station && SA.station.spawn) return SA.station.spawn(); } catch (e) { /* fall through */ }
    return { x: 0, z: 0 };
  }

  function dryOk(x, z) {
    var M = SA.map, B = M.BOUNDS;
    if (x < B.minX + EDGE || x > B.maxX - EDGE || z < B.minZ + EDGE || z > B.maxZ - EDGE) return false;
    if (M.isWater(x, z) || M.groundHeight(x, z) < M.WATER_LEVEL + 0.3) return false;
    if (SA.station && SA.station.inFootprint && SA.station.inFootprint(x, z, 3)) return false;
    return true;
  }

  function onTop(t, p) {
    if (!t || !p || !isFinite(p.y)) return false;
    return Math.abs(p.x - t.x) <= t.r && Math.abs(p.z - t.z) <= t.r && p.y >= t.topY - 1.5;
  }

  function spotFor(base, leg, avoid) {
    var M = SA.map, fallback = null;
    for (var r = 0; r < RINGS.length; r++) {
      for (var k = 0; k < (RINGS[r] ? ANGLES : 1); k++) {
        var a = k * Math.PI * 2 / ANGLES, x = base.x + Math.cos(a) * RINGS[r], z = base.z + Math.sin(a) * RINGS[r];
        if (!dryOk(x, z) || avoid.some(function (q) { return Math.hypot(q.x - x, q.z - z) < GAP; })) continue;
        if (leg.near !== 'water' || (M.nearWater && M.nearWater(x, z, 5))) return { x: x, z: z };
        if (!fallback) fallback = { x: x, z: z };
      }
    }
    return fallback;
  }

  function place(spec, seed, opts) {
    var M = SA.map;
    if (!M || !SA.lookouts || !spec || !Array.isArray(spec.legs)) return null;
    var towers = SA.lookouts.towers().filter(function (t) { return t.biome === (spec.biome || 'bosque'); });
    var t = towers[(((typeof seed === 'number' ? seed : 1) >>> 0) % Math.max(1, towers.length))];
    if (!t) return null;
    var S = startPoint(), dx = t.x - S.x, dz = t.z - S.z, len = Math.hypot(dx, dz) || 1, rx = -dz / len, rz = dx / len;   // (rx, rz): to the right of the way
    var avoid = [{ x: S.x, z: S.z }, { x: t.x, z: t.z }], legs = [];
    for (var i = 0; i < spec.legs.length; i++) {
      var g = spec.legs[i], side = typeof g.side === 'number' ? g.side : 0;
      var base = { x: S.x + dx * g.at + rx * side * SIDE, z: S.z + dz * g.at + rz * side * SIDE };
      var p = spotFor(base, g, avoid);
      if (!p) return null;
      avoid.push(p);
      legs.push({ place: g.place, x: p.x, z: p.z, r: LEG_R });
    }
    var bx = t.x - t.face.x * BOX_BACK, bz = t.z - t.face.z * BOX_BACK;     // on the platform, away from the ladder
    return { tower: { id: t.id, x: t.x, z: t.z, topY: t.topY, r: t.platform / 2 }, legs: legs, box: { x: bx, y: t.topY, z: bz, r: GIVE_REACH } };
  }

  function create(opts) {
    opts = opts || {};
    var cur = null, last = null;
    function missions() { return opts.missions || SA.missions; }
    function audio() { return opts.audio || SA.audio; }
    function carry() { return opts.carry || SA.carry; }
    function inv() { return opts.inventory || SA.inventory; }
    function say(key) { try { var a = audio(); if (key && a && a.say) a.say(key); } catch (e) { /* sound is best effort */ } }
    function sfx(n) { try { var a = audio(); if (a && a.sfx) a.sfx(n); } catch (e) { /* sound is best effort */ } }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }
    function report(ev) { return opts.report ? opts.report(ev) : (SA.missionRuntime ? SA.missionRuntime.report(ev) : { status: 'none' }); }
    function active() { var a = null; try { a = missions().active(); } catch (e) { a = null; } return a; }
    function stepOf() { var a = active(); return a && a.stepData; }

    function sync() {
      var a = active(), spec = a && a.mission && a.mission.letter, key = spec ? a.id + ':' + a.seed : null;
      if ((cur && cur.key) === key) return cur;
      var p = spec ? place(spec, a.seed) : null;
      cur = p ? { key: key, spec: spec, tower: p.tower, legs: p.legs, box: p.box, given: false, snapped: false, top: false } : null;
      return cur;
    }

    function isGive(s) { return !!(cur && s && s.kind === 'give' && s.to === cur.spec.box); }
    function isPhoto(s) { return !!(cur && s && s.kind === 'photo' && s.target === cur.spec.place); }
    function isTower(s) { return !!(cur && s && s.kind === 'goTo' && s.place === cur.spec.place); }
    function isLeg(s) { return !!(cur && s && s.kind === 'goTo' && cur.legs.some(function (g) { return g.place === s.place; })); }

    // The letter rides in the hand from the scientist's handover until the mailbox (put back after a reload too, so nobody is stuck without it).
    function ensureLetter() {
      var i = inv();
      if (cur.given || !i || i.has(cur.spec.item)) return;
      try { if (carry() && carry().pickUp(cur.spec.item, {})) track('letter.carry', { item: cur.spec.item }); } catch (e) { /* the hand is best effort */ }
    }

    function update(player) {
      sync();
      if (player) last = { x: player.x, y: player.y, z: player.z };
      if (!cur || !player) return cur;
      var s = stepOf();
      cur.top = onTop(cur.tower, player);
      if (isLeg(s) || isTower(s) || isGive(s)) ensureLetter();
      if (isGive(s) && cur.top && !cur.given && Math.hypot(player.x - cur.box.x, player.z - cur.box.z) <= GIVE_REACH) {
        var r = report({ type: 'gave', item: s.item, to: s.to });
        if (r && (r.status === 'step' || r.status === 'complete')) {
          cur.given = true;
          try { var c = carry(); if (c && c.holds(cur.spec.item)) c.drop(); else if (inv() && inv().has(cur.spec.item)) inv().remove(cur.spec.item); } catch (e) { /* best effort */ }
          sfx('chime');
          say(cur.spec.say && cur.spec.say.give);
          track('letter.given', { place: cur.spec.place });
        }
      }
      return cur;
    }

    function locate(id) {
      if (!cur) return null;
      if (id === cur.spec.place) return cur.top ? { x: cur.tower.x, z: cur.tower.z, r: cur.tower.r } : null;
      for (var i = 0; i < cur.legs.length; i++) if (cur.legs[i].place === id) return { x: cur.legs[i].x, z: cur.legs[i].z, r: cur.legs[i].r };
      return null;
    }

    function snap(player) {
      sync();
      var s = stepOf();
      if (!isPhoto(s) || cur.snapped) return { status: 'none' };
      var i = opts.inventory || SA.inventory;
      if (!i || i.equipped() !== 'camara') return { status: 'nocamera' };
      var p = player || last;
      if (!onTop(cur.tower, p) || Math.hypot(p.x - cur.box.x, p.z - cur.box.z) > PHOTO_REACH) return { status: 'far' };
      sfx('shutter');
      var a = active();
      var r = report({ type: 'photo', target: s.target });
      if (!r || (r.status !== 'complete' && r.status !== 'step')) return r || { status: 'none' };
      cur.snapped = true;
      say(cur.spec.say && cur.spec.say.photo);
      track('letter.photo', { place: cur.spec.place });
      var rec = { earned: [] };
      try { rec = (opts.rescueLog || SA.rescueLog).record({ kind: 'letter', mission: a ? a.id : '', key: a ? a.id : '' }) || rec; } catch (e) { /* the log never blocks play */ }
      if (api.onSticker) { try { api.onSticker({ mission: a ? a.id : '', badges: rec.earned || [] }); } catch (e) { /* the view never breaks play */ } }
      return r;
    }

    function view() {
      if (!cur) return null;
      var s = stepOf();
      return { box: { x: cur.box.x, y: cur.box.y, z: cur.box.z }, give: isGive(s), photo: isPhoto(s), given: cur.given };
    }

    var api = { sync: sync, update: update, locate: locate, snap: snap, view: view, onSticker: null, current: function () { return cur; }, create: create,
      GIVE_REACH: GIVE_REACH, PHOTO_REACH: PHOTO_REACH, LEG_R: LEG_R };
    return api;
  }

  var api = create();
  api.place = place;
  api.onTop = onTop;
  SA.missionLetter = api;
})(typeof window !== 'undefined' ? window : globalThis);
