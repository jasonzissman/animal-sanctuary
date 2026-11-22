/* SA.inventory: what the player carries. Pure logic over SA.save (no THREE, no DOM). Load after
 * game/save.js and game/data/items.js.
 *
 * State lives in the save as inventory = { items: [{ id, count }], equipped: id|null }, so it survives a reload.
 * A new (or migrated) save starts with the kit in SA.save.STARTING_KIT: cámara, cepillo, esponja, venda.
 * - add(id, n=1) -> true if added. Unknown ids are refused; a non-stackable item you already hold is refused.
 * - remove(id, n=1) -> true if removed. Refused when you hold fewer than n. Removing the last of the equipped item unequips it.
 * - count(id), has(id), list() ([{ id, count }] in items.js order, known items only).
 * - equip(id) -> true if now in hand; refused when you do not hold it. equipped() -> id|null. unequip().
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function known(id) { return typeof id === 'string' && !!SA.data.get('items', id); }
  function wholeN(n) { return n === undefined ? 1 : (typeof n === 'number' && isFinite(n) && n >= 1 && n === Math.floor(n) ? n : 0); }

  function read() { return SA.save.get().inventory; }
  function write(items, equipped) { SA.save.update({ inventory: { items: items, equipped: equipped } }); }

  function count(id) {
    var found = read().items.filter(function (it) { return it.id === id; })[0];
    return found ? found.count : 0;
  }

  function add(id, n) {
    n = wholeN(n);
    if (!known(id) || !n) return false;
    var inv = read();
    var have = count(id);
    if (!SA.data.get('items', id).stackable && have + n > 1) return false;
    var items = inv.items.filter(function (it) { return it.id !== id; });
    items.push({ id: id, count: have + n });
    write(items, inv.equipped);
    return true;
  }

  function remove(id, n) {
    n = wholeN(n);
    var have = count(id);
    if (!n || have < n) return false;
    var inv = read();
    var items = inv.items.filter(function (it) { return it.id !== id; });
    if (have > n) items.push({ id: id, count: have - n });
    write(items, have > n || inv.equipped !== id ? inv.equipped : null);
    return true;
  }

  function list() {
    var inv = read();
    return SA.data.all('items').map(function (def) {
      var found = inv.items.filter(function (it) { return it.id === def.id; })[0];
      return found ? { id: def.id, count: found.count } : null;
    }).filter(Boolean);
  }

  function equip(id) {
    if (!known(id) || count(id) < 1) return false;
    write(read().items, id);
    return true;
  }

  function unequip() { write(read().items, null); }

  SA.inventory = {
    add: add,
    remove: remove,
    count: count,
    has: function (id) { return count(id) > 0; },
    list: list,
    equip: equip,
    unequip: unequip,
    equipped: function () { return read().equipped; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
