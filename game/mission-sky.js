/* SA.missionSky: Mission 12's roof telescope and night-sky view (AS-0371, slice 1 of AS-0191: Noche de estrellas). Pure (no THREE, no DOM;
 * unit-tested in node:vm). A mission row declares `night: true` (it only STARTS at night: SA.missions.start answers reason 'night' by day, the board
 * shows it waiting) and `sky: { place, say?: { night?, sky?, moon?, stars? } }` (game/data/missions.js). The steps are generic: a 'look' step
 * { target: place } (tap the telescope on the station roof: the sky view opens) and a 'photo' step { target: place } (the camera button inside the view).
 * Nothing special-cases the mission id. The telescope itself (SA.station.layout().telescope) is part of the station, but it only does anything for a mission.
 *
 *   SA.missionSky.sync()            the current state | null; reads SA.missions.active() and starts a fresh state on a new mission/seed
 *   SA.missionSky.update(player)    polled each frame (SA.missionRuntime calls it with { x, z, y? }): remembers where the player stands, and says `say.night`
 *                                   ("la noche") once when the mission has just started
 *   SA.missionSky.canUse(player?)   true when the player stands on the station roof near the telescope (generous: REACH 4.5 m, feet above the roof - 1.5)
 *   SA.missionSky.open(player?)     a tap on the telescope: { status: 'far' | 'none' | 'open' | 'step' }. 'far' = not on the roof near it (a gentle no-op);
 *                                   'none' = no night mission is running; otherwise the view opens (state.open). On the look step the tap reports
 *                                   { type: 'looked', target } (the step moves on to the photo) and says `say.sky` ("el cielo"), then `say.moon` and `say.stars`
 *   SA.missionSky.close()           the big exit button: the view closes (progress is kept; the telescope can be tapped again) -> true when it was open
 *   SA.missionSky.onView            set by the UI: fn(open) when the view opens or closes (it shows / hides the controls)
 *   SA.missionSky.aim(dyaw, dpitch) turn the view (radians; pitch is kept between PITCH_MIN and PITCH_MAX, yaw wraps) -> { yaw, pitch }
 *   SA.missionSky.snap()            the camera button, only on the photo step with the view open: { status: 'none' | 'complete' | 'step' }. Shutter sound, the
 *                                   photo goes into the album as 'el cielo' (SA.album.addSky + SA.albumPics.shot('cielo')), the mission completes (stars) and logs one
 *                                   rescue row { kind: 'sky' } -> the sticker 'noche-de-estrellas' (onSticker hook for main.js)
 *   SA.missionSky.view()            -> { open, yaw, pitch, photo, moon: { yaw, pitch }, moonInView } | null   what the renderer / controls draw
 *   SA.missionSky.target(step)      -> { x, z, role, id } | null   compass: the telescope on the 'look' step (nothing else)
 *   SA.missionSky.stars(n?)         PURE: n { yaw, pitch, size } star directions (deterministic), spread over the dome above the horizon
 *   SA.missionSky.create({ missions?, audio?, report?, track?, rescueLog?, album?, albumPics?, telescope?, now? })   a separate instance (tests)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var REACH = 4.5, ROOF_SLACK = 1.5;
  var PITCH_MIN = -0.15, PITCH_MAX = 1.45, FOV = 1.0;          // view limits (radians): from just under the horizon to nearly overhead
  var MOON = { yaw: 0.9, pitch: 0.65 };                        // where the moon hangs in the dome (the renderer draws it exactly here)
  var TWO_PI = Math.PI * 2;

  function stars(n) {
    var count = typeof n === 'number' && n > 0 ? Math.floor(n) : 220, out = [], s = 20371;
    function rnd() { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }
    for (var i = 0; i < count; i++) {
      var u = rnd(), v = rnd(), w = rnd();
      out.push({ yaw: u * TWO_PI - Math.PI, pitch: Math.asin(0.04 + v * 0.96), size: 0.6 + w * w * 1.6 });   // uniform over the cap above the horizon
    }
    return out;
  }

  function wrapYaw(y) { y = (y + Math.PI) % TWO_PI; if (y < 0) y += TWO_PI; return y - Math.PI; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function create(opts) {
    opts = opts || {};
    var cur = null, last = null;
    function missions() { return opts.missions || SA.missions; }
    function audio() { return opts.audio || SA.audio; }
    function active() { var a = null; try { a = missions().active(); } catch (e) { a = null; } return a; }
    function stepOf() { var a = active(); return a && a.stepData; }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }
    function report(ev) { return opts.report ? opts.report(ev) : (SA.missionRuntime ? SA.missionRuntime.report(ev) : { status: 'none' }); }
    function sfx(n) { try { var a = audio(); if (a && a.sfx) a.sfx(n); } catch (e) { /* sound is best effort */ } }
    // Vocab keys (a string or a list) spoken one after the other (a real clock spaces them out; tests pass an audio stub and hear them at once).
    function say(keys) {
      [].concat(keys || []).forEach(function (k, i) {
        try { var a = audio(); if (k && a && a.say) { if (i && root.setTimeout && !opts.audio) root.setTimeout(function () { a.say(k); }, i * 1300); else a.say(k); } } catch (e) { /* sound is best effort */ }
      });
    }
    function sayOf(k) { return cur && cur.spec.say ? cur.spec.say[k] : null; }
    function telescope() { return opts.telescope || (SA.station && SA.station.layout ? SA.station.layout().telescope : null); }

    function sync() {
      var a = active(), spec = a && a.mission && a.mission.sky, key = spec ? a.id + ':' + a.seed : null;
      if ((cur && cur.key) === key) return cur;
      cur = spec ? { key: key, spec: spec, open: false, snapped: false, yaw: 0, pitch: 0.5, said: {} } : null;
      return cur;
    }

    function isLook(s) { return !!(cur && s && s.kind === 'look' && s.target === cur.spec.place); }
    function isPhoto(s) { return !!(cur && s && s.kind === 'photo' && s.target === cur.spec.place); }
    function once(k, keys) { if (!cur || cur.said[k]) return; cur.said[k] = true; say(keys); }

    function canUse(player) {
      var p = player || last, t = telescope();
      if (!p || !t) return false;
      if (Math.hypot(p.x - t.x, p.z - t.z) > REACH) return false;
      return !(isFinite(p.y) && p.y < t.y - ROOF_SLACK);
    }

    function update(player) {
      sync();
      if (player) last = { x: player.x, y: player.y, z: player.z };
      if (cur && isLook(stepOf())) once('night', sayOf('night'));       // "la noche" as the mission starts
      return cur;
    }

    function open(player) {
      sync();
      if (!cur) return { status: 'none' };
      if (!canUse(player)) return { status: 'far' };
      cur.open = true;
      notify(true);
      sfx('chime');
      var s = stepOf(), status = 'open';
      if (isLook(s)) {
        var r = report({ type: 'looked', target: s.target });
        if (r && (r.status === 'step' || r.status === 'complete')) status = 'step';
        track('sky.look', { place: cur.spec.place });
        cur.said.photo = true;
        once('sky', [].concat(sayOf('sky') || [], sayOf('moon') || [], sayOf('stars') || []));        // "el cielo", then "la luna", "las estrellas" (the photo step)
      }
      if (isPhoto(stepOf())) once('photo', [].concat(sayOf('moon') || [], sayOf('stars') || []));    // opened again (or after a reload) on the photo step
      return { status: status };
    }

    function notify(on) { if (api.onView) { try { api.onView(!!on); } catch (e) { /* a view never breaks play */ } } }
    function close() { var was = !!(cur && cur.open); if (cur) cur.open = false; if (was) notify(false); return was; }

    function aim(dyaw, dpitch) {
      if (!cur) return null;
      cur.yaw = wrapYaw(cur.yaw + (Number(dyaw) || 0));
      cur.pitch = clamp(cur.pitch + (Number(dpitch) || 0), PITCH_MIN, PITCH_MAX);
      return { yaw: cur.yaw, pitch: cur.pitch };
    }

    function moonInView() {
      if (!cur) return false;
      var dy = Math.abs(wrapYaw(cur.yaw - MOON.yaw)) * Math.cos(cur.pitch), dp = Math.abs(cur.pitch - MOON.pitch);
      return dy < FOV / 2 && dp < FOV / 2;
    }

    function snap() {
      sync();
      var s = stepOf();
      if (!cur || !cur.open || !isPhoto(s) || cur.snapped) return { status: 'none' };
      sfx('shutter');
      var a = active();
      try { var al = opts.album || SA.album; if (al && al.addSky) al.addSky(); } catch (e) { /* the album never blocks play */ }
      try { var ap = opts.albumPics || SA.albumPics; if (ap && ap.shot) ap.shot('cielo'); } catch (e) { /* the picture is best effort */ }
      var r = report({ type: 'photo', target: s.target });
      if (!r || (r.status !== 'complete' && r.status !== 'step')) return r || { status: 'none' };
      cur.snapped = true;
      track('sky.photo', { place: cur.spec.place, moon: moonInView() });
      var rec = { earned: [] };
      try { rec = (opts.rescueLog || SA.rescueLog).record({ kind: 'sky', mission: a ? a.id : '', key: a ? a.id : '' }) || rec; } catch (e) { /* the log never blocks play */ }
      if (api.onSticker) { try { api.onSticker({ mission: a ? a.id : '', badges: rec.earned || [] }); } catch (e) { /* the view never breaks play */ } }
      return r;
    }

    function view() {
      if (!cur) return null;
      return { open: cur.open, yaw: cur.yaw, pitch: cur.pitch, photo: isPhoto(stepOf()) && !cur.snapped, moon: { yaw: MOON.yaw, pitch: MOON.pitch }, moonInView: moonInView() };
    }

    // The compass points at the telescope while the look step is current.
    function target(s) {
      sync();
      var t = telescope();
      if (!cur || !t || !isLook(s)) return null;
      return { x: t.x, z: t.z, role: 'telescope', id: cur.spec.place };
    }

    var api = { sync: sync, update: update, canUse: canUse, open: open, close: close, aim: aim, snap: snap, view: view, target: target, locate: function () { return null; },
      onSticker: null, onView: null, current: function () { return cur; }, create: create, stars: stars, REACH: REACH, MOON: MOON, FOV: FOV, PITCH_MIN: PITCH_MIN, PITCH_MAX: PITCH_MAX };
    return api;
  }

  var api = create();
  SA.missionSky = api;
})(typeof window !== 'undefined' ? window : globalThis);
