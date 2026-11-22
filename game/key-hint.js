/* SA.keyHint: pure show/hide decision for the icon-only "press Enter/Space" keycap hint (Care mode part-cycling).
 *   var h = SA.keyHint.create();
 *   h.keydown(key, mods)  a real keyboard key went down (modifier-only keys and Ctrl/Meta/Alt combos are ignored)
 *   h.pointer()           the player touched/clicked the stage: the hint goes away (it returns on the next key)
 *   h.cycling()           part-cycling started: the hint is done for good
 *   h.visible()           true only after a keydown, while cycling has not started
 * Touch- and mouse-only sessions never produce a keydown, so the hint never shows for them.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var IGNORED = { Shift: 1, Control: 1, Alt: 1, Meta: 1, CapsLock: 1, Dead: 1, Unidentified: 1 };

  function create() {
    var sawKey = false, pointerAfterKey = false, cycled = false;
    return {
      keydown: function (key, mods) {
        if (cycled || !key || Object.prototype.hasOwnProperty.call(IGNORED, key)) return;
        if (mods && (mods.ctrlKey || mods.metaKey || mods.altKey)) return;
        sawKey = true;
        pointerAfterKey = false;
      },
      pointer: function () { pointerAfterKey = true; },
      cycling: function () { cycled = true; },
      visible: function () { return sawKey && !pointerAfterKey && !cycled; },
    };
  }

  SA.keyHint = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
