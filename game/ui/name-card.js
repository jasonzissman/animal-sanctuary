/* SA.nameCard: the '¿Cómo se llama?' card shown after a rescue photo (AS-0169). DOM only; the flow is SA.names.session (pure).
 *
 *   var card = SA.nameCard.create(doc, { onToggle(open)?, resolve(animalId) -> individualId | null, audio? })
 *   card.offer(animalId) -> true when the card opened (false when it is open already, the animal has no individual id, or it is already named)
 *   card.isOpen()   card.close()   card.element
 * Step 1: three big spoken name cards. Step 2: three big adjective cards (icon + the word that agrees with the animal). Tapping a card says it
 * ('Luna', then 'Luna la rápida') and moves on; the last tap saves the name, says '¡Hola, Luna la rápida!' and the card closes. ✕ skips at
 * any time (a name picked already is kept by itself). Never required, never a penalty. 🔊 repeats the question. A no-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var BTN = 'font:700 1.6rem system-ui,sans-serif;color:#24543a;background:#fff8d6;border:.12em solid #24543a;border-radius:.8em;' +
    'cursor:pointer;touch-action:manipulation;';
  var CLOSE_MS = 1600;

  function create(doc, o) {
    var none = { offer: function () { return false; }, isOpen: function () { return false; }, close: function () {}, element: null };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !SA.names) return none;
    o = o || {};
    function el(tag, css, text) {
      var e = doc.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    }
    function say(text) { try { var a = o.audio || SA.audio; if (a && a.say && text) a.say(text); } catch (e) { /* sound never breaks play */ } }
    function later(fn, ms) { return typeof root.setTimeout === 'function' ? root.setTimeout(fn, ms) : (fn(), null); }

    var wrap = el('div', 'position:fixed;inset:0;z-index:9;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.35);');
    var panel = el('div', 'position:relative;box-sizing:border-box;max-width:92vw;padding:16px 20px 20px;background:#fff;border:.15em solid #24543a;' +
      'border-radius:1em;display:flex;flex-direction:column;align-items:center;gap:12px;font:700 1.8rem system-ui,sans-serif;color:#24543a;');
    var head = el('div', 'display:flex;align-items:center;gap:12px;');
    var title = el('div', '', '🐾 ¿Cómo se llama?');
    var speaker = el('button', BTN + 'width:56px;height:56px;font-size:1.6rem;', '🔊');
    var close = el('button', BTN + 'width:56px;height:56px;font-size:1.6rem;position:absolute;top:8px;right:8px;', '✕');
    [speaker, close].forEach(function (b) { b.type = 'button'; });
    speaker.setAttribute('aria-label', 'Escuchar');
    close.setAttribute('aria-label', 'Saltar');
    var chosenLine = el('div', 'min-height:1.4em;font-size:1.6rem;');
    var row = el('div', 'display:flex;flex-wrap:wrap;gap:12px;justify-content:center;');
    head.appendChild(title); head.appendChild(speaker);
    panel.appendChild(head); panel.appendChild(chosenLine); panel.appendChild(row); panel.appendChild(close);
    wrap.appendChild(panel);
    doc.body.appendChild(wrap);
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) { wrap.addEventListener(ev, function (e) { if (e && e.stopPropagation) e.stopPropagation(); }); });

    var session = null, opened = false, busy = false;

    function setOpen(on) {
      if (on === opened) return;
      opened = on;
      wrap.style.display = on ? 'flex' : 'none';
      if (o.onToggle) o.onToggle(on);
    }

    function render() {
      while (row.firstChild) row.removeChild(row.firstChild);
      if (!session) return;
      chosenLine.textContent = session.text();
      session.options().forEach(function (opt, i) {
        var b = el('button', BTN + 'min-width:140px;min-height:120px;padding:.4em .6em;display:flex;flex-direction:column;align-items:center;gap:.2em;');
        b.type = 'button';
        b.setAttribute('aria-label', opt.es);
        b.appendChild(el('div', 'font-size:2.8rem;line-height:1.1;', opt.icon));
        b.appendChild(el('div', '', opt.es));
        b.addEventListener('click', function (e) { if (e && e.stopPropagation) e.stopPropagation(); pick(i, opt); });
        row.appendChild(b);
      });
    }

    function pick(i, opt) {
      if (!session || busy) return;
      say(opt.speak);
      var step = session.choose(i);
      if (step === 'done') { finish(); return; }
      render();
    }

    function finish() {
      var r = session && session.result;
      busy = true;
      while (row.firstChild) row.removeChild(row.firstChild);
      if (r) {
        title.textContent = '🎉 ' + r.text;
        chosenLine.textContent = '';
        say(SA.names.greeting(r.id));
        later(function () { busy = false; shut(); }, CLOSE_MS);
      } else { busy = false; shut(); }
    }

    function shut() { session = null; setOpen(false); }

    function skip() {
      if (!session || busy) return;
      session.skip();
      finish();
    }

    speaker.addEventListener('click', function (e) { if (e && e.stopPropagation) e.stopPropagation(); say('¿Cómo se llama?'); });
    close.addEventListener('click', function (e) { if (e && e.stopPropagation) e.stopPropagation(); skip(); });

    function offer(animalId) {
      if (opened || typeof animalId !== 'string') return false;
      var id = o.resolve ? o.resolve(animalId) : animalId;
      if (!id || SA.names.has(id)) return false;
      session = SA.names.session(id);
      busy = false;
      title.textContent = '🐾 ¿Cómo se llama?';
      render();
      setOpen(true);
      say('¿Cómo se llama?');
      return true;
    }

    return { offer: offer, isOpen: function () { return opened; }, close: function () { if (opened) { busy = false; skip(); } }, element: wrap };
  }

  SA.nameCard = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
