/* SA.sleepView.create(doc, { clock?, setTimeout? }) -> { go() }: the station bed (AS-0170). Using the bed (E / Enter or a tap) at dusk or night
 * fades the screen to a dark "😴 Zzz" card, skips the clock to the start of dawn behind it (SA.daynight sleep()) and fades back in to a bright
 * morning (the clock itself says "¡Buenos días!"). By day or at dawn the bed only says "el sol": there is nothing to sleep through. Staying up
 * is simply not using the bed. DOM only, harmless without one. SA.sleepView.use() is what the scene calls (it works before create() too).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var FADE_MS = 700, HOLD_MS = 1100;

  function create(doc, o) {
    o = o || {};
    var wait = o.setTimeout || function (f, ms) { return root.setTimeout(f, ms); }, busy = false, veil = null;
    function clock() { return o.clock || (SA.daynight && SA.daynight.instance()); }

    function build() {
      if (veil || !doc || typeof doc.createElement !== 'function' || !doc.body) return veil;
      veil = doc.createElement('div');
      veil.setAttribute('aria-hidden', 'true');
      veil.style.cssText = 'position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:#0b1233;color:#fff;'
        + 'font:700 4rem system-ui,sans-serif;opacity:0;transition:opacity ' + FADE_MS + 'ms ease;pointer-events:none;';
      veil.textContent = '😴 Zzz…';
      doc.body.appendChild(veil);
      return veil;
    }
    function show(on) { if (veil) { if (on) veil.style.display = 'flex'; veil.style.opacity = on ? '1' : '0'; } }

    function go() {
      var c = clock();
      if (!c || busy) return false;
      var p = c.phase();
      if (p !== 'dusk' && p !== 'night') { try { SA.audio.say('thing:sol'); } catch (e) { /* the voice is optional */ } return false; }
      busy = true;
      build();
      try { SA.audio.say('thing:noche'); } catch (e) { /* the voice is optional */ }
      // Next frame: start fading in (display first so the transition runs).
      wait(function () { show(true); }, 20);
      wait(function () {
        c.sleep();
        wait(function () {
          show(false);
          wait(function () { if (veil) veil.style.display = 'none'; busy = false; }, FADE_MS);
        }, HOLD_MS);
      }, FADE_MS + 40);
      return true;
    }

    var api = { go: go };
    SA.sleepView.current = api;
    return api;
  }

  SA.sleepView = { create: create, current: null, use: function () { return SA.sleepView.current ? SA.sleepView.current.go() : (SA.daynight ? SA.daynight.instance().sleep() : false); } };
})(typeof window !== 'undefined' ? window : globalThis);
