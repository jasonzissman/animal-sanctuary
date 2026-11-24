/* SA.friendCard: choosing, swapping and renaming your animal friend (AS-0175). DOM only; the rules are SA.friend (pure) and SA.names (naming).
 *
 *   var fc = SA.friendCard.create(doc, { onToggle(open)?, nameCard?, body?, audio? })    (also sets SA.friendCard.open / close)
 *   fc.open()      the picture cards: one per rescued species (a named animal shows its name, e.g. 'Canela la valiente'). A tap picks it, says it and,
 *                  when it has no name yet, opens the name card ('¿Cómo se llama?': name, then adjective) for it. ✕ closes. false when there is
 *                  nobody to choose (fewer than 3 rescues) or it is already open.
 *   fc.rename()    opens the name card again for the current friend (name + adjective picker); false without a friend
 *   fc.isOpen()    fc.close()    fc.element
 * Station (o.body = the station menu's room): when the card opens from the board (not the Insignias) it adds one 'Mi amigo' row once the friend
 * is unlocked: the friend's picture + name with 🔄 (swap: opens the picture cards) and ✏️ (rename). The station closes first, so the cards sit on top.
 * Never required, never a penalty. A no-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var BTN = 'font:700 1.6rem system-ui,sans-serif;color:#24543a;background:#fff8d6;border:.12em solid #24543a;border-radius:.8em;' +
    'cursor:pointer;touch-action:manipulation;margin:0;';

  function create(doc, o) {
    var none = { open: function () { return false; }, rename: function () { return false; }, close: function () {}, isOpen: function () { return false; }, element: null };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !SA.friend) return none;
    o = o || {};
    function el(tag, css, text) {
      var e = doc.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    }
    function say(t) { try { var a = o.audio || SA.audio; if (a && a.say && t) a.say(t); } catch (e) { /* sound never breaks play */ } }
    function clear(n) { while (n.children && n.children.length) { if (n.removeChild) n.removeChild(n.children[0]); else n.children.shift(); } }
    function later(fn, ms) { return typeof root.setTimeout === 'function' ? root.setTimeout(fn, ms) : (fn(), null); }
    function stop(e) { if (e && e.stopPropagation) e.stopPropagation(); }

    var wrap = el('div', 'position:fixed;inset:0;z-index:9;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.35);');
    var panel = el('div', 'position:relative;box-sizing:border-box;max-width:92vw;max-height:92vh;overflow:auto;padding:16px 20px 20px;background:#fff;' +
      'border:.15em solid #24543a;border-radius:1em;display:flex;flex-direction:column;align-items:center;gap:12px;font:700 1.8rem system-ui,sans-serif;color:#24543a;');
    var head = el('div', 'display:flex;align-items:center;gap:12px;');
    var speaker = el('button', BTN + 'width:56px;height:56px;', '🔊');
    var close = el('button', BTN + 'width:56px;height:56px;position:absolute;top:8px;right:8px;', '✕');
    var row = el('div', 'display:flex;flex-wrap:wrap;gap:12px;justify-content:center;');
    [speaker, close].forEach(function (b) { b.type = 'button'; });
    speaker.setAttribute('aria-label', 'Escuchar');
    close.setAttribute('aria-label', 'Cerrar');
    head.appendChild(el('div', '', '🐾 ' + SA.friend.OFFER.es)); head.appendChild(speaker);
    panel.appendChild(head); panel.appendChild(row); panel.appendChild(close);
    wrap.appendChild(panel);
    doc.body.appendChild(wrap);
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) { wrap.addEventListener(ev, stop); });

    var opened = false;
    function setOpen(on) { if (on === opened) return; opened = on; wrap.style.display = on ? 'flex' : 'none'; if (o.onToggle) o.onToggle(on); }
    function shut() { setOpen(false); }

    function nameIt(id, force) {
      var nc = o.nameCard;
      if (!nc || !nc.offer) return false;
      return nc.offer(id, { exact: true, force: !!force, done: function (r) { if (r) say(SA.names.greeting(r.id)); } });
    }

    function pick(c) {
      var cur = SA.friend.current();
      shut();
      if (cur && cur.id === c.id) { say(c.text || c.es); return; }
      if (!SA.friend.choose(c.id)) return;
      say(c.text || c.es);
      if (!c.named) later(function () { nameIt(c.id, false); }, 900);
      else later(function () { say(SA.names.greeting(c.id)); }, 900);
    }

    function render() {
      clear(row);
      var cur = SA.friend.current();
      SA.friend.candidates().forEach(function (c) {
        var mine = !!cur && cur.id === c.id;
        var b = el('button', BTN + 'min-width:140px;min-height:130px;padding:.4em .6em;display:flex;flex-direction:column;align-items:center;gap:.2em;font-size:1.4rem;' +
          (mine ? 'background:#d9f5c9;border-color:#2f9e44;' : ''));
        b.type = 'button';
        b.setAttribute('aria-label', c.text || c.es);
        b.appendChild(el('div', 'font-size:3.4rem;line-height:1.1;', c.icon));
        b.appendChild(el('div', '', c.text || c.es));
        b.addEventListener('click', function (e) { stop(e); pick(c); });
        row.appendChild(b);
      });
    }

    function open() {
      if (opened || !SA.friend.candidates().length) return false;
      render();
      setOpen(true);
      say(SA.friend.OFFER.key);
      return true;
    }
    function rename() {
      var cur = SA.friend.current();
      return !!cur && nameIt(cur.id, true);
    }

    speaker.addEventListener('click', function (e) { stop(e); say(SA.friend.OFFER.key); });
    close.addEventListener('click', function (e) { stop(e); shut(); });

    // The station's 'Mi amigo' row (swap / rename); the station closes first so the cards open above it.
    if (o.body && SA.station && SA.station.onOpen) {
      var strip = el('div', 'display:none;');
      o.body.appendChild(strip);
      var hide = function () { strip.style.cssText = 'display:none;'; };
      var go = function (fn) { if (SA.station.close) SA.station.close(); later(fn, 150); };
      SA.station.onOpen(function (source) {
        if (source === 'badges' || !SA.friend.unlocked() || !SA.friend.candidates().length) { hide(); return; }
        clear(strip);
        var cur = SA.friend.current();
        strip.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:.5em;margin-top:8px;padding:.3em .6em;background:#fff;' +
          'border:.12em solid #24543a;border-radius:.8em;font:700 1.3rem system-ui,sans-serif;';
        strip.appendChild(el('span', 'font-size:2.2rem;line-height:1;', cur ? cur.icon : '🐾'));
        strip.appendChild(el('span', '', cur ? (cur.text || cur.es) : 'Mi amigo'));
        var swap = el('button', BTN + 'min-width:64px;min-height:64px;', '🔄');
        swap.type = 'button'; swap.setAttribute('aria-label', 'Cambiar de amigo');
        swap.addEventListener('click', function (e) { stop(e); go(open); });
        strip.appendChild(swap);
        if (cur) {
          var ren = el('button', BTN + 'min-width:64px;min-height:64px;', '✏️');
          ren.type = 'button'; ren.setAttribute('aria-label', 'Cambiar el nombre');
          ren.addEventListener('click', function (e) { stop(e); go(rename); });
          strip.appendChild(ren);
        }
      });
      if (SA.station.onClose) SA.station.onClose(hide);
    }

    var api = { open: open, rename: rename, close: shut, isOpen: function () { return opened; }, element: wrap };
    SA.friendCard.open = open; SA.friendCard.close = shut; SA.friendCard.rename = rename;
    return api;
  }

  SA.friendCard = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
