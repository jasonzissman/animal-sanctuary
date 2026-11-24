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
 *   carry   optional { item, to, near? } (AS-0313): the thing a 'carry' / 'deliver' step moves and its drop-off ids; game/mission-carry.js
 *           places both on dry ground near `near` ('pond', the default) when the mission starts. `hatch: { baby, mama, seconds? }`
 *           (AS-0315, optional): the egg placed in the nest hatches `baby` next to `mama` after `seconds` (default 5, 1..30)
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
    if (m.carry !== undefined) {
      var c = m.carry;
      if (!c || typeof c !== 'object' || Array.isArray(c)) fail('carry', 'must be { item, to, near? }');
      ['item', 'to'].forEach(function (k) { if (typeof c[k] !== 'string' || !/^[a-z][a-z0-9-]*$/.test(c[k])) fail('carry.' + k, 'must be a lowercase id string'); });
      if (c.near !== undefined && c.near !== 'pond') fail('carry.near', 'must be a known anchor ("pond")');
      if (c.hatch !== undefined) {
        var h = c.hatch;
        if (!h || typeof h !== 'object' || Array.isArray(h)) fail('carry.hatch', 'must be { baby, mama, seconds? }');
        ['baby', 'mama'].forEach(function (k) { if (typeof h[k] !== 'string' || !h[k]) fail('carry.hatch.' + k, 'must be an animal id string'); });
        if (h.seconds !== undefined && (typeof h.seconds !== 'number' || !(h.seconds >= 1 && h.seconds <= 30))) fail('carry.hatch.seconds', 'must be a number from 1 to 30');
      }
    }
    var r = m.reward;
    if (!r || typeof r !== 'object' || typeof r.stars !== 'number' || r.stars < 0 || r.stars !== Math.floor(r.stars)) fail('reward', 'must be { stars: whole number >= 0 }');
  }

  SA.data.defineKind('missions', validateMission);
  SA.data.register('missions', [
    // Mission 1 (AS-0173 builds it): a lost piglet follows you to mamá cerda. Later rows are added by their own tickets.
    { id: 'mama', n: 1, es: '¿Dónde está mamá?', en: 'Where is mama?', icon: '🐷',
      intro: { es: '¡Ayuda al cerdito!', en: 'Help the piglet!', icon: '🐷' },
      spawn: { baby: 'cerdito', mama: 'cerda', minApart: 24 },   // the map is 2x (AS-0249): finding mamá takes a longer walk
      steps: [{ kind: 'find', target: 'cerdito', at: 'baby', line: { es: 'Busca al cerdito', icon: '🐷', en: 'Find the piglet' } },
        { kind: 'follow', animal: 'cerdito', at: 'mama', line: { es: 'Llévalo con mamá', icon: '🐖', en: 'Take him to mama' } },
        { kind: 'photo', at: 'mama', line: { es: 'Toma una foto', icon: '📷', en: 'Take a photo' } }],
      reward: { stars: 2 } },
    // Mission 2 (AS-0313, slice 1 of AS-0181): a lost egg lies near a duck's nest by the pond; pick it up and set it in the nest.
    // The egg and nest are placed by game/mission-carry.js from `carry`; the steps are the generic carry / deliver kinds.
    { id: 'huevo', n: 2, es: 'El huevo perdido', en: 'The lost egg', icon: '🥚',
      intro: { es: '¡Salva el huevo!', en: 'Save the egg!', icon: '🥚' },
      // AS-0315: `hatch` = the placed egg cracks after `seconds` and `baby` appears next to `mama` (game/mission-hatch.js).
      carry: { item: 'huevo', to: 'nido', near: 'pond', hatch: { baby: 'patito', mama: 'pato', seconds: 5 } },
      steps: [{ kind: 'carry', item: 'huevo', fragile: true, line: { es: 'Recoge el huevo', icon: '🥚', en: 'Pick up the egg' } },
        { kind: 'deliver', item: 'huevo', to: 'nido', line: { es: 'Llévalo al nido', icon: '🪺', en: 'Take it to the nest' } },
        { kind: 'hatch', item: 'huevo', line: { es: 'Espera un poquito', icon: '⏳', en: 'Wait a little' } },
        { kind: 'photo', target: 'patito', line: { es: 'Foto de la familia', icon: '📷', en: 'Family photo' } }],
      reward: { stars: 2 } }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
