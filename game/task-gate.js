/* SA.taskGate: small tasks appear only near their animal (AS-0225, slice 2 of AS-0217). Pure wiring (no THREE, no DOM; unit-tested in
 * node:vm with stubs) between SA.nearbyTask (which task, which animal), the encounter flow (SA.encounterFlow) and the prompt pill.
 * Free roam (AS-0246, slice 3 of AS-0179): the gate NEVER starts a clue round by itself. With no story mission running the world is free
 * roam plus encounters; story missions start only from the station board / the scientist (SA.missions.start in the board view).
 *
 *   var gate = SA.taskGate.create({ flow, view?, player, animals, encounters?, track?, nearby? })
 *     flow     { begin() }                                       begin() with no animal only clears the card (SA.missionFlow, o.gated)
 *     view     { setPill(on) }                                   shows/hides the top-left pill without touching its content
 *     player() -> { x, z, heading }      animals() -> [{ id, x, z }] the animals a task may anchor to (visible ones, current places)
 *     encounters  SA.encounterFlow: update, tasks, active, start, announce, release, dismiss -> { kind: 'encounter', id, animalId } tasks
 *     track(type, fields)                default window.SAT.track
 *   gate.update()   once per frame (game/main.js, after SA.focus.update()). Rules:
 *     - The nearest encounter whose animal is near shows its pill; on show the help flow starts (start also speaks the call and hint);
 *       walking away mid-help releases it quietly (the need waits); coming back says the call and hint again.
 *     - While a story mission runs nothing shows (SA.focus, via nearbyTask).
 *   Telemetry, once per transition (never per frame): task.shown / task.hidden { kind, animalId, dist }.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function create(o) {
    var nearby = o.nearby || SA.nearbyTask.create();
    var shown = null;          // { kind, animalId, dist } the pill is showing

    function track(type, f) {
      try {
        if (o.track) o.track(type, f);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, f);
      } catch (e) { /* telemetry never breaks play */ }
    }
    function round1(n) { return Math.round(n * 10) / 10; }
    function distTo(list, player, id) {
      var a = list.filter(function (x) { return x && x.id === id; })[0];
      return a ? Math.hypot(a.x - player.x, a.z - player.z) : Infinity;
    }
    function clearCard() { try { if (o.flow && o.flow.begin) o.flow.begin(); } catch (e) { /* the card never breaks play */ } }

    // Encounters only: no clue task exists any more (AS-0246).
    function tasksFor() { return o.encounters ? o.encounters.tasks() : []; }

    function setPill(on) { try { if (o.view && o.view.setPill) o.view.setPill(on); } catch (e) { /* the pill never breaks play */ } }

    function update() {
      var player = o.player(), list = o.animals() || [];
      if (!player) return null;
      var enc = o.encounters || null;
      if (enc) { try { enc.update(list); } catch (e) { /* encounters never break play */ } }
      var input = function () { return { player: player, animals: list, tasks: tasksFor() }; };
      var r = nearby.update(input());
      var started = false;
      if (enc && r && r.kind === 'encounter' && !enc.active()) {
        clearCard();               // anything left on the card is put away quietly (gated: just clears it)
        if (enc.start(r.animalId)) started = true;
        else { enc.dismiss(r.animalId); nearby.reset(); }       // no care task can be shown for it: drop the need
        r = nearby.update(input());
      } else if (enc && !r && enc.active() && enc.release()) {   // walked away mid-help: the need stays, the card clears
        clearCard();
      }

      var next = r ? { kind: r.kind, animalId: r.animalId, dist: round1(r.dist) } : null;
      var changed = (shown ? 1 : 0) !== (next ? 1 : 0) || (shown && next && (shown.kind !== next.kind || shown.animalId !== next.animalId));
      if (changed) {
        if (shown) {
          var d = distTo(list, player, shown.animalId);
          track('task.hidden', { kind: shown.kind, animalId: shown.animalId, dist: isFinite(d) ? round1(d) : shown.dist });
        }
        if (next) track('task.shown', next);
        setPill(!!next);
        if (next && !started) {      // back near it: say the encounter's call and hint again
          try { if (next.kind === 'encounter' && enc) enc.announce(next.animalId); } catch (e) { /* silent */ }
        }
      }
      shown = next;
      return shown;
    }

    return { update: update, shown: function () { return shown; } };
  }

  SA.taskGate = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
