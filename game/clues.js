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
 *     Single-fact clues (partAdjective, trait) may be satisfied by SEVERAL animals ("the one that swims" = duck AND turtle):
 *     clue.answerIds lists them all (in play), clue.answer.animalId is one of them (rotated by the rng so the
 *     silhouette hint does not always show the same animal), clue.match is the data to test any animal against.
 *   SA.clues.matches(clue, animal) -> boolean   pure: does this animal (object or id) satisfy the clue? clue.match is a
 *     list of facts that must ALL hold: { kind: 'trait', trait, value } | { kind: 'length', part, min?, max? } |
 *     { kind: 'count', part, count } | { kind: 'biome', id } | { kind: 'part', part }.
 *     A clue without `match` (hand-made) only accepts its answer.animalId.
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

  function matchesFact(f, animal) {
    if (!f || !animal) return false;
    switch (f.kind) {
      case 'trait': {
        var t = animal.traits;
        if (!t) return false;
        return t[f.trait] === f.value || (f.trait === 'movement' && Array.isArray(t.alsoMoves) && t.alsoMoves.indexOf(f.value) >= 0);
      }
      case 'length': return !!animal.parts && matchesLength(animal, f.part, f);
      case 'count': { var e = animal.parts && partEntry(animal, f.part); return !!e && e.count === f.count; }
      case 'biome': return animal.biome === f.id;
      case 'part': return !!animal.parts && !!partEntry(animal, f.part);
      default: return false;
    }
  }

  /** Does `animal` (object or id) satisfy `clue`? Every fact in clue.match must hold. */
  function matches(clue, animal) {
    if (typeof animal === 'string') animal = SA.data.get('animals', animal);
    if (!clue || !animal) return false;
    if (!Array.isArray(clue.match) || !clue.match.length) return !!clue.answer && clue.answer.animalId === animal.id;
    return clue.match.every(function (f) { return matchesFact(f, animal); });
  }

  // Keep the clue when at least one animal in play satisfies it (`unique`: exactly one, for touchPart/Care clues).
  function consider(out, animals, clue, match, unique) {
    var hits = animals.filter(function (a) { return matches({ match: match }, a); });
    if (unique ? hits.length !== 1 : hits.length < 1) return;
    clue.match = match;
    clue.answer = { animalId: hits[0].id };
    clue.answerIds = hits.map(function (a) { return a.id; });
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
        }, [{ kind: 'trait', trait: t.trait, value: v }]);
      });
    } else if (t.type === 'touchPart') {
      t.parts.forEach(function (k) {
        consider(out, animals, {
          key: t.id + ':' + k, templateId: t.id, type: t.type, part: k, text: t.lead.es + ' ' + partOf(k).label.es,
          vocabKeys: [t.lead.key, 'part:' + k]
        }, [{ kind: 'part', part: k }], true);
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
          }, [{ kind: 'length', part: k, min: adj.min, max: adj.max }]);
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
    var at = Math.min(pool.length - 1, Math.floor(r * pool.length));
    var clue = pool[at], ids = clue.answerIds;
    if (ids && ids.length > 1) {      // several animals fit: the rng's leftover fraction picks the one the hint shows
      var frac = Math.max(0, r * pool.length - at);
      var answer = { animalId: ids[Math.min(ids.length - 1, Math.floor(frac * ids.length))] };
      if (clue.answer && clue.answer.part) answer.part = clue.answer.part;
      clue = Object.assign({}, clue, { answer: answer });
    }
    return clue;
  }

  function remember(state, clue) {
    state.recent = (state.recent || []).concat(clue.key).slice(-RECENT_LIMIT);
    return state;
  }

  SA.clues = { RECENT_LIMIT: RECENT_LIMIT, makeRng: makeRng, inflect: inflect, candidates: candidates,
    pickClue: pickClue, matches: matches, remember: remember, partEntry: partEntry, matchesLength: matchesLength, bareNoun: bareNoun };
})(typeof window !== 'undefined' ? window : globalThis);
