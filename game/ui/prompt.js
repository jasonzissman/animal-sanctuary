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
  var AUTO_HINT_MS = 20000;  // stuck this long on a round: reveal the hint automatically

  // The icon lives in the animal's data (validated `icon` field); '🐾' only covers an id that is not registered.
  function iconFor(animalId) {
    var a = SA.data && SA.data.get('animals', animalId);
    return (a && a.icon) || '🐾';
  }

  function createController(o) {
    var game = o.game, view = o.view, fx = o.fx, audio = o.audio || SA.audio;
    var later = o.later || function (fn, ms) { return typeof root.setTimeout === 'function' ? root.setTimeout(fn, ms) : null; };

    function say(key) { try { if (audio && audio.say) audio.say(key); } catch (e) { /* silent */ } }
    function sfx(name) { try { if (audio && audio.sfx) audio.sfx(name); } catch (e) { /* silent */ } }

    var biomeFx = o.biomeFx || null;    // optional { show(biomeId), hide() }: the second-stage biome glow

    // Stuck without a correct pick: after each delay show the next hint stage (SA.hintStage). Hints never fail a round.
    function scheduleHint(r, seconds) {
      if (!SA.hintStage || r.stage >= SA.hintStage.MAX_STAGE) return;
      later(function () {
        if (game.current() !== r || r.done) return;
        var stage = SA.hintStage.next(r.level, seconds, r.stage);
        if (stage === 1) hint();
        else if (stage === 2) biomeHint();
        scheduleHint(r, seconds + AUTO_HINT_MS / 1000);
      }, AUTO_HINT_MS);
    }

    function begin() {
      // Stars/rounds may just have changed: let easter-egg unlocks run first so a new friend can join this clue.
      if (o.onProgress) { try { o.onProgress(); } catch (e) { /* unlocks never break play */ } }
      var r = game.start();
      if (!r) { view.clear(); return null; }
      view.showRound({ text: r.clue.text, icon: iconFor(r.answerId), hintShown: r.hintShown, stars: SA.save.get().stars, camera: !!o.photoMode });
      say(r.clue.text);
      if (biomeFx) biomeFx.hide();
      scheduleHint(r, AUTO_HINT_MS / 1000);
      return r;
    }

    var care = o.care || null;      // optional SA.careFlow: a care task may follow a correct pick

    function afterCelebration(animalId) {
      if (care && care.offer(animalId)) return;
      begin();
    }

    // Difficulty just moved: a wordless cue (star burst up, soft sparkle on Replay down). Sound only if SA.audio exists.
    function levelCue(change) {
      var lc = SA.levelCue;
      var cue = lc ? lc.cueFor(change) : null;
      if (!cue) return;
      try { if (view.levelCue) view.levelCue(cue); } catch (e) { /* a cue never breaks play */ }
      var name = lc.sfxFor(cue);
      if (name) sfx(name);
    }

    // Photo missions (o.photoMode): the round is a mission card; only a picture taken with la cámara answers it. Other tools or
    // empty hands on an animal never touch the mission, so the player can roam and do other things meanwhile.
    var photoMode = !!o.photoMode;

    function onShot(p) {
      sfx('shutter');
      var animal = SA.data && SA.data.get('animals', p.animalId);
      if (view.snapshot) view.snapshot({ icon: iconFor(p.animalId), text: animal && animal.name ? animal.name.es : '' });
      var res = SA.photo.take(game, p);
      if (res.verdict === 'other') {      // saved anyway: a friendly nudge back to the clue (the round continues)
        if (fx) fx.play(p.animalId, 'wobble');
        view.toast('¡Qué foto! Pero busca…');
        say('phrase:quefoto');
        later(function () { replay(); }, 1500);
      }
      return res;
    }

    function equipCamera() {
      if (!SA.inventory || !SA.inventory.equip(SA.photo.CAMERA)) return false;
      say('item:' + SA.photo.CAMERA);
      return true;
    }

    function onPick(p) {
      if (care && care.active()) return care.onPick(p);
      if (photoMode) {
        if (!SA.photo.isShot(p)) return { status: 'ignored' };
        var shot = onShot(p);
        if (shot.status !== 'correct') return shot;
        return finish(shot);
      }
      return finish(game.pick(p), p);
    }

    function finish(res, p) {
      levelCue(res && res.levelChange);
      if (res.status === 'wrong') {
        sfx('boing');
        if (fx) fx.play(p.animalId, 'wobble');
        view.toast('¡Casi! 🙈');
        view.shake();
      } else if (res.status === 'correct') {
        if (biomeFx) biomeFx.hide();
        sfx('chime');
        if (fx) fx.play(res.animalId, 'boing');
        view.celebrate({ icon: iconFor(res.animalId), stars: res.stars });
        view.confetti();
        var vocab = SA.vocab && SA.vocab.get('animal:' + res.animalId);
        view.toast('¡Muy bien! ⭐' + (vocab ? ' ' + vocab.es : ''));
        say('animal:' + res.animalId);
        later(function () { afterCelebration(res.animalId); }, NEXT_MS);
      }
      return res;
    }

    function replay() {
      if (care && care.active()) { care.replay(); return; }
      var r = game.current();
      if (r) say(r.clue.text);
    }

    function hint() {
      var r = game.hint();
      if (r) view.showHint();
    }

    function biomeHint() {
      var id = game.biomeHint && game.biomeHint();
      if (!id || !biomeFx) return;
      try { biomeFx.show(id); } catch (e) { /* the glow never breaks play */ }
      // Say the biome's Spanish name once, as the glow first appears (the stage logic calls this once per round).
      var key = SA.vocab && SA.vocab.biomeKey ? SA.vocab.biomeKey(id) : null;
      var muted = false;
      try { muted = !!(audio && audio.isMuted && audio.isMuted()); } catch (e) { muted = false; }
      if (key && !muted) say(key);
    }

    /** Scout & Spot is the active loop (no care task, round not yet answered). */
    function canReroll() {
      var r = game.current();
      return !!r && !r.done && !(care && care.active());
    }

    /** The camera settled in another biome: quietly swap to a new round from there. No miss, no round.complete, no scolding. */
    function reroll() {
      if (!canReroll()) return null;
      var before = game.current();
      var from = before ? before.answerId : null;
      var r = begin();
      if (r) {
        view.toast('🌿');
        if (SA.reroll && SA.reroll.track) SA.reroll.track(root.SAT, from, r.answerId);
      }
      return r;
    }

    return { begin: begin, onPick: onPick, replay: replay, hint: hint, canReroll: canReroll, reroll: reroll, equipCamera: equipCamera };
  }

  // No screen offsets here: every position comes from SA.hud.layout (see place() below).
  var BAR_CSS = 'position:fixed;box-sizing:border-box;z-index:4;display:flex;align-items:center;gap:.5em;' +
    'padding:.1em .6em;background:#fff8d6;color:#24543a;border:.12em solid #24543a;border-radius:1em;' +
    'box-shadow:0 .15em .6em rgba(0,0,0,.3);font:700 2rem system-ui,sans-serif;touch-action:manipulation;';
  var BTN_CSS = 'font-size:1.8rem;min-width:64px;height:64px;flex:none;border-radius:50%;border:.1em solid #24543a;' +
    'background:#fff;cursor:pointer;padding:0;touch-action:manipulation;';

  function createView(doc, handlers) {
    var noop = function () {};
    if (!doc || typeof doc.createElement !== 'function' || !doc.body) {
      return { showRound: noop, showCare: noop, celebrate: noop, clear: noop, toast: noop, shake: noop, confetti: noop, showHint: noop,
        setStars: noop, setHidden: noop, levelCue: noop, snapshot: noop };
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
    var starsEl = el('div', 'position:fixed;box-sizing:border-box;z-index:4;display:flex;align-items:center;justify-content:center;' +
      'white-space:nowrap;background:#fff8d6;border:.1em solid #24543a;border-radius:1em;font:700 2rem system-ui,sans-serif;' +
      'color:#24543a;', '⭐ 0');
    var toastEl = el('div', 'position:fixed;box-sizing:border-box;z-index:5;display:none;align-items:center;justify-content:center;' +
      'white-space:nowrap;overflow:hidden;padding:0 .4em;background:#fff;color:#24543a;border-radius:1em;' +
      'font:700 2.2rem system-ui,sans-serif;box-shadow:0 .15em .6em rgba(0,0,0,.3);pointer-events:none;');
    // Photo mission: a camera badge on the card (tap = equip la cámara), a white flash and a framed snapshot that slides in.
    var cameraBtn = el('button', BTN_CSS + 'display:none;', '📷');
    cameraBtn.type = 'button';
    cameraBtn.setAttribute('aria-label', 'La cámara');
    cameraBtn.addEventListener('click', function () { if (handlers.camera) handlers.camera(); });
    var flashEl = el('div', 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:6;background:#fff;opacity:0;display:none;pointer-events:none;');
    var snapEl = el('div', 'position:fixed;box-sizing:border-box;z-index:5;display:none;flex-direction:column;align-items:center;' +
      'justify-content:center;overflow:hidden;padding:.1em .3em;background:#fff;border:.1em solid #24543a;border-radius:.3em;box-shadow:0 .15em .6em rgba(0,0,0,.4);' +
      'font:700 1.3rem system-ui,sans-serif;color:#24543a;transform:translateX(140%) rotate(4deg);pointer-events:none;');
    var snapTimer = null;
    bar.appendChild(icon); bar.appendChild(text); bar.appendChild(cameraBtn); bar.appendChild(hintBtn); bar.appendChild(replayBtn);
    doc.body.appendChild(bar); doc.body.appendChild(starsEl); doc.body.appendChild(toastEl);
    doc.body.appendChild(flashEl); doc.body.appendChild(snapEl);
    // Feed tray: big food buttons along the bottom plus a row of counting dots (filled as food is given).
    var trayEl = el('div', 'position:fixed;box-sizing:border-box;z-index:4;display:none;' +
      'flex-direction:column;align-items:center;justify-content:flex-end;gap:.3em;font:700 2rem system-ui,sans-serif;');
    var dotsEl = el('div', 'padding:.1em .6em;background:#fff8d6;border:.1em solid #24543a;border-radius:1em;letter-spacing:.2em;');
    var foodsEl = el('div', 'display:flex;gap:.4em;');
    trayEl.appendChild(dotsEl); trayEl.appendChild(foodsEl);
    doc.body.appendChild(trayEl);
    var foodBtns = {}, feedIcon = '', feedCount = 0, feedItems = null;
    hintBtn.addEventListener('click', function () { if (handlers.hint) handlers.hint(); });
    replayBtn.addEventListener('click', function () { if (handlers.replay) handlers.replay(); });
    var toastTimer = null;

    // Positions: every rect comes from SA.hud.layout (pure; zones keep the prompt, stars, toast, snapshot card and feed tray
    // clear of each other and of every button). Re-applied on resize and whenever the feed tray is rebuilt.
    var rects = null;
    function viewport() {
      var d = doc.documentElement || {};
      return { width: root.innerWidth || d.clientWidth || 1280, height: root.innerHeight || d.clientHeight || 800 };
    }
    function place(e, r) {
      e.style.left = r.left + 'px'; e.style.top = r.top + 'px'; e.style.width = r.width + 'px'; e.style.height = r.height + 'px';
    }
    function px(n) { return Math.max(10, Math.round(n)) + 'px'; }
    function reflow() {
      if (!SA.hud) return;
      rects = SA.hud.layout(viewport());
      var r = rects;
      place(bar, r.prompt); place(starsEl, r.stars); place(toastEl, r.toast); place(snapEl, r.snapshot); place(trayEl, r.feedTray);
      var b = Math.min(64, r.prompt.height - 8) + 'px';
      [hintBtn, replayBtn, cameraBtn].forEach(function (btn) { btn.style.minWidth = b; btn.style.width = b; btn.style.height = b; });
      icon.style.fontSize = px(r.prompt.height * 0.45); bar.style.fontSize = px(r.prompt.height * 0.38);
      starsEl.style.fontSize = px(r.stars.height * 0.6); toastEl.style.fontSize = px(r.toast.height * 0.62);
      snapEl.style.fontSize = px(r.snapshot.height * 0.11);
      var dots = Math.round(r.feedTray.height * 0.21);
      dotsEl.style.fontSize = px(dots);
      var names = Object.keys(foodBtns), n = Math.max(1, names.length);
      var size = Math.max(40, Math.min(96, Math.floor((r.feedTray.width - (n - 1) * 6) / n), Math.floor(r.feedTray.height - dots * 1.6 - 8)));
      names.forEach(function (k) {
        var s = foodBtns[k].style;
        s.width = size + 'px'; s.minWidth = size + 'px'; s.height = size + 'px'; s.fontSize = px(size * 0.55);
      });
    }
    reflow();
    if (typeof root.addEventListener === 'function') root.addEventListener('resize', reflow);

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
        cameraBtn.style.display = r.camera ? '' : 'none';
        if (r.hintShown) setIcon(r.icon, true); else setIcon('❓', false);
      },
      // s: { icon, text }. White flash, then a framed snapshot (animal icon + its Spanish name) slides in from the right.
      snapshot: function (s) {
        flashEl.style.transition = 'none'; flashEl.style.opacity = '0.9'; flashEl.style.display = 'block';
        snapEl.textContent = '';
        snapEl.appendChild(el('div', 'font-size:' + px(rects ? rects.snapshot.height * 0.42 : 56) + ';line-height:1.1;background:#d9f0e0;' +
          'border-radius:.2em;padding:0 .2em;', s.icon || '🐾'));
        snapEl.appendChild(el('div', '', s.text || ''));
        snapEl.style.transition = 'none'; snapEl.style.transform = 'translateX(140%) rotate(4deg)'; snapEl.style.display = 'flex';
        if (snapTimer) root.clearTimeout(snapTimer);
        root.setTimeout(function () {
          flashEl.style.transition = 'opacity .35s'; flashEl.style.opacity = '0';
          snapEl.style.transition = 'transform .4s ease-out'; snapEl.style.transform = 'translateX(0) rotate(-3deg)';
        }, 40);
        root.setTimeout(function () { flashEl.style.display = 'none'; }, 450);
        snapTimer = root.setTimeout(function () {
          snapEl.style.transition = 'transform .4s ease-in'; snapEl.style.transform = 'translateX(140%) rotate(4deg)';
          snapTimer = root.setTimeout(function () { snapEl.style.display = 'none'; snapTimer = null; }, 450);
        }, 2400);
      },
      showCare: function (r) {      // care prompt: short text + tool icon (never a silhouette), no hint button
        text.textContent = r.text;
        starsEl.textContent = '⭐ ' + r.stars;
        hintBtn.style.display = 'none';
        setIcon(r.icon, false);
      },
      // r: { count, given, icon, items?: [{ icon, count }], tray: [{ id, icon, label }] }  (items: one row per asked food)
      showFeed: function (r) {
        feedIcon = r.icon; feedCount = r.count;
        feedItems = r.items && r.items.length > 1 ? r.items : null;
        foodsEl.textContent = '';
        foodBtns = {};
        r.tray.forEach(function (f) {
          var b = el('button', 'font-size:3.2rem;min-width:96px;height:96px;border-radius:1em;border:.06em solid #24543a;' +
            'background:#fff;cursor:pointer;padding:0;touch-action:manipulation;', f.icon);
          b.type = 'button';
          b.setAttribute('aria-label', f.label);
          b.addEventListener('click', function () { if (handlers.feed) handlers.feed(f.id); });
          foodBtns[f.id] = b;
          foodsEl.appendChild(b);
        });
        trayEl.style.display = 'flex';
        reflow();
        this.updateFeed({ given: r.given, items: r.items });
      },
      updateFeed: function (r) {
        var s = '';
        if (feedItems && r.items) {      // two-food ask: one group of dots per food, e.g. "🍓🍓 🥕"
          s = feedItems.map(function (it, k) {
            var g = r.items[k] ? r.items[k].given : 0, d = '';
            for (var j = 0; j < it.count; j++) d += j < g ? it.icon : '⚪';
            return d;
          }).join(' ');
        } else {
          for (var i = 0; i < feedCount; i++) s += i < r.given ? feedIcon : '⚪';
        }
        dotsEl.textContent = s;
      },
      hideFeed: function () { trayEl.style.display = 'none'; },
      bounceFood: function (id) {      // a food that was not wanted hops back (never punishing)
        var b = foodBtns[id];
        if (b && typeof b.animate === 'function') {
          b.animate([{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(-40px) rotate(-12deg)' },
            { transform: 'translateY(0) rotate(8deg)' }, { transform: 'translateY(-14px) rotate(-4deg)' },
            { transform: 'translateY(0) rotate(0deg)' }], { duration: 600 });
        }
      },
      pulseFood: function (id) {       // highlights a tray food while its word is spoken (Replay of a feed ask)
        var b = foodBtns[id];
        if (b && typeof b.animate === 'function') {
          b.animate([{ transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(255,217,61,0)' },
            { transform: 'scale(1.25)', boxShadow: '0 0 16px 8px rgba(255,217,61,.9)' },
            { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(255,217,61,0)' }], { duration: 800 });
        }
      },
      setStars: function (n) { starsEl.textContent = '⭐ ' + n; },
      setHidden: function (hide) {      // the habitat sandbox hides the prompt bar, star badge and feed tray while building
        bar.style.visibility = hide ? 'hidden' : 'visible';
        starsEl.style.visibility = hide ? 'hidden' : 'visible';
        trayEl.style.visibility = hide ? 'hidden' : 'visible';
      },
      showHint: function () { hintBtn.style.display = 'none'; setIcon(current, true); },
      celebrate: function (r) { setIcon(r.icon, false); starsEl.textContent = '⭐ ' + r.stars; hintBtn.style.display = 'none'; },
      clear: function () { text.textContent = ''; },
      toast: function (msg) {
        toastEl.textContent = msg;
        toastEl.style.display = 'flex';
        if (toastTimer !== null) root.clearTimeout(toastTimer);
        toastTimer = root.setTimeout(function () { toastEl.style.display = 'none'; toastTimer = null; }, 1400);
      },
      shake: function () {
        if (typeof bar.animate === 'function') {
          bar.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-12px)' }, { transform: 'translateX(12px)' },
            { transform: 'translateX(-8px)' }, { transform: 'translateX(0)' }], { duration: 450 });
        }
      },
      // cue: 'star-burst' (level up: stars fly out of the star badge) or 'soft-sparkle' (level down: a quiet shimmer on Replay).
      levelCue: function (cue) {
        function puff(emoji, css, from, to, ms) {
          var n = el('div', 'position:fixed;z-index:6;pointer-events:none;' + css, emoji);
          doc.body.appendChild(n);
          if (typeof n.animate === 'function') n.animate([from, to], { duration: ms, easing: 'ease-out' });
          root.setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, ms + 100);
        }
        if (cue === 'star-burst') {
          var plan = SA.levelCue.burstPlan();      // pure fan-out (dx/dy); the origin is the star badge's rect from SA.hud
          var sb = rects ? rects.stars : { left: 0, top: 0, width: 0, height: 0 };
          var ox = Math.round(sb.left + sb.width / 2 - plan.size / 2), oy = Math.round(sb.top + sb.height / 2 - plan.size / 2);
          plan.stars.forEach(function (s) {
            puff('⭐', 'left:' + ox + 'px;top:' + oy + 'px;font-size:2.2rem;line-height:1;',
              { transform: 'translate(0,0) scale(.4)', opacity: 1 },
              { transform: 'translate(' + s.dx + 'px,' + s.dy + 'px) scale(1.1)', opacity: 0 }, 900);
          });
        } else if (cue === 'soft-sparkle' && typeof replayBtn.animate === 'function') {
          replayBtn.animate([{ boxShadow: '0 0 0 0 rgba(255,217,61,0)' }, { boxShadow: '0 0 14px 6px rgba(255,217,61,.8)' },
            { boxShadow: '0 0 0 0 rgba(255,217,61,0)' }], { duration: 1200 });
        }
      },
      confetti: function () {
        var colors = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff'];
        for (var i = 0; i < 28; i++) {
          var c = el('div', 'position:fixed;z-index:6;pointer-events:none;width:14px;height:14px;border-radius:3px;' +
            'top:' + Math.round(viewport().height * 0.3) + 'px;left:' + Math.round(viewport().width * (0.2 + Math.random() * 0.6)) + 'px;' +
            'background:' + colors[i % colors.length] + ';');
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

  // o.careFx (optional): the 3D care effects (SA.render.createCareFx); enables the care loop.
  function start(o) {
    o = o || {};
    var ctl = null;
    var view = createView(o.doc, {
      hint: function () { if (ctl) ctl.hint(); },
      replay: function () { if (ctl) ctl.replay(); },
      feed: function (id) { if (careFlow) careFlow.onFeed(id); },
      camera: function () { if (ctl) ctl.equipCamera(); },
    });
    var careFlow = o.care || null;
    if (!careFlow && o.careFx !== undefined && SA.careFlow && SA.care) {
      careFlow = SA.careFlow.create({ care: SA.care.create(), view: view, fx: o.careFx, audio: o.audio, later: o.later,
        react: function (id, name) { if (o.fx && o.fx.play) o.fx.play(id, name); },
        onDone: function () { if (ctl) ctl.begin(); } });
    }
    ctl = createController({ game: o.game || SA.round.create(), view: view, fx: o.fx, audio: o.audio, later: o.later, biomeFx: o.biomeFx,
      care: careFlow, onProgress: o.onProgress, photoMode: o.photoMode });
    SA.picking.onPick(ctl.onPick);
    ctl.begin();
    // Easter-egg unlocks: a toast plus confetti (the 3D reveal and sounds are done by SA.unlockFlow).
    ctl.celebrate = function (msg) { view.toast(msg); view.confetti(); };
    // Habitat sandbox hooks: hide/show the bar and refresh the star badge after spending or refunding.
    ctl.setStars = view.setStars;
    ctl.setHidden = view.setHidden;
    return ctl;
  }

  SA.prompt = { NEXT_MS: NEXT_MS, AUTO_HINT_MS: AUTO_HINT_MS, iconFor: iconFor, createController: createController, createView: createView, start: start };
})(typeof window !== 'undefined' ? window : globalThis);
