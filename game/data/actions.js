/* Tool actions: registers kind "actions" (SA.data). Pure data + validator; no THREE, no DOM.
 * Load after game/data/parts.js and before game/data/care.js (each care task names the action that does it).
 *
 * Action shape (JSON-serialisable):
 *   id         lowercase ASCII key
 *   item       what you hold to do it: an item id from game/data/items.js (cepillo, esponja, venda), "hands" (empty hands,
 *              Space/click/tap with nothing equipped) or "food" (any food item from the inventory; it is used up)
 *   parts      part keys it works on ([] for feeding: the animal as a whole)
 *   verb       { es: 'cepillar', imperative: 'Cepilla' }  infinitive and the imperative used in task prompts
 *   reaction   how the animal answers a right action (one of SA.parts.REACTIONS)
 *   sfx        procedural sound (SA.audio.NAMES) played on each right action
 * A wrong tool or part never costs anything: SA.care answers { status: 'wrong', reason: 'tool' | 'part' } and the flow plays a
 * funny reaction plus the Spanish names of the tool and the part.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;

  var SFX = ['chime', 'boing', 'pop', 'splash', 'giggle', 'sparkle'];
  var MUDDY = ['patas', 'caparazon', 'cola', 'alas', 'pico', 'orejas'];

  function itemKnown(id) {
    try { return !!SA.data.get('items', id); } catch (e) { return true; }     // items not loaded (unit tests): checked elsewhere
  }

  function validateAction(a) {
    if (!/^[a-z]+$/.test(a.id)) fail('id', 'must be lowercase ASCII letters');
    if (typeof a.item !== 'string' || !a.item) fail('item', 'must be an item id, "hands" or "food"');
    if (a.item !== 'hands' && a.item !== 'food' && !itemKnown(a.item)) fail('item', 'unknown item ' + JSON.stringify(a.item));
    if (!Array.isArray(a.parts)) fail('parts', 'must be an array of part keys');
    a.parts.forEach(function (k, i) {
      if (!SA.data.get('parts', k)) fail('parts[' + i + ']', 'unknown part ' + JSON.stringify(k));
    });
    if (a.item !== 'food' && !a.parts.length) fail('parts', 'a tool action needs at least one part');
    if (!a.verb || typeof a.verb.es !== 'string' || !/^[a-zñáéíóú ]+(ar|er|ir)( [a-z ]+)?$/.test(a.verb.es)) fail('verb.es', 'must be a Spanish infinitive');
    if (typeof a.verb.imperative !== 'string' || !/^[A-ZÁÉÍÓÚ]/.test(a.verb.imperative)) fail('verb.imperative', 'must be a capitalised imperative');
    if (SA.parts.REACTIONS.indexOf(a.reaction) < 0) fail('reaction', 'must be one of ' + SA.parts.REACTIONS.join(', '));
    if (SFX.indexOf(a.sfx) < 0) fail('sfx', 'must be one of ' + SFX.join(', '));
    if (SA.audio && SA.audio.NAMES && SA.audio.NAMES.indexOf(a.sfx) < 0) fail('sfx', 'unknown audio effect ' + JSON.stringify(a.sfx));
  }

  SA.actions = {
    MUDDY: MUDDY,
    // Does what the player holds (an item id, or nothing = hands) do this action? food items fit the "food" action.
    fits: function (action, itemId) {
      if (action.item === 'hands') return !itemId;
      if (action.item === 'food') return !!itemId && !!SA.data.get('foods', itemId);
      return itemId === action.item;
    }
  };

  SA.data.defineKind('actions', validateAction);
  SA.data.register('actions', [
    { id: 'cepillar', item: 'cepillo', parts: ['pelo'], verb: { es: 'cepillar', imperative: 'Cepilla' }, reaction: 'wiggle', sfx: 'sparkle' },
    { id: 'lavar', item: 'esponja', parts: MUDDY.concat('pelo'), verb: { es: 'lavar', imperative: 'Lava' }, reaction: 'wobble', sfx: 'splash' },
    { id: 'curar', item: 'venda', parts: MUDDY, verb: { es: 'curar', imperative: 'Cura' }, reaction: 'nod', sfx: 'pop' },
    { id: 'acariciar', item: 'hands', parts: ['barriga'], verb: { es: 'acariciar', imperative: 'Acaricia' }, reaction: 'boing', sfx: 'giggle' },
    { id: 'alimentar', item: 'food', parts: [], verb: { es: 'dar de comer', imperative: 'Dale' }, reaction: 'boing', sfx: 'pop' }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
