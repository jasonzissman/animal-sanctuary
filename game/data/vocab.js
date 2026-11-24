/* Vocabulary manifest: registers kind "vocab" (SA.data) and exposes SA.vocab. Pure data; no THREE, no DOM.
 * Every speakable word/phrase has a key, its Spanish text (what is spoken and, for prompts, shown) and an
 * optional clip path (null until a recorded voice file exists). SA.audio.say(key) (game/speech.js) plays
 * the clip if there is one, else speaks `es` with speechSynthesis.
 *
 * Entry shape (JSON-serialisable):
 *   id, key   '<group>:<name>', e.g. 'part:orejas', 'animal:conejo', 'size:pequeño', 'color:rojo', 'number:3'
 *   es        Spanish text with article/accents exactly as shown on screen
 *   en        optional English scaffold text (shown only when settings.english is on)
 *   pitch     optional speech pitch 0.5..2 (1 = normal); a baby animal's voice is higher. Recorded clips ignore it.
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
    if (v.pitch !== undefined && (typeof v.pitch !== 'number' || !(v.pitch >= 0.5 && v.pitch <= 2))) fail('pitch', 'must be a number from 0.5 to 2');
    if (v.en !== undefined && (typeof v.en !== 'string' || !v.en.trim())) fail('en', 'must be a non-empty string when present');
    // Biome names are spoken with their article (la selva, el desierto) so the gender is always heard.
    if (/^biome:/.test(v.key) && !/^(el|la|los|las) /i.test(v.es)) fail('es', 'a biome name must start with its article (el/la/los/las)');
  }

  SA.data.defineKind('vocab', validateVocab);

  var items = [];
  function add(group, name, es, en) {
    var key = group + ':' + name;
    var item = { id: key, key: key, es: es, clip: null };
    if (en) item.en = en;
    items.push(item);
    return item;
  }
  var BABY_PITCH = 1.7;   // speechSynthesis pitch of a baby animal's voice (normal is 1)

  [['cabeza', 'la cabeza'], ['cuerpo', 'el cuerpo'], ['orejas', 'las orejas'], ['ojos', 'los ojos'],
    ['hocico', 'el hocico'], ['pico', 'el pico'], ['cola', 'la cola'], ['patas', 'las patas'], ['alas', 'las alas'],
    ['caparazon', 'el caparazón'], ['cuernos', 'los cuernos'], ['aletas', 'las aletas'], ['plumas', 'las plumas'],
    ['nariz', 'la nariz'], ['joroba', 'la joroba'], ['mejillas', 'las mejillas'],
    ['pelo', 'el pelo'], ['barriga', 'la barriga'], ['cresta', 'la cresta'], ['cuello', 'el cuello'],
    ['manchas', 'las manchas'], ['garras', 'las garras']].forEach(function (p) { add('part', p[0], p[1]); });

  [['conejo', 'el conejo'], ['pato', 'el pato'], ['tortuga', 'la tortuga'], ['mono', 'el mono'],
    ['tucan', 'el tucán'], ['rana', 'la rana'], ['camello', 'el camello'], ['serpiente', 'la serpiente'],
    ['zorrodesierto', 'el zorro del desierto'], ['lagartija', 'la lagartija'], ['correcaminos', 'el correcaminos'],
    ['oso', 'el oso'], ['llama', 'la llama'], ['condor', 'el cóndor'],
    ['ciervo', 'el ciervo'], ['ardilla', 'la ardilla'], ['jaguar', 'el jaguar'], ['perezoso', 'el perezoso'],
    ['cabra', 'la cabra'], ['aguila', 'el águila'], ['raton', 'el ratón chispa'],
    ['cerda', 'la cerda'], ['cerdito', 'el cerdito']].forEach(function (a) { add('animal', a[0], a[1]); });

  add('biome', 'bosque', 'El bosque y el río');
  add('biome', 'selva', 'La selva');
  add('biome', 'desierto', 'El desierto');
  add('biome', 'montana', 'La montaña');

  ['pequeño', 'mediano', 'grande'].forEach(function (w) { add('size', w, w); });
  ['blanco', 'gris', 'marrón', 'negro', 'verde', 'amarillo', 'naranja', 'rojo', 'azul', 'rosa'].forEach(function (w) { add('color', w, w); });
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
    'azul': ['azul', 'azules', 'azul', 'azules'], 'rosa': ['rosa', 'rosas', 'rosa', 'rosas']
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

  // Number words that agree with a noun in prompts ("un plátano", "una fresa"), and the "y" of two-food asks.
  add('number', 'un', 'un');
  add('number', 'una', 'una');
  add('phrase', 'y', 'y');

  add('phrase', 'muybien', '¡Muy bien!');
  add('phrase', 'otravez', '¡Otra vez!');
  add('phrase', 'dondeesta', '¿Dónde está?');
  add('phrase', 'busca', '¡Busca!', 'Find it!');
  add('phrase', 'toca', '¡Toca!');
  add('phrase', 'casi', '¡Casi!');
  add('phrase', 'yapuedevolar', '¡Ya puede volar!');
  add('phrase', 'yacaminabien', '¡Ya camina bien!', 'It walks well now!');   // the thorn is out (action quitarespina)
  add('phrase', 'yasecalmo', '¡Ya se calmó!', 'It is calm now!');   // the scared animal is calm (action acariciar; gender-neutral)
  add('phrase', 'barro', 'el barro', 'the mud');   // the puddle the animal is stuck in (action sacardelbarro)
  add('phrase', 'yasaliodelbarro', '¡Ya salió del barro!', 'It is out of the mud!');
  // Encounter hints (SA.encounters): spoken after the animal's own key ('animal:pato' + a predicate), so "el pato tiene hambre".
  // A predicate that changes with gender has an m and an f entry; the others are the same for both.
  add('phrase', 'tienehambre', 'tiene hambre', 'is hungry');
  add('phrase', 'tieneespina', 'tiene una espina', 'has a thorn');
  add('phrase', 'atascadom', 'está atascado en el barro', 'is stuck in the mud');
  add('phrase', 'atascadaf', 'está atascada en el barro', 'is stuck in the mud');
  add('phrase', 'tienehoja', 'tiene una hoja en el ala', 'has a leaf on its wing');
  add('phrase', 'asustadom', 'está asustado', 'is scared');
  add('phrase', 'asustadaf', 'está asustada', 'is scared');
  add('phrase', 'quefoto', '¡Qué foto! Pero busca…');
  add('phrase', 'tomalefoto', 'Tómale una foto', 'Take its photo');   // the photo step of a rescue mission (SA.missionFlow)
  add('phrase', 'estabien', '¡Está bien!', 'It is OK!');   // the rescue proof card stamp (SA.missionFlow)
  add('phrase', 'graciasbien', '¡Gracias! Está bien.', 'Thank you! It is OK.');   // the scientist's cheer for a proof sent to the station (SA.proofs)
  add('phrase', 'nuevamision', '¡Nueva misión!', 'New mission!');   // she points at the unlocked mission (SA.proofs)
  add('phrase', 'ay','¡Ay! ¡Pica!', 'Ouch! Prickly!');   // the cactus prick (SA.prick)
  // What the scientist says (SA.scientistTalk), at every load (SA.greeting) and when you use her: the one-line mission and what the current step asks.
  add('phrase', 'recuerdo', 'Ayuda a los animales: busca, ayuda, foto', 'Help the animals: find, help, photo');
  add('phrase', 'eligemision', 'Elige una misión en la estación', 'Pick a mission at the station');
  add('phrase', 'masmisiones', '¡Muy bien! Pronto, más misiones.', 'Well done! More missions soon.');
  add('phrase', 'pasoayuda', '¡Ayuda!', 'Help!');
  add('phrase', 'pasosigue', '¡Sigue!', 'Follow!');
  add('phrase', 'pasolleva', '¡Lleva!', 'Carry it!');
  add('phrase', 'pasoentrega', '¡Entrega!', 'Deliver it!');
  add('phrase', 'pasorecoge', '¡Recoge!', 'Collect it!');
  add('phrase', 'pasove', '¡Ve allí!', 'Go there!');
  // The pig's voice (animal.voice): the sow grunts, the piglet squeaks at a higher pitch (speech.js uses entry.pitch).
  add('phrase', 'oinc', 'Oinc, oinc', 'Oink oink');
  add('phrase', 'oincbebe', 'Oinc, oinc', 'Oink oink').pitch = BABY_PITCH;
  // The family words of the reunion (SA.missionReunion, AS-0235), spoken in this order.
  add('phrase', 'mama', 'la mamá', 'the mama');
  add('phrase', 'cria', 'la cría', 'the baby animal');
  add('phrase', 'bebe', 'el bebé', 'the baby');
  add('phrase', 'familia', 'la familia', 'the family');
  add('phrase', 'familiajunta', '¡La familia está junta!', 'The family is together!');
  add('phrase', 'acercate', '¡Acércate!', 'Come closer!');   // the reach cue (SA.reach.speakCue)

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
    // Vocab key ('biome:selva') for a biome id, or null when the id is junk or has no vocab entry.
    biomeKey: function (biomeId) {
      if (typeof biomeId !== 'string' || !/^[a-z]+$/.test(biomeId)) return null;
      var key = 'biome:' + biomeId;
      return SA.data.get('vocab', key) ? key : null;
    },
    // Sets entry.clip from a { key: path } map (game/data/voice-clips.js, generated by scripts/voices.js).
    // Unknown keys and non-string paths are ignored; returns how many entries got a clip.
    applyClips: function (map) {
      var n = 0;
      Object.keys(map || {}).forEach(function (k) {
        var e = SA.data.get('vocab', k);
        if (e && typeof map[k] === 'string' && map[k]) { e.clip = map[k]; n++; }
      });
      return n;
    },
    keys: function () { return SA.data.all('vocab').map(function (v) { return v.key; }); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
