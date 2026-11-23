/* SA.encounters: routine small needs on animals around the map (pure; no THREE, no DOM; unit-tested in node:vm).
 * Part of AS-0179. Loaded after game/data/needs.js, game/nearby-task.js and game/focus.js. Needs are data (game/data/needs.js):
 * each reuses a care task/action and carries a floating icon and a spoken hint. Nothing here knows an animal id.
 *
 *   var enc = SA.encounters.create({ rng?, now?, focus? });   rng() in [0,1) (default Math.random); now() in ms (default Date.now)
 *   enc.sync({ animals, excludeIds })    call each frame (cheap) or when the animals in play change. `animals` are animal data
 *                                        objects (or ids). Drops needs on animals that left play or are now excluded (the active
 *                                        mission's animals), then tops up toward ~1 in 4 animals (never above MAX), one animal at a
 *                                        time, only once the cooldown after the last fix has passed. Does nothing while paused.
 *   enc.tasks()                          -> [{ kind: 'encounter', id, animalId, need }] for SA.nearbyTask.update
 *   enc.need(animalId)                   -> the need { id, care, icon, hint } or null
 *   enc.hint(animalId)                   -> { icon, keys: ['animal:pato', 'phrase:tienehambre'], text: '¡El pato tiene hambre!' } or null
 *   enc.shouldCall(animalId, nowMs?)     -> true at most once per CALL_GAP_MS per needy animal (the near call plus spoken hint);
 *                                           false when it has no need or focus disallows small tasks
 *   enc.resolve(animalId)                -> true when a need was removed (starts the cooldown); a new need goes to another animal
 *   enc.reset()                          forget everything (a new session)
 * Paused (SA.focus.allowsSmall() false: a story mission runs): no new needs and no calls. Existing needs wait and come back.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var MAX = 4;                  // never more needy animals than this at once
  var PER_ANIMALS = 4;          // about one needy animal in four
  var CALL_GAP_MS = 20000;      // an animal calls out at most once per this long
  var COOLDOWN_MS = 30000;      // after a need is fixed, wait this long before a new one appears

  function create(opts) {
    opts = opts || {};
    var rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    var clock = typeof opts.now === 'function' ? opts.now : Date.now;
    var needs = {};             // animalId -> { id, animalId, need }
    var order = [];             // animal ids in the order they got a need
    var lastCall = {};          // animalId -> ms of the last shouldCall true
    var nextAddAt = 0, lastFixed = null, serial = 0;

    function allows() {
      try {
        var f = opts.focus || SA.focus;
        return !f || !f.allowsSmall || f.allowsSmall();
      } catch (e) { return true; }
    }

    function eatsAnything(animal) {
      try {
        var diet = animal.traits && animal.traits.diet;
        return SA.data.all('foods').some(function (f) { return f.diets.indexOf(diet) >= 0; });
      } catch (e) { return false; }
    }

    function fits(need, animal) {
      if (need.part && !(animal.parts || []).some(function (p) { return p.part === need.part; })) return false;
      return !need.eats || eatsAnything(animal);
    }

    function pick(list) { return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]; }

    function drop(id) { delete needs[id]; delete lastCall[id]; order = order.filter(function (x) { return x !== id; }); }

    function addOne(candidates) {
      var pool = candidates.filter(function (a) { return a.id !== lastFixed; });
      if (!pool.length) pool = candidates;                 // only the last-fixed animal is left: better than no need
      while (pool.length) {
        var animal = pick(pool);
        var options = SA.data.all('needs').filter(function (n) { return fits(n, animal); });
        if (options.length) {
          var need = pick(options);
          needs[animal.id] = { id: 'enc' + (++serial), animalId: animal.id, need: need };
          order.push(animal.id);
          return true;
        }
        pool = pool.filter(function (a) { return a !== animal; });
      }
      return false;
    }

    function sync(input) {
      input = input || {};
      var list = (input.animals || []).map(function (a) { return typeof a === 'string' ? SA.data.get('animals', a) : a; })
        .filter(function (a) { return a && typeof a.id === 'string'; });
      var skip = {};
      (input.excludeIds || []).forEach(function (id) { skip[id] = true; });
      var inPlay = {};
      list.forEach(function (a) { inPlay[a.id] = true; });
      Object.keys(needs).forEach(function (id) { if (!inPlay[id] || skip[id]) drop(id); });
      if (!allows() || clock() < nextAddAt) return;
      var target = Math.min(MAX, Math.round(list.length / PER_ANIMALS));
      while (order.length < target) {
        var free = list.filter(function (a) { return !skip[a.id] && !needs[a.id]; });
        if (!addOne(free)) break;
      }
    }

    function tasks() {
      return order.map(function (id) { return { kind: 'encounter', id: needs[id].id, animalId: id, need: needs[id].need }; });
    }

    function need(animalId) { return needs[animalId] ? needs[animalId].need : null; }

    function hint(animalId) {
      var n = need(animalId), animal = n && SA.data.get('animals', animalId);
      if (!n || !animal) return null;
      var key = n.hint[animal.name.gender === 'f' ? 'f' : 'm'];
      var who = SA.vocab.get('animal:' + animalId), what = SA.vocab.get(key);
      if (!who || !what) return null;
      var text = who.es.charAt(0).toUpperCase() + who.es.slice(1) + ' ' + what.es;
      return { icon: n.icon, keys: [who.key, key], text: '¡' + text + '!' };
    }

    function shouldCall(animalId, nowMs) {
      if (!needs[animalId] || !allows()) return false;
      var t = typeof nowMs === 'number' ? nowMs : clock();
      if (lastCall[animalId] !== undefined && t - lastCall[animalId] < CALL_GAP_MS) return false;
      lastCall[animalId] = t;
      return true;
    }

    function resolve(animalId) {
      if (!needs[animalId]) return false;
      drop(animalId);
      lastFixed = animalId;
      nextAddAt = clock() + COOLDOWN_MS;
      return true;
    }

    function reset() { needs = {}; order = []; lastCall = {}; nextAddAt = 0; lastFixed = null; }

    return { sync: sync, tasks: tasks, need: need, hint: hint, shouldCall: shouldCall, resolve: resolve, reset: reset };
  }

  SA.encounters = { MAX: MAX, PER_ANIMALS: PER_ANIMALS, CALL_GAP_MS: CALL_GAP_MS, COOLDOWN_MS: COOLDOWN_MS, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
