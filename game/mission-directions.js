/* SA.missionDirections: counts how often the kid asks to hear the current spoken direction again (AS-0365, slice 2 of AS-0190).
 * Pure (no THREE, no DOM; unit-tested in node:vm). Mission 11's legs are only HEARD (their steps carry `noArrow: true`, so the compass is hidden).
 * When the kid taps 🔊 Replay on such a step `hintAfter` times (default 2) a faint pointer toward the step's target fades in, so nobody is stuck.
 * No timers, no failure: it is only a gentle extra help. Nothing here knows a mission id; the threshold is step data:
 *   a step { kind: 'goTo', noArrow: true, hintAfter?: whole number >= 1 } (game/data/missions.js)
 *
 *   SA.missionDirections.create({ missions?, track?, threshold? }) -> counter     (SA.missionDirections is a default instance)
 *   counter.repeat()    one more 🔊 on the current step -> the new count (0 when there is no listen-only step); SA.missionPill.replay() calls it
 *   counter.count()     repeats on the current step (resets to 0 as soon as the next step starts)
 *   counter.threshold() repeats needed for the pointer on the current step (its `hintAfter`, else the default 2)
 *   counter.hint()      true once count() >= threshold(): the faint pointer shows; false before that and the moment the next step starts
 *   SA.missionDirections.DEFAULT_AFTER = 2
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var DEFAULT_AFTER = 2;

  function create(o) {
    o = o || {};
    var key = null, n = 0, told = false;
    function active() { try { return (o.missions || SA.missions).active(); } catch (e) { return null; } }
    function listenOnly(a) { return !!(a && a.stepData && a.stepData.noArrow === true); }

    function sync() {      // a new mission, seed or step starts a fresh count: the pointer hides again
      var a = active(), k = listenOnly(a) ? a.id + ':' + a.seed + ':' + a.step : null;
      if (k !== key) { key = k; n = 0; told = false; }
      return a;
    }
    function threshold() {
      var a = sync(), h = a && a.stepData && a.stepData.hintAfter;
      return typeof h === 'number' && h >= 1 ? Math.floor(h) : (typeof o.threshold === 'number' && o.threshold >= 1 ? Math.floor(o.threshold) : DEFAULT_AFTER);
    }
    function count() { sync(); return n; }
    function hint() { sync(); return key !== null && n >= threshold(); }
    function repeat() {
      sync();
      if (key === null) return 0;
      n++;
      if (!told && n >= threshold()) {
        told = true;
        try { if (o.track) o.track('directions.hint', { repeats: n }); else if (root.SAT && root.SAT.track) root.SAT.track('directions.hint', { repeats: n }); } catch (e) { /* telemetry never breaks play */ }
      }
      return n;
    }
    return { repeat: repeat, count: count, threshold: threshold, hint: hint };
  }

  var api = create();
  api.create = create;
  api.DEFAULT_AFTER = DEFAULT_AFTER;
  SA.missionDirections = api;
})(typeof window !== 'undefined' ? window : globalThis);
