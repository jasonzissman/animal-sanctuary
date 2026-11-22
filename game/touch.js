/* SA.touch: the one shared "is this a touch device?" answer and the pure visibility rule for on-screen touch controls (AS-0196).
 * Touch means (pointer: coarse) matches, OR the first pointerdown anywhere has a touch / pen pointerType (a mouse never
 * counts). Once true it stays true. Joystick, orbit pad, jump, climb and use buttons all ask the SAME tracker, so with a mouse
 * and keyboard none of them ever show (E, Space and C still work: the keys do not go through these buttons).
 *   SA.touch.isTouchPointer(type) -> true for 'touch' / 'pen'      SA.touch.isCoarse(win) -> (pointer: coarse) matches
 *   SA.touch.get(win) -> { is(), onChange(fn) }  shared per window (the tracker listens for the first touch pointerdown)
 *   SA.touch.visible(touch, canAct) -> a touch control shows only on touch; a context button (climb, use) also needs canAct
 *       (canAct undefined = always-on control such as the joystick, orbit pad and jump button)
 * No DOM needed: `win` may be null (never touch) or a fake with matchMedia / addEventListener. Pure and tested in node:vm.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var trackers = typeof WeakMap === 'function' ? new WeakMap() : null;

  function isTouchPointer(type) {
    if (SA.joystick && SA.joystick.isTouch) return SA.joystick.isTouch(type);
    return type === 'touch' || type === 'pen';
  }

  function isCoarse(win) {
    try { return !!(win && typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
  }

  function visible(touch, canAct) { return !!touch && (canAct === undefined || !!canAct); }

  function create(win) {
    var touch = isCoarse(win), listeners = [];
    function set() {
      if (touch) return;
      touch = true;
      listeners.slice().forEach(function (fn) { try { fn(true); } catch (e) { /* a bad listener never breaks the others */ } });
    }
    if (win && typeof win.addEventListener === 'function') {
      // Capture phase: the canvas may keep the pointer, but we still hear the very first finger.
      win.addEventListener('pointerdown', function (e) { if (e && isTouchPointer(e.pointerType)) set(); }, true);
    }
    return {
      is: function () { return touch; },
      onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
    };
  }

  function get(win) {
    if (!win || typeof win !== 'object' || !trackers) return create(win);
    var t = trackers.get(win);
    if (!t) { t = create(win); trackers.set(win, t); }
    return t;
  }

  SA.touch = { isTouchPointer: isTouchPointer, isCoarse: isCoarse, visible: visible, create: create, get: get };
})(typeof window !== 'undefined' ? window : globalThis);
