/* SA.missionRuntime: connects live game events to the active story mission (AS-0230, slice 2 of AS-0178). Pure wiring (no THREE,
 * no DOM; unit-tested in node:vm with stubbed events). The step rules are SA.missionRun (data-driven kinds); the saved progress and
 * the one-time reward are SA.missions (advance / complete); the pill that shows and speaks each step is SA.missionPill, which reads
 * SA.missions.active() every frame, so a step change here is all it needs. While a mission runs SA.focus pauses the small tasks.
 *
 *   SA.missionRuntime.report(event)   the one entry point: { type, ...fields } as the step kinds expect (game/data/step-kinds.js):
 *                                     'found' {target}, 'helped' {animal, careTask}, 'followed' {animal}, 'collected' {item},
 *                                     'arrived' {place}, 'talked' {who}, 'photo' {target?}, 'carried', 'delivered'.
 *                                     -> { status: 'none' | 'ignored' | 'progress' | 'step' | 'complete', ... }. Returns 'none' with
 *                                     no mission running; a replay advances exactly like the first play.
 *   SA.missionRuntime.onPick(pick)    a SA.picking pick { animalId, item? }: a plain pick is 'found'; a la cámara shot is 'found'
 *                                     and, only when that did not advance the step, 'photo' {target: animalId} (one shot never
 *                                     skips two steps).
 *   SA.missionRuntime.update(player)  polled each frame with { x, z }: a 'goTo' step finishes when the player is inside the place
 *                                     radius, a 'find' step when the player is near the target (places/targets from locate()).
 *   SA.missionRuntime.target()        -> { x, z, role, id } | null   the current step's world target (AS-0233): the piglet's spot for
 *                                     find, mamá's for follow (SA.missionSpawn); the compass (AS-0228) reads this
 *   SA.missionRuntime.create({ missions?, run?, spawn?, locate?, grant?, celebrate?, track? })   a separate instance (tests).
 *       locate(id) -> { x, z, r? } | null   where a place / find target is (default: none; mission content registers them)
 *       grant(reward)       the reward of the FIRST completion (stars; default adds to save.stars); never called on a replay
 *       celebrate(result)   the finish cheer (default: the fanfare, then the instance's `celebrateHook(result)`, which main.js sets to
 *                           the toast + confetti); the instance's `onStars(total)` refreshes the star badge after a reward
 * The run state (a collect count) lives in memory, keyed by mission id + seed; the step index lives in the save, so a reload
 * resumes on the saved step with the count restarted.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var REACH = 2.5;            // default radius of a place / find target when locate() gives none

  function create(opts) {
    opts = opts || {};
    var run = null, key = null, done = {};          // done[key]: this run already completed (a repeated event never re-completes)
    function missions() { return opts.missions || SA.missions; }
    function engine() { return opts.run || SA.missionRun; }
    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }

    // The run state follows the saved active mission; a new mission (or replay seed) or a saved step change rebuilds it.
    function sync() {
      var a = missions().active();
      if (!a) { run = null; key = null; return null; }
      var k = a.id + ':' + a.seed;
      if (k !== key || !run || run.index !== a.step) {
        run = engine().start(a.mission.steps, a.step);
        key = k;
      }
      return a;
    }

    function grant(reward) {
      if (!reward) return;
      if (opts.grant) { opts.grant(reward); return; }
      var stars = (SA.save.get().stars || 0) + (reward.stars || 0);
      SA.save.update({ stars: stars });
      if (api.onStars) api.onStars(stars);
    }

    function cheer(res) {
      if (opts.celebrate) { opts.celebrate(res); return; }
      try { if (SA.audio && SA.audio.sfx) SA.audio.sfx('fanfare'); } catch (e) { /* sound is best effort */ }
      if (api.celebrateHook) api.celebrateHook(res);
    }

    function report(event) {
      var a;
      try { a = sync(); } catch (e) { return { status: 'none' }; }
      if (!a || !run) return { status: 'none' };
      var r = engine().step(run, event);
      if (!r.advanced && !r.progressed) return { status: 'ignored' };
      run = r.state;
      if (r.progressed) {
        track('mission.progress', { id: a.id, step: a.step, have: run.progress });
        return { status: 'progress', have: run.progress };
      }
      if (r.done) {
        if (done[key]) return { status: 'ignored' };
        done[key] = true;
        var res = missions().complete();       // marks it done and clears active: the reward is non-null on the first time only
        run = null;
        if (res.status !== 'complete') return { status: 'ignored' };
        grant(res.reward);
        cheer(res);
        return { status: 'complete', id: res.id, firstTime: res.firstTime, reward: res.reward };
      }
      var adv = missions().advance();           // saves the new step and tracks mission.step { id, step }
      return { status: 'step', step: adv.step };
    }

    function onPick(pick) {
      if (!pick || typeof pick.animalId !== 'string') return { status: 'none' };
      var r = report({ type: 'found', target: pick.animalId });
      if (r.status === 'ignored' && SA.photo && SA.photo.isShot(pick)) return report({ type: 'photo', target: pick.animalId });
      return r;
    }

    // 'carry' is met while the item is held (a fragile one is flagged so a jump wobbles it, never fails the step); 'deliver' when
    // the held item is brought within range of its target and dropped there (SA.carry, AS-0231).
    function carrying(s, player, locate) {
      var c = opts.carry || SA.carry;
      if (!c) return { status: 'none' };
      if (s.kind === 'carry') {
        if (!c.holds(s.item)) return { status: 'none' };
        if (s.fragile) c.mark(s.item, true);
        return report({ type: 'carried', item: s.item });
      }
      var got = c.deliver(player, s, locate);
      return got ? report({ type: 'delivered', item: got.item, to: got.to }) : { status: 'none' };
    }

    function spawner() { return opts.spawn || SA.missionSpawn || null; }

    // Where the current step points in the world (AS-0233): { x, z, role, id } or null. The compass (AS-0228) points at it.
    // `at: 'baby'` is the spawned baby (find), `at: 'mama'` is mamá (follow); a step with no `at` has no target here.
    function target() {
      var sp = spawner(), a;
      try { a = missions().active(); } catch (e) { return null; }
      return sp && a && a.stepData ? sp.target(a.stepData) : null;
    }

    function update(player) {
      var sp = spawner();
      var locate = opts.locate || api.locate || (sp && sp.locate ? function (id) { return sp.locate(id); } : null);
      if (!player || !locate) return { status: 'none' };
      var a;
      try { a = missions().active(); } catch (e) { return { status: 'none' }; }
      var s = a && a.stepData;
      if (s && (s.kind === 'carry' || s.kind === 'deliver')) return carrying(s, player, locate);
      if (!s || (s.kind !== 'goTo' && s.kind !== 'find')) return { status: 'none' };
      var id = s.kind === 'goTo' ? s.place : s.target;
      var at = locate(id);
      if (!at || Math.hypot(player.x - at.x, player.z - at.z) > (at.r || REACH)) return { status: 'none' };
      return report(s.kind === 'goTo' ? { type: 'arrived', place: id } : { type: 'found', target: id });
    }

    var api = { report: report, onPick: onPick, update: update, target: target, create: create, celebrateHook: null, onStars: null, locate: null };
    return api;
  }

  SA.missionRuntime = create();
})(typeof window !== 'undefined' ? window : globalThis);
