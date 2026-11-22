/* SA.nearbyTask: which small task is on screen, and for which nearby animal (pure; no THREE, no DOM; unit-tested in node:vm).
 * Small tasks (clues, encounters) appear only near their animal. Loaded after game/focus.js and game/clues.js.
 *
 *   var nt = SA.nearbyTask.create({ focus? });          one instance remembers the task it shows (hysteresis)
 *   nt.update({ player: { x, z, heading }, animals: [{ id, x, z, traits, parts, ... }],
 *               tasks: [{ kind: 'clue', id, fits(animal) }, { kind: 'encounter', id, animalId }] })
 *     -> { kind, taskId, animalId, dist } | null        call once per frame; null = show nothing
 *   An animal's place is `x`,`z` or `position: { x, z }`. Heading: forward = (sin heading, cos heading), as SA.player.
 *   A task with `fits` is a clue (its anchor is the nearest fitting animal); one with `animalId` is an encounter.
 *
 * Rules
 *   - A clue starts only when an animal it fits is within NEAR and roughly in view (VIEW_HALF_ANGLE; closer than CLOSE counts as
 *     in view). An encounter shows while its needy animal is within NEAR (no view needed).
 *   - Once shown, the task stays until its anchor passes NEAR + HIDE_SLACK (no flicker at the edge). A clue whose anchor left
 *     may move to another fitting animal still inside that range.
 *   - Hiding only returns null: it never fails or removes the task, and it can come back when the player returns.
 *   - While a story mission runs (SA.focus.allowsSmall() is false) nothing is shown and the remembered task is forgotten.
 *   - nt.reset() forgets the shown task. nt.shown() returns it without recomputing.
 *
 *   SA.nearbyTask.pickClueFor(animal, state, rng, opts?) -> clue | null     a clue that `animal` satisfies, from the animals in
 *     play (state = { animals, recent, level?, types? }, as SA.clues.pickClue). clue.answer.animalId is `animal`, and
 *     clue.answerIds lists every animal in play that fits: any of them is still right (AS-0122).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var NEAR = 8;                              // metres: a task may show for an animal this close
  var HIDE_SLACK = 2;                        // extra metres before it hides, so it does not flicker at the edge
  var VIEW_HALF_ANGLE = 75 * Math.PI / 180;  // a clue starts only when the animal is within this angle of where the player faces
  var CLOSE = 2.5;                           // inside this distance an animal counts as in view whatever the heading
  var TYPES = ['partAdjective', 'trait'];    // like SA.round: clues whose answer is an animal

  function pos(a) {
    var p = a && a.position ? a.position : a;
    return p && typeof p.x === 'number' && typeof p.z === 'number' ? p : null;
  }

  function distance(player, a) {
    var p = pos(a);
    return p ? Math.hypot(p.x - player.x, p.z - player.z) : Infinity;
  }

  function inView(player, a, dist) {
    if (dist <= CLOSE) return true;
    var p = pos(a), h = typeof player.heading === 'number' ? player.heading : 0;
    var dx = (p.x - player.x) / dist, dz = (p.z - player.z) / dist;
    var dot = Math.sin(h) * dx + Math.cos(h) * dz;
    return Math.acos(Math.max(-1, Math.min(1, dot))) <= VIEW_HALF_ANGLE;
  }

  function fitsAnimal(task, animal) {
    try { return typeof task.fits === 'function' && !!task.fits(animal); } catch (e) { return false; }
  }

  // The anchor of `task` among `animals` within `limit` (and, for a new clue, in view): the nearest, or null.
  function anchorOf(task, animals, player, limit, needView) {
    var best = null;
    animals.forEach(function (a) {
      if (!a || typeof a.id !== 'string') return;
      var isEncounter = typeof task.animalId === 'string';
      if (isEncounter ? a.id !== task.animalId : !fitsAnimal(task, a)) return;
      var d = distance(player, a);
      if (d > limit) return;
      if (needView && !isEncounter && !inView(player, a, d)) return;
      if (!best || d < best.dist) best = { kind: isEncounter ? 'encounter' : 'clue', taskId: task.id, animalId: a.id, dist: d };
    });
    return best;
  }

  function create(opts) {
    opts = opts || {};
    var current = null;     // { kind, taskId, animalId } last returned

    function allows() {
      try {
        var f = opts.focus || SA.focus;
        return !f || !f.allowsSmall || f.allowsSmall();
      } catch (e) { return true; }
    }

    function update(input) {
      input = input || {};
      var player = input.player, animals = input.animals || [], tasks = input.tasks || [];
      if (!allows() || !player || typeof player.x !== 'number' || typeof player.z !== 'number') { current = null; return null; }
      var byId = {};
      tasks.forEach(function (t) { if (t && t.id !== undefined) byId[t.id] = t; });

      if (current && byId[current.taskId]) {        // keep what is shown until it is past NEAR + slack
        var kept = anchorOf(byId[current.taskId], animals, player, NEAR + HIDE_SLACK, false);
        if (kept) { current = kept; return kept; }
      }
      current = null;
      var best = null;
      tasks.forEach(function (t) {
        var c = t && anchorOf(t, animals, player, NEAR, true);
        if (c && (!best || c.dist < best.dist)) best = c;
      });
      current = best;
      return best;
    }

    return { update: update, reset: function () { current = null; }, shown: function () { return current; } };
  }

  // Animals the clue could name (SA.clues.pickClue's resolve step).
  function resolve(list) {
    return (list || []).map(function (a) { return typeof a === 'string' ? SA.data.get('animals', a) : a; })
      .filter(function (a) { return a && a.parts; });
  }

  function pickClueFor(animal, state, rng) {
    state = state || {};
    if (typeof animal === 'string') animal = SA.data.get('animals', animal);
    var inPlay = resolve(state.animals);
    if (!animal || !animal.parts) return null;
    if (!inPlay.some(function (a) { return a.id === animal.id; })) inPlay.push(animal);
    var recent = state.recent || [];
    var ok = function (c) { return recent.indexOf(c.key) < 0 && SA.clues.matches(c, animal); };
    var pool = [];
    if (state.level >= 2 && SA.clues.leveled) pool = SA.clues.leveled(inPlay, Math.min(3, state.level)).filter(ok);
    if (!pool.length) pool = SA.clues.candidates(inPlay, state.types || TYPES).filter(ok);   // beginner clues are the fallback
    if (!pool.length) return null;
    var r = typeof rng === 'function' ? rng() : 0;
    var clue = Object.assign({}, pool[Math.min(pool.length - 1, Math.floor(r * pool.length))]);
    clue.answer = Object.assign({}, clue.answer, { animalId: animal.id });
    clue.answerIds = inPlay.filter(function (a) { return SA.clues.matches(clue, a); }).map(function (a) { return a.id; });
    if (clue.answerIds.indexOf(animal.id) < 0) clue.answerIds.unshift(animal.id);
    return clue;
  }

  SA.nearbyTask = { NEAR: NEAR, HIDE_SLACK: HIDE_SLACK, VIEW_HALF_ANGLE: VIEW_HALF_ANGLE, CLOSE: CLOSE,
    create: create, pickClueFor: pickClueFor };
})(typeof window !== 'undefined' ? window : globalThis);
