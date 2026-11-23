/* SA.scientistCheer.create(doc, o) -> { update(dt), isShowing() }: the scientist's cheer for a proof sent to the station (AS-0206, DOM only).
 *   o.player()   -> { x, z }  where the kid is        o.paused() -> bool  a card/overlay is open (the cheer waits)
 * Polled once per frame. When the kid comes within SA.npc.NEAR of the scientist and SA.proofs has an uncheered proof, it takes ONE cheer
 * (SA.proofs.cheer() marks that proof celebrated at once, so it can never repeat) and shows a short speech bubble: 🙌 + "¡Gracias! Está
 * bien." spoken through SA.audio.say; for a mission proof a second line points at the newly opened mission on the Misiones board
 * ("👉 <mission icon> ¡Nueva misión!", also spoken). The bubble hides by itself after ~4 s; if more proofs wait, the next cheer follows
 * while the kid is still near. It ignores taps and never blocks play. A no-op without a DOM or SA.proofs / SA.npc.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var SHOW_S = 4;

  // A full-screen, click-through flex layer centres the bubble (no numeric offsets on fixed elements; see test/hud-place.test.js).
  var LAYER = 'position:fixed;inset:0;z-index:4;display:none;justify-content:center;align-items:flex-start;padding-top:24vh;' +
    'pointer-events:none;box-sizing:border-box;';
  var CSS = 'box-sizing:border-box;max-width:92vw;padding:.5em .9em;background:#fff8d6;border:.16em solid #24543a;border-radius:1.1em;' +
    'text-align:center;font:700 1.6rem system-ui,sans-serif;color:#24543a;box-shadow:0 .2em .6em rgba(0,0,0,.3);';

  function create(doc, o) {
    var none = { update: function () { return false; }, isShowing: function () { return false; } };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !SA.proofs || !SA.npc) return none;
    o = o || {};
    var el = doc.createElement('div'), bubble = doc.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = LAYER;
    bubble.style.cssText = CSS;
    el.appendChild(bubble);
    doc.body.appendChild(el);
    var left = 0;

    function row(text) {
      var d = doc.createElement('div');
      d.style.cssText = 'font-size:1.6rem;line-height:1.3;overflow-wrap:anywhere;';
      d.textContent = text;
      return d;
    }
    function render(c) {
      while (bubble.children && bubble.children.length) { if (bubble.removeChild) bubble.removeChild(bubble.children[0]); else bubble.children.shift(); }
      bubble.appendChild(row(c.icon + ' ' + c.es));
      if (c.point) bubble.appendChild(row(c.point.icon + ' ' + c.point.es + ' 👉'));
    }
    function say(c) {
      try {
        if (!SA.audio || !SA.audio.say) return;
        if (c.point) SA.audio.say(c.key, function () { SA.audio.say(c.point.key); });
        else SA.audio.say(c.key);
      } catch (e) { /* sound is best effort */ }
    }

    function show(c) {
      render(c);
      el.style.display = 'flex';
      left = SHOW_S;
      try { if (SA.audio && SA.audio.sfx) SA.audio.sfx('chime'); } catch (e) { /* silent */ }
      say(c);
    }

    function update(dt) {
      if (left > 0) {
        left -= Math.max(0, Math.min(0.25, +dt || 0));
        if (left <= 0) { left = 0; el.style.display = 'none'; }
        return true;
      }
      if (o.paused && o.paused()) return false;
      var p = o.player ? o.player() : null;
      if (!(SA.npc.distance(SA.npc.scientist(), p) <= SA.npc.NEAR)) return false;
      if (!SA.proofs.pending().length) return false;
      var c = SA.proofs.cheer();
      if (!c) return false;
      show(c);
      return true;
    }

    return { update: update, isShowing: function () { return left > 0; }, element: el, bubble: bubble };
  }

  SA.scientistCheer = { create: create, SHOW_S: SHOW_S };
})(typeof window !== 'undefined' ? window : globalThis);
