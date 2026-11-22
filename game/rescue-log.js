/* SA.rescueLog: the rescue log in the save (`rescues`) and the badges it earns (AS-0235). Pure (no THREE, no DOM; node:vm tested).
 * Badge rows are data (game/data/badges.js); this module only counts log entries per rescue kind.
 *
 *   SA.rescueLog.record({ kind, mission, animal?, key? })  -> { added, earned: [badge rows newly earned by this entry] }
 *       key (optional) makes the entry idempotent: a second record with the same key is ignored ({ added: false, earned: [] }).
 *   SA.rescueLog.count(kind)   how many entries of that kind
 *   SA.rescueLog.list()        the entries, oldest first
 *   SA.rescueLog.earned()      -> badge rows whose rule is met now
 *   SA.rescueLog.create({ save?, badges?, track? })   a separate instance (tests); the default one is SA.rescueLog.*
 * Telemetry: rescue.logged { kind, mission }, rescue.badge { id }.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function create(opts) {
    opts = opts || {};
    function store() { return opts.save || SA.save; }
    function rows() { return opts.badges || (SA.data ? SA.data.all('badges') : []); }
    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }
    function list() { var r = store().get().rescues; return Array.isArray(r) ? r.slice() : []; }
    function count(kind) { return list().filter(function (e) { return e.kind === kind; }).length; }
    function earnedIn(log) {
      return rows().filter(function (b) { return log.filter(function (e) { return e.kind === b.rule.kind; }).length >= b.rule.count; });
    }
    function earned() { return earnedIn(list()); }

    function record(entry) {
      if (!entry || typeof entry.kind !== 'string' || !entry.kind) return { added: false, earned: [] };
      var before = list();
      if (entry.key && before.some(function (e) { return e.key === entry.key; })) return { added: false, earned: [] };
      var row = { kind: entry.kind, mission: entry.mission || '' };
      if (entry.animal) row.animal = entry.animal;
      if (entry.key) row.key = String(entry.key).slice(0, 40);
      var after = before.concat([row]);
      store().update({ rescues: after });       // the save replaces arrays wholesale (like inventory), so this persists as is
      track('rescue.logged', { kind: row.kind, mission: row.mission });
      var had = {};
      earnedIn(before).forEach(function (b) { had[b.id] = true; });
      var fresh = earnedIn(after).filter(function (b) { return !had[b.id]; });
      fresh.forEach(function (b) { track('rescue.badge', { id: b.id }); });
      return { added: true, earned: fresh };
    }

    return { record: record, count: count, list: list, earned: earned, create: create };
  }

  SA.rescueLog = create();
})(typeof window !== 'undefined' ? window : globalThis);
