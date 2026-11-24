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
    ['cerda', 'la cerda'], ['cerdito', 'el cerdito'], ['patito', 'el patito'], ['perrito', 'el perrito'],
    ['ratoncampo', 'el ratón de campo'], ['ratoncito', 'el ratoncito'], ['conejito', 'el conejito'],
    ['buho', 'el búho'], ['murcielago', 'el murciélago']].forEach(function (a) { add('animal', a[0], a[1]); });

  // Things a mission carries or visits (AS-0313): spoken when the egg is picked up and when it rests in the nest.
  add('thing', 'huevo', 'el huevo', 'the egg');
  add('thing', 'nido', 'el nido', 'the nest');
  // Day and night (AS-0170): the greetings at each change of the sky and the words that go with them.
  add('phrase', 'buenasnoches', '¡Buenas noches!', 'Good night!');
  add('phrase', 'buenosdias', '¡Buenos días!', 'Good morning!');
  add('phrase', 'shh', '¡Shh! Está durmiendo', 'Shh! It is sleeping');   // AS-0171: using an animal that is asleep
  add('phrase', 'amigoacompanar', 'Uno de tus amigos quiere acompañarte.', 'One of your friends wants to come along.');   // AS-0175: the animal friend
  add('phrase', 'poraqui', '¡Por aquí!', 'This way!');
  add('thing', 'noche', 'la noche', 'the night');
  add('thing', 'luna', 'la luna', 'the moon');
  add('thing', 'cielo', 'el cielo', 'the sky');   // AS-0371: Mission 12 (Noche de estrellas)
  add('thing', 'estrellas', 'las estrellas', 'the stars');
  add('thing', 'sol', 'el sol', 'the sun');
  // Mission 3 words (AS-0318): the river the puppy is stranded in, the log you cross it on, and the verb.
  add('thing', 'rio', 'el río', 'the river');
  add('thing', 'tronco', 'el tronco', 'the log');
  add('thing', 'roca', 'la roca', 'the rock');   // AS-0319: the rock the puppy waits on
  add('thing', 'orilla', 'la orilla', 'the bank');   // AS-0320: where the rescued puppy is set down to dry
  // Mission 4 words (AS-0326): the monkey's birthday; uno / dos / tres are the number words below.
  add('thing', 'cumpleanos', 'el cumpleaños', 'the birthday');
  add('thing', 'regalo', 'el regalo', 'the gift');
  add('thing', 'platanos', 'los plátanos', 'the bananas');
  add('thing', 'fiesta', 'la fiesta', 'the party');
  add('thing', 'corona', 'la corona', 'the crown');
  // Mission 5 words (AS-0331): the sick camel by the oasis.
  add('thing', 'cubo', 'el cubo', 'the bucket');
  add('thing', 'agua', 'el agua', 'the water');
  add('thing', 'fiebre', 'la fiebre', 'the fever');
  add('thing', 'frente', 'la frente', 'the forehead');
  add('phrase', 'enfermo', 'enfermo', 'sick');
  add('phrase', 'tienefiebre', 'tiene fiebre', 'has a fever');
  // Mission 5, slice 2 (AS-0332): the medicine from the station and the shade so the camel rests.
  add('thing', 'medicina', 'la medicina', 'the medicine');
  add('thing', 'sombrilla', 'la sombrilla', 'the umbrella');
  add('thing', 'sombra', 'la sombra', 'the shade');
  add('phrase', 'mananamejor', '¡Mañana estaré mejor!', 'Tomorrow I will be better!');
  add('phrase', 'estoysano', '¡Estoy sano!', 'I am healthy!');
  // Mission 6 words (AS-0336): the eagle's nest up the mountain (la pluma is the item word, la montaña the biome word).
  add('thing', 'puente', 'el puente', 'the bridge');
  add('phrase', 'arriba', '¡Arriba!', 'Up!');
  add('phrase', 'volar', 'volar', 'to fly');   // the eagle chick's first flight (AS-0337)
  // Mission 8 words (AS-0346): the strawberry thieves' secret pantry in the hollow tree and the mouse family.
  add('thing', 'ratones', 'los ratones', 'the mice');
  add('thing', 'familia', 'la familia', 'the family');
  add('thing', 'huellas', 'las huellas', 'the footprints');   // AS-0347: the trail to the hollow tree
  add('phrase', 'seguir', 'seguir', 'to follow');
  add('phrase', 'compartir', 'compartir', 'to share');   // AS-0348: sharing the strawberries with the mouse family
  // Mission 9 words (AS-0350): building a home (a nest or burrow) for a new rabbit family.
  add('thing', 'palo', 'el palo', 'the stick');
  add('thing', 'hoja', 'la hoja', 'the leaf');
  add('thing', 'hierba', 'la hierba', 'the grass');
  add('thing', 'casa', 'la casa', 'the house');
  add('phrase', 'abajo', 'abajo', 'below');
  add('phrase', 'encima', 'encima', 'on top');
  add('phrase', 'construir', 'construir', 'to build');
  add('phrase', 'dentro', 'dentro', 'inside');   // AS-0352: the soft grass goes inside the home
  // Mission 10 words (AS-0354): the race to the big tree.
  add('thing', 'carrera', 'la carrera', 'the race');
  add('thing', 'bandera', 'la bandera', 'the flag');
  add('thing', 'arbol', 'el árbol', 'the tree');
  // AS-0355: the spoken countdown "¡Tres, dos, uno, ya!" (tres / dos / uno are the number words), the rabbit's carrot stop and the win.
  // Mission 11 words (AS-0364): the lost message, spoken directions to the lookout tower (cruzar and el puente are above).
  add('thing', 'carta', 'la carta', 'the letter');
  add('thing', 'torre', 'la torre', 'the tower');
  add('phrase', 'izquierda', 'izquierda', 'left');
  add('phrase', 'derecha', 'derecha', 'right');
  add('phrase', 'cerca', 'cerca', 'near');
  add('phrase', 'lejos', 'lejos', 'far');
  add('phrase', 'ya', '¡Ya!', 'Go!');
  add('phrase', 'rapido', 'rápido', 'fast');
  add('phrase', 'lento', 'lento', 'slow');
  add('phrase', 'ganaste', '¡Ganaste!', 'You won!');   // "ganar", to win
  add('phrase', 'pasotoca', '¡Toca!', 'Touch it!');
  add('phrase', 'pasollena', '¡Llena!', 'Fill it!');
  add('phrase', 'cruzar', 'cruzar', 'to cross');
  add('phrase', 'felizcumple', '¡Feliz cumpleaños!', 'Happy birthday!');   // the party at the monkey's tree (AS-0328)
  add('phrase', 'guau', '¡Guau!', 'Woof!').pitch = 1.25;   // el perrito's bark (animal.voice)

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

  // Wet and dry (AS-0318): the puppy is mojado until it is dried off; all four agreeing forms are speakable.
  [['mojado', 'wet'], ['mojada'], ['mojados'], ['mojadas'], ['seco', 'dry'], ['seca'], ['secos'], ['secas']].forEach(function (w) { add('adj', w[0], w[0], w[1]); });

  // 0 covers a snake's legs (animal traits.legs runs 0..8); clue counts of parts start at 1.
  ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'].forEach(function (w, i) { add('number', String(i), w); });

  // Number words that agree with a noun in prompts ("un plátano", "una fresa"), and the "y" of two-food asks.
  add('number', 'un', 'un');
  add('number', 'una', 'una');
  add('phrase', 'y', 'y');

  // Census phrases (AS-0340): "tres animales grises, dos que nadan y uno que salta". Plural verbs agree with "animales"
  // (the singular verbs are the movement: keys above); diet adjectives get all four agreeing forms under adj:.
  add('phrase', 'animal', 'animal', 'animal');
  add('phrase', 'animales', 'animales', 'animals');
  add('phrase', 'que', 'que', 'that');
  ['saltan', 'nadan', 'vuelan', 'trepan', 'caminan lento', 'corren', 'reptan'].forEach(function (w) { add('movement', w, w); });
  ['herbívor', 'carnívor', 'omnívor', 'insectívor'].forEach(function (stem) {
    ['o', 'os', 'a', 'as'].forEach(function (end) { add('adj', stem + end, stem + end); });
  });

  add('phrase', 'muybien', '¡Muy bien!');
  add('phrase', 'otravez', '¡Otra vez!');
  add('phrase', 'dondeesta', '¿Dónde está?');
  add('phrase', 'busca', '¡Busca!', 'Find it!');
  add('phrase', 'toca', '¡Toca!');
  add('phrase', 'casi', '¡Casi!');
  add('phrase', 'despacio', '¡Despacio!', 'Slowly!');   // running or jumping with a fragile thing (AS-0314)
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
  add('phrase', 'pio', '¡Pío pío!', 'Cheep cheep!').pitch = BABY_PITCH;   // el patito's call when it hatches (AS-0315)
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
