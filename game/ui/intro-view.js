/* SA.introView.create(doc, o) -> { element, isOpen(), start(), close() }: the scientist's first conversation (DOM only).
 *   o.onToggle(isOpen)  optional, e.g. main.js pauses picking while it shows.
 *   o.auto              false = do not auto-play (tests); default: plays at once when SA.introDialogue.shouldPlay() (a new save).
 * One full-screen card at a time: 🧑‍🔬, a big picture (icon), a short subtitle (<= 6 words), a 🔊 Replay button and a big ⏭️ skip
 * button. Tapping the card advances line by line; the lines also move on by themselves once the voice is done (at least
 * MIN_MS on a line, at most MAX_MS), so the whole talk is ~15-20 s. Skip (one tap) or the last line ends it:
 * SA.introDialogue.finish() sets the introSeen flag, makes sure la cámara is in the hotbar and starts Mission 1.
 * Voice: SA.audio.say(vocabKey) (clip, else speechSynthesis; muted = the subtitle alone). No-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var BTN = 'font:700 1.6rem system-ui,sans-serif;color:#24543a;background:#fff;border:.12em solid #24543a;border-radius:.8em;' +
    'cursor:pointer;touch-action:manipulation;min-height:72px;min-width:72px;padding:0 .8em;margin:0;';

  function create(doc, o) {
    var none = { element: null, isOpen: function () { return false; }, start: function () {}, close: function () {} };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !SA.introDialogue) return none;
    o = o || {};
    var D = SA.introDialogue;
    function el(tag, css, text) {
      var e = doc.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    }
    function clear(n) {
      while (n.children && n.children.length) { if (n.removeChild) n.removeChild(n.children[0]); else n.children.shift(); }
    }
    function later(fn, ms) { return typeof root.setTimeout === 'function' ? root.setTimeout(fn, ms) : null; }
    function cancel(t) { if (t !== null && typeof root.clearTimeout === 'function') root.clearTimeout(t); }

    var shade = el('div', 'position:fixed;inset:0;z-index:14;display:none;align-items:center;justify-content:center;' +
      'background:rgba(36,84,58,.7);touch-action:manipulation;cursor:pointer;');
    var card = el('div', '');
    shade.appendChild(card);
    doc.body.appendChild(shade);

    var state = null, opened = false, hold = null, cap = null, minDone = false, spoke = false, token = 0;

    function show(on) {
      if (on === opened) return;
      opened = on;
      shade.style.display = on ? 'flex' : 'none';
      if (o.onToggle) o.onToggle(on);
    }
    function stopTimers() { cancel(hold); cancel(cap); hold = cap = null; }

    function say() {
      var v = D.view(state), mine = token;
      if (!v || !SA.audio || !SA.audio.say) { spoke = true; return; }
      try { SA.audio.say(v.line.vocabKey, function () { if (mine === token) { spoke = true; tryAuto(); } }); }
      catch (e) { spoke = true; }
    }

    function tryAuto() { if (opened && state && !state.done && minDone && spoke) advance(); }

    function enterLine() {
      token += 1;
      minDone = false; spoke = false;
      stopTimers();
      var mine = token;
      hold = later(function () { if (mine === token) { minDone = true; tryAuto(); } }, D.MIN_MS);
      cap = later(function () { if (mine === token) { minDone = true; spoke = true; tryAuto(); } }, D.MAX_MS);
      render();
      say();
    }

    function end() {
      stopTimers();
      token += 1;
      var finished = state;
      state = null;
      show(false);
      try { D.finish(finished); } catch (e) { if (root.SAT && root.SAT.error) { try { root.SAT.error('intro.finish', e); } catch (x) { /* silent */ } } }
    }

    function advance() {
      state = D.next(state);
      if (state && state.done) end(); else enterLine();
    }
    function skipAll() {
      if (!state) return;
      if (SA.audio && SA.audio.stopVoice) { try { SA.audio.stopVoice(); } catch (e) { /* silent */ } }
      state = D.skip(state);
      end();
    }

    function button(label, aria, fn) {
      var b = el('button', BTN, label);
      b.type = 'button';
      b.setAttribute('aria-label', aria);
      b.addEventListener('click', function (e) { if (e && e.stopPropagation) e.stopPropagation(); fn(); });
      return b;
    }

    function render() {
      var v = D.view(state);
      clear(card);
      if (!v) return;
      card.style.cssText = 'box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:.4em;' +
        'width:min(92vw,520px);max-height:94vh;padding:.8em 1em;background:#fff8d6;border:.18em solid #24543a;border-radius:1em;' +
        'font:700 2rem system-ui,sans-serif;color:#24543a;text-align:center;';
      card.appendChild(el('div', 'font-size:2.6rem;line-height:1;', '🧑‍🔬'));
      card.appendChild(el('div', 'font-size:5.5rem;line-height:1.1;overflow-wrap:anywhere;', v.line.icon));
      card.appendChild(el('div', 'font-size:1.8rem;line-height:1.15;overflow-wrap:anywhere;', v.line.es));
      var dots = '';
      for (var i = 0; i < v.total; i++) dots += i === v.index ? '●' : '○';
      card.appendChild(el('div', 'font-size:1.2rem;letter-spacing:.2em;', dots));
      var row = el('div', 'display:flex;flex-wrap:wrap;gap:12px;justify-content:center;');
      row.appendChild(button('🔊', 'Otra vez', say));
      row.appendChild(button('⏭️', 'Saltar', skipAll));
      card.appendChild(row);
    }

    function start() {
      if (opened || !D.shouldPlay()) return;
      state = D.begin();
      if (!state) return;
      show(true);
      enterLine();
    }

    // Tap anywhere on the card or shade = the next line (the buttons stop their own clicks).
    shade.addEventListener('click', function () { if (opened && state) advance(); });
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) { shade.addEventListener(ev, function (e) { if (e && e.stopPropagation) e.stopPropagation(); }); });

    if (o.auto !== false) start();
    return { element: shade, isOpen: function () { return opened; }, start: start, close: function () { if (opened) skipAll(); } };
  }

  SA.introView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
