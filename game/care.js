/* SA.care: pure care-task state (no THREE, no DOM; unit-tested in node:vm). Part 1: clean a muddy part (limpiar).
 *
 *   var care = SA.care.create({ rng?, now?, level?, track? })      (same option meaning as SA.round.create)
 *   care.maybeStart(animalId, force?) -> task | null
 *       With the task's `chance` (or always when force) picks a part from the task data that the animal really has:
 *       { id, taskId, animalId, part, text: 'Limpia las patas', rubs, remaining, spots, misses, done }
 *   care.tap({ animalId, part }) -> { status: 'ignored' | 'wrong' | 'scrub' | 'done', ... }
 *       Emits part.tap {part, correct}. The right part washes one rub away ('scrub' with `remaining`, spots left in
 *       `spotsLeft`); the last rub finishes the task: +1 star, rounds.completed +1, round.complete
 *       {roundId, seconds, misses, hints, level}. A wrong part only counts a miss and returns its Spanish `label`
 *       (a learning moment, no penalty); the task continues.
 *   care.active() -> boolean     care.current() -> task | null
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function create(opts) {
    opts = opts || {};
    var rng = opts.rng || SA.clues.makeRng(Date.now());
    var now = opts.now || function () { return Date.now(); };
    var seq = 0, task = null, startedAt = 0;

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

    function maybeStart(animalId, force) {
      var animal = SA.data.get('animals', animalId);
      if (!animal || animal.easterEgg) return null;
      var defs = SA.data.all('careTasks');
      if (!defs.length) return null;
      var def = defs[Math.floor(rng() * defs.length) % defs.length];
      if (!force && rng() >= def.chance) return null;
      var has = animal.parts.map(function (p) { return p.part; });
      var eligible = def.parts.filter(function (k) { return has.indexOf(k) >= 0; });
      if (!eligible.length) return null;
      var part = eligible[Math.floor(rng() * eligible.length) % eligible.length];
      seq += 1;
      task = { id: 'c' + seq + ':' + animalId + ':' + part, taskId: def.id, animalId: animalId, part: part,
        text: def.prompt.replace('{part}', SA.data.get('parts', part).label.es), rubs: def.rubs, remaining: def.rubs,
        spots: def.rubs * def.spotsPerRub, spotsPerRub: def.spotsPerRub, misses: 0, done: false };
      startedAt = now();
      return task;
    }

    function complete() {
      var seconds = Math.max(0, Math.round((now() - startedAt) / 100) / 10);
      task.done = true;
      var s = SA.save.get();
      var stars = s.stars + 1;
      SA.save.update({ stars: stars, rounds: { completed: s.rounds.completed + 1, streak: s.rounds.streak } });
      track('round.complete', { roundId: task.id, seconds: seconds, misses: task.misses, hints: 0, level: levelNow() });
      return { status: 'done', animalId: task.animalId, part: task.part, seconds: seconds, stars: stars, misses: task.misses };
    }

    function tap(p) {
      if (!task || task.done || !p || p.animalId !== task.animalId) return { status: 'ignored' };
      var part = String(p.part || 'cuerpo');
      var correct = part === task.part;
      track('part.tap', { part: part, correct: correct });
      if (!correct) {
        task.misses += 1;
        var def = SA.data.get('parts', part);
        return { status: 'wrong', part: part, label: def ? def.label.es : part, misses: task.misses };
      }
      task.remaining -= 1;
      if (task.remaining <= 0) { task.remaining = 0; return complete(); }
      return { status: 'scrub', remaining: task.remaining, spotsLeft: task.remaining * task.spotsPerRub };
    }

    return {
      maybeStart: maybeStart, tap: tap, current: function () { return task; },
      active: function () { return !!task && !task.done; },
    };
  }

  SA.care = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
