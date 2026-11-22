/* Clue templates: registers kind "clueTemplates" (SA.data) and the phrase/adjective vocab they speak.
 * Pure data + validator; no THREE. Needs kinds "parts" and "vocab" (and SA.animals) loaded first.
 * game/clues.js turns these into concrete, grammatical Spanish clues.
 *
 * Template shapes (JSON-serialisable). `lead` = { key: vocab key, es: text before the subject }.
 *   type 'partAdjective'  "Busca el animal con orejas largas"
 *     parts       part keys (the noun's gender/number come from the registered part)
 *     adjectives  [{ id, forms: { m: { sg, pl }, f: { sg, pl } }, min?, max? }]  an animal's part matches when
 *                 its length (largest scale value) is >= min and/or <= max. The clue engine picks the form that
 *                 agrees with the part (largo/larga/largos/largas).
 *   type 'trait'          "Busca el animal que vuela" / "Busca el animal verde"
 *     trait       'size' | 'color' | 'movement'      values  allowed values (must exist in SA.animals lists)
 *   type 'touchPart'      "Toca las patas"            parts   part keys
 * Adjective forms and lead phrases are also registered as vocab ("adj:largas", "phrase:...") so they can be spoken.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;
  var TYPES = ['partAdjective', 'trait', 'touchPart'];
  var TRAITS = { size: 'SIZES', color: 'COLORS', movement: 'MOVEMENTS' };
  var GENDERS = ['m', 'f'];
  var NUMBERS = ['sg', 'pl'];

  function text(v, field) {
    if (typeof v !== 'string' || !v.trim()) fail(field, 'must be a non-empty string');
  }

  function partList(list) {
    if (!Array.isArray(list) || !list.length) fail('parts', 'must be a non-empty array of part keys');
    list.forEach(function (k, i) {
      if (typeof k !== 'string' || !SA.data.get('parts', k)) fail('parts[' + i + ']', 'unknown part ' + JSON.stringify(k));
    });
  }

  function validateAdjective(a, i) {
    var f = 'adjectives[' + i + ']';
    if (!a || typeof a !== 'object') fail(f, 'must be an object');
    text(a.id, f + '.id');
    GENDERS.forEach(function (g) {
      NUMBERS.forEach(function (n) {
        if (!a.forms || !a.forms[g]) fail(f + '.forms', 'needs forms for gender ' + g);
        text(a.forms[g][n], f + '.forms.' + g + '.' + n);
      });
    });
    var hasMin = typeof a.min === 'number', hasMax = typeof a.max === 'number';
    if (!hasMin && !hasMax) fail(f, 'needs a numeric min and/or max');
    if (a.min !== undefined && !hasMin) fail(f + '.min', 'must be a number');
    if (a.max !== undefined && !hasMax) fail(f + '.max', 'must be a number');
  }

  function validateTemplate(t) {
    if (TYPES.indexOf(t.type) < 0) fail('type', 'must be one of ' + TYPES.join(', '));
    if (!t.lead || typeof t.lead !== 'object') fail('lead', 'must be an object { key, es }');
    text(t.lead.key, 'lead.key');
    text(t.lead.es, 'lead.es');
    if (t.type === 'trait') {
      if (!TRAITS[t.trait]) fail('trait', 'must be one of ' + Object.keys(TRAITS).join(', '));
      var allowed = SA.animals[TRAITS[t.trait]];
      if (!Array.isArray(t.values) || !t.values.length) fail('values', 'must be a non-empty array');
      t.values.forEach(function (v) {
        if (allowed.indexOf(v) < 0) fail('values', 'unknown ' + t.trait + ' value ' + JSON.stringify(v));
      });
      return;
    }
    partList(t.parts);
    if (t.type === 'partAdjective') {
      if (!Array.isArray(t.adjectives) || !t.adjectives.length) fail('adjectives', 'must be a non-empty array');
      t.adjectives.forEach(validateAdjective);
    }
  }

  SA.data.defineKind('clueTemplates', validateTemplate);

  var lengthAdjectives = [
    { id: 'largo', min: 0.8, forms: { m: { sg: 'largo', pl: 'largos' }, f: { sg: 'larga', pl: 'largas' } } },
    { id: 'corto', max: 0.4, forms: { m: { sg: 'corto', pl: 'cortos' }, f: { sg: 'corta', pl: 'cortas' } } }
  ];
  var lead = {
    withPart: { key: 'phrase:buscaanimalcon', es: 'Busca el animal con' },
    that: { key: 'phrase:buscaanimalque', es: 'Busca el animal que' },
    plain: { key: 'phrase:buscaanimal', es: 'Busca el animal' },
    touch: { key: 'phrase:toca', es: 'Toca' }
  };

  var templates = [
    { id: 'part-length', type: 'partAdjective', lead: lead.withPart, adjectives: lengthAdjectives,
      parts: ['orejas', 'cola', 'pico', 'patas', 'alas', 'cuernos', 'ojos'] },
    // "ojos grandes": a distinguishing feature (the frog's big eyes) that no other animal's eyes reach.
    { id: 'part-size', type: 'partAdjective', lead: lead.withPart, parts: ['ojos'],
      adjectives: [{ id: 'grande', min: 0.2, forms: { m: { sg: 'grande', pl: 'grandes' }, f: { sg: 'grande', pl: 'grandes' } } }] },
    { id: 'trait-movement', type: 'trait', lead: lead.that, trait: 'movement',
      values: ['salta', 'nada', 'vuela', 'trepa', 'camina lento', 'corre', 'repta'] },
    { id: 'trait-size', type: 'trait', lead: lead.plain, trait: 'size', values: ['pequeño', 'mediano', 'grande'] },
    { id: 'trait-color', type: 'trait', lead: lead.plain, trait: 'color',
      values: ['blanco', 'gris', 'marrón', 'negro', 'verde', 'amarillo', 'naranja', 'rojo', 'azul'] },
    { id: 'touch-part', type: 'touchPart', lead: lead.touch,
      parts: ['cabeza', 'orejas', 'ojos', 'hocico', 'pico', 'cola', 'patas', 'alas', 'caparazon', 'cuernos', 'aletas',
        'plumas', 'nariz', 'joroba'] }
  ];
  SA.data.register('clueTemplates', templates);

  // Vocab for the new phrases and adjective forms (phrase:toca already exists in vocab.js).
  var vocab = [];
  var seen = {};
  function addVocab(key, es) {
    if (seen[key] || SA.data.get('vocab', key)) return;
    seen[key] = true;
    vocab.push({ id: key, key: key, es: es, clip: null });
  }
  templates.forEach(function (t) {
    addVocab(t.lead.key, t.lead.es);
    (t.adjectives || []).forEach(function (a) {
      GENDERS.forEach(function (g) { NUMBERS.forEach(function (n) { addVocab('adj:' + a.forms[g][n], a.forms[g][n]); }); });
    });
  });
  SA.data.register('vocab', vocab);
})(typeof window !== 'undefined' ? window : globalThis);
