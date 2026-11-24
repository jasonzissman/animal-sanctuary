/* SA.friend: your animal friend (AS-0175). One animal you rescued follows you, idles, celebrates, sleeps at night and leads the way when you
 * ask for a hint. Pure (no THREE, no DOM; node:vm tested). Walking is SA.follow (never re-implemented); naming is SA.names ('Canela la valiente').
 * Save: optional `friend: { id, animalId }` (no version bump). id is the individual's id: the named herd instance ('conejo#2') when that species
 * has a named animal, else the species id; the name itself lives in save.names[id] (SA.names), so renaming never touches the friend row.
 *
 *   SA.friend.unlocked()      true after NEED (3) rescues in SA.rescueLog
 *   SA.friend.candidates()    [{ id, animalId, icon, es, text, named }] one per rescued species (picture cards; named ones carry their name)
 *   SA.friend.pending()       true when it is unlocked, no friend is chosen and there is someone to choose (the scientist offers it)
 *   SA.friend.offer()         { es, key }: 'Uno de tus amigos quiere acompañarte.'  (spoken by the scientist)
 *   SA.friend.current()       { id, animalId, icon, es, text } | null      SA.friend.choose(id) -> bool      SA.friend.clear()
 *   SA.friend.step(dt, player, solids?) -> view | null   advances the friend; view = { id, animalId, x, z, heading, lift, moving, mode, pop }
 *       mode: 'follow' (walking) | 'sit' | 'chase' (idles: sits, chases a butterfly in a small circle) | 'sleep' (a day animal at night, the
 *             renderer floats Zzz) | 'celebrate' (hops) | 'run' (leading to a hint target) | 'call' (calling out)
 *   SA.friend.celebrate()     a rescue was just finished: it hops for ~2 s (SA.names.onRescued calls this in main.js)
 *   SA.friend.hint(target, player?) -> bool   { x, z } of the nearest mission animal: it runs HINT_RUN units toward it, then calls (species
 *       sound + '¡Por aquí!'), then comes back to you. False with no friend / no target / when it sleeps.
 *   SA.friend.onChange(fn) -> unsubscribe     SA.friend.create({ audio?, track?, now? })  a separate instance (tests)
 * Telemetry: friend.chosen { animalId }, friend.hint { animalId }.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  var NEED = 3, IDLE_AFTER = 2.2, SIT_FOR = 4, CHASE_FOR = 3.2, CELEBRATE_FOR = 2.2, HINT_RUN = 6, RUN_SPEED = 7, CALL_FOR = 1.6, CIRCLE = 0.9;
  var OFFER = { es: 'Uno de tus amigos quiere acompañarte.', key: 'phrase:amigoacompanar' };
  var CALL = { es: '¡Por aquí!', key: 'phrase:poraqui' };

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  function create(opts) {
    opts = opts || {};
    var listeners = [], f = null, fid = null, still = 0, idleT = 0, celebrate = 0, lead = null, last = null;

    function audio() { return opts.audio || SA.audio; }
    function track(type, fields) {
      try { if (opts.track) opts.track(type, fields); else if (root.SAT && root.SAT.track) root.SAT.track(type, fields); } catch (e) { /* telemetry never breaks play */ }
    }
    function emit() { listeners.slice().forEach(function (fn) { try { fn(current()); } catch (e) { /* a view never breaks the loop */ } }); }
    function animal(id) { return SA.data && SA.data.get('animals', id); }
    function wordOf(id) {
      var v = SA.vocab && SA.vocab.get('animal:' + id), a = animal(id);
      return (v && v.es) || (a && a.name && a.name.es) || id;
    }
    function saved() { var s = SA.save ? SA.save.get().friend : null; return s && typeof s === 'object' && typeof s.id === 'string' ? s : null; }

    function rescuedSpecies() {
      var out = [];
      function add(id) { if (typeof id === 'string' && animal(id) && out.indexOf(id) < 0) out.push(id); }
      try { (SA.rescueLog ? SA.rescueLog.list() : []).forEach(function (r) { add(r.animalId || r.animal); }); } catch (e) { /* none */ }
      try { (SA.names ? SA.names.friends() : []).forEach(function (n) { add(n.animalId); }); } catch (e) { /* none */ }
      return out;
    }
    function individualOf(animalId) {
      var named = SA.names ? SA.names.friends().filter(function (n) { return n.animalId === animalId; })[0] : null;
      return named ? named.id : animalId;
    }
    function card(id, animalId) {
      var a = animal(animalId), n = SA.names && SA.names.has(id) ? SA.names.get(id) : null;
      return { id: id, animalId: animalId, icon: (a && a.icon) || '🐾', es: wordOf(animalId), text: n ? n.text : '', named: !!n };
    }

    // Three rescues: the rescue log, or the animals you have named (naming happens right after a rescue photo, so it counts too).
    function unlocked() {
      var n = 0;
      try { n = SA.rescueLog.list().length; } catch (e) { n = 0; }
      try { n = Math.max(n, SA.names.friends().length); } catch (e) { /* none */ }
      return n >= NEED;
    }
    function candidates() { return unlocked() ? rescuedSpecies().map(function (s) { return card(individualOf(s), s); }) : []; }
    function current() {
      var s = saved();
      return s && animal(s.animalId || String(s.id).split('#')[0]) ? card(s.id, s.animalId || String(s.id).split('#')[0]) : null;
    }
    function pending() { return unlocked() && !current() && candidates().length > 0; }

    function choose(id) {
      var c = candidates().filter(function (x) { return x.id === id || x.animalId === id; })[0];
      if (!c || !SA.save) return false;
      SA.save.update({ friend: { id: c.id, animalId: c.animalId } });
      f = null; fid = null; lead = null; last = null;
      track('friend.chosen', { animalId: c.animalId });
      emit();
      return true;
    }
    function clear() {
      if (!SA.save) return;
      SA.save.update({ friend: { id: '', animalId: '' } });   // normalize drops an empty row
      f = null; fid = null; lead = null; last = null;
      emit();
    }

    function asleepNow(animalId) {
      try { return !!(SA.sleep && SA.sleep.isAsleep(animal(animalId))); } catch (e) { return false; }
    }

    function view(mode, extra) {
      var v = { id: fid, animalId: f.animalId, x: f.x, z: f.z, heading: f.heading, lift: f.lift || 0, moving: !!f.moving, mode: mode, pop: f.pop || null };
      if (extra) Object.keys(extra).forEach(function (k) { v[k] = extra[k]; });
      return (last = v);
    }

    function startFollower(player) {
      var h = num(player.heading, 0);
      f = SA.follow.create({ x: player.x - Math.sin(h) * 2.5, z: player.z - Math.cos(h) * 2.5, heading: h });
      f.animalId = current().animalId;
      fid = current().id;
      if (!SA.follow.free(f.x, f.z, [])) { f.x = player.x; f.z = player.z; }
      still = 0; idleT = 0;
    }

    function runStep(dt, solids) {                                // leading toward the hint target: straight line, stops at anything blocked
      var l = lead;
      if (l.phase === 'run') {
        var dx = l.tx - f.x, dz = l.tz - f.z, d = Math.hypot(dx, dz), len = Math.min(RUN_SPEED * dt, l.left, Math.max(0, d - 2));
        f.heading = Math.atan2(dx, dz);
        var nx = f.x + (d > 0 ? dx / d : 0) * len, nz = f.z + (d > 0 ? dz / d : 0) * len;
        if (len > 0.001 && SA.follow.free(nx, nz, solids)) { f.x = nx; f.z = nz; l.left -= len; f.moving = true; f.lift = Math.abs(Math.sin(l.t * 14)) * 0.12; }
        else { f.moving = false; f.lift = 0; l.left = 0; }
        l.t += dt;
        if (l.left <= 0.001) { l.phase = 'call'; l.t = 0; f.moving = false; f.lift = 0; callOut(); }
        return view('run');
      }
      l.t += dt;
      f.lift = Math.abs(Math.sin(l.t * 9)) * 0.25;
      if (l.t >= CALL_FOR) { lead = null; f.lift = 0; f.trail = []; still = 0; return null; }
      return view('call');
    }

    function callOut() {
      var a = animal(f.animalId), t = (a && a.traits) || {}, au = audio();
      try {
        if (au && au.sfx) au.sfx(t.movement === 'vuela' ? 'chirp' : t.size === 'pequeño' ? 'squeak' : 'whimper', 0.8, t.size === 'grande' ? 0.7 : t.size === 'pequeño' ? 1.2 : 1);
        if (au && au.say) (opts.later || function (fn, ms) { return root.setTimeout ? root.setTimeout(fn, ms) : fn(); })(function () { try { au.say(CALL.key); } catch (e) { /* silent */ } }, 600);
      } catch (e) { /* sound never breaks play */ }
    }

    function step(dt, player, solids) {
      if (!player || !current()) { f = null; last = null; return null; }
      dt = Math.min(0.1, Math.max(0, num(dt, 0)));
      solids = solids || [];
      var c = current();
      if (!f || fid !== c.id) startFollower(player);
      if (lead) { var r = runStep(dt, solids); if (r) return r; }
      var px = f.x, pz = f.z;
      SA.follow.step(f, player, solids, dt);
      var moved = Math.hypot(f.x - px, f.z - pz) > 0.001 || f.moving || f.pop || num(player.lift, 0) > 0.05;
      if (celebrate > 0) { celebrate = Math.max(0, celebrate - dt); f.lift = Math.abs(Math.sin(celebrate * 9)) * 0.5; return view('celebrate'); }
      if (moved) { still = 0; idleT = 0; return view('follow'); }
      still += dt;
      if (still < IDLE_AFTER) return view('follow');
      if (asleepNow(f.animalId)) return view('sleep');
      idleT += dt;
      var phase = idleT % (SIT_FOR + CHASE_FOR);
      if (phase < SIT_FOR) return view('sit');
      var a = (phase - SIT_FOR) / CHASE_FOR * Math.PI * 4, cx = f.x + Math.sin(a) * CIRCLE, cz = f.z + (1 - Math.cos(a)) * CIRCLE * 0.5;
      var ok = SA.follow.free(cx, cz, solids);
      return view('chase', ok ? { x: cx, z: cz, heading: a + Math.PI / 2, moving: true } : { moving: true });
    }

    function hint(target, player) {
      if (!f || !current() || !target || !isFinite(target.x) || !isFinite(target.z) || asleepNow(f.animalId)) return false;
      var d = Math.hypot(target.x - f.x, target.z - f.z);
      if (d < 3) return false;                                      // already right there: nothing to lead to
      lead = { phase: 'run', tx: target.x, tz: target.z, left: Math.min(HINT_RUN, d - 2), t: 0 };
      celebrate = 0;
      track('friend.hint', { animalId: f.animalId });
      return true;
    }

    return { unlocked: unlocked, candidates: candidates, pending: pending, offer: function () { return { es: OFFER.es, key: OFFER.key }; },
      current: current, choose: choose, clear: clear, step: step, hint: hint, view: function () { return last; }, leading: function () { return !!lead; },
      celebrate: function () { if (f) celebrate = CELEBRATE_FOR; },
      onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
      create: create, NEED: NEED, OFFER: OFFER, CALL: CALL, HINT_RUN: HINT_RUN };
  }

  SA.friend = create();
})(typeof window !== 'undefined' ? window : globalThis);
