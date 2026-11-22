/* SA.missionsDialogue: the scientist's talk on the Misiones board (pure; no THREE, no DOM; unit-tested in node:vm).
 * Intro lines are data on each mission row (game/data/missions.js: intro = [{ es, icon }, ...], 2-3 short lines).
 *
 *   SA.missionsDialogue.begin(row)   -> state | null     row = a mission row (null when it has no lines)
 *   SA.missionsDialogue.view(state)  -> { id, index, total, line: { es, icon }, last, button: 'next' | 'start', label }
 *       One picture card per line (icon + short phrase) with a Replay button (the view calls SA.audio.say(line.es)).
 *       The last line's button is 'start' (label 'Empezar'); every earlier one is 'next' (label 'Siguiente').
 *   SA.missionsDialogue.advance(state) -> state          the next line (stays on the last one; then the view calls missions.start)
 *   SA.missionsDialogue.create({ save?, missions? }) -> { celebration(), markSeen() }  (SA.missionsDialogue has a default instance)
 *       celebration() -> { id, unlockedId | null, icon, lines: [es, ...], sfx } | null: the highest mission finished
 *       that the scientist has not celebrated yet (so a replay never celebrates again), with the card it unlocked.
 *       markSeen() records every finished mission as celebrated in the save (missions.celebrated), so it plays once.
 *   SA.missionsDialogue.EMPEZAR / SIGUIENTE / BRAVO / NUEVA   the short Spanish phrases.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var EMPEZAR = 'Empezar', SIGUIENTE = 'Siguiente', BRAVO = '¡Lo lograste!', NUEVA = '¡Nueva misión!';

  function begin(row) {
    var lines = row && Array.isArray(row.intro) ? row.intro : [];
    return lines.length ? { id: row.id, lines: lines.slice(), index: 0 } : null;
  }

  function view(state) {
    if (!state) return null;
    var last = state.index >= state.lines.length - 1;
    return { id: state.id, index: state.index, total: state.lines.length, line: state.lines[state.index], last: last,
      button: last ? 'start' : 'next', label: last ? EMPEZAR : SIGUIENTE };
  }

  function advance(state) {
    if (!state) return state;
    return { id: state.id, lines: state.lines, index: Math.min(state.index + 1, state.lines.length - 1) };
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
  SA.missionsDialogue = { begin: begin, view: view, advance: advance, create: create, celebration: def.celebration, markSeen: def.markSeen,
    EMPEZAR: EMPEZAR, SIGUIENTE: SIGUIENTE, BRAVO: BRAVO, NUEVA: NUEVA };
})(typeof window !== 'undefined' ? window : globalThis);
