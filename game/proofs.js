/* SA.proofs: proof photos "sent to the station" and the scientist's one cheer for each (AS-0206, slice 1 of AS-0143). Pure
 * (no THREE, no DOM; unit-tested in node:vm). Nothing here asks the kid to go back: the next mission starts right after the photo, and
 * the cheer simply happens the next time they walk near the scientist (game/ui/scientist-cheer.js asks for it).
 *
 *   SA.proofs.record({ kind: 'rescue' | 'mission', animalId?, missionId?, key? })
 *        -> { added, proof }   stores { id, kind, animalId?, missionId?, date, celebrated: false } in save.proofs (newest last, cap 100).
 *        A rescue proof is the final photo of a small rescue (SA.missionFlow); a mission proof is the photo step that finished a story
 *        mission (SA.missionRuntime). key (optional) makes it idempotent: a known id is ignored ({ added: false }).
 *   SA.proofs.list() / pending()   all proofs / the ones not cheered yet, oldest first
 *   SA.proofs.cheer()  -> null | { proof, es, en, key, icon, point }   takes the OLDEST uncelebrated proof, marks it celebrated in the
 *        save at once (so it is never cheered twice, even if the bubble never shows) and returns the cheer: the line '¡Gracias! Está
 *        bien.' with its vocab key. point is set only for a mission proof whose next mission is now open on the Misiones board:
 *        { id, n, icon, es, key } (the scientist points at it); otherwise null.
 *   SA.proofs.create({ save?, missions?, track?, now? })   a separate instance (tests).
 * Telemetry: station.proof_sent { kind, animalId?, missionId? }, station.proof_cheer { kind, animalId?, missionId?, point } (when cheered).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var WORD = /^[a-z][a-z0-9-]*$/;
  var CHEER = { es: '¡Gracias! Está bien.', key: 'phrase:graciasbien', icon: '🙌' };
  var NEW_MISSION = { es: '¡Nueva misión!', key: 'phrase:nuevamision', icon: '👉' };

  function create(opts) {
    opts = opts || {};
    function store() { return opts.save || SA.save; }
    function missions() { return opts.missions || SA.missions; }
    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }
    function today() { return (opts.now ? opts.now() : new Date()).toISOString().slice(0, 10); }
    function list() { var p = store().get().proofs; return Array.isArray(p) ? p.slice() : []; }
    function pending() { return list().filter(function (p) { return !p.celebrated; }); }
    function fieldsOf(p) {
      var f = { kind: p.kind };
      if (p.animalId) f.animalId = p.animalId;
      if (p.missionId) f.missionId = p.missionId;
      return f;
    }

    function record(e) {
      if (!e || (e.kind !== 'rescue' && e.kind !== 'mission')) return { added: false, proof: null };
      var animalId = typeof e.animalId === 'string' && WORD.test(e.animalId) ? e.animalId : '';
      var missionId = typeof e.missionId === 'string' && WORD.test(e.missionId) ? e.missionId : '';
      if (!animalId && !missionId) return { added: false, proof: null };
      var before = list(), ids = {};
      before.forEach(function (p) { ids[p.id] = true; });
      var id = typeof e.key === 'string' && /^[a-z0-9:_-]{1,60}$/.test(e.key) ? e.key : '';
      if (id && ids[id]) return { added: false, proof: null };
      if (!id) {
        var n = before.length + 1, base = e.kind + ':' + (missionId || animalId) + ':';
        while (ids[base + n]) n += 1;
        id = base + n;
      }
      var row = { id: id, kind: e.kind, celebrated: false, date: today() };
      if (animalId) row.animalId = animalId;
      if (missionId) row.missionId = missionId;
      store().update({ proofs: before.concat([row]).slice(-100) });     // arrays are replaced wholesale by update()
      track('station.proof_sent', fieldsOf(row));
      return { added: true, proof: row };
    }

    // The mission that opened on the board because this one was finished (null when none is open or it is a rescue proof).
    function unlockedAfter(missionId) {
      if (!missionId) return null;
      try {
        var all = missions().list(), at = -1, i;
        for (i = 0; i < all.length; i++) if (all[i].id === missionId) at = i;
        if (at < 0) return null;
        var nxt = all[at + 1];
        if (!nxt || nxt.status !== 'available') return null;
        return { id: nxt.id, n: nxt.n, icon: nxt.icon || '⭐', es: NEW_MISSION.es, key: NEW_MISSION.key };
      } catch (err) { return null; }
    }

    function cheer() {
      var p = pending()[0];
      if (!p) return null;
      var all = list();
      all.forEach(function (x) { if (x.id === p.id) x.celebrated = true; });
      store().update({ proofs: all });
      var point = p.kind === 'mission' ? unlockedAfter(p.missionId) : null;
      var f = fieldsOf(p);
      f.point = point ? point.id : '';
      track('station.proof_cheer', f);
      return { proof: p, es: CHEER.es, en: enOf(CHEER.key), key: CHEER.key, icon: CHEER.icon, point: point };
    }
    function enOf(key) { try { var v = SA.vocab && SA.vocab.get(key); return (v && v.en) || ''; } catch (err) { return ''; } }

    return { record: record, list: list, pending: pending, cheer: cheer };
  }

  var def = create();
  SA.proofs = { create: create, record: def.record, list: def.list, pending: def.pending, cheer: def.cheer, CHEER: CHEER, NEW_MISSION: NEW_MISSION };
})(typeof window !== 'undefined' ? window : globalThis);
