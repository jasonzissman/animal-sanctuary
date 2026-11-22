/* SA.hintArrow.create(doc, onTap) -> { show(ex, ey, angle), hide() }: the soft arrow button at the screen edge.
 * ex/ey are NDC (y up), angle is radians (0 = right, PI/2 = up), as returned by SA.hintPointer. No-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var CSS = 'position:fixed;z-index:3;display:none;width:72px;height:72px;margin:0;padding:0;border-radius:50%;' +
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
      show: function (ex, ey, angle) {
        b.style.display = 'block';
        b.style.left = 'calc(' + ((ex + 1) * 50) + '% - 36px)';
        b.style.top = 'calc(' + ((1 - ey) * 50) + '% - 36px)';
        b.style.transform = 'rotate(' + (-angle) + 'rad)';
      },
      hide: function () { b.style.display = 'none'; },
    };
  }

  SA.hintArrow = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
