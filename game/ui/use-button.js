/* SA.useButton.create(doc, picking, win) -> { update(), element }: the big icon-only "use" button for touch players.
 * It appears while a body part is highlighted (picking.target()) on touch screens and shows the equipped item's icon
 * (🤚 with empty hands); pressing it calls picking.useTarget(), the same path as Space, a click or a tap on the part.
 * It sits just left of the orbit pad (pad covers right 12-132px, bottom 72-192px) so it never covers those buttons.
 * Mouse-only players never see it (Space and clicking cover them); it shows after the first touch or on a coarse pointer.
 * Call update() every frame. No text beyond the aria-label. No-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var EMPTY = { icon: '🤚', label: 'Usar' };

  function iconFor(itemId) {
    var it = itemId && SA.data && SA.data.get ? SA.data.get('items', itemId) : null;
    return it ? it.icon : EMPTY.icon;
  }

  function create(doc, picking, win) {
    var none = { update: function () {}, element: null };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !picking || !picking.target) return none;
    var touch = false;
    try { touch = !!(win && win.matchMedia && win.matchMedia('(pointer: coarse)').matches); } catch (e) { touch = false; }
    if (win && win.addEventListener) {
      win.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch') touch = true; }, true);
    }
    var shown = null, icon = null;
    var b = doc.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', EMPTY.label);
    b.style.cssText = 'position:fixed;right:144px;bottom:72px;z-index:4;display:none;width:84px;height:84px;margin:0;padding:0;' +
      'border-radius:50%;border:.12em solid #24543a;background:rgba(255,236,150,.95);font:700 2.6rem system-ui,sans-serif;' +
      'cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 .1em .4em rgba(0,0,0,.35);pointer-events:auto;';
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); picking.useTarget(); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    doc.body.appendChild(b);

    function update() {
      var want = touch && !!picking.target();
      if (want !== shown) { shown = want; b.style.display = want ? 'block' : 'none'; }
      if (!want) return;
      var ic = iconFor(SA.inventory && SA.inventory.equipped ? SA.inventory.equipped() : null);
      if (ic !== icon) { icon = ic; b.textContent = ic; }
    }
    return { update: update, element: b };
  }

  SA.useButton = { create: create, iconFor: iconFor, EMPTY: EMPTY };
})(typeof window !== 'undefined' ? window : globalThis);
