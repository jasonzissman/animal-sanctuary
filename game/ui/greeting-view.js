/* SA.greetingView.create(doc, o) -> { element, isOpen(), open(player), close(), update(player) }: the scientist's hello card (DOM only).
 *   o.onToggle(isOpen)   optional, e.g. main.js pauses picking while it shows.
 *   o.auto               false = do not open at once (tests); default: opens as soon as it is created (the world is shown).
 *   o.player()           optional: where the kid stands now (to notice walking away); update(player) is also called every frame.
 * Same card style as the scientist's reminder card (ui/scientist-view.js): 🧑‍🔬, then BOTH lines at once (picture + short phrase;
 * the English line only when the English toggle is on), 🔊 replay and ✕. It closes on ✕, Enter / E, a tap anywhere, or as soon as the
 * kid starts walking. Logic: SA.greeting (game/greeting.js). Voice: SA.audio.say, line 1 then line 2. It never starts a mission.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var BTN = 'font:700 1.6rem system-ui,sans-serif;color:#24543a;background:#fff;border:.12em solid #24543a;border-radius:.8em;' +
    'cursor:pointer;touch-action:manipulation;min-height:72px;min-width:72px;padding:0 .8em;margin:0;';

  function create(doc, o) {
    var none = { element: null, isOpen: function () { return false; }, open: function () { return false; }, close: function () {}, update: function () {} };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !SA.greeting) return none;
    o = o || {};
    var G = SA.greeting.create(o.logic || {});
    function el(tag, css, text) {
      var e = doc.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    }
    function english() { try { return !!(SA.save && SA.save.get().settings.english); } catch (e) { return false; } }

    var shade = el('div', 'position:fixed;inset:0;z-index:13;display:none;align-items:center;justify-content:center;' +
      'background:rgba(36,84,58,.45);touch-action:manipulation;');
    var card = el('div', 'box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:.4em;' +
      'width:min(92vw,520px);max-height:94vh;overflow:auto;padding:.8em 1em;background:#fff8d6;border:.18em solid #24543a;' +
      'border-radius:1em;font:700 2rem system-ui,sans-serif;color:#24543a;text-align:center;');
    shade.appendChild(card);
    doc.body.appendChild(shade);

    var token = 0;
    function stopVoice() { token += 1; if (SA.audio && SA.audio.stopVoice) { try { SA.audio.stopVoice(); } catch (e) { /* silent */ } } }
    // Line 1 then line 2; a newer call (Replay, close) cancels the older chain.
    function speak() {
      stopVoice();
      var mine = token, ls = SA.greeting.lines(), i = 0;
      function step() {
        if (mine !== token || !G.isOpen() || i >= ls.length) return;
        var key = ls[i++].key;
        try { if (SA.audio && SA.audio.say) { SA.audio.say(key, step); return; } } catch (e) { /* fall through */ }
        step();
      }
      step();
    }

    function button(label, aria, fn) {
      var b = el('button', BTN, label);
      b.type = 'button';
      b.setAttribute('aria-label', aria);
      b.addEventListener('click', function (e) { if (e && e.stopPropagation) e.stopPropagation(); fn(); });
      return b;
    }

    function render() {
      while (card.children.length) card.removeChild(card.children[0]);
      card.appendChild(el('div', 'font-size:2.6rem;line-height:1;', '🧑‍🔬'));
      var en = english();
      SA.greeting.lines().forEach(function (l) {
        var row = el('div', 'display:flex;flex-direction:column;align-items:center;');
        row.appendChild(el('div', 'font-size:3.6rem;line-height:1.1;overflow-wrap:anywhere;', l.icon));
        row.appendChild(el('div', 'font-size:1.5rem;line-height:1.15;overflow-wrap:anywhere;', l.es));
        if (en) row.appendChild(el('div', 'font-size:1rem;font-weight:400;line-height:1.15;', l.en));
        card.appendChild(row);
      });
      var btns = el('div', 'display:flex;flex-wrap:wrap;gap:12px;justify-content:center;');
      btns.appendChild(button('🔊', 'Otra vez', speak));
      btns.appendChild(button('✕', 'Cerrar', function () { closeWith('x'); }));
      card.appendChild(btns);
    }

    function hide() {
      shade.style.display = 'none';
      stopVoice();
      if (o.onToggle) o.onToggle(false);
    }
    function closeWith(reason) { if (G.close(reason)) hide(); }
    function open(player) {
      var p = player || (o.player ? o.player() : null);
      if (!G.open(p)) return false;
      render();
      shade.style.display = 'flex';
      if (o.onToggle) o.onToggle(true);
      speak();
      return true;
    }

    // A tap on the card or around it closes it (the buttons stop their own clicks); pointer events never reach the world behind.
    shade.addEventListener('click', function () { if (G.onTap()) hide(); });
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) { shade.addEventListener(ev, function (e) { if (e && e.stopPropagation) e.stopPropagation(); }); });
    // Capture phase, so Enter / E close the card instead of also talking to the scientist; walking keys close it and walk on.
    if (root.addEventListener) {
      root.addEventListener('keydown', function (e) {
        var r = G.onKey(e);
        if (r === 'none') return;
        hide();
        if (r === 'closed') { if (e.preventDefault) e.preventDefault(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
      }, true);
    }

    if (o.auto !== false) open();
    return { element: shade, isOpen: G.isOpen, open: open, close: function () { closeWith('api'); },
      update: function (p) { if (G.update(p)) hide(); } };
  }

  SA.greetingView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
