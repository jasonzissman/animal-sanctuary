/* SA.badgesBoard: the rows of the "Insignias" card inside the station (AS-0239). Pure (no THREE, no DOM; node:vm tested).
 * Reads SA.badges.progress() (AS-0167) and the badge data rows; ui/badges-board-view.js only draws what this returns.
 *
 *   SA.badgesBoard.TITLE                    'Insignias' (the English toggle shows 'Badges')
 *   SA.badgesBoard.rows({ english? })       -> [{ id, icon, name, have, need, earned, text, tier? }] one per badge, in data order.
 *       name  the short Spanish name (the English one only while the English scaffold is on)
 *       text  '✅' when earned, else 'have/need' (have is capped at need, so it never reads 5/1)
 *   SA.badgesBoard.summary(rows)            -> { earned, total } for a header such as "3/20"
 *   SA.badgesBoard.build(deps?)             a separate instance ({ badges: { progress() }, rows: [...badge data] }) for tests
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  function create(deps) {
    deps = deps || {};
    function progress() {
      var b = deps.badges || SA.badges;
      try { return b && b.progress ? b.progress() : []; } catch (e) { return []; }
    }
    function data() {
      if (deps.rows) return deps.rows;
      try { return SA.data ? SA.data.all('badges') : []; } catch (e) { return []; }
    }

    function rows(o) {
      var english = !!(o && o.english), byId = {};
      data().forEach(function (b) { byId[b.id] = b; });
      return progress().map(function (p) {
        var d = byId[p.id] || {}, row = {
          id: p.id,
          icon: d.icon || '🏅',
          name: english && d.en ? d.en : (d.es || p.id),
          have: p.have, need: p.need, earned: !!p.earned,
          text: p.earned ? '✅' : p.have + '/' + p.need
        };
        if (d.tier) row.tier = d.tier;
        return row;
      });
    }

    function summary(list) {
      list = list || rows();
      return { earned: list.filter(function (r) { return r.earned; }).length, total: list.length };
    }

    return { TITLE: 'Insignias', TITLE_EN: 'Badges', rows: rows, summary: summary, build: create };
  }

  SA.badgesBoard = create();
})(typeof window !== 'undefined' ? window : globalThis);
