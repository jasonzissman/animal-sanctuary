/* SA.scaffold: pure adaptive difficulty (no THREE, no DOM; unit-tested in node:vm). Needs SA.save for persistence.
 *
 * Levels: 1 beginner (one part/trait + silhouette hint), 2 intermediate (2-3 traits, no silhouette),
 * 3 challenge (counts and close pairs). The level lives in save.settings.scaffold.
 *
 *   SA.scaffold.classify({ seconds, misses, hints }) -> 'quick' | 'slow' | 'ok'
 *       quick: no misses, no hints and answered within QUICK_SECONDS.
 *       slow:  any miss, any hint, or longer than SLOW_SECONDS.   ok: everything in between (resets both streaks).
 *   SA.scaffold.create({ get?, set? }) -> tracker    get() -> level, set(level) persist it (default: SA.save settings)
 *       tracker.level()            current level, clamped to 1..3
 *       tracker.record(result)     -> { level, change: 'up' | 'down' | null }
 *           3 quick rounds in a row move up a level; 3 slow/missed rounds in a row move down. Streaks restart after a move.
 *   SA.scaffold.record(result)     the same on a shared tracker bound to the save.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var MIN_LEVEL = 1, MAX_LEVEL = 3;
  var STREAK = 3;            // rounds in a row before the level moves
  var QUICK_SECONDS = 12;
  var SLOW_SECONDS = 20;

  function clamp(l) {
    l = typeof l === 'number' && isFinite(l) ? Math.floor(l) : MIN_LEVEL;
    return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, l));
  }

  function classify(r) {
    r = r || {};
    var seconds = typeof r.seconds === 'number' ? r.seconds : 0;
    if ((r.misses | 0) > 0 || (r.hints | 0) > 0 || seconds > SLOW_SECONDS) return 'slow';
    return seconds <= QUICK_SECONDS ? 'quick' : 'ok';
  }

  function create(o) {
    o = o || {};
    var get = o.get || function () { return SA.save.get().settings.scaffold; };
    var set = o.set || function (l) { SA.save.update({ settings: { scaffold: l } }); };
    var quick = 0, slow = 0;

    function record(result) {
      var kind = classify(result);
      quick = kind === 'quick' ? quick + 1 : 0;
      slow = kind === 'slow' ? slow + 1 : 0;
      var level = clamp(get()), change = null;
      if (quick >= STREAK && level < MAX_LEVEL) { level += 1; change = 'up'; }
      else if (slow >= STREAK && level > MIN_LEVEL) { level -= 1; change = 'down'; }
      if (quick >= STREAK || slow >= STREAK) { quick = 0; slow = 0; }   // a full streak is spent even at the ends
      if (change) set(level);
      return { level: level, change: change };
    }

    return { level: function () { return clamp(get()); }, record: record };
  }

  var shared = null;
  SA.scaffold = {
    MIN_LEVEL: MIN_LEVEL, MAX_LEVEL: MAX_LEVEL, STREAK: STREAK, QUICK_SECONDS: QUICK_SECONDS, SLOW_SECONDS: SLOW_SECONDS,
    classify: classify, create: create,
    record: function (result) {
      if (!shared) shared = create();
      // A grown-up pinned the difficulty (settings.difficulty other than 'auto'): never adapt it.
      var pinned = false;
      try { var d = SA.save.get().settings.difficulty; pinned = !!d && d !== 'auto'; } catch (e) { pinned = false; }
      if (pinned) return { level: shared.level(), change: null };
      return shared.record(result);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
