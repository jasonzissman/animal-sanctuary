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
 *   SA.unlocks.create({ save?, track?, onUnlock? }) -> tracker
 *     tracker.tap(target, itemId, biome)   counts one tap on an item (session memory) and then runs check()
 *     tracker.check()                      unlocks every hidden easter egg whose condition now holds: saved in
 *                                          unlockedAnimals, event `unlock.animal` {animalId}, onUnlock(animal);
 *                                          returns the newly unlocked animals
 *     tracker.isUnlocked(id)   tracker.facts()
 *   SA.unlocks.isUnlocked(id)            true for real animals and for eggs saved in unlockedAnimals
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
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

  function create(opts) {
    opts = opts || {};
    var counts = {};    // 'target|biome|item' -> taps this session
    var best = {};      // target -> { biome|'*': highest count on one item }

    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }

    function facts() {
      var s = SA.save.get();
      return { stars: s.stars, rounds: s.rounds.completed, taps: best };
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
      var key = target + '|' + (biome || '*') + '|' + itemId;
      var n = counts[key] = (counts[key] || 0) + 1;
      var t = best[target] = best[target] || {};
      t['*'] = Math.max(t['*'] || 0, n);
      if (biome) t[biome] = Math.max(t[biome] || 0, n);
      return check();
    }

    return { tap: tap, check: check, facts: facts, isUnlocked: isUnlocked };
  }

  SA.unlocks = { TYPES: TYPES, validate: validate, evaluate: evaluate, create: create, isUnlocked: isUnlocked };
})(typeof window !== 'undefined' ? window : globalThis);
