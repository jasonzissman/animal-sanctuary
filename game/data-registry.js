/* SA.data: validated content registry. Content (animals, parts, biomes, traits, clues, props...)
 * is plain JSON-serialisable data registered from game/data/*.js. Engine code never special-cases an id.
 *
 * API
 *   SA.data.defineKind(kind, validateFn)  declare a kind; validateFn(item) must throw to reject,
 *                                         ideally via SA.data.fail(field, message).
 *   SA.data.register(kind, items)         validate every item (and id uniqueness) then store them.
 *                                         All-or-nothing: if any item is invalid nothing is added.
 *   SA.data.get(kind, id)                 the item, or null when unknown.
 *   SA.data.all(kind)                     array copy of items in registration order.
 *   SA.data.fail(field, message)          throw from inside a validator, naming the bad field.
 *
 * Every item needs a non-empty string `id`. Errors read like:
 *   SA.data: kind "animals", id "fox", field "legs": must be a number
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var kinds = {};   // kind -> { validate, items: [], byId: {} }

  function describe(kind, id, field, message) {
    return 'SA.data: kind "' + kind + '", id "' + id + '", field "' + field + '": ' + message;
  }

  function fail(field, message) {
    var e = new Error(message);
    e.saField = field;
    throw e;
  }

  function need(kind) {
    var k = Object.prototype.hasOwnProperty.call(kinds, kind) ? kinds[kind] : null;
    if (!k) throw new Error('SA.data: unknown kind "' + kind + '" (call SA.data.defineKind first)');
    return k;
  }

  function defineKind(kind, validate) {
    if (typeof kind !== 'string' || !kind) throw new Error('SA.data.defineKind: kind must be a non-empty string');
    if (typeof validate !== 'function') throw new Error('SA.data.defineKind: "' + kind + '" needs a validate function');
    if (Object.prototype.hasOwnProperty.call(kinds, kind)) throw new Error('SA.data.defineKind: kind "' + kind + '" is already defined');
    kinds[kind] = { validate: validate, items: [], byId: Object.create(null) };
  }

  function check(kind, k, item, index, seen) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(describe(kind, '#' + index, 'id', 'item must be an object'));
    }
    var id = item.id;
    if (typeof id !== 'string' || !id) throw new Error(describe(kind, '#' + index, 'id', 'must be a non-empty string'));
    if (k.byId[id] || seen[id]) throw new Error(describe(kind, id, 'id', 'duplicate id'));
    try {
      k.validate(item);
    } catch (e) {
      throw new Error(describe(kind, id, (e && e.saField) || '?', (e && e.message) || String(e)));
    }
    seen[id] = true;
  }

  function register(kind, items) {
    var k = need(kind);
    if (!Array.isArray(items)) throw new Error('SA.data.register: items for kind "' + kind + '" must be an array');
    var seen = Object.create(null);
    items.forEach(function (item, i) { check(kind, k, item, i, seen); });
    items.forEach(function (item) { k.items.push(item); k.byId[item.id] = item; });
  }

  function get(kind, id) { return need(kind).byId[id] || null; }
  function all(kind) { return need(kind).items.slice(); }

  SA.data = { defineKind: defineKind, register: register, get: get, all: all, fail: fail };
})(typeof window !== 'undefined' ? window : globalThis);
