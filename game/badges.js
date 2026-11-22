/* SA.badges: badge rules over the rescue log and the photo album (AS-0167). Pure (no THREE, no DOM; node:vm tested).
 * Badge rows are data (game/data/badges.js); the rescue log is save.rescues (SA.rescueLog writes it); earned ids live in save.badges.
 *
 * Rule: { count, kind?, animalId?, need?, biome?, night? }  counts rescue rows matching EVERY given field (none = any rescue)
 *       { album: 'all' }                                     every real (non easter-egg) species photographed (SA.album.progress())
 *
 *   SA.badges.met(rule, rescues, albumProgress?) -> { have, need }   (have is not capped)
 *   SA.badges.check(rescues?)  -> ids earned for the FIRST time by this call (saved to save.badges, so each id is returned once, ever);
 *                                 rescues defaults to the save's log. Tracks rescue.badge { id }.
 *   SA.badges.progress()       -> [{ id, have, need, earned }] for every badge row, in data order (have capped at need) for the board
 *   SA.badges.earnedIds()      -> ids saved as earned
 *   SA.badges.create({ save?, badges?, album?, track? })   a separate instance (tests); the default one is SA.badges.*
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var FIELDS = ['kind', 'animalId', 'need', 'biome', 'night'];

  function met(rule, rescues, album) {
    if (rule.album === 'all') {
      var p = album || { found: 0, total: 0 };
      return { have: p.found, need: Math.max(1, p.total) };
    }
    var have = (Array.isArray(rescues) ? rescues : []).filter(function (e) {
      return FIELDS.every(function (f) {
        if (rule[f] === undefined) return true;
        return f === 'night' ? (e.night === true) === rule.night : e[f] === rule[f];
      });
    }).length;
    return { have: have, need: rule.count };
  }

  function create(opts) {
    opts = opts || {};
    function store() { return opts.save || SA.save; }
    function rows() { return opts.badges || (SA.data ? SA.data.all('badges') : []); }
    function albumNow() {
      try { return opts.album ? opts.album() : (SA.album ? SA.album.progress() : null); } catch (e) { return null; }
    }
    function log() { var r = store().get().rescues; return Array.isArray(r) ? r : []; }
    function earnedIds() { var b = store().get().badges; return Array.isArray(b) ? b.slice() : []; }
    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }

    function check(rescues) {
      var list = Array.isArray(rescues) ? rescues : log(), alb = albumNow(), have = earnedIds();
      var fresh = rows().filter(function (b) {
        if (have.indexOf(b.id) >= 0) return false;
        var m = met(b.rule, list, alb);
        return m.have >= m.need;
      }).map(function (b) { return b.id; });
      if (fresh.length) {
        store().update({ badges: have.concat(fresh) });     // arrays are replaced wholesale by the save
        fresh.forEach(function (id) { track('rescue.badge', { id: id }); });
      }
      return fresh;
    }

    function progress() {
      var list = log(), alb = albumNow(), have = earnedIds();
      return rows().map(function (b) {
        var m = met(b.rule, list, alb);
        var earned = have.indexOf(b.id) >= 0 || m.have >= m.need;
        return { id: b.id, have: Math.min(m.have, m.need), need: m.need, earned: earned };
      });
    }

    return { check: check, progress: progress, earnedIds: earnedIds, met: met, create: create };
  }

  SA.badges = create();
})(typeof window !== 'undefined' ? window : globalThis);
