/* SA.taskGate: small tasks appear only near their animal (AS-0225, slice 2 of AS-0217). Pure wiring (no THREE, no DOM; unit-tested in
 * node:vm with stubs) between SA.nearbyTask (which task, which animal), the clue-round flow (SA.missionFlow, gated) and the prompt pill.
 *
 *   var gate = SA.taskGate.create({ flow, game, view?, player, animals, track?, nearby? })
 *     flow     { begin(animalId) -> round | null, replay() }   starts a clue round fitted to that animal (SA.missionFlow, o.gated)
 *     game     { current() }                                     the round state (SA.mission): answerIds, step, animalId, done
 *     view     { setPill(on) }                                   shows/hides the top-left pill without touching its content
 *     player() -> { x, z, heading }      animals() -> [{ id, x, z }] the animals a task may anchor to (visible ones, current places)
 *     track(type, fields)                default window.SAT.track
 *   gate.update()   once per frame (game/main.js, after SA.focus.update()). Rules:
 *     - No round yet: a clue starts only when SA.nearbyTask says an animal is near and in view; the clue is chosen to fit that animal.
 *       The animal you just finished stays quiet until you have walked away from it.
 *     - A round on screen shows its pill only while nearbyTask returns it. Walking away hides the pill quietly: no miss, no failure,
 *       the round is kept, and coming back shows the pill again and says the clue again.
 *     - A finished round (celebration under way) is left alone. While a story mission runs nothing shows (SA.focus, via nearbyTask).
 *   Telemetry, once per transition (never per frame): task.shown / task.hidden { kind, animalId, dist }.
 *   Encounters (AS-0179, AS-0245) join the same way: option `encounters` (SA.encounterFlow: update, tasks, active, start, announce, release,
 *   dismiss) adds { kind: 'encounter', id, animalId } tasks. The nearest wins; on show the clue on screen is put away and the help flow starts
 *   (start also speaks the call and hint); walking away mid-help releases it; a clue in its help/photo step is never interrupted.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function create(o) {
    var nearby = o.nearby || SA.nearbyTask.create();
    var shown = null;          // { kind, animalId, dist } the pill is showing
    var skip = null;           // animal whose round just finished: no new clue for it until the player has walked away
    var failed = {};           // animals no clue could be made for: not retried until the player has walked away

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
    function far(list, player, id) { return distTo(list, player, id) > SA.nearbyTask.NEAR + SA.nearbyTask.HIDE_SLACK; }

    function tasksFor(cur) {
      var enc = o.encounters;
      if (enc && enc.active()) return enc.tasks();         // helping a needy animal: nothing else competes for the pill
      var out = [];
      if (cur) {          // the round on screen: any animal that fits it is its anchor
        out = [{ kind: 'clue', id: cur.id, fits: function (a) {
          return cur.step === 'find' ? cur.answerIds.indexOf(a.id) >= 0 : a.id === cur.animalId;
        } }];
      } else {
        out = [{ kind: 'clue', id: 'new', fits: function (a) { return a.id !== skip && !failed[a.id]; } }];
      }
      // Encounters (AS-0245) join the same rule; a clue already in its help/photo step is not interrupted.
      if (enc && !(cur && cur.step !== 'find')) out = enc.tasks().concat(out);
      return out;
    }

    function setPill(on) { try { if (o.view && o.view.setPill) o.view.setPill(on); } catch (e) { /* the pill never breaks play */ } }

    function update() {
      var player = o.player(), list = o.animals() || [];
      if (!player) return null;
      var cur = o.game.current();
      if (cur && cur.done) { skip = cur.animalId; return shown; }       // celebrating: the flow starts what comes next
      if (skip && far(list, player, skip)) skip = null;
      Object.keys(failed).forEach(function (id) { if (far(list, player, id)) delete failed[id]; });

      var input = function (c) { return { player: player, animals: list, tasks: tasksFor(c) }; };
      var enc = o.encounters || null;
      if (enc) { try { enc.update(list); } catch (e) { /* encounters never break play */ } }
      var r = nearby.update(input(cur));
      var started = false;
      if (enc && r && r.kind === 'encounter' && !enc.active()) {
        o.flow.begin();            // a clue round on screen is put away quietly (gated: just clears the card)
        cur = null;
        if (enc.start(r.animalId)) started = true;
        else { enc.dismiss(r.animalId); nearby.reset(); }       // no care task can be shown for it: drop the need
        r = nearby.update(input(null));
      } else if (enc && !r && enc.active() && enc.release()) {   // walked away mid-help: the need stays, the card clears
        o.flow.begin();
      }
      if (!cur && r && r.kind === 'clue') {
        cur = o.flow.begin(r.animalId);
        if (!cur) { failed[r.animalId] = true; nearby.reset(); r = null; }
        else { started = true; r = nearby.update(input(cur)); }
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
        if (next && !started) {      // back near it: say the clue (or the encounter's call and hint) again
          try { if (next.kind === 'encounter' && enc) enc.announce(next.animalId); else o.flow.replay(); } catch (e) { /* silent */ }
        }
      }
      shown = next;
      return shown;
    }

    return { update: update, shown: function () { return shown; } };
  }

  SA.taskGate = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
