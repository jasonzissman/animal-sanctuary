/* Vocabulary manifest: registers kind "vocab" (SA.data) and exposes SA.vocab. Pure data; no THREE, no DOM.
 * Every speakable word/phrase has a key, its Spanish text (what is spoken and, for prompts, shown) and an
 * optional clip path (null until a recorded voice file exists). SA.audio.say(key) (game/speech.js) plays
 * the clip if there is one, else speaks `es` with speechSynthesis.
 *
 * Entry shape (JSON-serialisable):
 *   id, key   '<group>:<name>', e.g. 'part:orejas', 'animal:conejo', 'size:pequeño', 'color:rojo', 'number:3'
 *   es        Spanish text with article/accents exactly as shown on screen
 *   clip      relative path to an audio clip or null
 * Groups: part, animal, biome, size, color, movement, diet, number, phrase.
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
  ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'].forEach(function (w, i) { add('number', String(i + 1), w); });

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
    keys: function () { return SA.data.all('vocab').map(function (v) { return v.key; }); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
