/* SA.stickers: the sticker book's pure logic (AS-0168). No THREE, no DOM; node:vm tested. A sticker is a badge (game/data/badges.js);
 * the Pegatinas page (ui/stickers-page.js) and the earn celebration (ui/sticker-pop.js) only draw what this returns.
 *
 *   SA.stickers.rows({ english? })  -> SA.badgesBoard.rows() plus { noun, label, dots }: earned stickers first (data order inside each
 *       group), then the ones in progress, then the not-started grey outlines.
 *       label  '3/5 tortugas' (have/need + the thing to chase; '✅' when earned); noun comes from the goal phrase ('Rescata 5 tortugas')
 *       dots   '●●●○○' for need <= 6 (empty string when the goal is bigger: the label alone says it)
 *       say    what a tap speaks: '<name>. <goal>' (from SA.badgesBoard)
 *   SA.stickers.summary(rows?)      -> { earned, total }
 *   SA.stickers.lines(row)          -> '¡Amigo de las tortugas!' for one badge row (what the celebration speaks)
 *   SA.stickers.notify(badgeRows)   badges just earned (SA.rescueLog calls it): handed to the celebration, which shows them one at a time
 *   SA.stickers.onEarn(fn)          fn(badgeRow) for every notified badge; ones notified before any listener exists are delivered at once
 *   SA.stickers.create(deps?)       a separate instance (tests; deps.board replaces SA.badgesBoard)
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var MAX_DOTS = 6;

  function create(deps) {
    deps = deps || {};
    var listeners = [], waiting = [];
    function board() { return 'board' in deps ? deps.board : SA.badgesBoard; }

    function noun(goal) {
      var m = /^\S+ \d+ (.+)$/.exec(goal || '');
      return m ? m[1] : '';
    }
    function dots(have, need) {
      if (!(need >= 1 && need <= MAX_DOTS)) return '';
      var s = '';
      for (var i = 0; i < need; i++) s += i < have ? '●' : '○';
      return s;
    }

    function rows(o) {
      var list;
      try { list = board() ? board().rows(o) : []; } catch (e) { list = []; }
      var out = list.map(function (r, i) {
        var n = noun(r.goal), copy = {};
        Object.keys(r).forEach(function (k) { copy[k] = r[k]; });
        copy.noun = n;
        copy.label = r.earned ? '✅' : r.have + '/' + r.need + (n ? ' ' + n : '');
        copy.dots = r.earned ? '' : dots(r.have, r.need);
        copy.order = i;
        return copy;
      });
      var rank = { earned: 0, progress: 1, locked: 2 };
      out.sort(function (a, b) { return rank[a.state] - rank[b.state] || a.order - b.order; });
      return out;
    }

    function summary(list) {
      list = list || rows();
      return { earned: list.filter(function (r) { return r.earned; }).length, total: list.length };
    }
    function lines(row) { return row && row.es ? '¡' + row.es + '!' : ''; }

    function deliver(fn, row) { try { fn(row); } catch (e) { /* the view never breaks play */ } }
    function notify(list) {
      (Array.isArray(list) ? list : [list]).forEach(function (row) {
        if (!row || !row.id) return;
        if (!listeners.length) { waiting.push(row); return; }
        listeners.forEach(function (fn) { deliver(fn, row); });
      });
    }
    function onEarn(fn) {
      if (typeof fn !== 'function') return;
      listeners.push(fn);
      var q = waiting; waiting = [];
      q.forEach(function (row) { deliver(fn, row); });
    }

    return { rows: rows, summary: summary, lines: lines, notify: notify, onEarn: onEarn, create: create };
  }

  SA.stickers = create();
})(typeof window !== 'undefined' ? window : globalThis);
