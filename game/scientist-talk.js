/* SA.scientistTalk: what the scientist says when the kid uses her (AS-0204; pure, no THREE, no DOM; unit-tested in node:vm).
 * Text generation only: the overlay is game/ui/scientist-view.js, the "use" hook is SA.npc.talk (game/npc.js).
 *
 *   SA.scientistTalk.reminder({ missions? }) -> {
 *       state: 'active' | 'choose' | 'done',   an active mission / pick one at the board / every built mission finished
 *       lines: [{ role: 'general'|'mission'|'step'|'board', es, icon, key }]   in the order they are spoken; key is a vocab key
 *              (or the Spanish text itself for a mission title) that SA.audio.say plays
 *       missionId: id | null,
 *       replay: { icon, es }   the button that plays the whole intro conversation again }
 *   Line 1 is always the one-line general mission ("Ayuda a los animales: busca, ayuda, foto"). Then the current mission's title
 *   card (its icon) plus the step it is on (find / help / follow / photo ...), or "choose a mission at the board" when none runs.
 *   It only reads SA.missions (active / next); it never starts, advances or abandons anything: missions start only at the
 *   Misiones board.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var GENERAL = { role: 'general', es: 'Ayuda a los animales: busca, ayuda, foto', icon: '🔍🩹📷', key: 'phrase:recuerdo' };
  var BOARD = { role: 'board', es: 'Elige una misión en la estación', icon: '📋', key: 'phrase:eligemision' };
  var ALL_DONE = { role: 'board', es: '¡Muy bien! Pronto, más misiones.', icon: '🌟', key: 'phrase:masmisiones' };
  var REPLAY = { icon: '💬', es: 'La charla' };
  // One short spoken card per mission step kind (the runner's kinds, AS-0178). Unknown kinds just have no step line.
  var STEPS = {
    find: { es: '¡Busca!', icon: '🔍', key: 'phrase:busca' },
    help: { es: '¡Ayuda!', icon: '🩹', key: 'phrase:pasoayuda' },
    follow: { es: '¡Sigue!', icon: '👣', key: 'phrase:pasosigue' },
    carry: { es: '¡Lleva!', icon: '🎒', key: 'phrase:pasolleva' },
    deliver: { es: '¡Entrega!', icon: '📬', key: 'phrase:pasoentrega' },
    collect: { es: '¡Recoge!', icon: '🧺', key: 'phrase:pasorecoge' },
    'go-to': { es: '¡Ve allí!', icon: '📍', key: 'phrase:pasove' },
    photo: { es: 'Tómale una foto', icon: '📷', key: 'phrase:tomalefoto' }
  };

  function copy(o) { return { role: o.role, es: o.es, icon: o.icon, key: o.key }; }

  function reminder(opts) {
    var m = (opts && opts.missions) || SA.missions, lines = [copy(GENERAL)], state = 'done', id = null, act = null, nxt = null;
    try { act = m && m.active ? m.active() : null; } catch (e) { act = null; }
    if (act && act.mission) {
      state = 'active'; id = act.id;
      lines.push({ role: 'mission', es: act.mission.es, icon: act.mission.icon, key: act.mission.es });
      var st = act.stepData && STEPS[act.stepData.kind];
      if (st) lines.push({ role: 'step', es: st.es, icon: st.icon, key: st.key });
    } else {
      try { nxt = m && m.next ? m.next() : null; } catch (e) { nxt = null; }
      if (nxt) { state = 'choose'; lines.push(copy(BOARD)); } else lines.push(copy(ALL_DONE));
    }
    return { state: state, lines: lines, missionId: id, replay: { icon: REPLAY.icon, es: REPLAY.es } };
  }

  SA.scientistTalk = { reminder: reminder, GENERAL: GENERAL, STEPS: STEPS };
})(typeof window !== 'undefined' ? window : globalThis);
