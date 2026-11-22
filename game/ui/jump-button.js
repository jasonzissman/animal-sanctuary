/* SA.jumpButton.create(doc, rig, win) -> { show(), element }: one big round icon-only jump button (⬆️) for touch players.
 * Tapping it calls rig.jump() (the same hop as Space: one per landing, nothing in the air or up a tree). Like the
 * joystick it stays hidden on mouse/keyboard devices (Space still jumps) and appears on a coarse pointer or at the first touch (SA.touch). It sits above the use
 * button, between the joystick and the right-hand buttons; only the button itself catches pointer events, so the
 * joystick and drag-to-look are untouched. No text beyond the aria-label. No-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SIZE = (SA.hud && SA.hud.SIZES.regular.jump[0]) || 84;   // px: a big thumb target (the size table lives in SA.hud)

  function create(doc, rig, win) {
    var none = { show: function () {}, element: null };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !rig || typeof rig.jump !== 'function') return none;
    var b = doc.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Saltar');
    b.textContent = '⬆️';
    b.style.cssText = 'position:fixed;z-index:4;display:none;margin:0;padding:0;' +   // rect from SA.hud ('jump')
      'border-radius:50%;border:.1em solid #24543a;background:rgba(255,248,214,.92);font:700 2.4rem system-ui,sans-serif;' +
      'cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 .1em .4em rgba(0,0,0,.3);pointer-events:auto;';
    b.style.display = 'none';   // hidden until the first touch
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); rig.jump(); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    doc.body.appendChild(b);
    if (SA.hudPlace) SA.hudPlace.register('jump', b, { reserve: true, onPlace: function (r) { b.style.fontSize = Math.round(r.height * 0.4) + 'px'; } });

    win = win || root;
    var touch = SA.touch ? SA.touch.get(win) : null;   // shared: coarse pointer, or the first touch / pen pointerdown
    var shown = null;
    function show() {
      var want = !!touch && SA.touch.visible(touch.is());
      if (want === shown) return;
      shown = want; b.style.display = want ? 'block' : 'none';
      if (SA.hudPlace) SA.hudPlace.refresh();
    }
    if (touch) touch.onChange(show);
    show();
    return { show: show, element: b };
  }

  SA.jumpButton = { create: create, SIZE: SIZE };
})(typeof window !== 'undefined' ? window : globalThis);
