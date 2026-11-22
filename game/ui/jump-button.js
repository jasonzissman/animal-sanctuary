/* SA.jumpButton.create(doc, rig, win) -> { show(), element }: one big round icon-only jump button (⬆️) for touch players.
 * Tapping it calls rig.jump() (the same hop as Space: one per landing, nothing in the air or up a tree). Like the
 * joystick it stays hidden on mouse/keyboard devices and appears at the first touch anywhere. It sits above the use
 * button, between the joystick and the right-hand buttons; only the button itself catches pointer events, so the
 * joystick and drag-to-look are untouched. No text beyond the aria-label. No-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SIZE = 84;   // px: a big thumb target

  function create(doc, rig, win) {
    var none = { show: function () {}, element: null };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !rig || typeof rig.jump !== 'function') return none;
    var b = doc.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Saltar');
    b.textContent = '⬆️';
    b.style.cssText = 'position:fixed;right:144px;bottom:168px;z-index:4;display:none;width:' + SIZE + 'px;height:' + SIZE + 'px;margin:0;padding:0;' +
      'border-radius:50%;border:.1em solid #24543a;background:rgba(255,248,214,.92);font:700 2.4rem system-ui,sans-serif;' +
      'cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 .1em .4em rgba(0,0,0,.3);pointer-events:auto;';
    b.style.display = 'none';   // hidden until the first touch
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); rig.jump(); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    doc.body.appendChild(b);

    function show() { b.style.display = 'block'; }
    win = win || root;
    if (typeof win.addEventListener === 'function') {
      // Capture phase, like the joystick: the first finger anywhere reveals it.
      win.addEventListener('pointerdown', function (e) { if (e && (e.pointerType === 'touch' || e.pointerType === 'pen')) show(); }, true);
    }
    return { show: show, element: b };
  }

  SA.jumpButton = { create: create, SIZE: SIZE };
})(typeof window !== 'undefined' ? window : globalThis);
