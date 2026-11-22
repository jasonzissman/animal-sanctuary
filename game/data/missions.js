/* Missions data: registers kind "missions" (SA.data). Pure data; no THREE, no DOM. Logic is game/missions.js.
 *
 * Mission row (JSON-serialisable):
 *   id      unique lowercase key ('mama')
 *   n       1-based position in the ordered list; rows are contiguous (1, 2, 3...). Mission n unlocks when n-1 is done.
 *   es, en  short title ('¿Dónde está mamá?'); en is scaffolding only
 *   icon    short emoji
 *   intro   ONE line on the start card (AS-0220): { es, icon, en? }; es <= 4 words with correct gender/number, icon is the
 *           picture shown with it, en is the optional English toggle text. One press of "¡Vamos!" starts the mission.
 *   steps   ordered step objects { kind: 'find'|'help'|'follow'|..., line, ... }; the runner (AS-0178) owns the kinds' fields.
 *           line (required, AS-0223): { es, icon, en? } the ONE short line the prompt pill shows and speaks on that step;
 *           es <= 4 words with correct gender/number ('Llévalo con mamá'), icon is the picture beside it.
 *           at (optional, AS-0233): 'baby' | 'mama', which spawned animal is this step's world target (game/mission-spawn.js).
 *   spawn   optional { baby, mama, minApart? }: animal ids (game/data/animals.js) the mission places in the mamá's biome when it
 *           starts, at least minApart (default 14) apart. A replay can name another species' baby.
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
      var f = 'steps[' + i + ']';
      if (!s || typeof s !== 'object' || Array.isArray(s) || typeof s.kind !== 'string' || !s.kind) fail(f, 'must be an object with a "kind" string');
      var t = s.line;      // the one short line the prompt pill shows (and speaks) while this step is current (AS-0223)
      if (!t || typeof t !== 'object' || Array.isArray(t)) fail(f + '.line', 'is required: ONE short line { es, icon } for the prompt pill');
      if (typeof t.es !== 'string' || !t.es.trim()) fail(f + '.line.es', 'must be a non-empty Spanish phrase');
      if (t.es.trim().split(/\s+/).length > MAX_WORDS) fail(f + '.line.es', 'must be at most ' + MAX_WORDS + ' words (kids do not read walls of text)');
      if (typeof t.icon !== 'string' || !t.icon.trim() || t.icon.length > 8) fail(f + '.line.icon', 'must be a short emoji for the pill');
      if (t.en !== undefined && (typeof t.en !== 'string' || !t.en.trim())) fail(f + '.line.en', 'must be a non-empty string when present');
      if (s.at !== undefined && s.at !== 'baby' && s.at !== 'mama') fail(f + '.at', 'must be "baby" or "mama" when present');
      if (s.at !== undefined && !m.spawn) fail(f + '.at', 'needs the mission to declare a spawn');
    });
    if (m.spawn !== undefined) {
      var sp = m.spawn;
      if (!sp || typeof sp !== 'object' || Array.isArray(sp)) fail('spawn', 'must be { baby, mama, minApart? }');
      ['baby', 'mama'].forEach(function (k) { if (typeof sp[k] !== 'string' || !sp[k]) fail('spawn.' + k, 'must be an animal id string'); });
      if (sp.minApart !== undefined && (typeof sp.minApart !== 'number' || !(sp.minApart > 0))) fail('spawn.minApart', 'must be a number > 0');
    }
    var r = m.reward;
    if (!r || typeof r !== 'object' || typeof r.stars !== 'number' || r.stars < 0 || r.stars !== Math.floor(r.stars)) fail('reward', 'must be { stars: whole number >= 0 }');
  }

  SA.data.defineKind('missions', validateMission);
  SA.data.register('missions', [
    // Mission 1 (AS-0173 builds it): a lost piglet follows you to mamá cerda. Later rows are added by their own tickets.
    { id: 'mama', n: 1, es: '¿Dónde está mamá?', en: 'Where is mama?', icon: '🐷',
      intro: { es: '¡Ayuda al cerdito!', en: 'Help the piglet!', icon: '🐷' },
      spawn: { baby: 'cerdito', mama: 'cerda', minApart: 14 },
      steps: [{ kind: 'find', target: 'cerdito', at: 'baby', line: { es: 'Busca al cerdito', icon: '🐷', en: 'Find the piglet' } },
        { kind: 'follow', animal: 'cerdito', at: 'mama', line: { es: 'Llévalo con mamá', icon: '🐖', en: 'Take him to mama' } },
        { kind: 'photo', at: 'mama', line: { es: 'Toma una foto', icon: '📷', en: 'Take a photo' } }],
      reward: { stars: 2 } }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
