/* SA.badgesBoard: the rows of the "Insignias" card inside the station (AS-0239). Pure (no THREE, no DOM; node:vm tested).
 * Reads SA.badges.progress() (AS-0167) and the badge data rows; ui/badges-board-view.js only draws what this returns.
 *
 *   SA.badgesBoard.TITLE                    'Insignias' (the English toggle shows 'Badges')
 *   SA.badgesBoard.rows({ english? })       -> [{ id, icon, name, es, goal, say, have, need, fraction, state, earned, locked, text, tier? }]
 *       one per badge, in data order (AS-0240 added es, goal, say, fraction, state, locked).
 *       name  the short Spanish name (the English one only while the English scaffold is on); es is always the Spanish one
 *       text  '✅' when earned, else 'have/need' (have is capped at need, so it never reads 5/1)
 *       goal  a short Spanish goal phrase from the badge rule ('Rescata 5 conejos'); numbers are digits, so only the noun agrees
 *             (plural when n != 1, 'tucán' -> 'tucanes'); no article before the number, so 'águila' needs no un/una
 *       say   what a tap speaks: es + '. ' + goal
 *       fraction  have/need in 0..1 (the progress bar width); state 'earned' | 'progress' (have > 0) | 'locked' (not started: grey)
 *   SA.badgesBoard.goal(rule)               -> the goal phrase for one badge rule
 *   SA.badgesBoard.summary(rows)            -> { earned, total } for a header such as "3/20"
 *   SA.badgesBoard.build(deps?)             a separate instance ({ badges: { progress() }, rows: [...badge data] }) for tests
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  var PLACE = { bosque: 'el bosque' };           // the biome data name is "El bosque y el río" (too long to say)
  var NEED = {                                   // predicament -> [verb, singular noun, plural noun]
    thorn: ['Quita', 'espina', 'espinas'], mud: ['Limpia', 'animal', 'animales'],
    hungry: ['Alimenta', 'animal', 'animales'], tangled: ['Libera', 'animal', 'animales']
  };
  var UNACCENT = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u' };

  function plural(w) {
    if (/[aeiou]$/.test(w)) return w + 's';
    if (/[áéíóú]n$/.test(w)) return w.replace(/[áéíóú]/, function (c) { return UNACCENT[c]; }) + 'es';
    return w + 'es';
  }
  function lower(t) { return t.charAt(0).toLowerCase() + t.slice(1); }

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

    function lookup(kind, id) {
      if (deps.lookup) return deps.lookup(kind, id);
      try { return SA.data.get(kind, id); } catch (e) { return null; }
    }

    // Short (<= ~6 words) Spanish goal for one badge rule. Digits keep it simple: '1 conejo' / '5 conejos'.
    function goal(rule) {
      rule = rule || {};
      if (rule.album) return 'Fotografía todos los animales';
      var n = rule.count || 1, one = n === 1, num = n + ' ';
      if (rule.kind === 'hatch') return 'Salva ' + num + (one ? 'huevo' : 'huevos');
      if (rule.kind === 'reunion') return 'Reúne ' + num + (one ? 'familia' : 'familias');
      if (rule.need && NEED[rule.need]) return NEED[rule.need][0] + ' ' + num + NEED[rule.need][one ? 1 : 2];
      var noun = one ? 'animal' : 'animales';
      if (rule.animalId) {
        var a = lookup('animals', rule.animalId), es = a && a.name && a.name.es;
        if (es) noun = one ? es : plural(es);
      }
      var s = 'Rescata ' + num + noun;
      if (rule.biome) {
        var b = lookup('biomes', rule.biome), name = PLACE[rule.biome] || (b && b.name && lower(b.name.es));
        if (name) s += ' en ' + name;
      }
      if (rule.night) s += ' de noche';
      return s;
    }

    function rows(o) {
      var english = !!(o && o.english), byId = {};
      data().forEach(function (b) { byId[b.id] = b; });
      return progress().map(function (p) {
        var d = byId[p.id] || {}, es = d.es || p.id, g = goal(d.rule), earned = !!p.earned;
        var row = {
          id: p.id,
          icon: d.icon || '🏅',
          name: english && d.en ? d.en : es,
          es: es, goal: g, say: es + '. ' + g,
          have: p.have, need: p.need, earned: earned,
          fraction: earned ? 1 : (p.need > 0 ? Math.max(0, Math.min(1, p.have / p.need)) : 0),
          state: earned ? 'earned' : (p.have > 0 ? 'progress' : 'locked'),
          locked: !earned && !(p.have > 0),
          text: earned ? '✅' : p.have + '/' + p.need
        };
        if (d.tier) row.tier = d.tier;
        return row;
      });
    }

    function summary(list) {
      list = list || rows();
      return { earned: list.filter(function (r) { return r.earned; }).length, total: list.length };
    }

    return { TITLE: 'Insignias', TITLE_EN: 'Badges', rows: rows, summary: summary, goal: goal, build: create };
  }

  SA.badgesBoard = create();
})(typeof window !== 'undefined' ? window : globalThis);
