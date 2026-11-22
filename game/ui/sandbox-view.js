/* SA.sandboxView.create(doc, handlers) -> view: the big sandbox button and the prop tray (DOM only).
 *   handlers { toggle(), select(propId) }
 *   view     { setActive(on), select(id|null), setStars(n), toast(msg) }
 * The tray shows one big button per prop: icon + star cost. Props that cost more than the stars owned are dimmed
 * (still tappable: the controller answers with a gentle phrase). Harmless no-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var BTN = 'font:700 2rem system-ui,sans-serif;color:#24543a;background:#fff;border:.1em solid #24543a;' +
    'border-radius:1em;cursor:pointer;touch-action:manipulation;padding:0;';

  function create(doc, handlers) {
    var noop = function () {};
    if (!doc || typeof doc.createElement !== 'function' || !doc.body) return { setActive: noop, select: noop, setStars: noop, toast: noop };
    handlers = handlers || {};
    function el(tag, css, text) {
      var e = doc.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    }

    var toggleBtn = el('button', BTN + 'position:fixed;right:12px;top:84px;z-index:5;width:76px;height:76px;font-size:2.6rem;', '🏡');
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-label', 'Hábitat');
    toggleBtn.addEventListener('click', function () { if (handlers.toggle) handlers.toggle(); });

    var tray = el('div', 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:5;display:none;' +
      'align-items:center;gap:.4em;padding:.3em .5em;background:#fff8d6;border:.1em solid #24543a;border-radius:1em;' +
      'box-shadow:0 .15em .6em rgba(0,0,0,.3);');
    var starsEl = el('div', 'font:700 2rem system-ui,sans-serif;color:#24543a;padding:0 .3em;', '⭐ 0');
    tray.appendChild(starsEl);
    var buttons = {};
    SA.data.all('props').forEach(function (p) {
      var b = el('button', BTN + 'min-width:96px;height:96px;font-size:2.8rem;line-height:1.1;', p.icon);
      b.type = 'button';
      b.setAttribute('aria-label', p.name.es);
      b.appendChild(el('div', 'font-size:1.4rem;', '⭐ ' + p.cost));
      b.addEventListener('click', function () { if (handlers.select) handlers.select(p.id); });
      buttons[p.id] = { el: b, cost: p.cost };
      tray.appendChild(b);
    });
    var toastEl = el('div', 'position:fixed;top:30%;left:50%;transform:translateX(-50%);z-index:6;display:none;' +
      'padding:.2em .8em;background:#fff;color:#24543a;border-radius:1em;font:700 2.2rem system-ui,sans-serif;' +
      'box-shadow:0 .15em .6em rgba(0,0,0,.3);pointer-events:none;');
    doc.body.appendChild(toggleBtn); doc.body.appendChild(tray); doc.body.appendChild(toastEl);

    var timer = null, stars = 0;
    return {
      setActive: function (on) {
        tray.style.display = on ? 'flex' : 'none';
        toggleBtn.textContent = on ? '🎮' : '🏡';
        toggleBtn.style.background = on ? '#ffe9a8' : '#fff';
        if (!on) toastEl.style.display = 'none';
      },
      select: function (id) {
        Object.keys(buttons).forEach(function (k) {
          buttons[k].el.style.background = k === id ? '#ffe9a8' : '#fff';
          buttons[k].el.style.outline = k === id ? '.12em solid #e8a400' : 'none';
        });
      },
      setStars: function (n) {
        stars = n;
        starsEl.textContent = '⭐ ' + n;
        Object.keys(buttons).forEach(function (k) { buttons[k].el.style.opacity = buttons[k].cost > stars ? '0.5' : '1'; });
      },
      toast: function (msg) {
        toastEl.textContent = msg;
        toastEl.style.display = 'block';
        if (typeof root.setTimeout !== 'function') return;
        if (timer !== null) root.clearTimeout(timer);
        timer = root.setTimeout(function () { toastEl.style.display = 'none'; timer = null; }, 1400);
      }
    };
  }

  SA.sandboxView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
