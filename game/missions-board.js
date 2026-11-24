/* SA.missionsBoard: pure mapping for the Misiones board in the station menu (no THREE, no DOM; unit-tested in node:vm).
 *
 *   SA.missionsBoard.cards(list, opts?) -> [card]   list = SA.missions.list() (in order); opts.english adds the English title.
 *       card = { id, n, state: 'done'|'next'|'locked'|'active', icon, glyph, es, en|null, speak, tappable, silhouette, waiting }
 *       waiting (AS-0371): a `night: true` mission that is open while opts.isNight === false (day): shown as 🌙 and it says SA.missionsBoard.ESPERA_NOCHE.
 *       done -> ✅ + the mission icon (tap replays); next -> ⭐ + icon, glows (tap starts it); active -> ▶️ "En curso";
 *       locked -> 🔒, a grey silhouette: icon hidden, only its number shows, and tapping says "Misión N" so the title stays a surprise.
 *   SA.missionsBoard.layout(count, viewW, viewH) -> { cols, rows, cardW, cardH, gap, availW, maxH, scroll }
 *       Wrapping grid sized to the screen: columns never overflow availW, so cards never overlap each other or the ✕
 *       (which sits outside the body, on the card's corner). When the rows are taller than maxH the body scrolls instead.
 *       The active card spans the whole row (availW) so its two big buttons fit.
 *   SA.missionsBoard.pointAndStartFirst() -> { ok, id?, reason? }   see below; the scientist's intro/celebration logic is SA.missionsDialogue.
 *   SA.missionsBoard.EN_CURSO / CONTINUAR / ABANDONAR / PROXIMAMENTE   the short Spanish phrases.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var STATE_OF = { done: 'done', available: 'next', active: 'active', locked: 'locked' };
  var GLYPH = { done: '✅', next: '⭐', active: '▶️', locked: '🔒' };

  function cards(list, opts) {
    var english = !!(opts && opts.english);
    return (Array.isArray(list) ? list : []).map(function (m) {
      var state = STATE_OF[m.status] || 'locked';
      var locked = state === 'locked';
      return {
        id: m.id, n: m.n, state: state, glyph: GLYPH[state],
        icon: locked ? '' : m.icon, es: locked ? 'Misión ' + m.n : m.es, en: !locked && english ? m.en : null,
        speak: locked ? 'Misión ' + m.n : m.es,
        tappable: true, silhouette: locked,
        // AS-0371: a night mission that is open (next or done) while it is day waits for night: a 🌙 card that only says a gentle line when tapped
        waiting: m.night === true && (state === 'next' || state === 'done') && !!opts && opts.isNight === false
      };
    });
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // The card body sits inside the station card: its padding (~1.6em each side) and the page margin are taken off the screen width.
  function layout(count, viewW, viewH) {
    var w = Number(viewW) > 0 ? Number(viewW) : 800, h = Number(viewH) > 0 ? Number(viewH) : 600;
    var gap = 12, minCard = 120, cardH = 150;
    var availW = Math.floor(clamp(w * 0.9 - 80, minCard, 640));
    var cols = Math.max(1, Math.floor((availW + gap) / (minCard + gap)));
    var n = Math.max(0, Math.floor(count) || 0);
    cols = Math.min(cols, Math.max(1, n));
    var cardW = Math.floor((availW - gap * (cols - 1)) / cols);
    var rows = Math.ceil(n / cols);
    var maxH = Math.floor(Math.max(cardH, h * 0.5));
    var needed = rows * cardH + Math.max(0, rows - 1) * gap;
    return { cols: cols, rows: rows, cardW: cardW, cardH: cardH, gap: gap, availW: availW, maxH: maxH, scroll: needed > maxH };
  }

  // The hook the intro conversation (AS-0142) ends with: open the station on the Misiones board, point at the next card (mission 1 on
  // a fresh save) and run the scientist's intro for it, whose "¡Vamos!" starts it. Returns { ok, id?, reason? }. The board view
  // (ui/missions-board-view.js) replaces this no-op once it is mounted; without a DOM it stays { ok: false, reason: 'no-board' }.
  function pointAndStartFirst() { return { ok: false, reason: 'no-board' }; }

  SA.missionsBoard = { cards: cards, layout: layout, pointAndStartFirst: pointAndStartFirst, EN_CURSO: 'En curso', CONTINUAR: 'Continuar',
    ABANDONAR: 'Abandonar', PROXIMAMENTE: 'Próximamente', ESPERA_NOCHE: 'Espera a la noche', ESPERA_NOCHE_EN: 'Wait for night' };
})(typeof window !== 'undefined' ? window : globalThis);
