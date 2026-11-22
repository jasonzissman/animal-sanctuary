/* Care tasks: registers kind "careTasks" (SA.data). Pure data + validator; no THREE.
 *
 * Task shape (JSON-serialisable):
 *   id, kind    'limpiar' (clean the muddy part); more kinds (heal, feed) come in later tickets
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

  function validateCareTask(t) {
    if (t.kind !== 'limpiar') fail('kind', 'must be "limpiar" (got ' + JSON.stringify(t.kind) + ')');
    if (!Array.isArray(t.parts) || !t.parts.length) fail('parts', 'must be a non-empty array of part keys');
    t.parts.forEach(function (k, i) {
      if (!SA.data.get('parts', k)) fail('parts[' + i + ']', 'unknown part ' + JSON.stringify(k));
    });
    if (typeof t.prompt !== 'string' || t.prompt.indexOf('{part}') < 0) fail('prompt', 'must contain "{part}"');
    if (!Number.isInteger(t.rubs) || t.rubs < 1 || t.rubs > 10) fail('rubs', 'must be an integer from 1 to 10');
    if (!Number.isInteger(t.spotsPerRub) || t.spotsPerRub < 1 || t.spotsPerRub > 4) fail('spotsPerRub', 'must be an integer from 1 to 4');
    if (typeof t.chance !== 'number' || t.chance < 0 || t.chance > 1) fail('chance', 'must be a number from 0 to 1');
  }

  SA.data.defineKind('careTasks', validateCareTask);
  SA.data.register('careTasks', [
    { id: 'limpiar', kind: 'limpiar', prompt: 'Limpia {part}', rubs: 3, spotsPerRub: 2, chance: 0.5,
      parts: ['patas', 'caparazon', 'cola', 'alas', 'pico', 'orejas'] },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
