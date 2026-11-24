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

    var place = SA.hudPlace ? SA.hudPlace.register : function () { return { refresh: noop }; };
    var toggleBtn = el('button', BTN + 'position:fixed;z-index:5;font-size:2.6rem;', '🏡');   // rect from SA.hud ('sandbox')
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-label', 'Hábitat');
    toggleBtn.addEventListener('click', function () { if (handlers.toggle) handlers.toggle(); });
    place('sandbox', toggleBtn, { reserve: true, onPlace: function (r) { toggleBtn.style.fontSize = Math.round(r.height * 0.34) + 'px'; } });

    // The prop tray sits in the bottom-centre tray slot ('feedTray': feeding and building never happen together): an
    // invisible full-slot container with the visible card centred on its bottom edge.
    var trayBox = el('div', 'position:fixed;z-index:5;display:none;box-sizing:border-box;justify-content:center;align-items:flex-end;' +
      'pointer-events:none;');
    var tray = el('div', 'display:flex;align-items:center;gap:.4em;padding:.3em .5em;background:#fff8d6;border:.1em solid #24543a;' +
      'border-radius:1em;box-shadow:0 .15em .6em rgba(0,0,0,.3);pointer-events:auto;');
    trayBox.appendChild(tray);
    var starsEl = el('div', 'font:700 2rem system-ui,sans-serif;color:#24543a;padding:0 .3em;', '⭐ 0');
    tray.appendChild(starsEl);
    var buttons = {};
    SA.data.all('props').filter(function (p) { return !p.mission; }).forEach(function (p) {   // a mission prop is never for sale (AS-0346)
      var b = el('button', BTN + 'min-width:96px;height:96px;font-size:2.8rem;line-height:1.1;', p.icon);
      b.type = 'button';
      b.setAttribute('aria-label', p.name.es);
      b.appendChild(el('div', 'font-size:1.4rem;', '⭐ ' + p.cost));
      b.addEventListener('click', function () { if (handlers.select) handlers.select(p.id); });
      buttons[p.id] = { el: b, cost: p.cost };
      tray.appendChild(b);
    });
    // Gentle messages use the transient 'toast' slot (the same one the prompt's toast uses).
    var toastEl = el('div', 'position:fixed;z-index:6;display:none;box-sizing:border-box;align-items:center;justify-content:center;' +
      'white-space:nowrap;overflow:hidden;padding:0 .4em;background:#fff;color:#24543a;border-radius:1em;' +
      'font:700 2.2rem system-ui,sans-serif;box-shadow:0 .15em .6em rgba(0,0,0,.3);pointer-events:none;');
    doc.body.appendChild(toggleBtn); doc.body.appendChild(trayBox); doc.body.appendChild(toastEl);
    place('feedTray', trayBox, { reserve: true, onPlace: function (r) {
      var s = Math.max(48, Math.min(96, r.height - 24));
      Object.keys(buttons).forEach(function (k) { var b = buttons[k].el.style; b.minWidth = s + 'px'; b.height = s + 'px'; b.fontSize = Math.round(s * 0.29) + 'px'; });
    } });
    place('toast', toastEl, { reserve: true, onPlace: function (r) { toastEl.style.fontSize = Math.max(10, Math.round(r.height * 0.62)) + 'px'; } });

    var timer = null, stars = 0;
    return {
      setActive: function (on) {
        trayBox.style.display = on ? 'flex' : 'none';
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
        toastEl.style.display = 'flex';
        if (typeof root.setTimeout !== 'function') return;
        if (timer !== null) root.clearTimeout(timer);
        timer = root.setTimeout(function () { toastEl.style.display = 'none'; timer = null; }, 1400);
      }
    };
  }

  SA.sandboxView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
