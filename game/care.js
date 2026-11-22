/* SA.care: pure care-task state (no THREE, no DOM; unit-tested in node:vm). Task kinds: clean a muddy part (limpiar),
 * heal a scraped part (curar: the same tap logic with a single tap, the bandage is drawn by the flow) and feed with
 * counts (alimentar).
 *
 *   var care = SA.care.create({ rng?, now?, level?, track? })      (same option meaning as SA.round.create)
 *   care.maybeStart(animalId, force?, kind?) -> task | null
 *       With the task's `chance` (or always when force) picks a part from the task data that the animal really has:
 *       { id, taskId, kind, animalId, part, text: 'Limpia las patas', rubs, remaining, spots, misses, done }
 *       A feed task has no part: { ..., kind: 'alimentar', food: 'fresa', count: 3, given: 0, tray: [foodIds],
 *       items: [{ food, count, given }], words: [vocabKeys], text: 'Dale tres fresas al conejo' }; the tray holds the
 *       asked food(s) plus any other active foods (AS-0155: fresa is the only active food in game/data/foods.js, so the
 *       tray is just ['fresa'] and an animal whose diet has no food, carnívoro/insectívoro, never gets a feed task).
 *       `count`/`given` are totals over `items`; `words` are the vocab keys of the asked phrase ("number:3",
 *       "foodpl:fresa"). Counts are 1-3 at scaffold level 1, 1-5 at level 2, and 1-8 at level 3+, which can also ask two
 *       different foods once more than one food is active: 'Dale dos fresas y una zanahoria al conejo'
 *       (words: number:2 foodpl:fresa phrase:y number:una foodsg:zanahoria).
 *   care.feed(foodId, hand?) -> { status: 'ignored' | 'wrong' | 'fed' | 'done', ... }
 *       Only the asked food(s) count. 'fed' carries `given`/`remaining` (totals); the task completes (star,
 *       round.complete) only when every asked item has exactly its count. Any other food, or one too many of an
 *       asked food, is 'wrong' with `reason` 'diet' (the animal does not eat it) | 'other' (it eats it, but it was
 *       not asked) | 'extra', plus the food's Spanish `label`; no penalty, the task continues. Emits care.feed {food, correct}.
 *       A tray food must be on the tray; with `hand` true (a food item from the inventory, given with Space) any known food
 *       counts. The caller (SA.careFlow) removes the item from the inventory when it was accepted.
 *   care.tap({ animalId, part, item? }) -> { status: 'ignored' | 'wrong' | 'scrub' | 'done', ... }
 *       `item` is the equipped item id (absent = empty hands). Each task carries its action (game/data/actions.js):
 *       `task.action`, `task.item` (the tool that fits: 'esponja' | 'cepillo' | 'venda' | 'hands' | 'food'), `sfx`, `reaction`.
 *       Emits part.tap {part, correct}. The right tool on the right part washes one rub away ('scrub' with `remaining`,
 *       spots left in `spotsLeft`); the last rub finishes the task: +1 star, rounds.completed +1, round.complete
 *       {roundId, seconds, misses, hints, level}. Any other pairing only counts a miss and returns `reason`
 *       ('tool' | 'part'), the part's Spanish `label` and the held tool's `itemLabel` (a learning moment, no penalty);
 *       the task continues. Feed tasks ignore tool taps (see feed).
 *       Tangled wing (kind 'desenredar', action.tangled): `task.tangled` is true while the leaf is stuck (the render makes the
 *       bird hop, not fly); 3 right tugs (empty hands on the wing) finish it and the 'done' result carries `tangled`, `gives`
 *       (item id the flow adds to the inventory) and `say` (vocab key spoken instead of "¡Muy bien!").
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

    // Vocab key of the count word: "una"/"un" for 1 (agrees with the food's gender), else the number ("number:3").
    function countKey(n, gender) { return n === 1 ? (gender === 'f' ? 'number:una' : 'number:un') : 'number:' + n; }

    function vocabEs(key) {
      var v = SA.vocab && SA.vocab.get(key);
      return v ? v.es : key.split(':')[1];
    }

    // "el cepillo" for an item id (null for empty hands or an unknown item).
    function itemLabel(id) {
      try { var it = id && SA.data.get('items', id); return it ? it.name.es : null; } catch (e) { return null; }
    }

    function eats(food, diet) { return food.diets.indexOf(diet) >= 0; }

    function randInt(lo, hi) { var span = hi - lo + 1; return lo + Math.floor(rng() * span) % span; }

    // Scaffold level 1: 1..easyMax; 2: 1..maxCount; 3+ (challenge): 1..challengeMax, or sometimes two different foods.
    function startFeed(animal, def) {
      var diet = animal.traits.diet;
      var foods = SA.data.all('foods');
      var yes = foods.filter(function (f) { return eats(f, diet); });
      if (!yes.length) return null;
      var level = levelNow();
      var target = pick(yes);
      var second = null;
      if (level >= 3 && yes.length > 1 && rng() < def.pairChance) {
        second = pick(yes.filter(function (f) { return f !== target; }));
      }
      var maxN = level >= 3 ? def.challengeMax : level >= 2 ? def.maxCount : def.easyMax;
      var items = second
        ? [{ food: target.id, count: randInt(def.minCount, def.pairMax), given: 0 },
          { food: second.id, count: randInt(def.minCount, def.pairMax), given: 0 }]
        : [{ food: target.id, count: randInt(def.minCount, maxN), given: 0 }];
      var asked = second ? [target, second] : [target];
      var others = shuffled(yes.filter(function (f) { return asked.indexOf(f) < 0; })).slice(0, def.trayMatching);
      var wrong = shuffled(foods.filter(function (f) { return !eats(f, diet); })).slice(0, def.trayOther);
      var tray = shuffled(asked.concat(others, wrong)).map(function (f) { return f.id; });
      // Feminine nouns that start with a stressed "á" take "el" (el águila), so "al águila", not "a la águila".
      var who = (animal.name.gender === 'f' && !/^á/.test(animal.name.es) ? 'a la ' : 'al ') + animal.name.es;
      // Each ask is "<count> <noun>" with the count agreeing in gender, the noun singular for 1; asks are joined by "y".
      var words = [], phrases = [];
      items.forEach(function (it, i) {
        var f = asked[i], keys = [countKey(it.count, f.label.gender), (it.count === 1 ? 'foodsg:' : 'foodpl:') + f.id];
        phrases.push(keys.map(vocabEs).join(' '));
        words = words.concat(i ? ['phrase:y'] : [], keys);
      });
      var text = def.prompt.replace('{count} {food}', phrases.join(' y ')).replace('{animal}', who);
      var total = items.reduce(function (n, it) { return n + it.count; }, 0);
      seq += 1;
      return { id: 'c' + seq + ':' + animal.id + ':' + target.id, taskId: def.id, kind: 'alimentar', animalId: animal.id,
        part: null, action: 'alimentar', item: 'food', sfx: 'pop', reaction: 'boing', food: target.id, count: total, given: 0, items: items, words: words, tray: tray, text: text,
        misses: 0, done: false };
    }

    function startPart(animal, def) {
      var has = animal.parts.map(function (p) { return p.part; });
      var eligible = def.parts.filter(function (k) { return has.indexOf(k) >= 0; });
      if (!eligible.length) return null;
      var part = pick(eligible);
      seq += 1;
      var action = SA.data.get('actions', def.action);
      return { id: 'c' + seq + ':' + animal.id + ':' + part, taskId: def.id, kind: def.kind, animalId: animal.id, part: part,
        action: action.id, item: action.item, sfx: action.sfx, reaction: action.reaction, tangled: !!action.tangled,
        text: def.prompt.replace('{part}', SA.data.get('parts', part).label.es), rubs: def.rubs, remaining: def.rubs,
        spots: def.rubs * def.spotsPerRub, spotsPerRub: def.spotsPerRub, misses: 0, done: false };
    }

    // kind (optional) restricts the pick to one task kind ('limpiar' | 'curar' | 'alimentar').
    function maybeStart(animalId, force, kind) {
      var animal = SA.data.get('animals', animalId);
      if (!animal || (animal.easterEgg && SA.save.get().unlockedAnimals.indexOf(animalId) < 0)) return null;   // hidden eggs have no care
      var has = animal.parts.map(function (p) { return p.part; });
      // only tasks this animal can really do (a rabbit has el pelo and la barriga, a snake has neither); an animal whose
      // diet has no food (only fresas exist: carnívoro, insectívoro) never gets a feed task
      var feeds = SA.data.all('foods').some(function (f) { return eats(f, animal.traits.diet); });
      var defs = SA.data.all('careTasks').filter(function (d) {
        return (!kind || d.kind === kind) && (d.kind === 'alimentar' ? feeds : d.parts.some(function (k) { return has.indexOf(k) >= 0; }));
      });
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
      var action = SA.data.get('actions', task.action);
      return { status: 'done', kind: task.kind, animalId: task.animalId, part: task.part, seconds: seconds, stars: stars, misses: task.misses,
        sfx: task.sfx, reaction: task.reaction, tangled: !!action.tangled, gives: action.gives || null, say: action.say || null };
    }

    // Feed: one food item given to the animal. Only the asked food counts; the task completes at exactly `count`.
    // `hand` (a food item held in the inventory, given with Space) may be any known food, not only one on the tray.
    function feed(foodId, hand) {
      if (!task || task.done || task.kind !== 'alimentar' || !SA.data.get('foods', foodId) ||
        (!hand && task.tray.indexOf(foodId) < 0)) return { status: 'ignored' };
      var animal = SA.data.get('animals', task.animalId), food = SA.data.get('foods', foodId);
      var item = null, asked = false;
      task.items.forEach(function (it) {
        if (it.food !== foodId) return;
        asked = true;
        if (it.given < it.count) item = it;
      });
      var ok = !!item;
      track('care.feed', { food: foodId, correct: ok });
      if (!ok) {         // wrong food, a food it does not eat, or one too many: it bounces back (no penalty)
        task.misses += 1;
        var reason = asked ? 'extra' : eats(food, animal.traits.diet) ? 'other' : 'diet';
        return { status: 'wrong', reason: reason, food: foodId, label: SA.vocab.get('food:' + foodId).es, misses: task.misses };
      }
      item.given += 1;
      task.given += 1;
      if (task.given >= task.count) return complete();
      return { status: 'fed', food: foodId, given: task.given, remaining: task.count - task.given };
    }

    function tap(p) {
      if (!task || task.done || task.kind === 'alimentar' || !p || p.animalId !== task.animalId) return { status: 'ignored' };
      var part = String(p.part || 'cuerpo');
      // The right tool (the equipped item, or empty hands) on the right part progresses the task; anything else is a
      // funny harmless miss that names the tool and the part ("el cepillo", "las patas").
      var heldId = typeof p.item === 'string' && p.item ? p.item : null;
      var toolOk = SA.actions.fits(SA.data.get('actions', task.action), heldId);
      var correct = toolOk && part === task.part;
      track('part.tap', { part: part, correct: correct });
      if (!correct) {
        task.misses += 1;
        var def = SA.data.get('parts', part);
        return { status: 'wrong', reason: toolOk ? 'part' : 'tool', part: part, label: def ? def.label.es : part,
          item: heldId, itemLabel: itemLabel(heldId), misses: task.misses };
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
