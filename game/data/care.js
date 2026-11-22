/* Care tasks: registers kind "careTasks" (SA.data). Pure data + validator; no THREE.
 *
 * Task shape (JSON-serialisable):
 *   id, kind    'limpiar' (clean the muddy part), 'curar' (tap the scraped part: bandage) or 'alimentar' (feed with counts;
 *               has its own fields, see the entry below, and needs game/data/foods.js)
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

  var KINDS = ['limpiar', 'curar', 'alimentar'];

  function validateCareTask(t) {
    if (KINDS.indexOf(t.kind) < 0) fail('kind', 'must be one of ' + KINDS.join(', ') + ' (got ' + JSON.stringify(t.kind) + ')');
    if (typeof t.chance !== 'number' || t.chance < 0 || t.chance > 1) fail('chance', 'must be a number from 0 to 1');
    if (t.kind === 'alimentar') return validateFeed(t);
    if (!Array.isArray(t.parts) || !t.parts.length) fail('parts', 'must be a non-empty array of part keys');
    t.parts.forEach(function (k, i) {
      if (!SA.data.get('parts', k)) fail('parts[' + i + ']', 'unknown part ' + JSON.stringify(k));
    });
    if (typeof t.prompt !== 'string' || t.prompt.indexOf('{part}') < 0) fail('prompt', 'must contain "{part}"');
    if (!Number.isInteger(t.rubs) || t.rubs < 1 || t.rubs > 10) fail('rubs', 'must be an integer from 1 to 10');
    if (t.kind === 'curar' && t.rubs !== 1) fail('rubs', 'a heal task is one tap on the part (rubs must be 1)');
    if (!Number.isInteger(t.spotsPerRub) || t.spotsPerRub < 1 || t.spotsPerRub > 4) fail('spotsPerRub', 'must be an integer from 1 to 4');
  }

  function validateFeed(t) {
    ['{count}', '{food}', '{animal}'].forEach(function (k) {
      if (typeof t.prompt !== 'string' || t.prompt.indexOf(k) < 0) fail('prompt', 'must contain "' + k + '"');
    });
    ['minCount', 'maxCount', 'easyMax'].forEach(function (f) {
      if (!Number.isInteger(t[f]) || t[f] < 1 || t[f] > 5) fail(f, 'must be an integer from 1 to 5');
    });
    if (t.minCount > t.easyMax || t.easyMax > t.maxCount) fail('easyMax', 'must be between minCount and maxCount');
    ['trayMatching', 'trayOther'].forEach(function (f) {
      if (!Number.isInteger(t[f]) || t[f] < 0 || t[f] > 4) fail(f, 'must be an integer from 0 to 4');
    });
  }

  SA.data.defineKind('careTasks', validateCareTask);
  SA.data.register('careTasks', [
    { id: 'limpiar', kind: 'limpiar', prompt: 'Limpia {part}', rubs: 3, spotsPerRub: 2, chance: 0.5,
      parts: ['patas', 'caparazon', 'cola', 'alas', 'pico', 'orejas'] },
    { id: 'curar', kind: 'curar', prompt: 'Cura {part}', rubs: 1, spotsPerRub: 2, chance: 0.5,
      parts: ['patas', 'caparazon', 'cola', 'alas', 'pico', 'orejas'] },
    // Feed: {count} is a number word (una/un for 1), {food} the plural noun, {animal} "al conejo" / "a la tortuga".
    // minCount..easyMax counts at scaffold level 1, minCount..maxCount from level 2. The tray holds the asked food,
    // trayMatching other foods the animal eats and trayOther foods it does not eat.
    { id: 'alimentar', kind: 'alimentar', prompt: 'Dale {count} {food} {animal}', chance: 0.5,
      minCount: 1, easyMax: 3, maxCount: 5, trayMatching: 1, trayOther: 2 }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
