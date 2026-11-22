/* SA.care: pure care-task state (no THREE, no DOM; unit-tested in node:vm). Task kinds: clean a muddy part (limpiar),
 * heal a scraped part (curar: the same tap logic with a single tap, the bandage is drawn by the flow) and feed with
 * counts (alimentar).
 *
 *   var care = SA.care.create({ rng?, now?, level?, track? })      (same option meaning as SA.round.create)
 *   care.maybeStart(animalId, force?, kind?) -> task | null
 *       With the task's `chance` (or always when force) picks a part from the task data that the animal really has:
 *       { id, taskId, kind, animalId, part, text: 'Limpia las patas', rubs, remaining, spots, misses, done }
 *       A feed task has no part: { ..., kind: 'alimentar', food: 'fresa', count: 3, given: 0, tray: [foodIds],
 *       text: 'Dale tres fresas al conejo' }; the tray mixes the asked food with other foods (some the animal
 *       does not eat). The count is 1-3 at scaffold level 1 and 1-5 from level 2.
 *   care.feed(foodId) -> { status: 'ignored' | 'wrong' | 'fed' | 'done', ... }
 *       Only the asked food counts. 'fed' carries `given`/`remaining`; the task completes (star, round.complete)
 *       only at exactly `count`. Any other food, or one too many, is 'wrong' with `reason` 'diet' (the animal
 *       does not eat it) | 'other' (it eats it, but it was not asked) | 'extra', plus the food's Spanish `label`;
 *       no penalty, the task continues. Emits care.feed {food, correct}.
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
      if (type === 'part.tap' && SA.stats) SA.stats.recordTap(fields.part, fields.correct);
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }

    function pick(list) { return list[Math.floor(rng() * list.length) % list.length]; }

    function shuffled(list) {
      var a = list.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1)) % (i + 1), t = a[i];
        a[i] = a[j]; a[j] = t;
      }
      return a;
    }

    // "una"/"un" for 1 (agrees with the food's gender), else the spoken number word from the vocab ("tres").
    function countWord(n, gender) {
      if (n === 1) return gender === 'f' ? 'una' : 'un';
      var v = SA.vocab && SA.vocab.get('number:' + n);
      return v ? v.es : String(n);
    }

    function eats(food, diet) { return food.diets.indexOf(diet) >= 0; }

    function startFeed(animal, def) {
      var diet = animal.traits.diet;
      var foods = SA.data.all('foods');
      var yes = foods.filter(function (f) { return eats(f, diet); });
      if (!yes.length) return null;
      var target = pick(yes);
      var maxN = levelNow() >= 2 ? def.maxCount : def.easyMax;
      var count = def.minCount + Math.floor(rng() * (maxN - def.minCount + 1)) % (maxN - def.minCount + 1);
      var others = shuffled(yes.filter(function (f) { return f !== target; })).slice(0, def.trayMatching);
      var wrong = shuffled(foods.filter(function (f) { return !eats(f, diet); })).slice(0, def.trayOther);
      var tray = shuffled([target].concat(others, wrong)).map(function (f) { return f.id; });
      var who = (animal.name.gender === 'f' ? 'a la ' : 'al ') + animal.name.es;
      var text = def.prompt.replace('{count}', countWord(count, target.label.gender))
        .replace('{food}', count === 1 ? target.label.es : target.label.plural).replace('{animal}', who);
      seq += 1;
      return { id: 'c' + seq + ':' + animal.id + ':' + target.id, taskId: def.id, kind: 'alimentar', animalId: animal.id,
        part: null, food: target.id, count: count, given: 0, tray: tray, text: text, misses: 0, done: false };
    }

    function startPart(animal, def) {
      var has = animal.parts.map(function (p) { return p.part; });
      var eligible = def.parts.filter(function (k) { return has.indexOf(k) >= 0; });
      if (!eligible.length) return null;
      var part = pick(eligible);
      seq += 1;
      return { id: 'c' + seq + ':' + animal.id + ':' + part, taskId: def.id, kind: def.kind, animalId: animal.id, part: part,
        text: def.prompt.replace('{part}', SA.data.get('parts', part).label.es), rubs: def.rubs, remaining: def.rubs,
        spots: def.rubs * def.spotsPerRub, spotsPerRub: def.spotsPerRub, misses: 0, done: false };
    }

    // kind (optional) restricts the pick to one task kind ('limpiar' | 'curar' | 'alimentar').
    function maybeStart(animalId, force, kind) {
      var animal = SA.data.get('animals', animalId);
      if (!animal || animal.easterEgg) return null;
      var defs = SA.data.all('careTasks').filter(function (d) { return !kind || d.kind === kind; });
      if (!defs.length) return null;
      var def = pick(defs);
      if (!force && rng() >= def.chance) return null;
      var t = def.kind === 'alimentar' ? startFeed(animal, def) : startPart(animal, def);
      if (!t) return null;
      task = t;
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
      return { status: 'done', kind: task.kind, animalId: task.animalId, part: task.part, seconds: seconds, stars: stars, misses: task.misses };
    }

    // Feed: one food item given to the animal. Only the asked food counts; the task completes at exactly `count`.
    function feed(foodId) {
      if (!task || task.done || task.kind !== 'alimentar' || task.tray.indexOf(foodId) < 0) return { status: 'ignored' };
      var animal = SA.data.get('animals', task.animalId), food = SA.data.get('foods', foodId);
      var ok = foodId === task.food && task.given < task.count;
      track('care.feed', { food: foodId, correct: ok });
      if (!ok) {         // wrong food, a food it does not eat, or one too many: it bounces back (no penalty)
        task.misses += 1;
        var reason = foodId === task.food ? 'extra' : eats(food, animal.traits.diet) ? 'other' : 'diet';
        return { status: 'wrong', reason: reason, food: foodId, label: SA.vocab.get('food:' + foodId).es, misses: task.misses };
      }
      task.given += 1;
      if (task.given >= task.count) return complete();
      return { status: 'fed', food: foodId, given: task.given, remaining: task.count - task.given };
    }

    function tap(p) {
      if (!task || task.done || task.kind === 'alimentar' || !p || p.animalId !== task.animalId) return { status: 'ignored' };
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
      maybeStart: maybeStart, tap: tap, feed: feed, current: function () { return task; },
      active: function () { return !!task && !task.done; },
    };
  }

  SA.care = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
