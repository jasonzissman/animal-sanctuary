/* Badges data: registers kind "badges" (SA.data). Pure data; no THREE, no DOM. The rules engine is game/badges.js. Needs kinds
 * "biomes" and "animals" registered first (cross-checked).
 *
 * Badge row (JSON-serialisable):
 *   id     unique lowercase key ('amigo-tortuga-plata')
 *   es, en short name ('Amigo de las tortugas'); en is scaffolding only
 *   icon   short emoji (a species badge shows the animal plus its medal)
 *   tier   optional 'bronce' | 'plata' | 'oro' (species badges: 1 / 5 / 15 rescues)
 *   rule   { count, kind?, animalId?, need?, biome?, night? }: earned once the rescue log holds `count` rows matching every field given
 *                (animalId = that species, need = the predicament: thorn, mud, hungry, tangled; biome = where; night = true at night;
 *                kind = a story rescue such as 'reunion'). No field = any rescue.
 *          { album: 'all' }: earned once every real (non easter-egg) species is photographed (SA.album.progress()).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;
  var WORD = /^[a-z][a-z0-9-]*$/;
  var TIERS = ['bronce', 'plata', 'oro'];
  var COUNTS = [1, 5, 15];
  var MEDALS = ['🥉', '🥈', '🥇'];
  var RULE_KEYS = ['count', 'kind', 'animalId', 'need', 'biome', 'night', 'album'];

  // Registry lookup that tolerates a kind that is not loaded (a test loading only this file): undefined then, null when unknown.
  function lookup(kind, id) { try { return SA.data.get(kind, id); } catch (e) { return undefined; } }

  function validateBadge(b) {
    if (!WORD.test(b.id)) fail('id', 'must be lowercase ASCII letters, digits or "-"');
    if (typeof b.es !== 'string' || !b.es.trim()) fail('es', 'must be a non-empty string');
    if (b.en !== undefined && (typeof b.en !== 'string' || !b.en.trim())) fail('en', 'must be a non-empty string when present');
    if (typeof b.icon !== 'string' || !b.icon.trim() || b.icon.length > 8) fail('icon', 'must be a short non-empty emoji string');
    if (b.tier !== undefined && TIERS.indexOf(b.tier) < 0) fail('tier', 'must be one of ' + TIERS.join(', '));
    var r = b.rule;
    if (!r || typeof r !== 'object' || Array.isArray(r)) fail('rule', 'must be an object');
    Object.keys(r).forEach(function (k) { if (RULE_KEYS.indexOf(k) < 0) fail('rule.' + k, 'unknown rule field'); });
    if (r.album !== undefined) {
      if (r.album !== 'all') fail('rule.album', 'must be "all"');
      if (Object.keys(r).length !== 1) fail('rule', 'an album rule has no other fields');
      return;
    }
    if (typeof r.count !== 'number' || r.count < 1 || r.count !== Math.floor(r.count)) fail('rule.count', 'must be a whole number >= 1');
    if (r.kind !== undefined && (typeof r.kind !== 'string' || !WORD.test(r.kind))) fail('rule.kind', 'must be a lowercase rescue kind');
    if (r.need !== undefined && (typeof r.need !== 'string' || !WORD.test(r.need))) fail('rule.need', 'must be a lowercase need word');
    if (r.night !== undefined && typeof r.night !== 'boolean') fail('rule.night', 'must be true or false');
    if (r.animalId !== undefined && lookup('animals', r.animalId) === null) fail('rule.animalId', 'unknown animal ' + JSON.stringify(r.animalId));
    if (r.biome !== undefined && lookup('biomes', r.biome) === null) fail('rule.biome', 'unknown biome ' + JSON.stringify(r.biome));
  }

  // Species badges: "Amigo de las tortugas" at 1 / 5 / 15 rescues (bronce / plata / oro). Real animals only (no story pigs, no easter eggs).
  var SPECIES = [
    ['conejo', 'los conejos', 'rabbits'], ['pato', 'los patos', 'ducks'], ['tortuga', 'las tortugas', 'turtles'],
    ['mono', 'los monos', 'monkeys'], ['tucan', 'los tucanes', 'toucans'], ['rana', 'las ranas', 'frogs'],
    ['camello', 'los camellos', 'camels'], ['serpiente', 'las serpientes', 'snakes'], ['cabra', 'las cabras', 'goats'],
    ['aguila', 'las águilas', 'eagles']
  ];

  var rows = [
    { id: 'primer-rescate', es: 'Primer rescate', en: 'First rescue', icon: '⭐', rule: { count: 1 } },
    { id: 'super-ayudante', es: 'Súper ayudante', en: 'Super helper', icon: '🦸', rule: { count: 25 } },
    { id: 'reune-familias', es: 'Reúne familias', en: 'Reunite families', icon: '👨‍👩‍👧', rule: { kind: 'reunion', count: 1 } },
    { id: 'patito-nuevo', es: 'Patito nuevo', en: 'New duckling', icon: '🐥', rule: { kind: 'hatch', count: 1 } },   // the mission 2 sticker (AS-0315)
    { id: 'perrito-feliz', es: 'Perrito feliz', en: 'Happy puppy', icon: '🐶', rule: { kind: 'river', count: 1 } },   // the mission 3 sticker (AS-0321)
    { id: 'camello-sano', es: 'Camello sano', en: 'Healthy camel', icon: '🐫', rule: { kind: 'doctor', count: 1 } },   // the mission 5 sticker (AS-0333)
    { id: 'aguilucho-volador', es: 'Aguilucho volador', en: 'Flying eaglet', icon: '🦅', rule: { kind: 'nest', count: 1 } },   // the mission 6 sticker (AS-0338)
    { id: 'censo-completo', es: 'Censo completo', en: 'Census done', icon: '📋', rule: { kind: 'census', count: 1 } },   // the mission 7 sticker (AS-0341)
    { id: 'despensa-secreta', es: 'Despensa secreta', en: 'Secret pantry', icon: '🍓', rule: { kind: 'pantry', count: 1 } },   // the mission 8 sticker (AS-0346)
    { id: 'hogar-nuevo', es: 'Hogar nuevo', en: 'New home', icon: '🏡', rule: { kind: 'home', count: 1 } },   // the mission 9 sticker (AS-0350)
    { id: 'fiesta-feliz', es: 'Fiesta feliz', en: 'Happy party', icon: '🎉', rule: { kind: 'party', count: 1 } },   // the mission 4 sticker (AS-0328)
    { id: 'doctora-de-patitas', es: 'Doctora de patitas', en: 'Paw doctor', icon: '🩹', rule: { need: 'thorn', count: 5 } },
    { id: 'heroe-del-barro', es: 'Héroe del barro', en: 'Mud hero', icon: '🛁', rule: { need: 'mud', count: 5 } },
    { id: 'chef-del-santuario', es: 'Chef del santuario', en: 'Sanctuary chef', icon: '🍓', rule: { need: 'hungry', count: 5 } },
    { id: 'explorador-del-bosque', es: 'Explorador del bosque', en: 'Forest explorer', icon: '🌲', rule: { biome: 'bosque', count: 5 } },
    { id: 'explorador-de-la-selva', es: 'Explorador de la selva', en: 'Jungle explorer', icon: '🌴', rule: { biome: 'selva', count: 5 } },
    { id: 'explorador-del-desierto', es: 'Explorador del desierto', en: 'Desert explorer', icon: '🌵', rule: { biome: 'desierto', count: 5 } },
    { id: 'explorador-de-la-montana', es: 'Explorador de la montaña', en: 'Mountain explorer', icon: '⛰️', rule: { biome: 'montana', count: 5 } },
    { id: 'buho-nocturno', es: 'Búho nocturno', en: 'Night owl', icon: '🦉', rule: { night: true, count: 3 } },
    { id: 'album-completo', es: 'Álbum completo', en: 'Complete album', icon: '📖', rule: { album: 'all' } }
  ];

  SPECIES.forEach(function (sp) {
    var animal = lookup('animals', sp[0]);
    if (!animal) return;                                  // a species that is not registered simply has no badges
    TIERS.forEach(function (tier, i) {
      rows.push({ id: 'amigo-' + sp[0] + '-' + tier, es: 'Amigo de ' + sp[1], en: 'Friend of ' + sp[2], icon: animal.icon + MEDALS[i],
        tier: tier, rule: { animalId: sp[0], count: COUNTS[i] } });
    });
  });

  SA.data.defineKind('badges', validateBadge);
  SA.data.register('badges', rows);
})(typeof window !== 'undefined' ? window : globalThis);
