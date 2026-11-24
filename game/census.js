/* SA.census: pure census checklist (no THREE, no DOM; loads in node:vm for tests). Slice 1 of Mission 7 (AS-0186):
 * the scientist's list of animals to photograph, e.g. "tres animales grises, dos que nadan y uno que salta".
 *
 *   SA.census.generate(rng, opts?) -> list      from the registered animals (SA.data 'animals'); build(animals, rng, opts) takes any array
 *     rng   a function returning [0, 1) or a numeric seed (same seed + animals = same list); opts.avoid = a previous list (or
 *           its key): the new list differs from it (a replay), as long as the data allows another one.
 *     list  { key, entries: [entry], es: 'tres animales grises, dos que nadan y uno que salta', vocabKeys: [...] }
 *     entry { trait: 'color'|'movement'|'size'|'diet', value: 'gris', n: 3, icon: '🩶',
 *             es: 'tres animales grises' (standalone), short: 'tres grises' (as a later item of the list),
 *             vocabKeys, shortKeys (SA.audio.say keys of es / short) }
 *     Only entries that at least n DISTINCT species of the sanctuary fit are generated (story animals and easter eggs are not part of
 *     the pool, so the list can always be finished); no animal id is special-cased.
 *   SA.census.matches(animal, entry) -> boolean   animal object or id; movement also counts alsoMoves (the turtle swims, AS-0122).
 *   SA.census.newState(list) -> state;  SA.census.tick(state, animal) -> entry | null;  SA.census.isDone(state) -> boolean
 *     tick: every unfinished entry the animal fits and has not ticked yet gets this animal (ANY fitting animal counts, and the same
 *     animal never ticks the same entry twice); returns the first entry it ticked (list order), or null when nothing changed.
 *   SA.census.progress(state) -> [{ entry, have, need, done }]
 *   SA.census.numberWord(n, gender, beforeNoun) -> { text, key }   uno/una, un/una before a noun, dos, tres ...
 *   SA.census.agree(trait, value, gender, plural) -> { text, keys }   the trait phrase agreeing with the noun
 *     ('gris' -> 'grises', 'que nadan', 'herbívoras'); the noun is 'animal(es)' (masculine) unless gender 'f' is asked for.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var TRAITS = ['color', 'movement', 'size', 'diet'];
  var MAX_N = 3;
  var NUMBER_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  var PLURAL_VERB = { 'salta': 'saltan', 'nada': 'nadan', 'vuela': 'vuelan', 'trepa': 'trepan', 'camina lento': 'caminan lento',
    'corre': 'corren', 'repta': 'reptan' };
  var ICONS = {
    color: { blanco: '🤍', gris: '🩶', 'marrón': '🤎', negro: '🖤', verde: '💚', amarillo: '💛', naranja: '🧡', rojo: '❤️', azul: '💙', rosa: '🩷' },
    movement: { salta: '🦘', nada: '🏊', vuela: '🕊️', trepa: '🧗', 'camina lento': '🐢', corre: '🏃', repta: '🐍' },
    size: { 'pequeño': '🐭', mediano: '🐕', grande: '🐘' },
    diet: { 'herbívoro': '🌿', 'carnívoro': '🥩', 'omnívoro': '🍽️', 'insectívoro': '🐛' }
  };

  function makeRng(seed) {   // mulberry32, the same generator SA.clues uses (kept local so this module stands alone)
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function toRng(r) { return typeof r === 'function' ? r : makeRng(typeof r === 'number' ? r : 1); }
  function vocabText(key) { var e = SA.data.get('vocab', key); return e ? e.es : null; }
  function resolve(animal) { return typeof animal === 'string' ? SA.data.get('animals', animal) : animal; }

  function numberWord(n, gender, beforeNoun) {
    if (n === 1) {
      var key = gender === 'f' ? 'una' : (beforeNoun ? 'un' : '1');
      return { text: vocabText('number:' + key), key: 'number:' + key };
    }
    return { text: vocabText('number:' + n), key: 'number:' + NUMBER_KEYS[n] };
  }

  // Trait phrase agreeing with the noun: colours/sizes as adj: forms, diets by their -o/-a/-os/-as ending, movements as "que" + verb.
  function agree(trait, value, gender, plural) {
    var g = gender === 'f' ? 'f' : 'm';
    var number = plural ? 'pl' : 'sg';
    if (trait === 'movement') {
      var verb = plural ? PLURAL_VERB[value] : value;
      return { text: 'que ' + verb, keys: ['phrase:que', 'movement:' + verb] };
    }
    var key;
    if (trait === 'diet') key = 'adj:' + value.slice(0, -1) + ({ m: { sg: 'o', pl: 'os' }, f: { sg: 'a', pl: 'as' } })[g][number];
    else key = SA.vocab.adjKey(value, g, number);
    return { text: vocabText(key), keys: [key] };
  }

  function entryPhrases(trait, value, n) {
    var plural = n > 1;
    var tp = agree(trait, value, 'm', plural);
    var count = numberWord(n, 'm', false);
    var countNoun = numberWord(n, 'm', true);
    var noun = plural ? { text: 'animales', key: 'phrase:animales' } : { text: 'animal', key: 'phrase:animal' };
    return {
      es: countNoun.text + ' ' + noun.text + ' ' + tp.text,
      vocabKeys: [countNoun.key, noun.key].concat(tp.keys),
      short: count.text + ' ' + tp.text,
      shortKeys: [count.key].concat(tp.keys)
    };
  }

  function makeEntry(trait, value, n) {
    var p = entryPhrases(trait, value, n);
    return { trait: trait, value: value, n: n, icon: ICONS[trait][value], es: p.es, short: p.short, vocabKeys: p.vocabKeys, shortKeys: p.shortKeys };
  }

  function fitsValue(animal, trait, value) {
    var t = animal && animal.traits;
    if (!t) return false;
    if (t[trait] === value) return true;
    return trait === 'movement' && Array.isArray(t.alsoMoves) && t.alsoMoves.indexOf(value) >= 0;
  }

  function matches(animal, entry) {
    var a = resolve(animal);
    return !!a && !!entry && fitsValue(a, entry.trait, entry.value);
  }

  function listKey(list) {
    return list.entries.map(function (e) { return e.trait + '=' + e.value + 'x' + e.n; }).sort().join('|');
  }

  // Joins the list: first item in full, the rest short ("a, b y c").
  function describe(entries) {
    var parts = entries.map(function (e, i) { return i === 0 ? e.es : e.short; });
    var keys = [];
    entries.forEach(function (e, i) {
      if (i > 0 && i === entries.length - 1) keys.push('phrase:y');
      keys.push.apply(keys, i === 0 ? e.vocabKeys : e.shortKeys);
    });
    var es = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' y ' + parts[parts.length - 1] : parts[0];
    return { es: es, vocabKeys: keys };
  }

  function pool(animals) {
    var seen = {};
    return (animals || []).filter(function (a) {
      if (!a || !a.traits || a.story || a.easterEgg || seen[a.id]) return false;
      seen[a.id] = true;
      return true;
    });
  }

  // Every { trait, value, max } the pool supports (max = how many distinct species fit, capped at MAX_N).
  function candidates(animals) {
    var out = [];
    TRAITS.forEach(function (trait) {
      Object.keys(ICONS[trait]).forEach(function (value) {
        var fit = animals.filter(function (a) { return fitsValue(a, trait, value); }).length;
        if (fit > 0) out.push({ trait: trait, value: value, max: Math.min(MAX_N, fit) });
      });
    });
    return out;
  }

  function shuffle(list, rng) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function draw(cands, rng) {
    var want = Math.min(cands.length, rng() < 0.5 ? 2 : 3);
    var order = shuffle(cands, rng);
    var picked = [];
    var usedTrait = {};
    order.forEach(function (c) {   // first pass: one entry per trait, for variety
      if (picked.length < want && !usedTrait[c.trait]) { usedTrait[c.trait] = true; picked.push(c); }
    });
    order.forEach(function (c) { if (picked.length < want && picked.indexOf(c) < 0) picked.push(c); });
    var entries = picked.map(function (c) {
      var low = Math.min(2, c.max);
      return makeEntry(c.trait, c.value, low + Math.floor(rng() * (c.max - low + 1)));
    });
    var d = describe(entries);
    var list = { entries: entries, es: d.es, vocabKeys: d.vocabKeys };
    list.key = listKey(list);
    return list;
  }

  function build(animals, rngOrSeed, opts) {
    var rng = toRng(rngOrSeed);
    var cands = candidates(pool(animals));
    if (!cands.length) return null;
    var avoid = opts && opts.avoid ? (typeof opts.avoid === 'string' ? opts.avoid : opts.avoid.key) : null;
    var list = draw(cands, rng);
    for (var tries = 0; avoid && list.key === avoid && tries < 30; tries++) list = draw(cands, rng);
    return list;
  }

  function generate(rngOrSeed, opts) { return build(SA.data.all('animals'), rngOrSeed, opts); }

  function newState(list) {
    return { list: list, ticked: list.entries.map(function () { return []; }) };
  }

  function tick(state, animal) {
    var a = resolve(animal);
    if (!state || !a) return null;
    var first = null;
    state.list.entries.forEach(function (e, i) {
      var ids = state.ticked[i];
      if (ids.length >= e.n || ids.indexOf(a.id) >= 0 || !matches(a, e)) return;
      ids.push(a.id);
      if (!first) first = e;
    });
    return first;
  }

  function progress(state) {
    return state.list.entries.map(function (e, i) {
      var have = Math.min(e.n, state.ticked[i].length);
      return { entry: e, have: have, need: e.n, done: have >= e.n };
    });
  }

  function isDone(state) { return !!state && progress(state).every(function (p) { return p.done; }); }

  SA.census = { TRAITS: TRAITS, MAX_N: MAX_N, makeRng: makeRng, numberWord: numberWord, agree: agree, matches: matches,
    pool: pool, candidates: candidates, build: build, generate: generate, newState: newState, tick: tick, progress: progress,
    isDone: isDone };
})(typeof window !== 'undefined' ? window : globalThis);
