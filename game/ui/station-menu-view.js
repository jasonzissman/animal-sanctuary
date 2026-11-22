/* SA.stationMenuView.create(doc, o) -> { element, body, isOpen() }: the placeholder station menu (DOM only; state is SA.station).
 *   o.onToggle(isOpen)  optional, e.g. main.js pauses picking while the card is open.
 * Opens when SA.station.open() fires (E / Enter on the outlined door, or a tap on it) and closes with the big ✕ button, a tap
 * outside the card, Escape, or SA.station.close(). Just an atom icon and a short Spanish phrase for now. The character
 * customizer (AS-0144) renders into `body` (or replaces this view) by listening to SA.station.onOpen. No-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var PHRASE = 'La estación';

  function create(doc, o) {
    var none = { element: null, body: null, isOpen: function () { return false; } };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !SA.station || !SA.station.onOpen) return none;
    o = o || {};
    function el(tag, css, text) {
      var e = doc.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    }
    var shade = el('div', 'position:fixed;inset:0;z-index:11;display:none;align-items:center;justify-content:center;background:rgba(36,84,58,.55);');
    var card = el('div', 'position:relative;display:flex;flex-direction:column;align-items:center;gap:.3em;min-width:min(70vw,320px);' +
      'padding:1.2em 1.6em;background:#fff8d6;border:.18em solid #24543a;border-radius:1em;font:700 2rem system-ui,sans-serif;color:#24543a;');
    var icon = el('div', 'font-size:4rem;line-height:1;', '⚛️');
    var phrase = el('div', '', PHRASE);
    var body = el('div', 'display:flex;flex-direction:column;align-items:center;');   // the customizer's room
    var close = el('button', 'position:absolute;top:-.6em;right:-.6em;width:64px;height:64px;font:700 1.8rem system-ui,sans-serif;color:#24543a;' +
      'background:#fff;border:.12em solid #24543a;border-radius:50%;cursor:pointer;touch-action:manipulation;padding:0;', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar');
    card.appendChild(icon); card.appendChild(phrase); card.appendChild(body); card.appendChild(close);
    shade.appendChild(card);
    doc.body.appendChild(shade);

    var opened = false;
    function show(on) {
      if (on === opened) return;
      opened = on;
      shade.style.display = on ? 'flex' : 'none';
      if (on && SA.audio && SA.audio.sfx) { try { SA.audio.sfx('pop'); } catch (e) { /* silent */ } }
      if (o.onToggle) o.onToggle(on);
    }
    SA.station.onOpen(function () { show(true); });
    if (SA.station.onClose) SA.station.onClose(function () { show(false); });

    close.addEventListener('click', function () { SA.station.close(); });
    shade.addEventListener('click', function (e) { if (e.target === shade) SA.station.close(); });
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) { shade.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    if (typeof doc.addEventListener === 'function') {
      doc.addEventListener('keydown', function (e) { if (opened && e.key === 'Escape') SA.station.close(); });
    }
    return { element: shade, body: body, isOpen: function () { return opened; } };
  }

  SA.stationMenuView = { create: create, PHRASE: PHRASE };
})(typeof window !== 'undefined' ? window : globalThis);
