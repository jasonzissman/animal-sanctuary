/* SA.hotbarView.create(doc) -> { update(), setHidden(bool), element }: icon-only hotbar fixed at the bottom centre.
 * One big (72px) button per SA.hotbar slot: the item icon, a count badge for stacks (> 1) and a bright ring on the
 * equipped slot. Tapping a slot calls SA.hotbar.tapSlot (tap the equipped one again to empty your hands).
 * update() is cheap (compares SA.hotbar.signature()) and rebuilds only when the inventory changed; call it every frame.
 * Each button has an aria-label with the Spanish item name; no visible text. No-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SLOT = 'position:relative;width:72px;height:72px;margin:0;padding:0;border-radius:.6em;border:.12em solid #24543a;' +
    'background:rgba(255,248,214,.92);font:700 2.2rem system-ui,sans-serif;line-height:1;cursor:pointer;touch-action:manipulation;' +
    'user-select:none;-webkit-user-select:none;box-shadow:0 .1em .4em rgba(0,0,0,.3);pointer-events:auto;';
  var ON = 'border-color:#ff9f1c;background:#fff;box-shadow:0 0 0 .14em #ff9f1c,0 .1em .5em rgba(0,0,0,.4);transform:translateY(-6px);';
  var BADGE = 'position:absolute;right:2px;bottom:2px;min-width:1.3em;padding:0 .25em;border-radius:1em;background:#24543a;' +
    'color:#fff;font:700 1rem system-ui,sans-serif;line-height:1.4;text-align:center;pointer-events:none;';

  function create(doc) {
    var none = { update: function () {}, setHidden: function () {}, element: null };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !SA.hotbar) return none;
    var bar = doc.createElement('div');
    bar.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:4;display:flex;gap:8px;' +
      'max-width:100vw;pointer-events:none;';
    doc.body.appendChild(bar);
    var shown = null, hidden = false, buttons = [];

    function build() {
      buttons.forEach(function (old) { bar.removeChild(old); });
      buttons = [];
      SA.hotbar.slots().forEach(function (s) {
        var b = doc.createElement('button');
        b.type = 'button';
        b.style.cssText = SLOT + (s.equipped ? ON : '');
        b.textContent = s.icon;
        b.setAttribute('aria-label', SA.data.get('items', s.id).name.es);
        b.setAttribute('aria-pressed', s.equipped ? 'true' : 'false');
        if (s.count > 1) {
          var badge = doc.createElement('span');
          badge.style.cssText = BADGE;
          badge.textContent = String(s.count);
          b.appendChild(badge);
        }
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); SA.hotbar.tapSlot(s.slot); update(); });
        b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        bar.appendChild(b);
        buttons.push(b);
      });
    }

    function update() {
      var sig = SA.hotbar.signature();
      if (sig === shown) return;
      shown = sig;
      build();
    }

    update();
    return {
      update: update,
      setHidden: function (h) { hidden = !!h; bar.style.display = hidden ? 'none' : 'flex'; },
      element: bar
    };
  }

  SA.hotbarView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
