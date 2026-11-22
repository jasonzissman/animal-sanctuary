/* Items: registers kind "items" (SA.data) plus a vocab entry "item:<id>" for each. Pure data; no THREE, no DOM.
 * Load after game/data/vocab.js and game/data/foods.js. Used by game/inventory.js.
 *
 * Item shape (JSON-serialisable):
 *   id         lowercase ASCII key; food items reuse the id from game/data/foods.js
 *   name       { es: 'la cámara' (article + accents), en: 'camera' }
 *   gender     'm' | 'f' (must agree with the article in name.es)
 *   icon       emoji shown on the hotbar
 *   kind       'tool' (starting kit, used on animals), 'food' (fed to animals) or 'find' (collected while exploring)
 *   stackable  true: you can hold many (count); false: you hold at most one
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;

  var KINDS = ['tool', 'food', 'find'];

  function validateItem(it) {
    if (!/^[a-z]+$/.test(it.id)) fail('id', 'must be lowercase ASCII letters');
    if (!it.name || typeof it.name.es !== 'string' || !/^(el|la|los|las) \S/.test(it.name.es)) fail('name.es', 'must start with an article (el/la/los/las)');
    if (typeof it.name.en !== 'string' || !it.name.en.trim()) fail('name.en', 'must be a non-empty string');
    if (it.gender !== 'm' && it.gender !== 'f') fail('gender', 'must be "m" or "f"');
    if ((it.gender === 'm') !== /^(el|los) /.test(it.name.es)) fail('gender', 'must agree with the article in name.es');
    if (typeof it.icon !== 'string' || !it.icon) fail('icon', 'must be an emoji string');
    if (KINDS.indexOf(it.kind) < 0) fail('kind', 'must be one of ' + KINDS.join(', '));
    if (typeof it.stackable !== 'boolean') fail('stackable', 'must be true or false');
    if (it.kind === 'tool' && it.stackable) fail('stackable', 'tools are not stackable');
    if (it.kind === 'food' && !SA.data.get('foods', it.id)) fail('id', 'food items must reuse a foods.js id');
  }

  function item(id, icon, es, en, gender, kind, stackable) {
    return { id: id, icon: icon, name: { es: es, en: en }, gender: gender, kind: kind, stackable: stackable };
  }

  var items = [
    item('camara', '📷', 'la cámara', 'camera', 'f', 'tool', false),
    item('cepillo', '🪮', 'el cepillo', 'brush', 'm', 'tool', false),
    item('esponja', '🧽', 'la esponja', 'sponge', 'f', 'tool', false),
    item('venda', '🩹', 'la venda', 'bandage', 'f', 'tool', false),
    item('platano', '🍌', 'el plátano', 'banana', 'm', 'food', true),
    item('fresa', '🍓', 'la fresa', 'strawberry', 'f', 'food', true),
    item('zanahoria', '🥕', 'la zanahoria', 'carrot', 'f', 'food', true),
    item('pez', '🐟', 'el pez', 'fish', 'm', 'food', true),
    item('roca', '🪨', 'la roca', 'rock', 'f', 'find', true)
  ];

  SA.data.defineKind('items', validateItem);
  SA.data.register('items', items);
  SA.data.register('vocab', items.map(function (it) {
    return { id: 'item:' + it.id, key: 'item:' + it.id, es: it.name.es, clip: null };
  }));
})(typeof window !== 'undefined' ? window : globalThis);
