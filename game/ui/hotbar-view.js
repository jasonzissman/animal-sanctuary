/* SA.hotbarView.create(doc) -> { update(), setHidden(bool), element }: icon-only hotbar fixed at the bottom centre.
 * One big (72px) button per SA.hotbar slot: the item icon, a count badge for stacks (> 1) and a bright ring on the
 * equipped slot. Tapping a slot calls SA.hotbar.tapSlot (tap the equipped one again to empty your hands).
 * update() is cheap (compares SA.hotbar.signature()) and rebuilds only when the inventory changed; call it every frame.
 * A chip above the bar shows the equipped item's icon and Spanish name with article ("el cepillo"); equipping speaks it via
 * SA.audio.say('item:<id>') (not for an item restored from the save), unequipping hides the chip.
 * Each button has an aria-label with the Spanish item name; no visible text. No-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SLOT = 'position:relative;margin:0;padding:0;border-radius:.6em;border:.12em solid #24543a;' +
    'background:rgba(255,248,214,.92);font:700 2.2rem system-ui,sans-serif;line-height:1;cursor:pointer;touch-action:manipulation;' +
    'user-select:none;-webkit-user-select:none;box-shadow:0 .1em .4em rgba(0,0,0,.3);pointer-events:auto;';
  var ON = 'border-color:#ff9f1c;background:#fff;box-shadow:0 0 0 .14em #ff9f1c,0 .1em .5em rgba(0,0,0,.4);transform:translateY(-6px);';
  var BADGE = 'position:absolute;right:2px;bottom:2px;min-width:1.3em;padding:0 .25em;border-radius:1em;background:#24543a;' +
    'color:#fff;font:700 1rem system-ui,sans-serif;line-height:1.4;text-align:center;pointer-events:none;';

  var CHIP = 'position:fixed;z-index:4;display:none;align-items:center;justify-content:center;box-sizing:border-box;overflow:hidden;' +
    'gap:.4em;padding:0 .8em;border-radius:1em;background:rgba(255,248,214,.95);border:.1em solid #ff9f1c;color:#24543a;' +
    'font:700 1.6rem system-ui,sans-serif;box-shadow:0 .1em .4em rgba(0,0,0,.3);pointer-events:none;white-space:nowrap;';

  function create(doc) {
    var none = { update: function () {}, setHidden: function () {}, element: null };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !SA.hotbar) return none;
    var bar = doc.createElement('div');
    // Rects come from SA.hud: 'hotbar' (the slots shrink to fit narrow screens) and 'hotbarChip' (the name flash).
    bar.style.cssText = 'position:fixed;z-index:4;display:flex;gap:8px;justify-content:center;align-items:flex-end;' +
      'box-sizing:border-box;pointer-events:none;';
    doc.body.appendChild(bar);
    var chip = doc.createElement('div');
    chip.style.cssText = CHIP;
    chip.setAttribute('aria-live', 'polite');
    doc.body.appendChild(chip);
    var shown = null, hidden = false, buttons = [], chipId = SA.inventory ? SA.inventory.equipped() : null;
    var barRect = null, slot = 72;
    function relayout() { if (SA.hudPlace) SA.hudPlace.refresh(); }
    function sizeSlots() {
      var rect = barRect || { width: 9999, height: 72 }, gap = 8, n = Math.max(1, buttons.length);
      slot = Math.max(28, Math.min(rect.height, Math.floor((rect.width - gap * (n - 1)) / n)));
      buttons.forEach(function (b) { b.style.width = slot + 'px'; b.style.height = slot + 'px'; b.style.fontSize = Math.round(slot * 0.4) + 'px'; });
    }
    if (SA.hudPlace) {
      SA.hudPlace.register('hotbar', bar, { reserve: true, onPlace: function (r) { barRect = r; sizeSlots(); } });
      SA.hudPlace.register('hotbarChip', chip, { onPlace: function (r) { chip.style.fontSize = Math.round(r.height * 0.5) + 'px'; } });
    }

    function showChip(c) {
      chip.textContent = c.icon + ' ' + c.text;
      chip.style.display = hidden ? 'none' : 'flex';
      relayout();
    }

    // Show/hide the name chip when the equipped item changes; speak it on equip (not for the item restored from the save).
    function syncChip() {
      var id = SA.inventory ? SA.inventory.equipped() : null;
      if (id === chipId) return;
      chipId = id;
      var c = SA.hotbar.nameChip(id);
      if (!c) { chip.style.display = 'none'; relayout(); return; }
      showChip(c);
      if (SA.audio && SA.audio.say) SA.audio.say(c.key);
    }

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
      sizeSlots();
    }

    function update() {
      syncChip();
      var sig = SA.hotbar.signature();
      if (sig === shown) return;
      shown = sig;
      build();
    }

    update();
    var c0 = SA.hotbar.nameChip(chipId);
    if (c0) showChip(c0);
    return {
      update: update,
      setHidden: function (h) {
        hidden = !!h;
        bar.style.display = hidden ? 'none' : 'flex';
        chip.style.display = hidden || !chipId ? 'none' : 'flex';
        relayout();
      },
      element: bar
    };
  }

  SA.hotbarView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
