/* SA.missions: pure mission progress (no THREE, no DOM; unit-tested in node:vm). The ordered list lives in game/data/missions.js;
 * progress lives in the save as `missions: { done: [id], active: { id, step, seed, replay } | null }`.
 *
 *   SA.missions.list()        -> [{ ...row, status }]   in order; status: 'done' | 'active' | 'available' | 'locked'
 *   SA.missions.status(id)    -> status | null (unknown id)
 *       mission 1 is always available; mission n only when n-1 is done; a done mission stays 'done' (replayable);
 *       the running one is 'active' (a replay of a done mission is 'active' while it runs, 'done' again after).
 *   SA.missions.next()        -> the first available row (what the scientist offers), or null; comingSoon() = every built mission is done
 *   SA.missions.start(id)     -> { ok, reason?, mission?, replay?, seed? }
 *       Only the station's Misiones board calls this (never the world). reason: 'unknown' | 'locked' | 'busy' (one at a time,
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
      return { done: done, active: a };
    }
    function write(done, active) { store().update({ missions: { done: done, active: active } }); }

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
      if (p.active) return { ok: false, reason: 'busy' };
      var st = statusOf(id, p);
      if (st === 'locked') return { ok: false, reason: 'locked' };
      var replay = st === 'done';
      var seed = freshSeed();
      write(p.done, { id: id, step: 0, seed: seed, replay: replay });
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
      write(done, null);
      var reward = firstTime && f.row.reward ? Object.assign({}, f.row.reward) : null;
      if (reward && typeof opts.grant === 'function') opts.grant(reward);
      track('mission.complete', { id: f.row.id, replay: !firstTime });
      return { status: 'complete', id: f.row.id, firstTime: firstTime, reward: reward };
    }

    function advance() {
      var a = active();
      if (!a) return { status: 'none' };
      if (a.step + 1 >= a.mission.steps.length) return complete();
      write(progress().done, { id: a.id, step: a.step + 1, seed: a.seed, replay: a.replay });
      track('mission.step', { id: a.id, step: a.step + 1 });
      return { status: 'step', step: a.step + 1 };
    }

    function abandon() {
      var p = progress();
      if (!p.active) return { ok: false };
      write(p.done, null);
      track('mission.abandon', { id: p.active.id, step: p.active.step });
      return { ok: true, id: p.active.id };
    }

    return { list: list, status: status, next: next, comingSoon: comingSoon, start: start, active: active,
      advance: advance, complete: complete, abandon: abandon, create: create };
  }

  SA.missions = create();
})(typeof window !== 'undefined' ? window : globalThis);
