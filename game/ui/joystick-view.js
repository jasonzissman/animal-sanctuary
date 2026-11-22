/* SA.joystickView.create(doc, rig, win): icon-only virtual joystick, bottom-left, for touch players.
 * Dragging the knob calls rig.setStick(x, y) (unit disc, +y down); releasing recentres it. The pad stays hidden on
 * mouse/keyboard devices and appears at the first touch anywhere. Only the pad itself catches pointer events, so
 * animals and parts stay pickable. Vector maths lives in SA.joystick (pure, tested). No-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var BASE = 136, KNOB = 68, RADIUS = (BASE - KNOB) / 2 + 12;   // px; the knob travels a little past the rim

  // Four-way arrow cross drawn inline (no emoji/fonts/files, so it looks the same on every classroom device).
  var CROSS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" ' +
    'focusable="false" style="display:block;pointer-events:none"><g fill="#24543a">' +
    '<rect x="10.75" y="5" width="2.5" height="14" rx="1"/><rect x="5" y="10.75" width="14" height="2.5" rx="1"/>' +
    '<polygon points="12,1 7.5,6.5 16.5,6.5"/><polygon points="12,23 7.5,17.5 16.5,17.5"/>' +
    '<polygon points="1,12 6.5,7.5 6.5,16.5"/><polygon points="23,12 17.5,7.5 17.5,16.5"/></g></svg>';

  var BOTTOM = 252;   // px above the bottom edge (was 84, which touched the hotbar; 132 still met the 5-food feed tray at 768px)

  function create(doc, rig, win) {
    var none = { show: function () {}, release: function () {} };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !rig || !SA.joystick) return none;
    var activeId = null, cx = 0, cy = 0;

    var pad = doc.createElement('div');
    pad.setAttribute('aria-label', 'Caminar');
    // bottom:252px clears the stars badge (top edge ~62px), the hotbar (72px slots, an equipped one lifts to ~90px), the habitat
    // tray (top edge ~125px) and the centred feed tray (bottom:96px, up to ~245px high, ~535px wide with 5 foods, so its left
    // edge is ~118px at 768px wide). The pad spans 252..388px from the bottom, so at 600px tall it stays below the prompt bar
    // (top 12..~90px).
    pad.style.cssText = 'position:fixed;left:16px;bottom:' + BOTTOM + 'px;z-index:4;display:none;width:' + BASE + 'px;height:' + BASE + 'px;' +
      'border-radius:50%;background:rgba(255,248,214,.45);border:.1em solid #24543a;touch-action:none;user-select:none;' +
      '-webkit-user-select:none;pointer-events:auto;';
    pad.style.display = 'none';   // hidden until the first touch
    var knob = doc.createElement('div');
    knob.style.cssText = 'position:absolute;left:' + (BASE - KNOB) / 2 + 'px;top:' + (BASE - KNOB) / 2 + 'px;width:' + KNOB + 'px;height:' + KNOB + 'px;' +
      'border-radius:50%;background:rgba(255,248,214,.9);border:.1em solid #24543a;box-shadow:0 .1em .4em rgba(0,0,0,.3);' +
      'display:grid;place-items:center;font:700 1.6rem system-ui,sans-serif;color:#24543a;pointer-events:none;';
    knob.innerHTML = CROSS_SVG;
    pad.appendChild(knob);
    doc.body.appendChild(pad);

    function setKnob(x, y) { knob.style.transform = 'translate(' + Math.round(x * RADIUS) + 'px,' + Math.round(y * RADIUS) + 'px)'; }
    function drive(e) {
      var v = SA.joystick.vector(e.clientX - cx, e.clientY - cy, RADIUS);
      rig.setStick(v.x, v.y);
      setKnob(v.x, v.y);
    }
    function release() {
      activeId = null;
      if (rig.setStick) rig.setStick(0, 0);
      setKnob(0, 0);
    }
    function show() { pad.style.display = 'block'; }

    pad.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (activeId !== null) return;
      activeId = e.pointerId;
      // The stick is relative to the pad centre, so the thumb never has to hit one exact spot.
      var r = pad.getBoundingClientRect ? pad.getBoundingClientRect() : null;
      cx = r ? r.left + r.width / 2 : e.clientX; cy = r ? r.top + r.height / 2 : e.clientY;
      if (pad.setPointerCapture) { try { pad.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      drive(e);
    });
    pad.addEventListener('pointermove', function (e) { if (e.pointerId === activeId) drive(e); });
    var up = function (e) { if (e.pointerId === activeId) release(); };
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
    pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    win = win || root;
    if (typeof win.addEventListener === 'function') {
      // Capture phase: the canvas may keep the pointer, but we still hear the very first finger.
      win.addEventListener('pointerdown', function (e) { if (SA.joystick.isTouch(e.pointerType)) show(); }, true);
      win.addEventListener('blur', release);
    }
    return { show: show, release: release, element: pad };
  }

  SA.joystickView = { create: create, CROSS_SVG: CROSS_SVG };
})(typeof window !== 'undefined' ? window : globalThis);
