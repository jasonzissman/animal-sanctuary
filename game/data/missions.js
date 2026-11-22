/* Missions data: registers kind "missions" (SA.data). Pure data; no THREE, no DOM. Logic is game/missions.js.
 *
 * Mission row (JSON-serialisable):
 *   id      unique lowercase key ('mama')
 *   n       1-based position in the ordered list; rows are contiguous (1, 2, 3...). Mission n unlocks when n-1 is done.
 *   es, en  short title ('¿Dónde está mamá?'); en is scaffolding only
 *   icon    short emoji
 *   intro   ONE line on the start card (AS-0220): { es, icon, en? }; es <= 4 words with correct gender/number, icon is the
 *           picture shown with it, en is the optional English toggle text. One press of "¡Vamos!" starts the mission.
 *   steps   ordered step objects { kind: 'find'|'help'|'follow'|..., ... }; the runner (AS-0178) owns the kinds' fields
 *   reward  one-time reward { stars: whole number >= 0 }; never granted again on a replay
 * Missions not built yet are simply absent: the list ends and the board shows "Próximamente".
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;
  var MAX_WORDS = 4;

  function validateMission(m) {
    if (!/^[a-z][a-z0-9-]*$/.test(m.id)) fail('id', 'must be lowercase ASCII letters, digits or "-"');
    if (typeof m.n !== 'number' || m.n < 1 || m.n !== Math.floor(m.n)) fail('n', 'must be a whole number >= 1');
    if (typeof m.es !== 'string' || !m.es.trim()) fail('es', 'must be a non-empty string');
    if (typeof m.en !== 'string' || !m.en.trim()) fail('en', 'must be a non-empty string');
    if (typeof m.icon !== 'string' || !m.icon.trim() || m.icon.length > 8) fail('icon', 'must be a short non-empty emoji string');
    var l = m.intro;
    if (!l || typeof l !== 'object' || Array.isArray(l)) fail('intro', 'must be ONE spoken line { es, icon }, not a list');
    if (typeof l.es !== 'string' || !l.es.trim()) fail('intro.es', 'must be a non-empty Spanish phrase');
    if (l.es.trim().split(/\s+/).length > MAX_WORDS) fail('intro.es', 'must be at most ' + MAX_WORDS + ' words (kids do not read walls of text)');
    if (typeof l.icon !== 'string' || !l.icon.trim() || l.icon.length > 8) fail('intro.icon', 'must be a short emoji for the picture card');
    if (l.en !== undefined && (typeof l.en !== 'string' || !l.en.trim())) fail('intro.en', 'must be a non-empty string when present');
    if (!Array.isArray(m.steps) || !m.steps.length) fail('steps', 'must be a non-empty array');
    m.steps.forEach(function (s, i) {
      if (!s || typeof s !== 'object' || Array.isArray(s) || typeof s.kind !== 'string' || !s.kind) fail('steps[' + i + ']', 'must be an object with a "kind" string');
    });
    var r = m.reward;
    if (!r || typeof r !== 'object' || typeof r.stars !== 'number' || r.stars < 0 || r.stars !== Math.floor(r.stars)) fail('reward', 'must be { stars: whole number >= 0 }');
  }

  SA.data.defineKind('missions', validateMission);
  SA.data.register('missions', [
    // Mission 1 (AS-0173 builds it): a lost piglet follows you to mamá cerda. Later rows are added by their own tickets.
    { id: 'mama', n: 1, es: '¿Dónde está mamá?', en: 'Where is mama?', icon: '🐷',
      intro: { es: '¡Ayuda al cerdito!', en: 'Help the piglet!', icon: '🐷' },
      steps: [{ kind: 'find' }, { kind: 'follow' }, { kind: 'photo' }],
      reward: { stars: 2 } }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
