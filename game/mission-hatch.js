/* SA.missionHatch: the egg placed in the nest hatches, then the family photo (AS-0315, slice 3 of AS-0181). Pure (no THREE, no DOM;
 * unit-tested in node:vm). A mission row declares `carry.hatch: { baby, mama, seconds? }` (animal ids; nothing here names one) and
 * continues after the delivery with a 'hatch' step (this module reports it) and a 'photo' step (target = the baby).
 *
 *   phase  'none' (egg not placed yet) -> 'waiting' (placed; the egg rocks) -> 'cracking' (the last CRACK_SECONDS: cracks, harder
 *          wobble) -> 'hatched' (the baby is out; it says its call; the mission moves on to the photo) -> 'done' (photo taken)
 *   SA.missionHatch.update(dt, player?)  once per frame (the renderer calls it): runs the timer from the moment the 'hatch' step is
 *                                        current and the egg rests in the nest, and reports { type: 'hatched', item } when it ends.
 *                                        Resuming (a reload) on the photo step goes straight to 'hatched' without the show.
 *   SA.missionHatch.view()      -> { key, phase, crack (0..1), t, spec, nest {x,z,y}, mama {x,z,y,rotY}, baby {x,z,y,rotY} } | null
 *   SA.missionHatch.snap(player?) a tap on the family with la cámara: while the 'photo' step is current, the camera is in hand and the kid
 *                                        is near the nest, takes the family photo -> { status: 'none' | 'nocamera' | 'far' | 'ignored' |
 *                                        'complete' | ... } (the runtime's result). The finish logs the mission sticker (badge 'patito-nuevo').
 *   SA.missionHatch.trail(from, to, o?) -> [{ x, z, rot, kind: 'foot' | 'feather' }]  PURE: tiny tracks from the nest edge to the egg
 *   SA.missionHatch.family(nest, seed?) -> { mama, baby }  PURE: where mamá and the hatchling stand beside the nest
 *   SA.missionHatch.onHatch / onSticker  hooks (main.js): the hatch moment { baby, mama }; the sticker earned { mission, badges }
 *   SA.missionHatch.create({ missions?, carry?, runtime?, log?, audio?, inventory?, later?, track? })   a separate instance (tests)
 * Telemetry: hatch.start, hatch.done { id }, hatch.photo { id }.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var SECONDS = 5, CRACK_SECONDS = 1.6, SNAP_REACH = 9, SAY_DELAY_MS = 1100, STEP = 0.7, SKIP = 1.2, SIDE = 0.2;

  // Tiny tracks from the nest toward the egg: footprints (alternating left/right) with a feather every third mark.
  function trail(from, to, o) {
    var dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz);
    var start = (o && o.start) || SKIP, end = (o && o.end) || SKIP;
    if (!(len > start + end)) return [];
    var ux = dx / len, uz = dz / len, rot = Math.atan2(ux, uz), out = [], i = 0;
    for (var d = start; d <= len - end; d += STEP, i++) {
      var side = i % 2 ? SIDE : -SIDE;
      out.push({ x: from.x + ux * d - uz * side, z: from.z + uz * d + ux * side, rot: rot, kind: i % 3 === 2 ? 'feather' : 'foot' });
    }
    return out;
  }

  // Mamá stands a step from the nest, the hatchling on the other side, both turned toward it (rotY 0 = facing +z).
  function family(nest, seed) {
    var a = (((typeof seed === 'number' ? seed : 1) >>> 0) % 628) / 100, M = SA.map;
    function at(ang, r) {
      var x = nest.x + Math.cos(ang) * r, z = nest.z + Math.sin(ang) * r;
      return { x: x, z: z, y: M && M.groundHeight ? M.groundHeight(x, z) : nest.y || 0, rotY: Math.atan2(nest.x - x, nest.z - z) };
    }
    return { mama: at(a, 1.9), baby: at(a + 2.3, 1.1) };
  }

  function create(opts) {
    opts = opts || {};
    var st = { key: null, phase: 'none', t: 0 }, spec = null, fam = null, cur = null;
    function missions() { return opts.missions || SA.missions; }
    function carry() { return opts.carry || SA.missionCarry; }
    function runtime() { return opts.runtime || SA.missionRuntime; }
    function audio() { return opts.audio || SA.audio; }
    function say(k) { try { var a = audio(); if (a && a.say) a.say(k); } catch (e) { /* sound is best effort */ } }
    function sfx(n) { try { var a = audio(); if (a && a.sfx) a.sfx(n); } catch (e) { /* sound is best effort */ } }
    function later(fn, ms) { return opts.later ? opts.later(fn, ms) : root.setTimeout(fn, ms); }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }
    function active() { try { return missions().active(); } catch (e) { return null; } }
    function seconds() { return spec && typeof spec.seconds === 'number' ? spec.seconds : SECONDS; }

    function reset(c) {
      cur = c;
      spec = c && c.spec && c.spec.hatch || null;
      st = { key: spec ? c.key : null, phase: 'none', t: 0 };
      fam = spec ? family(c.to, hashOf(c.key)) : null;
    }
    function hashOf(key) { var h = 7; for (var i = 0; i < String(key).length; i++) h = (h * 31 + String(key).charCodeAt(i)) >>> 0; return h; }

    function hatched() {
      st.phase = 'hatched';
      var a = active(), r = runtime().report({ type: 'hatched', item: cur.spec.item });
      track('hatch.done', { id: a ? a.id : '' });
      sfx('sparkle');
      later(function () { say('animal:' + spec.baby); later(function () { say('phrase:pio'); }, SAY_DELAY_MS); }, 350);
      if (api.onHatch) { try { api.onHatch({ baby: spec.baby, mama: spec.mama }); } catch (e) { /* the view never breaks play */ } }
      return r;
    }

    function update(dt) {
      var c = null;
      try { c = carry().current(); } catch (e) { c = null; }
      if (((c && c.spec && c.spec.hatch && c.key) || null) !== st.key) reset(c);
      if (!spec || !c) return st.phase;
      cur = c;
      var a = active(), s = a && a.stepData;
      if (st.phase === 'none' && c.phase === 'placed') {
        if (s && s.kind === 'hatch') { st.phase = 'waiting'; st.t = 0; track('hatch.start', { id: a.id }); }
        else if (s && s.kind === 'photo') st.phase = 'hatched';        // resumed after the hatch: the family is already there
        else if (!a) st.phase = 'done';                                 // the finished mission leaves the family by the nest
      }
      if (st.phase === 'waiting' || st.phase === 'cracking') {
        st.t += dt || 0;
        if (st.t >= seconds()) hatched();
        else if (st.t >= seconds() - CRACK_SECONDS) st.phase = 'cracking';
      } else if (st.phase === 'hatched' && !a) st.phase = 'done';
      return st.phase;
    }

    function view() {
      if (!spec || !cur || st.phase === 'none') return spec && cur ? { key: st.key, phase: 'none', crack: 0, t: 0, spec: spec, nest: cur.to, mama: fam.mama, baby: fam.baby } : null;
      var crack = st.phase === 'cracking' ? Math.min(1, (st.t - (seconds() - CRACK_SECONDS)) / CRACK_SECONDS) : st.phase === 'waiting' ? 0 : 1;
      return { key: st.key, phase: st.phase, crack: crack, t: st.t, spec: spec, nest: cur.to, mama: fam.mama, baby: fam.baby };
    }

    function snap(player) {
      var a = active(), s = a && a.stepData;
      if (!spec || !s || s.kind !== 'photo' || (st.phase !== 'hatched')) return { status: 'none' };
      var inv = opts.inventory || SA.inventory;
      if (!inv || inv.equipped() !== 'camara') return { status: 'nocamera' };
      if (player && Math.hypot(player.x - cur.to.x, player.z - cur.to.z) > SNAP_REACH) return { status: 'far' };
      sfx('shutter');
      var r = runtime().report({ type: 'photo', target: spec.baby });
      if (r.status !== 'complete' && r.status !== 'step') return r;
      st.phase = 'done';
      track('hatch.photo', { id: a.id });
      var rec = { earned: [] };
      try { rec = (opts.log || SA.rescueLog).record({ kind: 'hatch', mission: a.id, animal: spec.baby, key: a.id }) || rec; } catch (e) { /* the log never blocks play */ }
      say('phrase:familia');
      if (api.onSticker) { try { api.onSticker({ mission: a.id, badges: rec.earned || [] }); } catch (e) { /* the view never breaks play */ } }
      return r;
    }

    var api = { update: update, view: view, snap: snap, create: create, onHatch: null, onSticker: null,
      reach: SNAP_REACH };
    return api;
  }

  var api = create();
  api.trail = trail;
  api.family = family;
  api.SECONDS = SECONDS;
  api.CRACK_SECONDS = CRACK_SECONDS;
  SA.missionHatch = api;
})(typeof window !== 'undefined' ? window : globalThis);
