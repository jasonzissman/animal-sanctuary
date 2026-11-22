/* Pickups: registers kind "pickups" (SA.data) plus a vocab entry "found:<item>" ("¡Un plátano!") for each collectable item.
 * Pure data; no THREE, no DOM. Load after game/data/items.js and game/map.js. Placement/respawn logic is game/pickups.js.
 *
 * Pickup rule shape (JSON-serialisable):
 *   id       unique key
 *   item     an id from game/data/items.js (what you get; it goes into SA.inventory)
 *   where    'ground' (on dry land), 'tree' (up in a tree canopy: climb to reach it) or 'water' (on the bank near water)
 *   biomes   biome ids (SA.map strips) the rule applies to
 *   count    how many of this pickup are scattered in each listed biome
 *   respawn  seconds until a collected one grows back in the same place
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;

  var WHERE = ['ground', 'tree', 'water'];

  function validatePickup(p) {
    if (!/^[a-z-]+$/.test(p.id)) fail('id', 'must be lowercase ASCII letters or "-"');
    if (!SA.data.get('items', p.item)) fail('item', 'unknown item ' + JSON.stringify(p.item));
    if (WHERE.indexOf(p.where) < 0) fail('where', 'must be one of ' + WHERE.join(', '));
    if (!Array.isArray(p.biomes) || !p.biomes.length) fail('biomes', 'must be a non-empty array');
    p.biomes.forEach(function (b, i) { if (!SA.map.biomeRange(b)) fail('biomes[' + i + ']', 'unknown biome ' + JSON.stringify(b)); });
    if (typeof p.count !== 'number' || p.count < 1 || p.count !== Math.floor(p.count)) fail('count', 'must be a whole number >= 1');
    if (typeof p.respawn !== 'number' || !(p.respawn > 0)) fail('respawn', 'must be a positive number of seconds');
  }

  function rule(id, item, where, biomes, count, respawn) {
    return { id: id, item: item, where: where, biomes: biomes, count: count, respawn: respawn };
  }

  var rules = [
    rule('platano-arbol', 'platano', 'tree', ['selva'], 4, 60),
    rule('fresa-arbol', 'fresa', 'tree', ['bosque'], 3, 60),
    rule('roca-suelo', 'roca', 'ground', ['bosque', 'montana', 'desierto'], 3, 45),
    rule('pez-agua', 'pez', 'water', ['bosque', 'selva'], 2, 60)
  ];

  SA.data.defineKind('pickups', validatePickup);
  SA.data.register('pickups', rules);

  // The spoken/shown exclamation: indefinite article agreeing with the item's gender ("¡Un plátano!", "¡Una roca!").
  var seen = {};
  var found = [];
  rules.forEach(function (r) {
    if (seen[r.item]) return;
    seen[r.item] = true;
    var it = SA.data.get('items', r.item);
    var noun = it.name.es.replace(/^(el|la|los|las) /, '');
    found.push({ id: 'found:' + r.item, key: 'found:' + r.item, es: '¡' + (it.gender === 'm' ? 'Un ' : 'Una ') + noun + '!', clip: null });
  });
  SA.data.register('vocab', found);
})(typeof window !== 'undefined' ? window : globalThis);
