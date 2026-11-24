/* SA.stickersPage.fill(doc, container, o) -> { count }: draws the 'Pegatinas' page of the album into `container` (DOM only; AS-0168).
 *   o.say(text)   speaks a string (the album passes SA.audio.say); o.english  show the English names (scaffold).
 * One big sticker per badge from SA.stickers.rows(): earned = a shiny badge-shaped sticker (icon + short name, slightly tilted);
 * locked / in progress = a grey outline with a faded icon, the progress dots and 'have/need noun' ('3/5 tortugas') so kids see what to
 * chase next. Tapping any sticker speaks its name and goal ('Amigo de las tortugas. Rescata 5 tortugas') and wobbles it.
 * The caller clears the container first; the page is rebuilt every time the album opens. A quiet no-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function fill(doc, container, o) {
    o = o || {};
    if (!doc || typeof doc.createElement !== 'function' || !container || !SA.stickers) return { count: 0 };
    function el(tag, css, text) {
      var e = doc.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    }
    function wobble(node) {
      if (!node.animate) return;
      try { node.animate([{ transform: 'rotate(-6deg) scale(1.05)' }, { transform: 'rotate(6deg) scale(1.05)' }, { transform: 'rotate(0)' }], { duration: 300 }); } catch (e) { /* cosmetic */ }
    }

    function sticker(r, i) {
      var grey = !r.earned;
      var tilt = r.earned ? (i % 2 ? 2 : -2) : 0;
      var s = el('div', 'box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:.15em;padding:.5em .4em;cursor:pointer;' +
        'touch-action:manipulation;text-align:center;font:700 1.2rem system-ui,sans-serif;border-radius:1.4em;' +
        'transform:rotate(' + tilt + 'deg);' +
        (grey ? 'background:#e4e4e4;border:.14em dashed #9a9a9a;color:#777;'
          : 'background:linear-gradient(135deg,#fff8d6,#ffe27a);border:.18em solid #f0a020;color:#24543a;box-shadow:0 2px 6px rgba(0,0,0,.35);'));
      s.setAttribute('role', 'button');
      s.setAttribute('aria-label', r.name);
      s.appendChild(el('div', 'font-size:3.2rem;line-height:1.1;' + (grey ? 'filter:grayscale(1) brightness(.8);opacity:.55;' : ''), r.icon));
      s.appendChild(el('div', 'overflow-wrap:anywhere;', r.name));
      if (r.earned) s.appendChild(el('div', 'font-size:1.4rem;', '✅'));
      else {
        if (r.dots) s.appendChild(el('div', 'font-size:1.2rem;letter-spacing:.1em;color:#f0a020;', r.dots));
        s.appendChild(el('div', 'font-size:1rem;font-weight:600;', r.label));
      }
      s.addEventListener('click', function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        if (o.say) o.say(r.say || r.name);
        wobble(s);
      });
      return s;
    }

    var rows = SA.stickers.rows({ english: !!o.english }), sum = SA.stickers.summary(rows);
    var grid = el('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;');
    rows.forEach(function (r, i) { grid.appendChild(sticker(r, i)); });
    container.appendChild(grid);
    return { count: rows.length, earned: sum.earned, total: sum.total, element: grid };
  }

  SA.stickersPage = { fill: fill };
})(typeof window !== 'undefined' ? window : globalThis);
