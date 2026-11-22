/* SA.albumView.create(doc, o) -> { open(), close(), toggle(), isOpen(), element }: the photo album (DOM only; logic is SA.album).
 *   o.onToggle(isOpen)  optional, e.g. main.js pauses picking while the book is open.
 * A big 📖 button (right side, under the habitat button) opens a full-screen page of cards, one per species:
 *   photographed = the animal icon, its Spanish name (with article) and a row of its body parts as icon chips;
 *   not yet photographed = a dark silhouette with "?".
 * Saved pictures (SA.albumPics.load: first + newest 3) replace the icon on a photographed card; tap one to see it bigger in an overlay with
 * a big ✕ and a 🔊. No picture / no storage keeps the icon card. A 🔊 next to the name also says it.
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

    function speaker(e) {
      var b = el('button', BTN + 'width:56px;height:56px;font-size:1.8rem;border-radius:.6em;', '🔊');
      b.type = 'button';
      b.setAttribute('aria-label', 'Escuchar');
      b.addEventListener('click', function (ev) { ev.stopPropagation(); say(SA.album.speakKey(e)); });
      return b;
    }

    // Enlarged picture: a simple overlay inside the page with a big ✕ and a 🔊 for the animal's name.
    var big = el('div', 'position:fixed;inset:0;z-index:11;display:none;flex-direction:column;align-items:center;justify-content:center;' +
      'gap:12px;background:rgba(0,0,0,.85);padding:12px;box-sizing:border-box;');
    var bigImg = el('img', 'max-width:92%;max-height:68%;border:.2em solid #fff8d6;border-radius:.6em;background:#fff;');
    var bigBar = el('div', 'display:flex;align-items:center;gap:16px;');
    var bigClose = el('button', BTN + 'width:88px;height:88px;font-size:2.6rem;', '✕');
    bigClose.type = 'button';
    bigClose.setAttribute('aria-label', 'Cerrar');
    var bigSay = null;
    bigBar.appendChild(bigClose);
    big.appendChild(bigImg); big.appendChild(bigBar);
    page.appendChild(big);
    function showBig(e, pic) {
      bigImg.src = pic.src;
      bigImg.setAttribute('alt', e.es);
      if (bigSay) bigBar.removeChild(bigSay);
      bigSay = speaker(e);
      bigSay.style.width = bigSay.style.height = '88px';
      bigSay.style.fontSize = '2.6rem';
      bigBar.appendChild(bigSay);
      big.style.display = 'flex';
      say(SA.album.speakKey(e));
    }
    function hideBig() { big.style.display = 'none'; bigImg.src = ''; }
    bigClose.addEventListener('click', function (ev) { ev.stopPropagation(); hideBig(); });
    big.addEventListener('click', hideBig);
    var token = 0;

    // Swaps the icon for the saved pictures (first + newest 3) once they are read; no pictures or no storage = the icon stays.
    function fillPics(e, media, mine) {
      if (!SA.albumPics || !SA.albumPics.load) return;
      SA.albumPics.load(e.id).then(function (pics) {
        if (mine !== token || !pics.length) return;
        while (media.firstChild) media.removeChild(media.firstChild);
        media.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;';
        pics.forEach(function (p) {
          var b = el('button', BTN + 'padding:2px;border-radius:.4em;border-width:.08em;');
          b.type = 'button';
          b.setAttribute('aria-label', e.es);
          var img = el('img', 'display:block;width:' + (pics.length > 2 ? 84 : 120) + 'px;height:auto;border-radius:.3em;');
          img.src = p.src;
          b.appendChild(img);
          b.addEventListener('click', function (ev) { ev.stopPropagation(); showBig(e, p); });
          media.appendChild(b);
        });
      });
    }

    function card(e, mine) {
      var c = el('div', CARD);
      c.setAttribute('role', 'button');
      c.setAttribute('aria-label', e.seen ? e.es : '?');
      if (e.seen) {
        var media = el('div', 'font-size:3.4rem;line-height:1.1;', e.icon);
        c.appendChild(media);
        var nameRow = el('div', 'display:flex;align-items:center;gap:.3em;');
        nameRow.appendChild(el('div', '', e.es));
        nameRow.appendChild(speaker(e));
        c.appendChild(nameRow);
        fillPics(e, media, mine);
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
      var mine = ++token;
      hideBig();
      SA.album.entries().forEach(function (e) { grid.appendChild(card(e, mine)); });
      var p = SA.album.progress();
      title.textContent = '📖 Álbum ' + p.found + '/' + p.total;
    }

    function setOpen(on) {
      if (on === opened) return;
      opened = on;
      if (on) build(); else { token++; hideBig(); }
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
