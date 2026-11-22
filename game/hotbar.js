/* SA.hotbar: pure slot/key mapping over SA.inventory (no THREE, no DOM). Load after game/inventory.js.
 *
 * Slots 1-9 are the inventory items in items.js order (SA.inventory.list()); anything past the 9th is not on the bar.
 * - slots() -> [{ slot, id, count, icon, equipped }] (only filled slots; empty slots do not exist)
 * - slotItem(n) -> item id or null (empty or out-of-range slot)
 * - pressKey(key) -> result: '1'-'9' equips that slot (pressing the equipped slot's key keeps it in hand), '0' empties hands.
 * - tapSlot(n) -> result: equips that slot, or unequips when it is already in hand.
 * - nameChip(id) -> { id, key, text, icon } | null: the item's Spanish name with article ('el cepillo'), the vocab key to
 *   speak ('item:<id>') and its icon; null for no/unknown item. Data-driven (items.js / vocab), never special-cased.
 * - chipVisible({ sinceEquip, messageShown }) -> bool (CHIP_MS = 1500): the name chip shows ~1.5 s after an equip, never over a message.
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

  // The Spanish name with its article (from item data / vocab), the vocab key to speak and the icon; null for no/unknown item.
  function nameChip(id) {
    var it = typeof id === 'string' ? SA.data.get('items', id) : null;
    if (!it) return null;
    var key = 'item:' + it.id;
    var v = SA.vocab && SA.vocab.get ? SA.vocab.get(key) : null;
    return { id: it.id, key: key, text: v ? v.es : it.name.es, icon: it.icon };
  }

  // AS-0121: the name chip is a short confirmation, not a permanent label. It shows for CHIP_MS after the player equips an item
  // (sinceEquip = ms since then; null/undefined = never equipped this session, e.g. the item restored from the save) and never
  // while another message (toast, animal name, part label, feed tray...) is on screen: messages always win.
  var CHIP_MS = 1500;
  function chipVisible(st) {
    st = st || {};
    var t = st.sinceEquip;
    if (typeof t !== 'number' || t !== t || t < 0 || t >= CHIP_MS) return false;
    return !st.messageShown;
  }

  function signature() {
    return slots().map(function (s) { return s.id + ':' + s.count + (s.equipped ? '*' : ''); }).join('|');
  }

  SA.hotbar = { MAX_SLOTS: MAX_SLOTS, slots: slots, slotItem: slotItem, pressKey: pressKey, tapSlot: tapSlot, nameChip: nameChip, signature: signature,
    CHIP_MS: CHIP_MS, chipVisible: chipVisible };
})(typeof window !== 'undefined' ? window : globalThis);
