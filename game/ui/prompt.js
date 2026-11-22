/* SA.prompt: the Scout & Spot prompt bar and the round controller (needs SA.round, SA.picking, SA.audio).
 *
 *   SA.prompt.start({ doc, fx, audio?, game? }) -> controller   (called by game/main.js)
 *       Builds the prompt bar, subscribes to SA.picking.onPick and begins the first round.
 *   SA.prompt.createController({ game, view, fx, audio, later }) -> { begin, onPick, replay, hint }
 *       Pure wiring (unit-tested with stubs): speaks the clue, plays chime/confetti/name on a correct pick,
 *       boing + wobble on a wrong one (the round just continues), then starts the next round after NEXT_MS.
 *   SA.prompt.createView(doc) -> view   the DOM bar: silhouette/icon hint, short Spanish clue, Replay, hint button,
 *       star counter, confetti and toast. Harmless no-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var NEXT_MS = 2200;      // celebration time before the next clue

  var ICONS = { conejo: '🐰', pato: '🦆', tortuga: '🐢', mono: '🐵', tucan: '🦜', rana: '🐸' };
  function iconFor(animalId) { return ICONS[animalId] || '🐾'; }

  function createController(o) {
    var game = o.game, view = o.view, fx = o.fx, audio = o.audio || SA.audio;
    var later = o.later || function (fn, ms) { return root.setTimeout(fn, ms); };

    function say(key) { try { if (audio && audio.say) audio.say(key); } catch (e) { /* silent */ } }
    function sfx(name) { try { if (audio && audio.sfx) audio.sfx(name); } catch (e) { /* silent */ } }

    function begin() {
      var r = game.start();
      if (!r) { view.clear(); return null; }
      view.showRound({ text: r.clue.text, icon: iconFor(r.answerId), hintShown: r.hintShown, stars: SA.save.get().stars });
      say(r.clue.text);
      return r;
    }

    function onPick(p) {
      var res = game.pick(p);
      if (res.status === 'wrong') {
        sfx('boing');
        if (fx) fx.play(p.animalId, 'wobble');
        view.toast('¡Casi! 🙈');
        view.shake();
      } else if (res.status === 'correct') {
        sfx('chime');
        if (fx) fx.play(res.animalId, 'boing');
        view.celebrate({ icon: iconFor(res.animalId), stars: res.stars });
        view.confetti();
        var vocab = SA.vocab && SA.vocab.get('animal:' + res.animalId);
        view.toast('¡Muy bien! ⭐' + (vocab ? ' ' + vocab.es : ''));
        say('animal:' + res.animalId);
        later(begin, NEXT_MS);
      }
      return res;
    }

    function replay() { var r = game.current(); if (r) say(r.clue.text); }

    function hint() {
      var r = game.hint();
      if (r) view.showHint();
    }

    return { begin: begin, onPick: onPick, replay: replay, hint: hint };
  }

  var BAR_CSS = 'position:fixed;top:12px;left:12px;right:90px;z-index:4;display:flex;align-items:center;gap:.5em;' +
    'padding:.3em .6em;background:#fff8d6;color:#24543a;border:.12em solid #24543a;border-radius:1em;' +
    'box-shadow:0 .15em .6em rgba(0,0,0,.3);font:700 2rem system-ui,sans-serif;touch-action:manipulation;';
  var BTN_CSS = 'font-size:1.8rem;min-width:64px;height:64px;border-radius:50%;border:.1em solid #24543a;' +
    'background:#fff;cursor:pointer;padding:0;touch-action:manipulation;';

  function createView(doc, handlers) {
    var noop = function () {};
    if (!doc || typeof doc.createElement !== 'function' || !doc.body) {
      return { showRound: noop, celebrate: noop, clear: noop, toast: noop, shake: noop, confetti: noop, showHint: noop };
    }
    handlers = handlers || {};
    function el(tag, css, text) {
      var e = doc.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    }
    var bar = el('div', BAR_CSS);
    bar.setAttribute('aria-live', 'polite');
    var icon = el('span', 'font-size:2.6rem;line-height:1;', '❓');
    var text = el('span', 'flex:1;');
    var hintBtn = el('button', BTN_CSS, '💡');
    hintBtn.type = 'button';
    hintBtn.setAttribute('aria-label', 'Pista');
    var replayBtn = el('button', BTN_CSS, '🔁');
    replayBtn.type = 'button';
    replayBtn.setAttribute('aria-label', 'Otra vez');
    var starsEl = el('div', 'position:fixed;left:12px;bottom:12px;z-index:4;padding:.1em .6em;background:#fff8d6;' +
      'border:.1em solid #24543a;border-radius:1em;font:700 2rem system-ui,sans-serif;color:#24543a;', '⭐ 0');
    var toastEl = el('div', 'position:fixed;top:96px;left:50%;transform:translateX(-50%);z-index:5;display:none;' +
      'padding:.2em .8em;background:#fff;color:#24543a;border-radius:1em;font:700 2.2rem system-ui,sans-serif;' +
      'box-shadow:0 .15em .6em rgba(0,0,0,.3);pointer-events:none;');
    bar.appendChild(icon); bar.appendChild(text); bar.appendChild(hintBtn); bar.appendChild(replayBtn);
    doc.body.appendChild(bar); doc.body.appendChild(starsEl); doc.body.appendChild(toastEl);
    hintBtn.addEventListener('click', function () { if (handlers.hint) handlers.hint(); });
    replayBtn.addEventListener('click', function () { if (handlers.replay) handlers.replay(); });
    var toastTimer = null;

    function setIcon(emoji, silhouette) {
      icon.textContent = emoji;
      icon.style.filter = silhouette ? 'brightness(0) opacity(.7)' : 'none';
    }

    var current = '🐾';
    return {
      showRound: function (r) {
        current = r.icon;
        text.textContent = r.text;
        starsEl.textContent = '⭐ ' + r.stars;
        hintBtn.style.display = r.hintShown ? 'none' : '';
        if (r.hintShown) setIcon(r.icon, true); else setIcon('❓', false);
      },
      showHint: function () { hintBtn.style.display = 'none'; setIcon(current, true); },
      celebrate: function (r) { setIcon(r.icon, false); starsEl.textContent = '⭐ ' + r.stars; hintBtn.style.display = 'none'; },
      clear: function () { text.textContent = ''; },
      toast: function (msg) {
        toastEl.textContent = msg;
        toastEl.style.display = 'block';
        if (toastTimer !== null) root.clearTimeout(toastTimer);
        toastTimer = root.setTimeout(function () { toastEl.style.display = 'none'; toastTimer = null; }, 1400);
      },
      shake: function () {
        if (typeof bar.animate === 'function') {
          bar.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-12px)' }, { transform: 'translateX(12px)' },
            { transform: 'translateX(-8px)' }, { transform: 'translateX(0)' }], { duration: 450 });
        }
      },
      confetti: function () {
        var colors = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff'];
        for (var i = 0; i < 28; i++) {
          var c = el('div', 'position:fixed;z-index:6;pointer-events:none;width:14px;height:14px;border-radius:3px;' +
            'top:30%;left:' + (20 + Math.random() * 60) + '%;background:' + colors[i % colors.length] + ';');
          doc.body.appendChild(c);
          if (typeof c.animate === 'function') {
            c.animate([{ transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
              { transform: 'translate(' + ((Math.random() - 0.5) * 300) + 'px,' + (150 + Math.random() * 250) + 'px) rotate(' +
                (Math.random() * 720) + 'deg)', opacity: 0 }], { duration: 1200 + Math.random() * 600, easing: 'ease-out' });
          }
          (function (node) {
            root.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 1900);
          })(c);
        }
      },
    };
  }

  function start(o) {
    o = o || {};
    var ctl = null;
    var view = createView(o.doc, {
      hint: function () { if (ctl) ctl.hint(); },
      replay: function () { if (ctl) ctl.replay(); },
    });
    ctl = createController({ game: o.game || SA.round.create(), view: view, fx: o.fx, audio: o.audio, later: o.later });
    SA.picking.onPick(ctl.onPick);
    ctl.begin();
    return ctl;
  }

  SA.prompt = { NEXT_MS: NEXT_MS, ICONS: ICONS, createController: createController, createView: createView, start: start };
})(typeof window !== 'undefined' ? window : globalThis);
