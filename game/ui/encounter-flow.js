/* SA.encounterFlow: the glue that puts roaming encounters (SA.encounters, AS-0179) into the live game. Pure wiring with injectable
 * collaborators (no THREE, no DOM), so it is unit-tested in node:vm with stubs. Loaded after game/ui/care-flow.js.
 *
 *   var ef = SA.encounterFlow.create({ encounters, care, audio?, log?, track?, later?, onEarned? })
 *     encounters  SA.encounters.create(...) (the scheduler)       care  SA.careFlow instance (offer / active / cancel / replay)
 *     log         SA.rescueLog (record)                           onEarned(badgeRows)  a badge was earned by the help just logged
 *   ef.update(animals)      each frame: animals = [{ id, x, z }] in play; lets the scheduler add/drop needs
 *   ef.tasks()              [{ kind: 'encounter', id, animalId, need }] for SA.taskGate / SA.nearbyTask (none while one is being helped
 *                           except that one: see active())
 *   ef.needs()              [{ animalId, icon }] for the floating icons (game/render/need-icons.js)
 *   ef.start(animalId)      the animal is near: starts its help flow (the existing care task, 1-2 steps, forced, silent) and announces it;
 *                           false when no care task can be shown (the need is then dropped quietly by the gate via dismiss)
 *   ef.announce(animalId)   the species call + the spoken hint ("el pato tiene hambre") at most once per 20 s (SA.encounters.shouldCall),
 *                           then the care prompt is spoken; inside the 20 s only the prompt is spoken
 *   ef.active()             animal id being helped, or null
 *   ef.onCareDone(task)     the care flow finished a task: when it was the encounter's, logs save.rescues { kind: 'encounter', animalId,
 *                           need, biome, night }, resolves the need (so a new one appears later) and returns true; else false
 *   ef.release()            the player walked away mid-help: the care task is put away quietly, the need stays; true when it did
 *   ef.cancel()             a story mission started (SA.focus): the same (a task already celebrating still finishes and logs)
 *   ef.dismiss(animalId)    drop a need that cannot be helped, without logging
 * While SA.focus says a story mission runs, the scheduler adds nothing and shouldCall is false: no icon call, no prompt.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var CALL_SFX_MS = 700;        // the species sound plays this long before the spoken hint
  var SAFETY_MS = 4000;         // a spoken step that never reports back does not stall the chain

  function create(o) {
    var enc = o.encounters, care = o.care, audio = o.audio || SA.audio;
    var later = o.later || null;
    var active = null;          // { animalId, need }

    function track(type, f) {
      try {
        if (o.track) o.track(type, f);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, f);
      } catch (e) { /* telemetry never breaks play */ }
    }
    function animalOf(id) { try { return SA.data.get('animals', id); } catch (e) { return null; } }

    // The species sound: the animal's own voice word when it has one, else a short procedural call shaped by size / movement.
    function callStep(animal) {
      if (animal && animal.voice) return function (next) { say(animal.voice, next); };
      var t = (animal && animal.traits) || {};
      var name = t.movement === 'vuela' ? 'chirp' : t.size === 'pequeño' ? 'squeak' : 'whimper';
      var rate = t.size === 'grande' ? 0.7 : t.size === 'pequeño' ? 1.2 : 1;
      return function (next) {
        try { if (audio && audio.sfx) audio.sfx(name, 0.8, rate); } catch (e) { /* silent */ }
        if (later) later(next, CALL_SFX_MS); else next();
      };
    }

    function say(key, done) {
      var fired = false, fin = function () { if (fired) return; fired = true; if (done) done(); };
      try {
        if (audio && audio.say) { audio.say(key, fin); if (later) later(fin, SAFETY_MS); return; }
      } catch (e) { /* silent */ }
      fin();
    }

    function chain(steps, alive) {
      var i = 0;
      (function go() {
        if (i >= steps.length || !alive()) return;
        steps[i++](go);
      })();
    }

    function announce(animalId) {
      if (!active || active.animalId !== animalId) return false;
      var mine = active;
      var steps = [];
      if (enc.shouldCall(animalId)) {
        steps.push(callStep(animalOf(animalId)));
        var h = enc.hint(animalId);
        if (h) h.keys.forEach(function (k) { steps.push(function (next) { say(k, next); }); });
        track('encounter.called', { animalId: animalId, need: active.need.id });
      }
      steps.push(function () { try { if (care.active()) care.replay(); } catch (e) { /* silent */ } });
      chain(steps, function () { return active === mine; });
      return true;
    }

    function start(animalId) {
      if (active) return false;
      var need = enc.need(animalId), def = need && SA.data.get('careTasks', need.care);
      if (!def || !care.offer(animalId, true, def.kind, true)) return false;
      active = { animalId: animalId, need: need };
      track('encounter.started', { animalId: animalId, need: need.id });
      announce(animalId);
      return true;
    }

    function onCareDone(task) {
      if (!active || !task || task.animalId !== active.animalId) return false;
      var mine = active, animal = animalOf(mine.animalId);
      active = null;
      var res = null;
      try {
        res = (o.log || SA.rescueLog).record({ kind: 'encounter', animalId: mine.animalId, need: mine.need.word || mine.need.id,
          biome: animal && animal.biome, night: false });
      } catch (e) { /* the log never breaks play */ }
      enc.resolve(mine.animalId);
      track('encounter.helped', { animalId: mine.animalId, need: mine.need.id });
      if (res && res.earned && res.earned.length && o.onEarned) { try { o.onEarned(res.earned); } catch (e) { /* silent */ } }
      return true;
    }

    // Walked away (or a mission began) mid-help: put the care task away quietly. A task already celebrating still finishes and logs.
    function release() {
      if (!active || !care.active()) return false;
      try { care.cancel(); } catch (e) { /* silent */ }
      active = null;
      return true;
    }
    function cancel() { return release(); }

    function dismiss(animalId) { enc.resolve(animalId); }

    function tasks() {
      var list = enc.tasks();
      return active ? list.filter(function (t) { return t.animalId === active.animalId; }) : list;
    }

    function update(animals) {
      enc.sync({ animals: (animals || []).map(function (a) { return a.id; }) });
    }

    function needs() {
      try { if (SA.focus && !SA.focus.allowsSmall()) return []; } catch (e) { /* free play */ }      // paused during a story mission
      return enc.tasks().map(function (t) { return { animalId: t.animalId, icon: t.need.icon }; });
    }

    return { update: update, tasks: tasks, needs: needs, start: start, announce: announce, active: function () { return active ? active.animalId : null; },
      onCareDone: onCareDone, release: release, cancel: cancel, dismiss: dismiss };
  }

  SA.encounterFlow = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
