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
 *   river   optional { animal, rock, log } (AS-0319): the stranded animal's id and the ids of the river rock and the fallen log; game/mission-log.js
 *           places them in the river and slides the log across ('push' step: item = the log id; 'goTo' step: place = the rock id)
 *   bananas optional { item, n, biome? } (AS-0326): the `n` pickups of `item` that game/mission-bananas.js scatters in `biome` (default 'selva')
 *           while this mission runs; a 'collect' step { item, n } counts them. A step may carry `gives` (a vocab 'thing' id, e.g. 'corona'):
 *           what the scientist hands over on a 'talk' step; it is spoken and cheered when that step is met.
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
    if (m.river !== undefined) {
      var rv = m.river;
      if (!rv || typeof rv !== 'object' || Array.isArray(rv)) fail('river', 'must be { animal, rock, log }');
      ['animal', 'rock', 'log'].forEach(function (k) { if (typeof rv[k] !== 'string' || !/^[a-z][a-z0-9-]*$/.test(rv[k])) fail('river.' + k, 'must be a lowercase id string'); });
      ['bank', 'action'].forEach(function (k) { if (rv[k] !== undefined && (typeof rv[k] !== 'string' || !/^[a-z][a-z0-9-]*$/.test(rv[k]))) fail('river.' + k, 'must be a lowercase id string'); });
      if (rv.rubs !== undefined && (!Number.isInteger(rv.rubs) || rv.rubs < 1 || rv.rubs > 8)) fail('river.rubs', 'must be a whole number from 1 to 8');
    }
    if (m.bananas !== undefined) {
      var b = m.bananas;
      if (!b || typeof b !== 'object' || Array.isArray(b)) fail('bananas', 'must be { item, n, biome? }');
      if (typeof b.item !== 'string' || !/^[a-z][a-z0-9-]*$/.test(b.item)) fail('bananas.item', 'must be a lowercase id string');
      if (!Number.isInteger(b.n) || b.n < 1 || b.n > 6) fail('bananas.n', 'must be a whole number from 1 to 6');
      if (b.biome !== undefined && (typeof b.biome !== 'string' || !b.biome)) fail('bananas.biome', 'must be a biome id string');
    }
    m.steps.forEach(function (s, i) {
      if (s.gives !== undefined && (typeof s.gives !== 'string' || !/^[a-z][a-z0-9-]*$/.test(s.gives))) fail('steps[' + i + '].gives', 'must be a lowercase vocab id string');
    });
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
      reward: { stars: 2 } },
    // Mission 3 (AS-0319, slice 2 of AS-0182): a puppy is stranded on a rock in the river. Push the fallen log across the water so it
    // locks as a bridge, then walk over it to the rock. game/mission-log.js places the rock, puppy and log from `river`.
    { id: 'rio', n: 3, es: 'Rescate en el río', en: 'River rescue', icon: '🐶',
      intro: { es: '¡Salva al perrito!', en: 'Save the puppy!', icon: '🐶' },
      // AS-0320: `bank` is where the puppy is set down (a towel lies there), `rubs` the sponge taps that dry it, `action` the care action used.
      river: { animal: 'perrito', rock: 'roca', log: 'tronco', bank: 'orilla', rubs: 3, action: 'lavar' },
      steps: [{ kind: 'push', item: 'tronco', line: { es: 'Empuja el tronco', icon: '🪵', en: 'Push the log' } },
        { kind: 'goTo', place: 'roca', line: { es: 'Cruza el río', icon: '🌊', en: 'Cross the river' } },
        { kind: 'carry', item: 'perrito', line: { es: 'Recoge al perrito', icon: '🐶', en: 'Pick up the puppy' } },
        { kind: 'deliver', item: 'perrito', to: 'orilla', line: { es: 'Llévalo a la orilla', icon: '🏞️', en: 'Take it to the bank' } },
        { kind: 'dry', item: 'perrito', line: { es: 'Sécalo', icon: '🧽', en: 'Dry it off' } },
        // AS-0321: the dry puppy wags its tail; a photo of it ends the mission (and earns the sticker).
        { kind: 'photo', target: 'perrito', line: { es: 'Foto del perrito', icon: '📷', en: 'Puppy photo' } }],
      reward: { stars: 2 } },
    // Mission 4 (AS-0326, slice 1 of AS-0183): the monkey's birthday. Collect 3 bananas in the selva (game/mission-bananas.js scatters them
    // only while this mission runs), then ask the scientist for the flower crown. Inviting friends, the party and the photo come later.
    { id: 'fiesta', n: 4, es: 'La fiesta del mono', en: "The monkey's party", icon: '🎂',
      intro: { es: '¡Feliz cumpleaños, mono!', en: 'Happy birthday, monkey!', icon: '🐵' },
      bananas: { item: 'platano', n: 3, biome: 'selva' },
      steps: [{ kind: 'collect', item: 'platano', n: 3, line: { es: 'Recoge 3 plátanos', icon: '🍌', en: 'Pick up 3 bananas' } },
        { kind: 'talk', who: 'scientist', gives: 'corona', line: { es: 'Pide la corona', icon: '👑', en: 'Ask for the crown' } }],
      reward: { stars: 2 } }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
