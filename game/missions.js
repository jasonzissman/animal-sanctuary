/* SA.missions: pure mission progress (no THREE, no DOM; unit-tested in node:vm). The ordered list lives in game/data/missions.js;
 * progress lives in the save as `missions: { done: [id], active: { id, step, seed, replay } | null }`.
 *
 *   SA.missions.list()        -> [{ ...row, status }]   in order; status: 'done' | 'active' | 'available' | 'locked'
 *   SA.missions.status(id)    -> status | null (unknown id)
 *       mission 1 is always available; mission n only when n-1 is done; a done mission stays 'done' (replayable);
 *       the running one is 'active' (a replay of a done mission is 'active' while it runs, 'done' again after).
 *   SA.missions.next()        -> the first available row (what the scientist offers), or null; comingSoon() = every built mission is done
 *   SA.missions.start(id)     -> { ok, reason?, mission?, replay?, seed? }
 *       Only the station's Misiones board calls this (never the world). reason: 'unknown' | 'locked' | 'night' (a `night: true` row by day,
 *       AS-0371; opts.isNight() overrides the shared SA.daynight clock) | 'busy' (one at a time,
 *       also when it is the same one) | 'not-at-station' (when opts.canStart says no). A replay gets a fresh seed so the step
 *       runner can pick other spots; the first play has replay:false.
 *   SA.missions.active()      -> { id, step, seed, replay, mission, stepData } | null   (restored from the save)
 *   SA.missions.advance()     -> { status: 'none' } | { status: 'step', step } | { status: 'complete', ...complete() }
 *   SA.missions.complete()    -> { status: 'none' } | { status: 'complete', id, firstTime, reward }
 *       marks it done and clears active. reward is the row's one-time reward on the first completion only; null on a replay
 *       (opts.grant(reward) is called in the same case, so a replay never re-grants).
 *   SA.missions.abandon()     -> { ok, id? }   drops the active one without marking it done: it returns to available (or done).
 *   SA.missions.create({ missions?, save?, rng?, track?, grant?, canStart? })   a separate instance (tests, or custom rows).
 *       SA.missions itself is the default instance reading SA.data 'missions' and SA.save.
 *       canStart() is the "are we at the station board?" gate the UI wires in (e.g. SA.station.isOpen); default: always.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  function create(opts) {
    opts = opts || {};
    var SESSION = opts.session || (Date.now().toString(36) + Math.random().toString(36).slice(2));   // one per page load (AS-0333)
    function rows() {
      var all = opts.missions || SA.data.all('missions');
      return all.slice().sort(function (a, b) { return a.n - b.n; });
    }
    function store() { return opts.save || SA.save; }
    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }
    function find(id) {
      var r = rows();
      for (var i = 0; i < r.length; i++) if (r[i].id === id) return { row: r[i], index: i, all: r };
      return null;
    }
    // Saved progress, with ids that are not in the list any more dropped.
    function progress() {
      var s = store().get().missions;
      s = isObj(s) ? s : {};
      var known = {};
      rows().forEach(function (r) { known[r.id] = true; });
      var done = (Array.isArray(s.done) ? s.done : []).filter(function (id) { return known[id]; });
      var a = isObj(s.active) && known[s.active.id] ? s.active : null;
      var w = isObj(s.waiting) && known[s.waiting.id] ? s.waiting : null;
      var n = typeof s.completions === 'number' && s.completions >= 0 ? Math.floor(s.completions) : 0;
      return { done: done, active: a, waiting: w, completions: n };
    }
    // `wait` ({ session, mark }, AS-0333) stamps a mission that reached a 'recover' step; `waiting` is such a mission parked while another runs.
    // null is written explicitly because the save deep-merges objects (an old stamp would otherwise stay).
    function act(id, step, seed, replay, wait) { return { id: id, step: step, seed: seed, replay: replay, wait: wait || null }; }
    function write(done, active, waiting, completions) {
      store().update({ missions: { done: done, active: active, waiting: waiting || null, completions: completions || 0 } });
    }
    // AS-0371: night rows (`night: true`) only start at night. opts.isNight() overrides; the default reads the shared day/night clock (true when there is none).
    function isNight() {
      if (typeof opts.isNight === 'function') return !!opts.isNight();
      try { return SA.daynight && SA.daynight.instance ? !!SA.daynight.instance().isNight() : true; } catch (e) { return true; }
    }
    function stepKind(row, i) { var s = row.steps[i]; return s ? s.kind : ''; }

    function statusOf(id, p) {
      var f = find(id);
      if (!f) return null;
      if (p.active && p.active.id === id) return 'active';
      if (p.done.indexOf(id) >= 0) return 'done';
      return f.index === 0 || p.done.indexOf(f.all[f.index - 1].id) >= 0 ? 'available' : 'locked';
    }

    function status(id) { return statusOf(id, progress()); }

    function list() {
      var p = progress();
      return rows().map(function (r) { return Object.assign({}, r, { status: statusOf(r.id, p) }); });
    }

    function next() {
      var p = progress();
      var r = rows().filter(function (m) { return statusOf(m.id, p) === 'available'; });
      return r.length ? r[0] : null;
    }

    function comingSoon() {
      var p = progress();
      return rows().every(function (m) { return p.done.indexOf(m.id) >= 0; });
    }

    function freshSeed() {
      var rng = opts.rng || Math.random;
      return Math.floor(rng() * 2147483647);
    }

    function start(id) {
      var f = find(id);
      if (!f) return { ok: false, reason: 'unknown' };
      if (typeof opts.canStart === 'function' && !opts.canStart()) return { ok: false, reason: 'not-at-station' };
      var p = progress();
      var parked = p.waiting;
      if (p.active) {
        // A mission waiting for tomorrow (on its 'recover' step) never blocks the board: it is parked until the next session or
        // the next finished mission (AS-0333).
        var cf = find(p.active.id);
        if (!(cf && cf.row.id !== id && !parked && stepKind(cf.row, Math.floor(Number(p.active.step) || 0)) === 'recover')) return { ok: false, reason: 'busy' };
        parked = Object.assign({}, p.active);
        p.active = null;
      }
      var st = statusOf(id, p);
      if (st === 'locked') return { ok: false, reason: 'locked' };
      if (f.row.night === true && !(parked && parked.id === id) && !isNight()) return { ok: false, reason: 'night' };   // AS-0371: a night mission only starts at night
      if (parked && parked.id === id) {                // the parked mission is picked up again where it waits
        write(p.done, act(id, parked.step, parked.seed, !!parked.replay, parked.wait), null, p.completions);
        track('mission.start', { id: id, replay: !!parked.replay });
        return { ok: true, mission: find(id).row, replay: !!parked.replay, seed: parked.seed };
      }
      var replay = st === 'done';
      var seed = freshSeed();
      write(p.done, act(id, 0, seed, replay), parked, p.completions);
      track('mission.start', { id: id, replay: replay });
      return { ok: true, mission: f.row, replay: replay, seed: seed };
    }

    function active() {
      var p = progress();
      if (!p.active) return null;
      var f = find(p.active.id);
      var step = Math.min(Math.max(0, Math.floor(Number(p.active.step) || 0)), f.row.steps.length - 1);
      return { id: f.row.id, step: step, seed: p.active.seed, replay: !!p.active.replay, mission: f.row, stepData: f.row.steps[step] };
    }

    function complete() {
      var p = progress();
      if (!p.active) return { status: 'none' };
      var f = find(p.active.id);
      var firstTime = p.done.indexOf(f.row.id) < 0;
      var done = firstTime ? p.done.concat([f.row.id]) : p.done;
      write(done, null, p.waiting, p.completions + 1);
      settle();                                        // a parked mission stops waiting once another one is finished (AS-0333)
      var reward = firstTime && f.row.reward ? Object.assign({}, f.row.reward) : null;
      if (reward && typeof opts.grant === 'function') opts.grant(reward);
      track('mission.complete', { id: f.row.id, replay: !firstTime });
      return { status: 'complete', id: f.row.id, firstTime: firstTime, reward: reward };
    }

    function advance() {
      var a = active();
      if (!a) return { status: 'none' };
      if (a.step + 1 >= a.mission.steps.length) return complete();
      var p = progress();
      var wait = stepKind(a.mission, a.step + 1) === 'recover' ? { session: SESSION, mark: p.completions } : null;
      write(p.done, act(a.id, a.step + 1, a.seed, a.replay, wait), p.waiting, p.completions);
      track('mission.step', { id: a.id, step: a.step + 1 });
      return { status: 'step', step: a.step + 1 };
    }

    // A waiting mission (AS-0333) recovers on the next session (a new page load) or once another mission was finished since. The active one on
    // its 'recover' step moves on; a parked one comes back as the active mission on the step after. -> { recovered: id } | null
    function due(w, p) { return !w || (w.session !== SESSION || p.completions > (typeof w.mark === 'number' ? w.mark : 0)); }
    function settle() {
      var p = progress(), a = p.active, f;
      if (a && (f = find(a.id)) && stepKind(f.row, Math.floor(Number(a.step) || 0)) === 'recover' && due(a.wait, p)) {
        advance();
        track('mission.recovered', { id: a.id });
        return { recovered: a.id };
      }
      var w = p.waiting;
      if (w && !a && (f = find(w.id)) && due(w.wait, p)) {
        write(p.done, act(w.id, Math.min(Math.floor(Number(w.step) || 0) + 1, f.row.steps.length - 1), w.seed, !!w.replay, null), null, p.completions);
        track('mission.recovered', { id: w.id });
        return { recovered: w.id };
      }
      return null;
    }

    function abandon() {
      var p = progress();
      if (!p.active) return { ok: false };
      write(p.done, null, p.waiting, p.completions);
      track('mission.abandon', { id: p.active.id, step: p.active.step });
      return { ok: true, id: p.active.id };
    }

    return { list: list, status: status, next: next, comingSoon: comingSoon, start: start, active: active,
      advance: advance, complete: complete, abandon: abandon, settle: settle, create: create };
  }

  SA.missions = create();
})(typeof window !== 'undefined' ? window : globalThis);
