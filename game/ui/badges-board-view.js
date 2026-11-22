/* SA.badgesBoardView.create(doc, o) -> { render(), element }: the "Insignias" card inside the station menu (DOM only; AS-0239).
 *   o.body   the station menu's room (SA.stationMenuView.create(...).body). No-op without it or a DOM.
 * Shown only when the station opened with source 'badges' (the Insignias board on the front wall: E / Enter or a tap). Each badge is
 * one row: icon + short Spanish name + 'n/m' (✅ when earned); the grid wraps and scrolls inside the card. Tapping a row says its name
 * (SA.audio.say). Rows come from SA.badgesBoard.rows(); the missions view hides itself for this source (ui/missions-board-view.js).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function create(doc, o) {
    var none = { render: function () {}, element: null };
    o = o || {};
    if (!doc || typeof doc.createElement !== 'function' || !o.body || !SA.badgesBoard || !SA.station || !SA.station.onOpen) return none;
    function el(tag, css, text) {
      var e = doc.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    }
    function english() { try { return !!(SA.settings && SA.settings.get().english); } catch (e) { return false; } }
    function say(text) { if (text && SA.audio && SA.audio.say) SA.audio.say(text); }

    var panel = el('div', 'display:none;');
    o.body.appendChild(panel);
    function clear() { while (panel.children && panel.children.length) { if (panel.removeChild) panel.removeChild(panel.children[0]); else panel.children.shift(); } }

    function rowEl(r) {
      var bg = r.earned ? '#d9f5c9' : '#fff', bd = r.earned ? '#2f9e44' : '#24543a';
      var row = el('div', 'box-sizing:border-box;display:flex;align-items:center;gap:.5em;min-width:min(42vw,220px);min-height:64px;padding:.2em .6em;' +
        'border-radius:.8em;border:.12em solid ' + bd + ';background:' + bg + ';font:700 1.2rem system-ui,sans-serif;color:#24543a;' +
        'cursor:pointer;touch-action:manipulation;' + (r.earned ? '' : 'opacity:.85;'));
      row.appendChild(el('span', 'font-size:2.2rem;line-height:1;' + (r.earned ? '' : 'filter:grayscale(1);'), r.icon));
      row.appendChild(el('span', 'flex:1;overflow-wrap:anywhere;', r.name));
      row.appendChild(el('span', 'font-size:1.4rem;', r.text));
      row.addEventListener('click', function (e) { if (e && e.stopPropagation) e.stopPropagation(); say(r.name); });
      return row;
    }

    function render() {
      clear();
      var en = english(), list = SA.badgesBoard.rows({ english: en }), s = SA.badgesBoard.summary(list);
      var w = root.innerWidth || 800, h = root.innerHeight || 600;
      panel.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;max-width:min(92vw,720px);';
      panel.appendChild(el('div', 'font:700 1.6rem system-ui,sans-serif;', '🏅 ' + (en ? SA.badgesBoard.TITLE_EN : SA.badgesBoard.TITLE) + ' ' + s.earned + '/' + s.total));
      var grid = el('div', 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-content:flex-start;box-sizing:border-box;width:100%;' +
        'max-height:' + Math.max(160, Math.round(h * 0.55)) + 'px;overflow-y:auto;padding:6px;max-width:' + Math.round(w * 0.92) + 'px;');
      list.forEach(function (r) { grid.appendChild(rowEl(r)); });
      panel.appendChild(grid);
    }

    SA.station.onOpen(function (source) {
      if (source === 'badges') render(); else panel.style.cssText = 'display:none;';
    });
    if (SA.station.onClose) SA.station.onClose(function () { panel.style.cssText = 'display:none;'; });
    return { render: render, element: panel };
  }

  SA.badgesBoardView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
