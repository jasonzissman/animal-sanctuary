/* Encounter needs: registers kind "needs" (SA.data). Pure data + validator; no THREE, no DOM.
 * Load after game/data/actions.js, game/data/care.js and game/data/vocab.js. Used by game/encounters.js (AS-0179).
 *
 * A need is a small help an animal asks for as you pass. It reuses an existing care task/action; nothing here is per animal.
 *   id       lowercase ASCII key
 *   care     id of the care task (game/data/care.js) that fixes it; its action is the tool/verb
 *   icon     emoji floating over the animal while it waits
 *   hint     spoken after the animal's own vocab key ('animal:pato'): { m, f } vocab keys of the predicate agreeing with the
 *            animal's gender (the same key twice when it does not change). "el pato" + "tiene hambre" = "el pato tiene hambre"
 *   word     optional badge word the rescue log records as `need` ('thorn', 'mud', 'hungry', 'tangled'; game/data/badges.js); default the id
 *   part     optional part key the animal must have (the wing for a tangled leaf)
 *   eats     optional true: only animals whose diet has a food (a carnivore is never "hungry")
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;

  function validateNeed(n) {
    if (!/^[a-z]+$/.test(n.id)) fail('id', 'must be lowercase ASCII letters');
    if (!SA.data.get('careTasks', n.care)) fail('care', 'unknown care task ' + JSON.stringify(n.care));
    if (typeof n.icon !== 'string' || !n.icon) fail('icon', 'must be an emoji string');
    if (!n.hint || ['m', 'f'].some(function (g) { return !SA.vocab.get(n.hint[g]); })) fail('hint', 'needs vocab keys { m, f }');
    if (n.word !== undefined && !/^[a-z][a-z0-9-]*$/.test(n.word)) fail('word', 'must be a lowercase word');
    if (n.part !== undefined && !SA.data.get('parts', n.part)) fail('part', 'unknown part ' + JSON.stringify(n.part));
    if (n.eats !== undefined && n.eats !== true) fail('eats', 'must be true when present');
  }

  SA.data.defineKind('needs', validateNeed);
  SA.data.register('needs', [
    { id: 'hambre', word: 'hungry', care: 'alimentar', icon: '🍓', eats: true, hint: { m: 'phrase:tienehambre', f: 'phrase:tienehambre' } },
    { id: 'espina', word: 'thorn', care: 'quitarespina', icon: '🌵', part: 'patas', hint: { m: 'phrase:tieneespina', f: 'phrase:tieneespina' } },
    { id: 'barro', word: 'mud', care: 'sacardelbarro', icon: '💧', part: 'patas', hint: { m: 'phrase:atascadom', f: 'phrase:atascadaf' } },
    { id: 'hoja', word: 'tangled', care: 'desenredar', icon: '🍃', part: 'alas', hint: { m: 'phrase:tienehoja', f: 'phrase:tienehoja' } },
    { id: 'susto', word: 'scared', care: 'acariciar', icon: '😨', part: 'barriga', hint: { m: 'phrase:asustadom', f: 'phrase:asustadaf' } }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
