/* SA.round: pure Scout & Spot round state (no THREE, no DOM; unit-tested in node:vm).
 *
 *   var game = SA.round.create({ animals?, rng?, now?, level?, track? })
 *     animals  ids/objects in play (default: every non-easter-egg animal plus unlocked eggs)   rng  () -> [0,1)   now  () -> ms
 *     level    number or () -> number; default reads SA.save settings.scaffold (1 = beginner)
 *     track    (type, fields) event sink; default window.SAT.track
 *     biome    biome id or () -> id, read at each start(): target and distractors come only from animals whose
 *              data `biome` matches when it has >= MIN_BIOME_ANIMALS of them, else from all animals.
 *              SA.round.biomeForX(cameraTargetX) gives the biome under the camera target.
 *   game.start()  -> round | null    begins a new round with a fresh clue:
 *       { id, clue, answerId, level, hintShown, misses, hints, done }
 *       Beginner (level <= 1) shows the silhouette hint right away; higher levels reveal it with game.hint().
 *   game.pick({ animalId, part }) -> { status: 'ignored' | 'wrong' | 'correct', ... }
 *       Emits part.tap {part, correct}. A wrong pick only counts a miss (no penalty, the round continues).
 *       The right animal emits round.complete {roundId, seconds, misses, hints, level}, awards 1 star in SA.save
 *       and ends the round ({ status: 'correct', animalId, seconds, stars }).
 *   game.hint() -> round | null       reveals the silhouette (counts a hint when it was hidden).
 *   game.current() -> round | null
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var TYPES = ['partAdjective', 'trait'];   // clues whose answer is an animal (touchPart is for Care)

  var MIN_BIOME_ANIMALS = 3;

  /** Animals of `biomeId` (by data `biome` field) when there are at least `min` of them, else the whole list. */
  function candidatesForBiome(list, biomeId, min) {
    if (typeof biomeId !== 'string' || !biomeId) return list;
    var here = list.filter(function (a) { return a && a.biome === biomeId; });
    return here.length >= (min === undefined ? MIN_BIOME_ANIMALS : min) ? here : list;
  }

  /** Biome id under the camera target at world x; null when SA.map is missing or x is not a number. */
  function biomeForX(x) {
    return SA.map && typeof x === 'number' && isFinite(x) ? SA.map.biomeAt(x) : null;
  }

  function create(opts) {
    opts = opts || {};
    var rng = opts.rng || SA.clues.makeRng(Date.now());
    var now = opts.now || function () { return Date.now(); };
    var cluesState = { animals: null, recent: [], types: TYPES };
    var seq = 0, round = null, startedAt = 0;

    function animals() {
      var found = SA.save.get().unlockedAnimals;   // unlocked easter eggs join the clue rotation
      var list = opts.animals || SA.data.all('animals').filter(function (a) { return !a.easterEgg || found.indexOf(a.id) >= 0; });
      return list.map(function (a) { return typeof a === 'string' ? SA.data.get('animals', a) : a; });
    }

    function levelNow() {
      var l = typeof opts.level === 'function' ? opts.level()
        : opts.level !== undefined ? opts.level : SA.save.get().settings.scaffold;
      return typeof l === 'number' && l >= 1 ? Math.floor(l) : 1;
    }

    function track(type, fields) {
      if (type === 'part.tap' && SA.stats) SA.stats.recordTap(fields.part, fields.correct);
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }

    function start() {
      var biome = typeof opts.biome === 'function' ? opts.biome() : opts.biome;
      cluesState.animals = candidatesForBiome(animals(), biome);
      cluesState.level = levelNow();
      var clue = SA.clues.pickClue(cluesState, rng);
      if (!clue) {                       // everything was used recently: forget history and try again
        cluesState.recent = [];
        clue = SA.clues.pickClue(cluesState, rng);
      }
      if (!clue) { round = null; return null; }
      SA.clues.remember(cluesState, clue);
      seq += 1;
      var level = levelNow();
      round = { id: 'r' + seq + ':' + clue.key, clue: clue, answerId: clue.answer.animalId, level: level,
        hintShown: level <= 1, misses: 0, hints: 0, done: false };
      startedAt = now();
      return round;
    }

    function complete() {
      var seconds = Math.max(0, Math.round((now() - startedAt) / 100) / 10);
      round.done = true;
      var s = SA.save.get();
      var stars = s.stars + 1;
      SA.save.update({ stars: stars, rounds: {
        completed: s.rounds.completed + 1, streak: round.misses ? 0 : s.rounds.streak + 1 } });
      track('round.complete', { roundId: round.id, seconds: seconds, misses: round.misses, hints: round.hints, level: round.level });
      var adapt = null;      // adapt the saved level for the next round (only when it is read from the save)
      try {
        if (opts.level === undefined && SA.scaffold) {
          adapt = SA.scaffold.record({ seconds: seconds, misses: round.misses, hints: round.hints });
        }
      } catch (e) { /* adaptivity never breaks play */ }
      return { status: 'correct', animalId: round.answerId, seconds: seconds, stars: stars, misses: round.misses,
        levelChange: adapt ? adapt.change : null };
    }

    function pick(p) {
      if (!round || round.done || !p || typeof p.animalId !== 'string') return { status: 'ignored' };
      var correct = p.animalId === round.answerId;
      track('part.tap', { part: String(p.part || 'cuerpo'), correct: correct });
      if (correct) return complete();
      round.misses += 1;
      return { status: 'wrong', misses: round.misses };
    }

    function hint() {
      if (!round || round.done) return null;
      if (!round.hintShown) { round.hintShown = true; round.hints += 1; }
      return round;
    }

    /** The off-screen arrow was tapped: counts as one hint for this round (once). */
    function pointerHint() {
      if (!round || round.done) return null;
      if (!round.pointerUsed) { round.pointerUsed = true; round.hints += 1; }
      return round;
    }

    return { start: start, pick: pick, hint: hint, pointerHint: pointerHint, current: function () { return round; } };
  }

  SA.round = { TYPES: TYPES, MIN_BIOME_ANIMALS: MIN_BIOME_ANIMALS, candidatesForBiome: candidatesForBiome,
    biomeForX: biomeForX, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
