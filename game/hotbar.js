/* SA.hotbar: pure slot/key mapping over SA.inventory (no THREE, no DOM). Load after game/inventory.js.
 *
 * Slots 1-9 are the inventory items in items.js order (SA.inventory.list()); anything past the 9th is not on the bar.
 * - slots() -> [{ slot, id, count, icon, equipped }] (only filled slots; empty slots do not exist)
 * - slotItem(n) -> item id or null (empty or out-of-range slot)
 * - pressKey(key) -> result: '1'-'9' equips that slot (pressing the equipped slot's key keeps it in hand), '0' empties hands.
 * - tapSlot(n) -> result: equips that slot, or unequips when it is already in hand.
 * - signature() -> string that changes whenever the slots, counts or equipped item change (cheap per-frame change check).
 * result = { action: 'equip' | 'unequip' | 'none', id: string|null }. 'none' = nothing changed (empty slot, bad key).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var MAX_SLOTS = 9;

  function slots() {
    var eq = SA.inventory.equipped();
    return SA.inventory.list().slice(0, MAX_SLOTS).map(function (it, i) {
      return { slot: i + 1, id: it.id, count: it.count, icon: SA.data.get('items', it.id).icon, equipped: it.id === eq };
    });
  }

  function slotItem(n) {
    if (typeof n !== 'number' || n !== Math.floor(n) || n < 1 || n > MAX_SLOTS) return null;
    var s = slots()[n - 1];
    return s ? s.id : null;
  }

  function none() { return { action: 'none', id: null }; }

  function equipSlot(n, toggle) {
    var id = slotItem(n);
    if (!id) return none();
    if (toggle && SA.inventory.equipped() === id) { SA.inventory.unequip(); return { action: 'unequip', id: id }; }
    return SA.inventory.equip(id) ? { action: 'equip', id: id } : none();
  }

  function pressKey(key) {
    if (key === '0') {
      var had = SA.inventory.equipped();
      if (!had) return none();
      SA.inventory.unequip();
      return { action: 'unequip', id: had };
    }
    if (typeof key !== 'string' || !/^[1-9]$/.test(key)) return none();
    return equipSlot(Number(key), false);
  }

  function tapSlot(n) { return equipSlot(n, true); }

  function signature() {
    return slots().map(function (s) { return s.id + ':' + s.count + (s.equipped ? '*' : ''); }).join('|');
  }

  SA.hotbar = { MAX_SLOTS: MAX_SLOTS, slots: slots, slotItem: slotItem, pressKey: pressKey, tapSlot: tapSlot, signature: signature };
})(typeof window !== 'undefined' ? window : globalThis);
