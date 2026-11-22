/* SA.keyHintView.create(doc, container) -> { keydown(e), pointer(), cycling() }: the DOM side of SA.keyHint.
 * Two keycap glyphs (Enter, Space), no words. Sits bottom-left above the stars badge, clear of the mute (top right),
 * replay/prompt bar (top), habitat (right), gear and orbit pad (bottom right) and the centred tray/chip.
 * Created lazily on the first keydown; fades in/out via opacity and never catches pointer events. No-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var CSS = 'position:fixed;left:12px;bottom:84px;z-index:3;display:flex;gap:6px;pointer-events:none;opacity:0;' +
    'transition:opacity .4s ease;';
  var KEY = 'min-width:44px;height:44px;box-sizing:border-box;padding:0 .3em;display:flex;align-items:center;justify-content:center;' +
    'background:#fff;color:#24543a;border:.1em solid #24543a;border-bottom-width:.25em;border-radius:.4em;' +
    'font:700 1.6rem system-ui,sans-serif;box-shadow:0 .1em .4em rgba(0,0,0,.3);';
  var GLYPHS = ['⏎', '␣'];   // Enter, Space keycap symbols

  function create(doc, container) {
    var state = SA.keyHint && SA.keyHint.create();
    if (!state) return { keydown: function () {}, pointer: function () {}, cycling: function () {} };
    var el = null;

    function build() {
      if (el || !doc || typeof doc.createElement !== 'function') return;
      el = doc.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = CSS;
      GLYPHS.forEach(function (g) {
        var k = doc.createElement('span');
        k.style.cssText = KEY;
        k.textContent = g;
        el.appendChild(k);
      });
      (container || doc.body).appendChild(el);
    }
    function render() {
      if (state.visible()) build();
      if (el) el.style.opacity = state.visible() ? '.9' : '0';
    }
    return {
      keydown: function (e) { state.keydown(e && e.key, e); render(); },
      pointer: function () { state.pointer(); render(); },
      cycling: function () { state.cycling(); render(); },
    };
  }

  SA.keyHintView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
