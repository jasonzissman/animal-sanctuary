/* SA.useButton.create(doc, picking, win) -> { update(), element }: the big icon-only "use" button for touch players.
 * It appears while a body part is highlighted (picking.target()) on touch screens and shows the equipped item's icon
 * (🤚 with empty hands); pressing it calls picking.useTarget(), the same path as E / Enter, a click or a tap on the part.
 * It sits just left of the orbit pad (both rects come from SA.hud, bottomRight zone) so it never covers those buttons.
 * Mouse-only players never see it (E / Enter and clicking cover them); it shows after the first touch or on a coarse pointer.
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
    var touch = SA.touch ? SA.touch.get(win) : null;   // shared: coarse pointer, or the first touch / pen pointerdown
    var shown = null, icon = null;
    var b = doc.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', EMPTY.label);
    b.style.cssText = 'position:fixed;z-index:4;display:none;margin:0;padding:0;' +   // rect from SA.hud ('use')
      'border-radius:50%;border:.12em solid #24543a;background:rgba(255,236,150,.95);font:700 2.6rem system-ui,sans-serif;' +
      'cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 .1em .4em rgba(0,0,0,.35);pointer-events:auto;';
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); picking.useTarget(); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    doc.body.appendChild(b);
    if (SA.hudPlace) SA.hudPlace.register('use', b, { reserve: true, onPlace: function (r) { b.style.fontSize = Math.round(r.height * 0.31) + 'px'; } });

    function update() {
      var want = !!touch && SA.touch.visible(touch.is(), !!picking.target());   // touch only, and only while it can act
      if (want !== shown) { shown = want; b.style.display = want ? 'block' : 'none'; if (SA.hudPlace) SA.hudPlace.refresh(); }
      if (!want) return;
      var ic = iconFor(SA.inventory && SA.inventory.equipped ? SA.inventory.equipped() : null);
      if (ic !== icon) { icon = ic; b.textContent = ic; }
    }
    return { update: update, element: b };
  }

  SA.useButton = { create: create, iconFor: iconFor, EMPTY: EMPTY };
})(typeof window !== 'undefined' ? window : globalThis);
