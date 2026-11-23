/* SA.photoBoard: layout and card data for the station's photo board (AS-0207, slice 2 of AS-0143). Pure (no THREE, no DOM; node:vm tested).
 * The board (game/render/photo-board.js) shows one framed card per proof stored by SA.proofs. This module decides WHAT and WHERE:
 *
 *   SA.photoBoard.COLS / ROWS / PAGE            the grid: 4 x 2 = 8 cards per page
 *   SA.photoBoard.slots(w?, h?)                 -> [{ col, row, x, y, w, h }]  PAGE card slots in board-local units, row-major from the
 *                                                  top left of the READER's view: x grows to the reader's right, y up; (0, 0) is the board's
 *                                                  centre. The title strip is reserved at the top (TITLE_H).
 *   SA.photoBoard.pageCount(n)                  -> pages for n proofs (at least 1)
 *   SA.photoBoard.lastPage(n)                   -> index of the newest page (the board shows it, so a new photo is always visible)
 *   SA.photoBoard.page(proofs, index)           -> the proofs on that page, oldest first (an out-of-range index is clamped)
 *   SA.photoBoard.card(proof)                   -> { id, kind, label, color: '#rrggbb', icon, animalId?, missionId? }
 *                                                  rescue: the animal's Spanish name on its body colour; mission: 'Misión N' on gold
 *   SA.photoBoard.cards(proofs?, pageIndex?)    -> cards for a page (defaults: SA.proofs.list(), the newest page), each with its slot
 *   SA.photoBoard.signature(proofs?)            -> a short string that changes whenever the shown proofs change (the render polls it)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var COLS = 4, ROWS = 2, PAGE = COLS * ROWS, TITLE_H = 0.5, PAD = 0.15, GAP = 0.1;
  var HEX = /^#[0-9a-fA-F]{6}$/;
  var GOLD = '#ffd24a', GREY = '#b8b0a0';

  function slots(w, h) {
    w = w || 3.6; h = h || 2.2;
    var areaW = w - 2 * PAD, areaH = h - TITLE_H - 2 * PAD, cw = (areaW - (COLS - 1) * GAP) / COLS, ch = (areaH - (ROWS - 1) * GAP) / ROWS, out = [];
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      out.push({ col: c, row: r, w: cw, h: ch,
        x: -w / 2 + PAD + cw / 2 + c * (cw + GAP),
        y: h / 2 - TITLE_H - PAD - ch / 2 - r * (ch + GAP) });
    }
    return out;
  }

  function pageCount(n) { return Math.max(1, Math.ceil((n > 0 ? n : 0) / PAGE)); }
  function lastPage(n) { return pageCount(n) - 1; }
  function page(proofs, index) {
    var all = Array.isArray(proofs) ? proofs : [], last = lastPage(all.length);
    var i = Math.max(0, Math.min(last, Math.floor(index) || 0));
    return all.slice(i * PAGE, i * PAGE + PAGE);
  }

  function animalOf(id) { try { return SA.data.get('animals', id); } catch (e) { return null; } }
  function bodyColor(a) {
    var parts = a && Array.isArray(a.parts) ? a.parts : [], i;
    for (i = 0; i < parts.length; i++) if (parts[i].part === 'cuerpo' && HEX.test(parts[i].color)) return parts[i].color;
    for (i = 0; i < parts.length; i++) if (HEX.test(parts[i].color)) return parts[i].color;
    return GREY;
  }
  function missionOf(id) {
    try {
      var all = SA.missions.list();
      for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    } catch (e) { /* no missions loaded */ }
    return null;
  }

  function card(p) {
    if (!p || typeof p !== 'object') return null;
    var c = { id: String(p.id), kind: p.kind, label: '', color: GREY, icon: '📷' };
    if (p.animalId) c.animalId = p.animalId;
    if (p.missionId) c.missionId = p.missionId;
    if (p.kind === 'mission') {
      var m = missionOf(p.missionId);
      c.color = GOLD; c.icon = (m && m.icon) || '⭐';
      c.label = m && m.n ? 'Misión ' + m.n : 'Misión';
    } else {
      var a = animalOf(p.animalId);
      if (a) { c.color = bodyColor(a); c.icon = a.icon || c.icon; c.label = a.name && a.name.es ? a.name.es : ''; }
    }
    return c;
  }

  function currentList() { try { return SA.proofs ? SA.proofs.list() : []; } catch (e) { return []; } }

  function cards(proofs, pageIndex) {
    var all = Array.isArray(proofs) ? proofs : currentList();
    var shown = page(all, pageIndex === undefined ? lastPage(all.length) : pageIndex), sl = slots(), out = [];
    shown.forEach(function (p, i) {
      var c = card(p);
      if (c) { c.slot = sl[i]; out.push(c); }
    });
    return out;
  }

  function signature(proofs) {
    var all = Array.isArray(proofs) ? proofs : currentList();
    return all.length + ':' + page(all, lastPage(all.length)).map(function (p) { return p && p.id; }).join(',');
  }

  SA.photoBoard = { COLS: COLS, ROWS: ROWS, PAGE: PAGE, TITLE_H: TITLE_H, slots: slots, pageCount: pageCount, lastPage: lastPage,
    page: page, card: card, cards: cards, signature: signature };
})(typeof window !== 'undefined' ? window : globalThis);
