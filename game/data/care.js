/* Care tasks: registers kind "careTasks" (SA.data). Pure data + validator; no THREE.
 *
 * Task shape (JSON-serialisable):
 *   id, kind    'limpiar' (wash the muddy part with the sponge), 'curar' (tap the scraped part: bandage), 'cepillar' (brush
 *               el pelo), 'acariciar' (rub la barriga with empty hands), 'desenredar' (tug a stuck leaf off a wing), 'espina' (pull a thorn out of a paw), 'barro' (tug an animal out of a mud puddle) or 'alimentar' (feed with counts; has its own
 *               fields, see the entry below, and needs game/data/foods.js)
 *   action      id from game/data/actions.js: the tool (item) and verb that do it; parts must be ones the action works on;
 *               the prompt starts with the action's imperative ("Lava las patas", "Cepilla el pelo")
 *   parts       part keys that may get muddy (the animal must actually have one of them)
 *   prompt      short Spanish prompt; "{part}" becomes the part's label with its article ("las patas")
 *   rubs        rubs/taps on the muddy part needed to finish
 *   spotsPerRub mud spots drawn per rub (each rub washes this many away)
 *   chance      0..1 probability that a care task follows a correct Scout & Spot pick
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;

  var KINDS = ['limpiar', 'curar', 'cepillar', 'acariciar', 'desenredar', 'espina', 'barro', 'alimentar'];

  function validateCareTask(t) {
    if (KINDS.indexOf(t.kind) < 0) fail('kind', 'must be one of ' + KINDS.join(', ') + ' (got ' + JSON.stringify(t.kind) + ')');
    if (typeof t.chance !== 'number' || t.chance < 0 || t.chance > 1) fail('chance', 'must be a number from 0 to 1');
    var action = SA.data.get('actions', t.action);
    if (!action) fail('action', 'unknown action ' + JSON.stringify(t.action) + ' (see game/data/actions.js)');
    if (t.kind === 'alimentar') {
      if (action.item !== 'food') fail('action', 'a feed task needs the "food" action');
      return validateFeed(t);
    }
    if (action.item === 'food') fail('action', 'only a feed task uses the "food" action');
    if (!Array.isArray(t.parts) || !t.parts.length) fail('parts', 'must be a non-empty array of part keys');
    t.parts.forEach(function (k, i) {
      if (!SA.data.get('parts', k)) fail('parts[' + i + ']', 'unknown part ' + JSON.stringify(k));
      if (action.parts.indexOf(k) < 0) fail('parts[' + i + ']', 'action ' + action.id + ' does not work on ' + k);
    });
    if (typeof t.prompt !== 'string' || t.prompt.indexOf('{part}') < 0) fail('prompt', 'must contain "{part}"');
    if (t.prompt.indexOf(action.verb.imperative + ' ') !== 0) fail('prompt', 'must start with the action verb "' + action.verb.imperative + '"');
    if (!Number.isInteger(t.rubs) || t.rubs < 1 || t.rubs > 10) fail('rubs', 'must be an integer from 1 to 10');
    if (t.kind === 'curar' && t.rubs !== 1) fail('rubs', 'a heal task is one tap on the part (rubs must be 1)');
    if (!Number.isInteger(t.spotsPerRub) || t.spotsPerRub < 1 || t.spotsPerRub > 4) fail('spotsPerRub', 'must be an integer from 1 to 4');
  }

  function validateFeed(t) {
    ['{count}', '{food}', '{animal}'].forEach(function (k) {
      if (typeof t.prompt !== 'string' || t.prompt.indexOf(k) < 0) fail('prompt', 'must contain "' + k + '"');
    });
    if (t.prompt.indexOf('{count} {food}') < 0) fail('prompt', 'must contain "{count} {food}" together');
    ['minCount', 'maxCount', 'easyMax'].forEach(function (f) {
      if (!Number.isInteger(t[f]) || t[f] < 1 || t[f] > 5) fail(f, 'must be an integer from 1 to 5');
    });
    if (t.minCount > t.easyMax || t.easyMax > t.maxCount) fail('easyMax', 'must be between minCount and maxCount');
    if (!Number.isInteger(t.challengeMax) || t.challengeMax < t.maxCount || t.challengeMax > 10) fail('challengeMax', 'must be an integer from maxCount to 10');
    if (!Number.isInteger(t.pairMax) || t.pairMax < t.minCount || t.pairMax > 5) fail('pairMax', 'must be an integer from minCount to 5');
    if (typeof t.pairChance !== 'number' || t.pairChance < 0 || t.pairChance > 1) fail('pairChance', 'must be a number from 0 to 1');
    ['trayMatching', 'trayOther'].forEach(function (f) {
      if (!Number.isInteger(t[f]) || t[f] < 0 || t[f] > 4) fail(f, 'must be an integer from 0 to 4');
    });
  }

  SA.data.defineKind('careTasks', validateCareTask);
  SA.data.register('careTasks', [
    // `action` names the tool action (game/data/actions.js) that does the task: the right item on the right part progresses it.
    { id: 'limpiar', kind: 'limpiar', action: 'lavar', prompt: 'Lava {part}', rubs: 3, spotsPerRub: 2, chance: 0.5,
      parts: ['patas', 'caparazon', 'cola', 'alas', 'pico', 'orejas'] },
    { id: 'curar', kind: 'curar', action: 'curar', prompt: 'Cura {part}', rubs: 1, spotsPerRub: 2, chance: 0.5,
      parts: ['patas', 'caparazon', 'cola', 'alas', 'pico', 'orejas'] },
    { id: 'cepillar', kind: 'cepillar', action: 'cepillar', prompt: 'Cepilla {part}', rubs: 3, spotsPerRub: 2, chance: 0.5,
      parts: ['pelo'] },
    { id: 'acariciar', kind: 'acariciar', action: 'acariciar', prompt: 'Acaricia {part}', rubs: 3, spotsPerRub: 1, chance: 0.5,
      parts: ['barriga'] },
    // Tangled wing: a leaf is stuck on one of the bird's alas; a few tugs (Space on the wing, empty hands) pull it off.
    { id: 'desenredar', kind: 'desenredar', action: 'desenredar', prompt: 'Quita la hoja de {part}', rubs: 3, spotsPerRub: 1, chance: 0.5,
      parts: ['alas'] },
    // Thorn in a paw: the animal limps; two tugs (Space on the paw, empty hands) pull the thorn out.
    { id: 'quitarespina', kind: 'espina', action: 'quitarespina', prompt: 'Quita la espina de {part}', rubs: 2, spotsPerRub: 1, chance: 0.5,
      parts: ['patas'] },
    // Stuck in mud: the animal sits sunk in a puddle; three tugs (Space on the paws, empty hands) pull it out.
    { id: 'sacardelbarro', kind: 'barro', action: 'sacardelbarro', prompt: 'Saca {part} del barro', rubs: 3, spotsPerRub: 1, chance: 0.5,
      parts: ['patas'] },
    // Feed: {count} is a number word (una/un for 1), {food} the plural noun, {animal} "al conejo" / "a la tortuga".
    // minCount..easyMax counts at scaffold level 1, minCount..maxCount from level 2. The tray holds the asked food,
    // trayMatching other foods the animal eats and trayOther foods it does not eat. Challenge level (scaffold 3+) counts
    // minCount..challengeMax, and with chance pairChance asks for two different foods ("dos fresas y una zanahoria"),
    // each minCount..pairMax.
    { id: 'alimentar', kind: 'alimentar', action: 'alimentar', prompt: 'Dale {count} {food} {animal}', chance: 0.5,
      minCount: 1, easyMax: 3, maxCount: 5, challengeMax: 8, pairMax: 4, pairChance: 0.5, trayMatching: 1, trayOther: 2 }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
