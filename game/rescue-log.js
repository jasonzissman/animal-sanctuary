/* SA.rescueLog: the rescue log in the save (`rescues`) and the badges it earns (AS-0235, AS-0167). Pure (no THREE, no DOM; node:vm tested).
 * Badge rules live in SA.badges (game/badges.js, rows in game/data/badges.js); this module only writes log entries.
 *
 *   SA.rescueLog.record({ animalId?, need?, biome?, night?, kind?, mission?, animal?, key? })
 *                              -> { added, earned: [badge rows newly earned by this entry] }
 *       One row per finished rescue. animalId/need/biome/night/date feed the badges ('tortuga', 'thorn', 'desierto', true);
 *       kind/mission/animal are the story rescues ('reunion', 'mama', 'cerdito'). An entry needs a kind or an animalId.
 *       date defaults to today (YYYY-MM-DD). key (optional) makes the entry idempotent: a repeated key is ignored ({ added: false }).
 *   SA.rescueLog.count(kind)   how many entries of that story kind
 *   SA.rescueLog.list()        the entries, oldest first
 *   SA.rescueLog.earned()      -> badge rows whose rule is met now
 *   SA.rescueLog.create({ save?, badges?, track?, album?, now? })   a separate instance (tests); the default one is SA.rescueLog.*
 * Telemetry: rescue.logged { kind|animalId, need, mission }, rescue.badge { id } (from SA.badges.check).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var WORD = /^[a-z][a-z0-9-]*$/;

  function create(opts) {
    opts = opts || {};
    function store() { return opts.save || SA.save; }
    function rows() { return opts.badges || (SA.data ? SA.data.all('badges') : []); }
    function badges() { return SA.badges.create({ save: opts.save, badges: opts.badges, track: opts.track, album: opts.album }); }
    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }
    function list() { var r = store().get().rescues; return Array.isArray(r) ? r.slice() : []; }
    function count(kind) { return list().filter(function (e) { return e.kind === kind; }).length; }
    function earned() {
      var b = badges(), list = rows();
      return b.progress().filter(function (p) { return p.earned; }).map(function (p) {
        return list.filter(function (r) { return r.id === p.id; })[0];
      });
    }
    function today() { return (opts.now ? opts.now() : new Date()).toISOString().slice(0, 10); }

    function record(entry) {
      if (!entry || typeof entry !== 'object') return { added: false, earned: [] };
      var kind = typeof entry.kind === 'string' && WORD.test(entry.kind) ? entry.kind : '';
      var animalId = typeof entry.animalId === 'string' && WORD.test(entry.animalId) ? entry.animalId : '';
      if (!kind && !animalId) return { added: false, earned: [] };
      var before = list();
      if (entry.key && before.some(function (e) { return e.key === entry.key; })) return { added: false, earned: [] };
      var row = { kind: kind, mission: entry.mission || '' };
      if (animalId) row.animalId = animalId;
      if (typeof entry.need === 'string' && WORD.test(entry.need)) row.need = entry.need;
      if (typeof entry.biome === 'string' && WORD.test(entry.biome)) row.biome = entry.biome;
      if (animalId || entry.night !== undefined) row.night = entry.night === true;
      if (animalId) row.date = typeof entry.date === 'string' ? entry.date : today();
      if (entry.animal) row.animal = entry.animal;
      if (entry.key) row.key = String(entry.key).slice(0, 40);
      var after = before.concat([row]);
      store().update({ rescues: after });       // the save replaces arrays wholesale (like inventory), so this persists as is
      track('rescue.logged', { kind: row.kind, mission: row.mission, animalId: row.animalId || '', need: row.need || '' });
      var ids = badges().check(after), list2 = rows();
      return { added: true, earned: ids.map(function (id) { return list2.filter(function (b) { return b.id === id; })[0]; }) };
    }

    return { record: record, count: count, list: list, earned: earned, create: create };
  }

  SA.rescueLog = create();
})(typeof window !== 'undefined' ? window : globalThis);
