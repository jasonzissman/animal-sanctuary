/* SA.albumView.create(doc, o) -> { open(), close(), toggle(), isOpen(), element }: the photo album (DOM only; logic is SA.album).
 *   o.onToggle(isOpen)  optional, e.g. main.js pauses picking while the book is open.
 * A big 📖 button (right side, under the habitat button) opens a full-screen page of cards, one per species:
 *   photographed = the animal icon, its Spanish name (with article) and a row of its body parts as icon chips;
 *   not yet photographed = a dark silhouette with "?".
 * Tapping a card speaks the animal name; tapping a part chip speaks the part (SA.audio.say with the vocab key). A silhouette
 * only wobbles (no name: it stays a surprise). The page is rebuilt each time it opens, so new photos show up. No-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var BTN = 'font:700 2rem system-ui,sans-serif;color:#24543a;background:#fff;border:.1em solid #24543a;border-radius:1em;' +
    'cursor:pointer;touch-action:manipulation;padding:0;';
  var CARD = 'position:relative;display:flex;flex-direction:column;align-items:center;gap:.2em;padding:.5em .4em;margin:0;' +
    'background:#fff8d6;border:.12em solid #24543a;border-radius:.8em;font:700 1.5rem system-ui,sans-serif;color:#24543a;' +
    'cursor:pointer;touch-action:manipulation;';

  function create(doc, o) {
    var none = { open: function () {}, close: function () {}, toggle: function () {}, isOpen: function () { return false; }, element: null };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !SA.album) return none;
    o = o || {};
    function el(tag, css, text) {
      var e = doc.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    }
    function say(key) { if (key && SA.audio && SA.audio.say) SA.audio.say(key); }

    var opener = el('button', BTN + 'position:fixed;z-index:5;font-size:2.6rem;', '📖');   // rect from SA.hud ('album')
    opener.type = 'button';
    if (SA.hudPlace) SA.hudPlace.register('album', opener, { reserve: true, onPlace: function (r) { opener.style.fontSize = Math.round(r.height * 0.34) + 'px'; } });
    opener.setAttribute('aria-label', 'Álbum');
    var page = el('div', 'position:fixed;inset:0;z-index:10;display:none;flex-direction:column;background:rgba(36,84,58,.94);' +
      'padding:12px;box-sizing:border-box;overflow:auto;');
    var head = el('div', 'display:flex;align-items:center;gap:.6em;color:#fff8d6;font:700 2rem system-ui,sans-serif;margin-bottom:.4em;');
    var title = el('div', 'flex:1;', '📖 Álbum');
    var close = el('button', BTN + 'width:64px;height:64px;font-size:1.8rem;', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar');
    head.appendChild(title); head.appendChild(close);
    var grid = el('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;');
    page.appendChild(head); page.appendChild(grid);
    doc.body.appendChild(opener);
    doc.body.appendChild(page);
    var opened = false;

    function wobble(node) {
      if (!node.animate) return;
      try { node.animate([{ transform: 'rotate(-6deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(0)' }], { duration: 300 }); } catch (e) { /* cosmetic */ }
    }

    function chip(p) {
      var c = el('button', BTN + 'width:56px;height:56px;font-size:1.8rem;border-radius:.6em;', p.icon);
      c.type = 'button';
      c.title = p.es;
      c.setAttribute('aria-label', p.es);
      c.addEventListener('click', function (e) { e.stopPropagation(); say(p.speak); });
      return c;
    }

    function card(e) {
      var c = el('div', CARD);
      c.setAttribute('role', 'button');
      c.setAttribute('aria-label', e.seen ? e.es : '?');
      if (e.seen) {
        c.appendChild(el('div', 'font-size:3.4rem;line-height:1.1;', e.icon));
        c.appendChild(el('div', '', e.es));
        var row = el('div', 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;');
        e.parts.forEach(function (p) { row.appendChild(chip(p)); });
        c.appendChild(row);
      } else {
        c.style.background = '#cfd8d2';
        c.appendChild(el('div', 'font-size:3.4rem;line-height:1.1;filter:brightness(0) opacity(.45);', e.silhouette || '🐾'));
        c.appendChild(el('div', 'font-size:2.2rem;', '?'));
      }
      c.addEventListener('click', function () { if (e.seen) say(SA.album.speakKey(e)); else wobble(c); });
      return c;
    }

    function build() {
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      SA.album.entries().forEach(function (e) { grid.appendChild(card(e)); });
      var p = SA.album.progress();
      title.textContent = '📖 Álbum ' + p.found + '/' + p.total;
    }

    function setOpen(on) {
      if (on === opened) return;
      opened = on;
      if (on) build();
      page.style.display = on ? 'flex' : 'none';
      if (o.onToggle) o.onToggle(on);
    }

    // Pointer events on the buttons stop here so a tap never also walks/picks in the 3D world underneath.
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) {
      opener.addEventListener(ev, function (e) { e.stopPropagation(); });
      page.addEventListener(ev, function (e) { e.stopPropagation(); });
    });
    opener.addEventListener('click', function () { setOpen(!opened); });
    close.addEventListener('click', function () { setOpen(false); });
    return { open: function () { setOpen(true); }, close: function () { setOpen(false); },
      toggle: function () { setOpen(!opened); }, isOpen: function () { return opened; }, element: opener };
  }

  SA.albumView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
