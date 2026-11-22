/* SA.climbButton.create(doc, rig) -> { update(), element }: one big icon-only climb button for touch and mouse players.
 * It shows 🧗 next to a climbable tree and ⬇️ while you are up one (rig.climbPrompt() says which); tapping it calls
 * rig.toggleClimb() (the same path as Space / C). Hidden otherwise. Call update() every frame. No text beyond the
 * aria-label. No-op without a DOM. Rules live in SA.climb (pure, tested).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var ICONS = { up: { icon: '🧗', label: 'Trepar' }, down: { icon: '⬇️', label: 'Bajar' } };

  function create(doc, rig) {
    var none = { update: function () {}, element: null };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !rig || !rig.climbPrompt) return none;
    var shown;   // undefined until the first update so the button is explicitly hidden
    var b = doc.createElement('button');
    b.type = 'button';
    b.style.cssText = 'position:fixed;z-index:4;display:none;margin:0;padding:0;' +   // rect from SA.hud ('climb')
      'border-radius:50%;border:.1em solid #24543a;background:rgba(255,248,214,.92);font:700 2.2rem system-ui,sans-serif;' +
      'cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 .1em .4em rgba(0,0,0,.3);pointer-events:auto;';
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); rig.toggleClimb(); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    doc.body.appendChild(b);
    if (SA.hudPlace) SA.hudPlace.register('climb', b, { reserve: true, onPlace: function (r) { b.style.fontSize = Math.round(r.height * 0.4) + 'px'; } });

    function update() {
      var p = rig.climbPrompt();
      if (p === shown) return;
      shown = p;
      if (!p) b.style.display = 'none';
      else {
        b.textContent = ICONS[p].icon;
        b.setAttribute('aria-label', ICONS[p].label);
        b.style.display = 'block';
      }
      if (SA.hudPlace) SA.hudPlace.refresh();
    }
    return { update: update, element: b };
  }

  SA.climbButton = { create: create, ICONS: ICONS };
})(typeof window !== 'undefined' ? window : globalThis);
