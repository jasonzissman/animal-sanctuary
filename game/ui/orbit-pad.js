/* SA.orbitPad.create(doc, rig): four icon-only buttons (rotate left/right, tilt up/down) for touch players.
 * Holding a button calls rig.setOrbitAxes(yaw, pitch), which runs the same clamped orbit code as Q/E/R/F.
 * The wrapper ignores pointer events, so only the buttons themselves catch taps; the animals stay pickable.
 * No-op without a DOM. Axis mapping lives in SA.orbitButtons (pure, tested).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SIZE = Math.max(56, (SA.orbitButtons && SA.orbitButtons.MIN_SIZE) || 44);
  var BTN = 'width:' + SIZE + 'px;height:' + SIZE + 'px;margin:0;padding:0;border-radius:50%;border:.1em solid #24543a;' +
    'background:rgba(255,248,214,.85);color:#24543a;font:700 1.8rem system-ui,sans-serif;cursor:pointer;opacity:.85;' +
    'touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 .1em .4em rgba(0,0,0,.3);pointer-events:auto;';

  function create(doc, rig) {
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !rig || !SA.orbitButtons) return { release: function () {} };
    var held = {};   // pointerId -> button id

    function push() {
      var a = SA.orbitButtons.combine(Object.keys(held).map(function (k) { return held[k]; }));
      rig.setOrbitAxes(a.yaw, a.pitch);
    }
    function release() { held = {}; push(); }

    var wrap = doc.createElement('div');
    // The 2x2 block's rect comes from SA.hud ('orbitPad'); each button is half of it minus the gap.
    wrap.style.cssText = 'position:fixed;z-index:4;display:grid;gap:8px;pointer-events:none;box-sizing:border-box;' +
      'grid-template-columns:repeat(2,' + SIZE + 'px);align-content:start;justify-content:start;';
    var btns = [];
    SA.orbitButtons.BUTTONS.forEach(function (def) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', def.label);
      b.textContent = def.icon;
      b.style.cssText = BTN;
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        held[e.pointerId] = def.id;
        push();
      });
      var up = function (e) { delete held[e.pointerId]; push(); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      wrap.appendChild(b); btns.push(b);
    });
    doc.body.appendChild(wrap);
    if (SA.hudPlace) SA.hudPlace.register('orbitPad', wrap, { reserve: true, onPlace: function (r) {
      var s = Math.floor((r.width - 8) / 2);
      wrap.style.gridTemplateColumns = 'repeat(2,' + s + 'px)';
      btns.forEach(function (b) { b.style.width = s + 'px'; b.style.height = s + 'px'; });
    } });
    if (typeof root.addEventListener === 'function') root.addEventListener('blur', release);
    return { release: release, element: wrap };
  }

  SA.orbitPad = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
