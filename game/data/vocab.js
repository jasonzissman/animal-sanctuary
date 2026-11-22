/* Vocabulary manifest: registers kind "vocab" (SA.data) and exposes SA.vocab. Pure data; no THREE, no DOM.
 * Every speakable word/phrase has a key, its Spanish text (what is spoken and, for prompts, shown) and an
 * optional clip path (null until a recorded voice file exists). SA.audio.say(key) (game/speech.js) plays
 * the clip if there is one, else speaks `es` with speechSynthesis.
 *
 * Entry shape (JSON-serialisable):
 *   id, key   '<group>:<name>', e.g. 'part:orejas', 'animal:conejo', 'size:pequeño', 'color:rojo', 'number:3'
 *   es        Spanish text with article/accents exactly as shown on screen
 *   clip      relative path to an audio clip or null
 * Groups: part, animal, biome, size, color, movement, diet, number, phrase, adj.
 * Adjective forms: size:/color: keys speak the masculine singular (base) word. Every size and colour adjective
 * also has all four agreeing forms as 'adj:<form>' keys (adj:blanca, adj:blancos, adj:blancas, adj:grises ...), the
 * same key shape game/data/clues.js uses for largo/larga/largos/largas. SA.vocab.adjKey(base, gender, number) maps a
 * base word ('blanco' / 'marrón'), 'm'|'f' and 'sg'|'pl' to that key, ready for SA.audio.say(). Invariable forms
 * (grande, verde, gris ...) reuse the same key for both genders.
 * test/vocab.test.js fails when any part, animal, biome or trait value in the data has no entry here.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;

  function validateVocab(v) {
    if (typeof v.key !== 'string' || !/^[a-z]+:\S.*$/.test(v.key)) fail('key', 'must look like "group:name"');
    if (v.key !== v.id) fail('key', 'must equal id');
    if (typeof v.es !== 'string' || !v.es.trim()) fail('es', 'must be a non-empty string');
    if (v.clip !== null && (typeof v.clip !== 'string' || !v.clip)) fail('clip', 'must be a path string or null');
  }

  SA.data.defineKind('vocab', validateVocab);

  var items = [];
  function add(group, name, es) {
    var key = group + ':' + name;
    items.push({ id: key, key: key, es: es, clip: null });
  }

  [['cabeza', 'la cabeza'], ['cuerpo', 'el cuerpo'], ['orejas', 'las orejas'], ['ojos', 'los ojos'],
    ['hocico', 'el hocico'], ['pico', 'el pico'], ['cola', 'la cola'], ['patas', 'las patas'], ['alas', 'las alas'],
    ['caparazon', 'el caparazón'], ['cuernos', 'los cuernos'], ['aletas', 'las aletas'], ['plumas', 'las plumas'],
    ['nariz', 'la nariz'], ['joroba', 'la joroba'], ['mejillas', 'las mejillas']].forEach(function (p) { add('part', p[0], p[1]); });

  [['conejo', 'el conejo'], ['pato', 'el pato'], ['tortuga', 'la tortuga'], ['mono', 'el mono'],
    ['tucan', 'el tucán'], ['rana', 'la rana'], ['camello', 'el camello'], ['serpiente', 'la serpiente'],
    ['cabra', 'la cabra'], ['aguila', 'el águila'], ['raton', 'el ratón chispa']].forEach(function (a) { add('animal', a[0], a[1]); });

  add('biome', 'bosque', 'El bosque y el río');
  add('biome', 'selva', 'La selva');
  add('biome', 'desierto', 'El desierto');
  add('biome', 'montana', 'La montaña');

  ['pequeño', 'mediano', 'grande'].forEach(function (w) { add('size', w, w); });
  ['blanco', 'gris', 'marrón', 'negro', 'verde', 'amarillo', 'naranja', 'rojo', 'azul'].forEach(function (w) { add('color', w, w); });
  ['salta', 'nada', 'vuela', 'trepa', 'camina lento', 'corre', 'repta'].forEach(function (w) { add('movement', w, w); });
  ['herbívoro', 'carnívoro', 'omnívoro', 'insectívoro'].forEach(function (w) { add('diet', w, w); });
  // Agreeing forms of every size/colour adjective: base -> [m.sg, m.pl, f.sg, f.pl]. Accents kept (marrón/marrones).
  var ADJ_FORMS = {
    'pequeño': ['pequeño', 'pequeños', 'pequeña', 'pequeñas'], 'mediano': ['mediano', 'medianos', 'mediana', 'medianas'],
    'grande': ['grande', 'grandes', 'grande', 'grandes'],
    'blanco': ['blanco', 'blancos', 'blanca', 'blancas'], 'gris': ['gris', 'grises', 'gris', 'grises'],
    'marrón': ['marrón', 'marrones', 'marrón', 'marrones'], 'negro': ['negro', 'negros', 'negra', 'negras'],
    'verde': ['verde', 'verdes', 'verde', 'verdes'], 'amarillo': ['amarillo', 'amarillos', 'amarilla', 'amarillas'],
    'naranja': ['naranja', 'naranjas', 'naranja', 'naranjas'], 'rojo': ['rojo', 'rojos', 'roja', 'rojas'],
    'azul': ['azul', 'azules', 'azul', 'azules']
  };
  var FORM_INDEX = { m: { sg: 0, pl: 1 }, f: { sg: 2, pl: 3 } };
  var seenAdj = {};
  Object.keys(ADJ_FORMS).forEach(function (base) {
    ADJ_FORMS[base].forEach(function (w) {
      if (!seenAdj[w]) { seenAdj[w] = true; add('adj', w, w); }
    });
  });

  // 0 covers a snake's legs (animal traits.legs runs 0..8); clue counts of parts start at 1.
  ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'].forEach(function (w, i) { add('number', String(i), w); });

  add('phrase', 'muybien', '¡Muy bien!');
  add('phrase', 'otravez', '¡Otra vez!');
  add('phrase', 'dondeesta', '¿Dónde está?');
  add('phrase', 'busca', '¡Busca!');
  add('phrase', 'toca', '¡Toca!');
  add('phrase', 'casi', '¡Casi!');

  SA.data.register('vocab', items);
  SA.vocab = {
    // Entry for a key, or null (so callers can treat unknown strings as plain text).
    get: function (key) { return typeof key === 'string' ? SA.data.get('vocab', key) : null; },
    // Vocab key of the adjective `base` (e.g. 'blanco') agreeing in gender ('m'|'f') and number ('sg'|'pl'), or null.
    adjKey: function (base, gender, number) {
      var forms = Object.prototype.hasOwnProperty.call(ADJ_FORMS, base) ? ADJ_FORMS[base] : null;
      var g = FORM_INDEX[gender];
      if (!forms || !g || g[number] === undefined) return null;
      return 'adj:' + forms[g[number]];
    },
    keys: function () { return SA.data.all('vocab').map(function (v) { return v.key; }); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
