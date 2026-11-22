/* SA.menu (pure, no DOM/THREE; loadable in node:vm): the state of the 🎒 menu in the top-right HUD column.
 *
 *   SA.menu.ITEMS   the four items, in order: { id, hud, icon, es, closes }
 *                   hud = the SA.hud id of the button the item uses; closes = the menu closes after it is used
 *                   (sound stays open so you see the icon change; settings closes when its hold-to-open guard opens the drawer).
 *   SA.menu.create({ onChange?(isOpen) }) -> { isOpen(), open(), close(), toggle(), outsideTap(), used(id), key(key) }
 *       outsideTap()  a tap that landed outside the menu: closes it (returns true if it was open)
 *       used(id)      an item was activated: closes the menu when that item's `closes` is set (returns true if it closed)
 *       key(key)      a keydown: 'Escape' closes an open menu -> 'close'; 'm'/'M' -> 'sound' (the caller toggles mute; the menu
 *                     does NOT open); anything else -> null
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  var ITEMS = [
    { id: 'sound', hud: 'audioUi', icon: '🔊', es: 'Sonido', closes: false },
    { id: 'habitat', hud: 'sandbox', icon: '🏡', es: 'Hábitat', closes: true },
    { id: 'album', hud: 'album', icon: '📖', es: 'Álbum', closes: true },
    { id: 'settings', hud: 'settings', icon: '⚙️', es: 'Ajustes', closes: true },
  ];

  function create(o) {
    o = o || {};
    var open = false;
    function set(on) {
      on = !!on;
      if (on === open) return false;
      open = on;
      if (o.onChange) o.onChange(open);
      return true;
    }
    function find(id) { for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i]; return null; }
    return {
      isOpen: function () { return open; },
      open: function () { return set(true); },
      close: function () { return set(false); },
      toggle: function () { set(!open); return open; },
      outsideTap: function () { return set(false); },
      used: function (id) { var it = find(id); return !!(it && it.closes && set(false)); },
      key: function (key) {
        if (key === 'Escape') return set(false) ? 'close' : null;
        if (key === 'm' || key === 'M') return 'sound';
        return null;
      },
    };
  }

  SA.menu = { ITEMS: ITEMS, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
