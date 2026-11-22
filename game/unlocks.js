/* SA.unlocks: pure, data-driven unlock conditions for easter-egg animals (no THREE, no DOM; unit-tested in node:vm).
 * Nothing here knows about any particular creature: an animal says `unlock: <condition>` in its data and this module
 * evaluates that condition against the player's facts.
 *
 * Condition shapes (JSON-serialisable):
 *   { type: 'stars',   min: n }                          the player owns at least n stars
 *   { type: 'rounds',  min: n }                          at least n rounds/care tasks completed
 *   { type: 'sameTap', target, biome?, count: n }        one single item of `target` (e.g. one tree) was tapped n
 *                                                        times (biome narrows it to items standing in that biome)
 *   { type: 'all', of: [cond, ...] }   every condition holds        { type: 'any', of: [cond, ...] }   one does
 *
 * facts = { stars, rounds, taps: { <target>: { <biome>|'*': highest tap count on one item } } }
 *
 *   SA.unlocks.validate(cond)            throws a clear Error for a malformed condition
 *   SA.unlocks.evaluate(cond, facts)     -> boolean
 *   SA.unlocks.create({ save?, track?, onUnlock?, now? }) -> tracker
 *     tracker.tap(target, itemId, biome)   counts one tap on an item (count in stats.unlocks, time in stats.unlockTimes)
 *                                          and then runs check(). Taps more than WINDOW_MS (10 s) apart restart the
 *                                          count at 1, so only a short burst on one item counts.
 *     tracker.tapCount(target, itemId, biome)  taps in the current burst on that item (0 once it went stale)
 *   SA.unlocks.streakAfterTap(count, last, now, windowMs?) / liveCount(...)  the pure streak rules
 *     tracker.check()                      unlocks every hidden easter egg whose condition now holds: saved in
 *                                          unlockedAnimals, event `unlock.animal` {animalId}, onUnlock(animal);
 *                                          returns the newly unlocked animals
 *     tracker.isUnlocked(id)   tracker.facts()
 *   SA.unlocks.isUnlocked(id)            true for real animals and for eggs saved in unlockedAnimals
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var MAX_TAPS = 999;
  var TYPES = ['stars', 'rounds', 'sameTap', 'all', 'any'];

  function num(v, field, min) {
    if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < min) {
      throw new Error('unlock condition: ' + field + ' must be an integer >= ' + min + ' (got ' + JSON.stringify(v) + ')');
    }
  }

  function validate(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('unlock condition must be an object');
    if (TYPES.indexOf(c.type) < 0) throw new Error('unlock condition: type must be one of ' + TYPES.join(', ') + ' (got ' + JSON.stringify(c.type) + ')');
    if (c.type === 'stars' || c.type === 'rounds') num(c.min, c.type + '.min', 1);
    if (c.type === 'sameTap') {
      if (typeof c.target !== 'string' || !c.target) throw new Error('unlock condition: sameTap.target must be a non-empty string');
      if (c.biome !== undefined && (typeof c.biome !== 'string' || !c.biome)) throw new Error('unlock condition: sameTap.biome must be a string');
      num(c.count, 'sameTap.count', 1);
    }
    if (c.type === 'all' || c.type === 'any') {
      if (!Array.isArray(c.of) || !c.of.length) throw new Error('unlock condition: ' + c.type + '.of must be a non-empty array');
      c.of.forEach(validate);
    }
    return true;
  }

  function evaluate(c, facts) {
    facts = facts || {};
    switch (c && c.type) {
      case 'stars': return (facts.stars || 0) >= c.min;
      case 'rounds': return (facts.rounds || 0) >= c.min;
      case 'sameTap': return ((facts.taps && facts.taps[c.target] && facts.taps[c.target][c.biome || '*']) || 0) >= c.count;
      case 'all': return c.of.every(function (x) { return evaluate(x, facts); });
      case 'any': return c.of.some(function (x) { return evaluate(x, facts); });
      default: return false;
    }
  }

  function savedIds() {
    var s = SA.save && SA.save.get ? SA.save.get() : null;
    return s && Array.isArray(s.unlockedAnimals) ? s.unlockedAnimals : [];
  }

  function isUnlocked(id) {
    var a = SA.data && SA.data.get('animals', id);
    return !!a && (!a.easterEgg || savedIds().indexOf(id) >= 0);
  }

  // Pure streak rule: a tap continues the streak only when it comes within WINDOW_MS of the previous tap on the
  // same item; otherwise (or when the stored data is missing/odd) the streak restarts at 1.
  var WINDOW_MS = 10000;
  function isLive(last, now, windowMs) {
    var w = typeof windowMs === 'number' ? windowMs : WINDOW_MS;
    return typeof last === 'number' && isFinite(last) && typeof now === 'number' && isFinite(now) && last > 0 && now >= last && now - last <= w;
  }
  // -> the streak length after a tap at `now` (count/last = the item's previous streak length and last tap time)
  function streakAfterTap(count, last, now, windowMs) {
    var c = typeof count === 'number' && isFinite(count) && count > 0 ? Math.floor(count) : 0;
    return isLive(last, now, windowMs) ? Math.min(c + 1, MAX_TAPS) : 1;
  }
  // -> the streak length still counting at `now` (0 once the window has passed)
  function liveCount(count, last, now, windowMs) {
    return isLive(last, now, windowMs) && typeof count === 'number' && count > 0 ? count : 0;
  }

  function create(opts) {
    opts = opts || {};
    var counts = {};    // 'target|biome|item' -> taps in the current burst (restored from stats.unlocks)
    var times = {};     // same key -> ms timestamp of the last tap (restored from stats.unlockTimes)
    function clock() { return opts.now ? opts.now() : Date.now(); }

    // Progress from earlier visits (a missing/odd save simply starts at zero). Stale counts are kept as they
    // are and simply stop counting once their window has passed; the next tap restarts them.
    try {
      var st = SA.save.get().stats;
      Object.keys(st.unlocks).forEach(function (k) { counts[k] = st.unlocks[k]; });
      var tm = st.unlockTimes;
      if (tm && typeof tm === 'object') Object.keys(tm).forEach(function (k) { times[k] = tm[k]; });
    } catch (e) { /* no save module: session memory only */ }

    // target -> { biome|'*': highest in-window count on one item }
    function best() {
      var out = {}, now = clock();
      Object.keys(counts).forEach(function (key) {
        var p = key.split('|');
        var n = liveCount(counts[key], times[key], now);
        if (p.length !== 3 || !p[0] || !n) return;
        var t = out[p[0]] = out[p[0]] || {};
        t['*'] = Math.max(t['*'] || 0, n);
        if (p[1] !== '*') t[p[1]] = Math.max(t[p[1]] || 0, n);
      });
      return out;
    }

    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }

    function facts() {
      var s = SA.save.get();
      return { stars: s.stars, rounds: s.rounds.completed, taps: best() };
    }

    function check() {
      var done = [], f = facts();
      SA.data.all('animals').forEach(function (a) {
        if (!a.easterEgg || !a.unlock || savedIds().indexOf(a.id) >= 0 || !evaluate(a.unlock, f)) return;
        SA.save.update({ unlockedAnimals: savedIds().concat([a.id]) });
        track('unlock.animal', { animalId: a.id });
        done.push(a);
        if (opts.onUnlock) { try { opts.onUnlock(a); } catch (e) { /* the unlock stays saved */ } }
      });
      return done;
    }

    function tap(target, itemId, biome) {
      var key = target + '|' + (biome || '*') + '|' + itemId, now = clock();
      var n = counts[key] = streakAfterTap(counts[key], times[key], now);
      times[key] = now;
      try {
        var patch = { stats: { unlocks: {}, unlockTimes: {} } };
        patch.stats.unlocks[key] = n; patch.stats.unlockTimes[key] = now;
        SA.save.update(patch);
      } catch (e) { /* play on */ }
      return check();
    }

    // Taps in the current burst on one item (0 once the window has passed).
    function tapCount(target, itemId, biome) {
      var key = target + '|' + (biome || '*') + '|' + itemId;
      return liveCount(counts[key], times[key], clock());
    }

    return { tap: tap, tapCount: tapCount, check: check, facts: facts, isUnlocked: isUnlocked };
  }

  SA.unlocks = { WINDOW_MS: WINDOW_MS, streakAfterTap: streakAfterTap, liveCount: liveCount, TYPES: TYPES, validate: validate, evaluate: evaluate, create: create, isUnlocked: isUnlocked };
})(typeof window !== 'undefined' ? window : globalThis);
