/* SA.stats: local play statistics for the grown-up drawer (pure; no THREE, no DOM; unit-tested in node:vm).
 * Stored in the save as stats.parts = { <part key>: { taps, misses } } (counts only, no identifiers).
 *
 *   SA.stats.recordTap(part, correct)    adds one tap (and one miss when !correct) via SA.save.update
 *   SA.stats.missRates(stats)            -> [{ part, taps, misses, missRate }] sorted by missRate desc, then taps desc
 *       Pure: takes the save's `stats` object. missRate = misses / taps (0..1, 0 when taps is 0).
 *   SA.stats.summary(save)               -> { rounds, taps, misses, accuracy|null, mostMissed: [top 3 with misses > 0] }
 *   SA.stats.toText(save, labelFor?)     plain-text summary for "copy"; labelFor(part) -> display name (default: the key)
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var MAX_PARTS = 40;
  var KEY_RE = /^[a-z0-9_]{1,24}$/;

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function num(n) { return typeof n === 'number' && isFinite(n) && n > 0 ? Math.floor(n) : 0; }

  function missRates(stats) {
    var parts = isObj(stats) && isObj(stats.parts) ? stats.parts : {};
    return Object.keys(parts).map(function (part) {
      var e = isObj(parts[part]) ? parts[part] : {};
      var taps = num(e.taps), misses = Math.min(num(e.misses), taps);
      return { part: part, taps: taps, misses: misses, missRate: taps ? misses / taps : 0 };
    }).filter(function (r) { return r.taps > 0; }).sort(function (a, b) {
      return b.missRate - a.missRate || b.taps - a.taps || (a.part < b.part ? -1 : a.part > b.part ? 1 : 0);
    });
  }

  function summary(save) {
    save = isObj(save) ? save : {};
    var rates = missRates(save.stats);
    var taps = 0, misses = 0;
    rates.forEach(function (r) { taps += r.taps; misses += r.misses; });
    return {
      rounds: isObj(save.rounds) ? num(save.rounds.completed) : 0,
      taps: taps,
      misses: misses,
      accuracy: taps ? (taps - misses) / taps : null,
      mostMissed: rates.filter(function (r) { return r.misses > 0; }).slice(0, 3)
    };
  }

  function pct(x) { return Math.round(x * 100) + '%'; }

  function toText(save, labelFor) {
    var s = summary(save);
    var name = typeof labelFor === 'function' ? labelFor : function (p) { return p; };
    var lines = ['Santuario de Animales - resumen',
      'Rondas: ' + s.rounds,
      'Aciertos: ' + (s.accuracy === null ? '-' : pct(s.accuracy)) + ' (' + s.taps + ' toques)',
      'Partes mas falladas:'];
    if (!s.mostMissed.length) lines.push('  -');
    s.mostMissed.forEach(function (r) { lines.push('  ' + name(r.part) + ': ' + pct(r.missRate) + ' (' + r.misses + '/' + r.taps + ')'); });
    return lines.join('\n');
  }

  function recordTap(part, correct) {
    try {
      part = String(part);
      if (!SA.save || !KEY_RE.test(part)) return false;
      var parts = (SA.save.get().stats || {}).parts || {};
      if (!parts[part] && Object.keys(parts).length >= MAX_PARTS) return false;
      var e = parts[part] || {};
      var patch = {};
      patch[part] = { taps: num(e.taps) + 1, misses: num(e.misses) + (correct ? 0 : 1) };
      SA.save.update({ stats: { parts: patch } });
      return true;
    } catch (err) { return false; }
  }

  SA.stats = { missRates: missRates, summary: summary, toText: toText, recordTap: recordTap };
})(typeof window !== 'undefined' ? window : globalThis);
