/* SA.clues: pure clue engine (no THREE, no DOM). Turns kind "clueTemplates" (game/data/clues.js) into concrete
 * Spanish clues whose adjectives agree with the noun, and picks one that exactly one animal in play satisfies.
 *
 *   SA.clues.pickClue(state, rng) -> clue | null
 *     state = { animals: [animal object or id], recent: [clue keys], types?: ['partAdjective'|'trait'|'touchPart'] }
 *     rng   = function returning a number in [0, 1), e.g. SA.clues.makeRng(seed)   (same seed + state = same clue)
 *     clue  = { key, templateId, type, text: 'Busca el animal con orejas largas',
 *               answer: { animalId, part? }, vocabKeys: ['phrase:buscaanimalcon', 'part:orejas', 'adj:largas'] }
 *     Returns null when no unique clue is left that was not used recently (callers may then widen the animals).
 *     state.level (optional, 1..3): 2 and 3 give multi-trait clues from game/clue-levels.js (intermediate, challenge).
 *   SA.clues.remember(state, clue)   push clue.key onto state.recent, keeping only the last RECENT_LIMIT (3).
 *   SA.clues.inflect(adjective, gender, number)  adjective forms -> 'larga' etc.
 *   SA.clues.candidates(animals, types) every unique clue for those animals (before the recent filter).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var RECENT_LIMIT = 3;

  // Small deterministic PRNG (mulberry32).
  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function inflect(adjective, gender, number) {
    return adjective.forms[gender][number];
  }

  // Length of an animal part entry: its largest scale value.
  function lengthOf(entry) {
    var s = entry.scale;
    return Array.isArray(s) ? Math.max.apply(null, s) : s;
  }

  function partEntry(animal, partKey) {
    for (var i = 0; i < animal.parts.length; i++) if (animal.parts[i].part === partKey) return animal.parts[i];
    return null;
  }

  function matchesLength(animal, partKey, adj) {
    var e = partEntry(animal, partKey);
    if (!e) return false;
    var len = lengthOf(e);
    return (adj.min === undefined || len >= adj.min) && (adj.max === undefined || len <= adj.max);
  }

  // The part noun without its article: 'las orejas' -> 'orejas' (used after "con").
  function bareNoun(part) { return part.label.es.split(' ').slice(1).join(' '); }

  // Text and vocab key of a size/colour trait value agreeing with the noun the template declares (t.gender 'm'|'f',
  // t.number 'sg'|'pl', default m/sg). Masculine singular keeps the base key ('color:verde'); other forms use
  // SA.vocab.adjKey ('adj:verdes'). Falls back to the base word/key when adjKey is missing or has no form.
  function agreeTrait(t, value) {
    var base = { text: value, key: t.trait + ':' + value };
    var g = t.gender || 'm', n = t.number || 'sg';
    if ((t.trait !== 'size' && t.trait !== 'color') || (g === 'm' && n === 'sg')) return base;
    var vocab = SA.vocab;
    var key = vocab && typeof vocab.adjKey === 'function' ? vocab.adjKey(value, g, n) : null;
    if (!key) return base;
    var entry = typeof vocab.get === 'function' ? vocab.get(key) : null;
    return { text: entry ? entry.es : key.slice(4), key: key };
  }

  function resolve(animals) {
    return (animals || []).map(function (a) { return typeof a === 'string' ? SA.data.get('animals', a) : a; })
      .filter(function (a) { return a && a.parts; });
  }

  // Keep the clue only when exactly one animal in play satisfies it.
  function consider(out, animals, clue, test) {
    var hits = animals.filter(test);
    if (hits.length !== 1) return;
    clue.answer = { animalId: hits[0].id };
    if (clue.part) clue.answer.part = clue.part;
    delete clue.part;
    out.push(clue);
  }

  function fromTemplate(t, animals, out) {
    var partOf = function (k) { return SA.data.get('parts', k); };
    if (t.type === 'trait') {
      t.values.forEach(function (v) {
        var agreed = agreeTrait(t, v);
        consider(out, animals, {
          key: t.id + ':' + v, templateId: t.id, type: t.type, text: t.lead.es + ' ' + agreed.text,
          vocabKeys: [t.lead.key, agreed.key]
        }, function (a) { return a.traits[t.trait] === v; });
      });
    } else if (t.type === 'touchPart') {
      t.parts.forEach(function (k) {
        consider(out, animals, {
          key: t.id + ':' + k, templateId: t.id, type: t.type, part: k, text: t.lead.es + ' ' + partOf(k).label.es,
          vocabKeys: [t.lead.key, 'part:' + k]
        }, function (a) { return !!partEntry(a, k); });
      });
    } else {
      t.parts.forEach(function (k) {
        var part = partOf(k);
        t.adjectives.forEach(function (adj) {
          var word = inflect(adj, part.gender, part.number);
          consider(out, animals, {
            key: t.id + ':' + k + ':' + adj.id, templateId: t.id, type: t.type, part: k,
            text: t.lead.es + ' ' + bareNoun(part) + ' ' + word,
            vocabKeys: [t.lead.key, 'part:' + k, 'adj:' + word]
          }, function (a) { return matchesLength(a, k, adj); });
        });
      });
    }
  }

  function candidates(animals, types) {
    var list = resolve(animals), out = [];
    if (!list.length) return out;
    SA.data.all('clueTemplates').forEach(function (t) {
      if (!types || types.indexOf(t.type) >= 0) fromTemplate(t, list, out);
    });
    return out;
  }

  function pickClue(state, rng) {
    state = state || {};
    var recent = state.recent || [];
    var fresh = function (c) { return recent.indexOf(c.key) < 0; };
    var pool = [];
    if (state.level >= 2 && SA.clues.leveled) pool = SA.clues.leveled(resolve(state.animals), Math.min(3, state.level)).filter(fresh);
    if (!pool.length) pool = candidates(state.animals, state.types).filter(fresh);   // beginner clues are the fallback
    if (!pool.length) return null;
    var r = typeof rng === 'function' ? rng() : 0;
    return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];
  }

  function remember(state, clue) {
    state.recent = (state.recent || []).concat(clue.key).slice(-RECENT_LIMIT);
    return state;
  }

  SA.clues = { RECENT_LIMIT: RECENT_LIMIT, makeRng: makeRng, inflect: inflect, candidates: candidates,
    pickClue: pickClue, remember: remember, partEntry: partEntry, matchesLength: matchesLength, bareNoun: bareNoun };
})(typeof window !== 'undefined' ? window : globalThis);
