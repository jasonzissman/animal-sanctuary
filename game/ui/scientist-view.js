/* SA.scientistView.create(doc, o) -> { element, isOpen(), open(source), close(), replayIntro() }: the scientist's reminder card (DOM only).
 *   o.onToggle(isOpen)   optional, e.g. main.js pauses picking while it shows.
 *   o.onReplayIntro()    called after the card closes when the kid taps 💬: plays the whole intro conversation again
 *                        (SA.introView start(true); a replay never starts a mission).
 * Opens when SA.npc.talk() fires (E / Enter on the outlined scientist, or a tap on her). It shows the picture cards from
 * SA.scientistTalk.reminder() (🧑‍🔬, the one-line general mission, then the current mission and step, or "pick a mission at the
 * board"), speaks them one after the other (SA.audio.say), and has a big 🔊 Replay, a 💬 replay-the-intro button and ✕.
 * It only talks: it never starts a mission. No-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var BTN = 'font:700 1.6rem system-ui,sans-serif;color:#24543a;background:#fff;border:.12em solid #24543a;border-radius:.8em;' +
    'cursor:pointer;touch-action:manipulation;min-height:72px;min-width:72px;padding:0 .8em;margin:0;';

  function create(doc, o) {
    var none = { element: null, isOpen: function () { return false; }, open: function () { return false; }, close: function () {}, replayIntro: function () {} };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !SA.npc || !SA.npc.onTalk || !SA.scientistTalk) return none;
    o = o || {};
    function el(tag, css, text) {
      var e = doc.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    }
    function clear(n) {
      while (n.children && n.children.length) { if (n.removeChild) n.removeChild(n.children[0]); else n.children.shift(); }
    }

    var shade = el('div', 'position:fixed;inset:0;z-index:13;display:none;align-items:center;justify-content:center;' +
      'background:rgba(36,84,58,.6);touch-action:manipulation;');
    var card = el('div', '');
    shade.appendChild(card);
    doc.body.appendChild(shade);

    var opened = false, talk = null, token = 0;

    function say(line, done) {
      try { if (SA.audio && SA.audio.say) { SA.audio.say(line.key, done); return; } } catch (e) { /* fall through */ }
      if (done) done();
    }
    // Speaks every line in order; a newer call (Replay, close) cancels the older chain.
    function speak() {
      token += 1;
      var mine = token, i = 0;
      if (SA.audio && SA.audio.stopVoice) { try { SA.audio.stopVoice(); } catch (e) { /* silent */ } }
      function step() {
        if (mine !== token || !opened || !talk || i >= talk.lines.length) return;
        say(talk.lines[i++], step);
      }
      step();
    }

    function show(on) {
      if (on === opened) return;
      opened = on;
      shade.style.display = on ? 'flex' : 'none';
      if (!on) { token += 1; if (SA.audio && SA.audio.stopVoice) { try { SA.audio.stopVoice(); } catch (e) { /* silent */ } } }
      if (o.onToggle) o.onToggle(on);
    }

    function button(label, aria, fn) {
      var b = el('button', BTN, label);
      b.type = 'button';
      b.setAttribute('aria-label', aria);
      b.addEventListener('click', function (e) { if (e && e.stopPropagation) e.stopPropagation(); fn(); });
      return b;
    }

    function close() { show(false); }
    function replayIntro() {
      close();
      try { if (o.onReplayIntro) o.onReplayIntro(); } catch (e) { if (root.SAT && root.SAT.error) { try { root.SAT.error('scientist.replayIntro', e); } catch (x) { /* silent */ } } }
    }

    function render() {
      clear(card);
      card.style.cssText = 'box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:.4em;' +
        'width:min(92vw,520px);max-height:94vh;overflow:auto;padding:.8em 1em;background:#fff8d6;border:.18em solid #24543a;' +
        'border-radius:1em;font:700 2rem system-ui,sans-serif;color:#24543a;text-align:center;';
      card.appendChild(el('div', 'font-size:2.6rem;line-height:1;', '🧑‍🔬'));
      talk.lines.forEach(function (l) {
        var row = el('div', 'display:flex;flex-direction:column;align-items:center;');
        row.appendChild(el('div', 'font-size:' + (l.role === 'general' ? '3rem' : '4rem') + ';line-height:1.1;overflow-wrap:anywhere;', l.icon));
        row.appendChild(el('div', 'font-size:1.5rem;line-height:1.15;overflow-wrap:anywhere;', l.es));
        card.appendChild(row);
      });
      var btns = el('div', 'display:flex;flex-wrap:wrap;gap:12px;justify-content:center;');
      btns.appendChild(button('🔊', 'Otra vez', speak));
      btns.appendChild(button(talk.replay.icon, talk.replay.es, replayIntro));
      btns.appendChild(button('✕', 'Cerrar', close));
      card.appendChild(btns);
    }

    function open(source) {
      if (opened) return false;
      talk = SA.scientistTalk.reminder();
      try { if (root.SAT && root.SAT.track) root.SAT.track('scientist.talk', { source: source || 'api', state: talk.state }); } catch (e) { /* telemetry never blocks */ }
      show(true);
      render();
      if (SA.audio && SA.audio.sfx) { try { SA.audio.sfx('pop'); } catch (e) { /* silent */ } }
      speak();
      return true;
    }

    SA.npc.onTalk(function (source) { return open(source); });
    shade.addEventListener('click', function (e) { if (e.target === shade) close(); });
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) { shade.addEventListener(ev, function (e) { if (e && e.stopPropagation) e.stopPropagation(); }); });
    if (root.addEventListener) root.addEventListener('keydown', function (e) { if (opened && e && e.key === 'Escape') close(); });

    return { element: shade, isOpen: function () { return opened; }, open: open, close: close, replayIntro: replayIntro };
  }

  SA.scientistView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
