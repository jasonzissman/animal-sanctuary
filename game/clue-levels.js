/* SA.clues.leveled: multi-trait clues for the intermediate and challenge levels (pure; no THREE, no DOM).
 * Loaded after game/clues.js and game/data/clue-levels.js.
 *
 *   SA.clues.leveled(animals, level) -> [clue]   every clue for that level (2 or 3) that exactly one animal satisfies:
 *     { key, templateId, type: 'multiTrait', text: 'Tiene cola larga, cuatro patas y vive en la selva',
 *       answer: { animalId }, vocabKeys: [...] }          (same shape as the single-fact clues of SA.clues.pickClue)
 *   SA.clues.pickClue(state, rng) uses it when state.level >= 2 and falls back to the beginner clues when empty.
 *   SA.clues.join(items) -> 'a', 'a y b', 'a, b y c'
 *
 * A "fact" is one thing an animal satisfies: a part length ("cola larga"), a part count ("dos alas"), its habitat
 * ("vive en la selva") or its movement ("vuela"). Adjectives agree with the part noun (orejas largas, pico corto).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var C = SA.clues;

  function join(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
  }

  function lowerFirst(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

  function numberWord(n) {
    var v = SA.data.get('vocab', 'number:' + n);
    return v ? v.es : null;
  }

  // Facts one animal satisfies. Each: { id, group: 'part'|'verb', part?, count?, text, vocabKeys, test(animal) }.
  function factsOf(animal, lvl, adjectives) {
    var out = [];
    animal.parts.forEach(function (e) {
      var part = SA.data.get('parts', e.part);
      if (!part || e.part === 'cuerpo') return;
      var noun = C.bareNoun(part);
      adjectives.forEach(function (t) {
        if (t.parts.indexOf(e.part) < 0) return;
        t.adjectives.forEach(function (adj) {
          if (!C.matchesLength(animal, e.part, adj)) return;
          var word = C.inflect(adj, part.gender, part.number);
          out.push({ id: 'len:' + e.part + ':' + adj.id, group: 'part', part: e.part, text: noun + ' ' + word,
            vocabKeys: ['part:' + e.part, 'adj:' + word],
            m: { kind: 'length', part: e.part, min: adj.min, max: adj.max },
            test: function (a) { return C.matchesLength(a, e.part, adj); } });
        });
      });
      var word = numberWord(e.count);
      if (e.count >= 2 && part.number === 'pl' && word) {
        out.push({ id: 'cnt:' + e.part + ':' + e.count, group: 'part', part: e.part, count: true, text: word + ' ' + noun,
          vocabKeys: ['number:' + e.count, 'part:' + e.part],
          m: { kind: 'count', part: e.part, count: e.count },
          test: function (a) { var x = C.partEntry(a, e.part); return !!x && x.count === e.count; } });
      }
    });
    if (lvl.partsOnly) return out;
    var biome = SA.data.get('biomes', animal.biome);
    if (biome) {
      out.push({ id: 'hab:' + biome.id, group: 'verb', text: lvl.dwell.es + ' ' + lowerFirst(biome.name.es),
        vocabKeys: [lvl.dwell.key, 'biome:' + biome.id],
        m: { kind: 'biome', id: biome.id }, test: function (a) { return a.biome === biome.id; } });
    }
    var mv = animal.traits.movement;
    out.push({ id: 'mov:' + mv, group: 'verb', text: mv, vocabKeys: ['movement:' + mv],
      m: { kind: 'trait', trait: 'movement', value: mv },
      test: function (a) { return C.matches({ match: [{ kind: 'trait', trait: 'movement', value: mv }] }, a); } });
    return out;
  }

  // Subsets of `list` with between min and max members, in list order.
  function subsets(list, min, max) {
    var out = [];
    (function walk(start, chosen) {
      if (chosen.length >= min) out.push(chosen);
      if (chosen.length === max) return;
      for (var i = start; i < list.length; i++) walk(i + 1, chosen.concat(list[i]));
    })(0, []);
    return out;
  }

  function hits(animals, facts) {
    return animals.filter(function (a) { return facts.every(function (f) { return f.test(a); }); }).length;
  }

  function validCombo(animals, lvl, combo) {
    var parts = {};
    for (var i = 0; i < combo.length; i++) {          // at most one fact per part
      var p = combo[i].part;
      if (p) { if (parts[p]) return false; parts[p] = true; }
    }
    if (!combo.some(function (f) { return f.group === 'part'; })) return false;
    if (lvl.needsCount && !combo.some(function (f) { return f.count; })) return false;
    if (hits(animals, combo) !== 1) return false;
    if (!lvl.minimal) return true;
    return combo.every(function (_, i) { return hits(animals, combo.filter(function (__, j) { return j !== i; })) > 1; });
  }

  function leveled(animals, level) {
    var list = (animals || []).map(function (a) { return typeof a === 'string' ? SA.data.get('animals', a) : a; })
      .filter(function (a) { return a && a.parts; });
    var lvl = SA.data.all('clueLevels').filter(function (l) { return l.level === level; })[0];
    if (!lvl || list.length < 2) return [];
    var adjectives = SA.data.all('clueTemplates').filter(function (t) { return t.type === 'partAdjective'; });
    var out = [];
    list.forEach(function (animal) {
      var facts = factsOf(animal, lvl, adjectives);
      subsets(facts, lvl.facts[0], lvl.facts[1]).forEach(function (combo) {
        if (!validCombo(list, lvl, combo)) return;
        var ordered = combo.filter(function (f) { return f.group === 'part'; })
          .concat(combo.filter(function (f) { return f.group === 'verb'; }));
        var keys = [lvl.lead.key];
        ordered.forEach(function (f, i) {
          if (i === ordered.length - 1 && i > 0) keys.push(lvl.and.key);
          keys = keys.concat(f.vocabKeys);
        });
        out.push({ key: lvl.id + ':' + animal.id + ':' + ordered.map(function (f) { return f.id; }).join('+'),
          templateId: lvl.id, type: 'multiTrait', text: lvl.lead.es + ' ' + join(ordered.map(function (f) { return f.text; })),
          answer: { animalId: animal.id }, answerIds: [animal.id], vocabKeys: keys,
          match: ordered.map(function (f) { return f.m; }) });
      });
    });
    return out;
  }

  C.leveled = leveled;
  C.join = join;
})(typeof window !== 'undefined' ? window : globalThis);
