/* SA.mission: pure rescue-mission state (no THREE, no DOM; unit-tested in node:vm). One mission goes deeper into ONE animal:
 *   find (any animal that fits the clue) -> help (1 task at scaffold level 1, 2 at level 2+) -> photo (la cámara on that animal).
 *
 *   var m = SA.mission.create({ animals?, rng?, now?, level?, track?, biome? })   (same options as SA.round.create)
 *   SA.mission.supportedTasks(animal) -> [careTask]   the care tasks the animal really supports: a part task needs one of its
 *       parts (limpiar/curar patas.., cepillar pelo, acariciar barriga, desenredar alas), alimentar needs a diet that eats a food
 *   m.start({ animalId? }) -> mission | null   (animalId: the clue fits that nearby animal, AS-0225; none: any clue)   { id, clue, answerId, answerIds, level, step: 'find', animalId: null, tasks: [], misses, hints, done }
 *   m.found(animalId) -> { status: 'ignored' | 'wrong' | 'found', ... }
 *       any animal in answerIds is right (the duck or the turtle for "nada"); 'found' sticks the mission to that animal and picks
 *       its help tasks: mission.tasks = [{ id, kind, action, done }] (ids are careTasks ids; start each with
 *       SA.care.maybeStart(animalId, true, task.kind)). An animal with no supported task goes straight to the photo step.
 *   m.taskDone(taskId) -> { status: 'ignored' | 'task' | 'helped', remaining }   marks a pending help task done; 'helped' = all done.
 *   m.photo(animalId) -> { status: 'ignored' | 'wrong' | 'early' | 'correct', ... }
 *       'wrong' a photo of another animal, 'early' the right animal before the help is done (a friendly miss each, nothing is lost).
 *       'correct' is only the photo of the found animal after the help: +1 star, rounds.completed +1, round.complete
 *       {roundId, seconds, misses, hints, level} once, and SA.scaffold.record when the level is read from the save.
 *   m.hasBiomePool(biomeId) -> boolean   the biome has enough animals of its own (SA.reroll); mission.biome / .picks feed it too.
 *   m.hint() -> mission | null     counts one hint.      m.current() -> mission | null
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var TYPES = ['partAdjective', 'trait'];

  function eats(food, diet) { return food.diets.indexOf(diet) >= 0; }

  /** Care tasks this animal can really do (same rules as SA.care.maybeStart). */
  function supportedTasks(animal) {
    if (!animal || !animal.parts) return [];
    var has = animal.parts.map(function (p) { return p.part; });
    var feeds = SA.data.all('foods').some(function (f) { return eats(f, animal.traits.diet); });
    return SA.data.all('careTasks').filter(function (d) {
      return d.kind === 'alimentar' ? feeds : d.parts.some(function (k) { return has.indexOf(k) >= 0; });
    });
  }

  function create(opts) {
    opts = opts || {};
    var rng = opts.rng || SA.clues.makeRng(Date.now());
    var now = opts.now || function () { return Date.now(); };
    var cluesState = { animals: null, recent: [], types: TYPES };
    var seq = 0, m = null, startedAt = 0;

    function animals() {
      var unlocked = SA.save.get().unlockedAnimals;
      var list = opts.animals || SA.data.all('animals').filter(function (a) { return !a.story && (!a.easterEgg || unlocked.indexOf(a.id) >= 0); });
      return list.map(function (a) { return typeof a === 'string' ? SA.data.get('animals', a) : a; });
    }

    function levelNow() {
      var l = typeof opts.level === 'function' ? opts.level()
        : opts.level !== undefined ? opts.level : SA.save.get().settings.scaffold;
      return typeof l === 'number' && l >= 1 ? Math.floor(l) : 1;
    }

    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }

    function shuffled(list) {
      var a = list.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1)) % (i + 1), t = a[i];
        a[i] = a[j]; a[j] = t;
      }
      return a;
    }

    // A clue the nearby animal fits (SA.nearbyTask.pickClueFor), or the usual random clue when no animal is named.
    function pickClue(animalId) {
      if (animalId && SA.nearbyTask) return SA.nearbyTask.pickClueFor(animalId, cluesState, rng);
      return SA.clues.pickClue(cluesState, rng);
    }

    function start(startOpts) {
      var animalId = startOpts && typeof startOpts.animalId === 'string' ? startOpts.animalId : null;
      var biome = typeof opts.biome === 'function' ? opts.biome() : opts.biome;
      var list = animals();
      cluesState.animals = SA.round ? SA.round.candidatesForBiome(list, biome) : list;
      cluesState.level = levelNow();
      var clue = pickClue(animalId);
      if (!clue) { cluesState.recent = []; clue = pickClue(animalId); }
      if (!clue) { m = null; return null; }
      SA.clues.remember(cluesState, clue);
      seq += 1;
      var ids = list.filter(function (a) { return SA.clues.matches(clue, a); }).map(function (a) { return a.id; });
      if (ids.indexOf(clue.answer.animalId) < 0) ids.unshift(clue.answer.animalId);
      m = { id: 'm' + seq + ':' + clue.key, clue: clue, answerId: clue.answer.animalId, answerIds: ids, level: levelNow(),
        step: 'find', animalId: null, tasks: [], misses: 0, hints: 0, done: false, picks: 0,
        biome: typeof biome === 'string' && biome ? biome : null };
      startedAt = now();
      return m;
    }

    function found(animalId) {
      if (!m || m.done || m.step !== 'find' || typeof animalId !== 'string') return { status: 'ignored' };
      if (m.answerIds.indexOf(animalId) < 0) { m.misses += 1; return { status: 'wrong', misses: m.misses }; }
      var animal = SA.data.get('animals', animalId);
      var count = m.level >= 2 ? 2 : 1;
      m.animalId = animalId;
      m.tasks = shuffled(supportedTasks(animal)).slice(0, count).map(function (d) {
        return { id: d.id, kind: d.kind, action: d.action, done: false };
      });
      m.step = m.tasks.length ? 'help' : 'photo';
      return { status: 'found', animalId: animalId, step: m.step, tasks: m.tasks };
    }

    function taskDone(taskId) {
      if (!m || m.done || m.step !== 'help') return { status: 'ignored' };
      var t = m.tasks.filter(function (x) { return x.id === taskId && !x.done; })[0];
      if (!t) return { status: 'ignored' };
      t.done = true;
      var remaining = m.tasks.filter(function (x) { return !x.done; }).length;
      if (remaining) return { status: 'task', remaining: remaining };
      m.step = 'photo';
      return { status: 'helped', remaining: 0 };
    }

    function complete() {
      var seconds = Math.max(0, Math.round((now() - startedAt) / 100) / 10);
      m.done = true;
      m.step = 'done';
      var s = SA.save.get();
      var stars = s.stars + 1;
      SA.save.update({ stars: stars, rounds: { completed: s.rounds.completed + 1, streak: m.misses ? 0 : s.rounds.streak + 1 } });
      track('round.complete', { roundId: m.id, seconds: seconds, misses: m.misses, hints: m.hints, level: m.level });
      var adapt = null;
      try {
        if (opts.level === undefined && SA.scaffold) adapt = SA.scaffold.record({ seconds: seconds, misses: m.misses, hints: m.hints });
      } catch (e) { /* adaptivity never breaks play */ }
      return { status: 'correct', animalId: m.animalId, seconds: seconds, stars: stars, misses: m.misses,
        levelChange: adapt ? adapt.change : null };
    }

    function photo(animalId) {
      if (!m || m.done || typeof animalId !== 'string') return { status: 'ignored' };
      if (m.step === 'photo' && animalId === m.animalId) return complete();
      m.misses += 1;
      // a different animal is a friendly miss; the found animal before its help is done just isn't ready yet
      return { status: animalId === m.animalId ? 'early' : 'wrong', misses: m.misses, step: m.step };
    }

    function hint() {
      if (!m || m.done) return null;
      m.hints += 1;
      return m;
    }

    /** True when `biomeId` has enough animals of its own to roll a clue from (same rule as SA.round.hasBiomePool; SA.reroll). */
    function hasBiomePool(biomeId) {
      if (typeof biomeId !== 'string' || !biomeId || !SA.round) return false;
      var list = animals();
      return SA.round.candidatesForBiome(list, biomeId) !== list;
    }

    return { start: start, found: found, taskDone: taskDone, photo: photo, hint: hint, hasBiomePool: hasBiomePool,
      current: function () { return m; },
      cancel: function () { m = null; } };      // drops the round quietly: no miss, no round.complete (AS-0222)
  }

  SA.mission = { TYPES: TYPES, supportedTasks: supportedTasks, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
