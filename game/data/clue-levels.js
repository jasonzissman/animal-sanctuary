/* Clue levels: registers kind "clueLevels" (SA.data) plus the vocab for the multi-trait phrases they speak.
 * Pure data + validator; no THREE. Needs kinds "parts", "vocab" and "clueTemplates" (game/data/clues.js) first.
 * game/clue-levels.js turns these into concrete Spanish clues from the animals' own data.
 *
 * Entry shape (JSON-serialisable):
 *   id, level    1..3 (1 beginner uses the single-fact clueTemplates; 2 and 3 are generated here)
 *   lead         { key, es } phrase before the facts ("Toca el animal con")
 *   dwell        { key, es } habitat verb phrase ("vive en"), spoken before the biome name
 *   facts        [min, max] number of facts in the clue
 *   partsOnly    true: only body-part facts (no habitat / movement), as in "Toca el animal con ..."
 *   needsCount  true: at least one "dos alas"-style count fact is required
 *   minimal      true: every fact is needed (no single fact, nor any pair, already identifies the animal)
 *   and          { key, es } the joiner ("y")
 * Intermediate: "Tiene cola larga, cuatro patas y vive en la selva".  Challenge: "Toca el animal con dos alas y pico largo".
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;

  function phrase(p, field) {
    if (!p || typeof p.key !== 'string' || typeof p.es !== 'string' || !p.es.trim()) fail(field, 'must be { key, es }');
  }

  function validateLevel(l) {
    if (!Number.isInteger(l.level) || l.level < 2 || l.level > 3) fail('level', 'must be 2 or 3');
    phrase(l.lead, 'lead');
    phrase(l.and, 'and');
    phrase(l.dwell, 'dwell');
    if (typeof l.partsOnly !== 'boolean') fail('partsOnly', 'must be true or false');
    if (!Array.isArray(l.facts) || l.facts.length !== 2 || !(l.facts[0] >= 2) || l.facts[1] < l.facts[0]) {
      fail('facts', 'must be [min, max] with 2 <= min <= max');
    }
    if (typeof l.needsCount !== 'boolean') fail('needsCount', 'must be true or false');
    if (typeof l.minimal !== 'boolean') fail('minimal', 'must be true or false');
  }

  SA.data.defineKind('clueLevels', validateLevel);

  var and = { key: 'phrase:y', es: 'y' };
  var dwell = { key: 'phrase:viveen', es: 'vive en' };
  var levels = [
    { id: 'intermediate', level: 2, lead: { key: 'phrase:tiene', es: 'Tiene' }, and: and, dwell: dwell,
      facts: [2, 3], partsOnly: false, needsCount: false, minimal: false },
    { id: 'challenge', level: 3, lead: { key: 'phrase:tocaanimalcon', es: 'Toca el animal con' }, and: and, dwell: dwell, facts: [2, 3], partsOnly: true, needsCount: true, minimal: true }
  ];
  SA.data.register('clueLevels', levels);

  var seen = {};
  var vocab = [];
  function addVocab(p) {
    if (seen[p.key] || SA.data.get('vocab', p.key)) return;
    seen[p.key] = true;
    vocab.push({ id: p.key, key: p.key, es: p.es, clip: null });
  }
  levels.forEach(function (l) { addVocab(l.lead); addVocab(l.and); addVocab(l.dwell); });
  SA.data.register('vocab', vocab);
})(typeof window !== 'undefined' ? window : globalThis);
