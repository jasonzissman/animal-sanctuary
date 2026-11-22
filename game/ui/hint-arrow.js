/* SA.hintArrow.create(doc, onTap) -> { show(ex, ey, angle), hide() }: the soft arrow button at the screen edge.
 * ex/ey are NDC (y up), angle is radians (0 = right, PI/2 = up), as returned by SA.hintPointer. No-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var CSS = 'position:fixed;z-index:3;display:none;margin:0;padding:0;border-radius:50%;' +
    'border:.1em solid #24543a;background:rgba(255,248,214,.85);color:#24543a;font:700 2.2rem system-ui,sans-serif;' +
    'cursor:pointer;opacity:.9;touch-action:manipulation;box-shadow:0 .1em .5em rgba(0,0,0,.3);';

  function create(doc, onTap) {
    if (!doc || typeof doc.createElement !== 'function' || !doc.body) return { show: function () {}, hide: function () {} };
    var b = doc.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Pista: ¿dónde está?');
    b.textContent = '➤';
    b.style.cssText = CSS;
    b.addEventListener('click', function () { if (onTap) onTap(); });
    doc.body.appendChild(b);
    return {
      // The arrow follows the camera, so its spot is computed per frame: the point for (ex, ey) on screen, then nudged by
      // SA.hud so it stays on-screen and never sits on another HUD element. Its size is the hud size table's.
      show: function (ex, ey, angle) {
        b.style.display = 'block';
        var hp = SA.hudPlace, vp = hp ? hp.viewport() : { width: 1280, height: 800 };
        var size = SA.hud ? SA.hud.SIZES[SA.hud.mode(vp)].hintArrow[0] : 72;
        var r = { left: Math.round((ex + 1) / 2 * vp.width - size / 2), top: Math.round((1 - ey) / 2 * vp.height - size / 2), width: size, height: size };
        if (hp && SA.hud) r = hp.nudge(r);
        b.style.left = r.left + 'px'; b.style.top = r.top + 'px'; b.style.width = size + 'px'; b.style.height = size + 'px';
        b.style.transform = 'rotate(' + (-angle) + 'rad)';
      },
      hide: function () { b.style.display = 'none'; },
    };
  }

  SA.hintArrow = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
