/* SA.missionsDialogue: the scientist's talk on the Misiones board (pure; no THREE, no DOM; unit-tested in node:vm).
 * The intro is ONE line on each mission row (game/data/missions.js: intro = { es, icon, en? }, es <= 4 words). Every prompt needs at
 * most one press (AS-0220).
 *
 *   SA.missionsDialogue.begin(row)   -> state | null     row = a mission row (null when it has no line)
 *   SA.missionsDialogue.view(state)  -> { id, title, icon, line: { es, icon, en? }, button: 'start', label: '¡Vamos!' }
 *       ONE picture card (mission icon + title + the short line) with a Replay button (the view calls SA.audio.say(line.es)).
 *       The only button is 'start': pressing it (tap, Enter or E) calls SA.missions.start at once.
 *   SA.missionsDialogue.create({ save?, missions? }) -> { celebration(), markSeen() }  (SA.missionsDialogue has a default instance)
 *       celebration() -> { id, unlockedId | null, icon, lines: [es, ...], sfx } | null: the highest mission finished
 *       that the scientist has not celebrated yet (so a replay never celebrates again), with the card it unlocked.
 *       It shows on one strip with no button (it needs no press at all).
 *       markSeen() records every finished mission as celebrated in the save (missions.celebrated), so it plays once.
 *   SA.missionsDialogue.VAMOS / BRAVO / NUEVA   the short Spanish phrases.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var VAMOS = '¡Vamos!', BRAVO = '¡Lo lograste!', NUEVA = '¡Nueva misión!';

  function begin(row) {
    var l = row && row.intro;
    if (!l || typeof l !== 'object' || Array.isArray(l) || typeof l.es !== 'string' || !l.es) return null;
    return { id: row.id, title: row.es || '', icon: row.icon || l.icon, line: l };
  }

  function view(state) {
    if (!state) return null;
    return { id: state.id, title: state.title, icon: state.icon, line: state.line, button: 'start', label: VAMOS };
  }

  function create(opts) {
    opts = opts || {};
    function store() { return opts.save || SA.save; }
    function rows() {
      return (opts.missions || SA.data.all('missions')).slice().sort(function (a, b) { return a.n - b.n; });
    }
    function mine() {
      var m = store().get().missions;
      var ok = !!m && typeof m === 'object' && !Array.isArray(m);
      return { done: ok && Array.isArray(m.done) ? m.done : [], celebrated: ok && Array.isArray(m.celebrated) ? m.celebrated : [] };
    }

    function celebration() {
      var p = mine(), all = rows(), found = null, idx = -1;
      for (var i = 0; i < all.length; i++) {
        if (p.done.indexOf(all[i].id) >= 0 && p.celebrated.indexOf(all[i].id) < 0) { found = all[i]; idx = i; }
      }
      if (!found) return null;
      var after = all[idx + 1];
      var unlocked = after && p.done.indexOf(after.id) < 0 ? after.id : null;
      return { id: found.id, unlockedId: unlocked, icon: found.icon, lines: unlocked ? [BRAVO, NUEVA] : [BRAVO], sfx: 'fanfare' };
    }

    function markSeen() {
      var p = mine();
      store().update({ missions: { celebrated: p.done.slice() } });
    }

    return { celebration: celebration, markSeen: markSeen };
  }

  var def = create();
  SA.missionsDialogue = { begin: begin, view: view, create: create, celebration: def.celebration, markSeen: def.markSeen,
    VAMOS: VAMOS, BRAVO: BRAVO, NUEVA: NUEVA };
})(typeof window !== 'undefined' ? window : globalThis);
