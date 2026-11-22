/* SA.missionBaby: the lost baby of a story mission (AS-0234, slice 3 of AS-0173). Pure (no THREE, no DOM; node:vm tested).
 * Using the crying baby ('find' step, `at: 'baby'`) completes the step (SA.missionRuntime 'found'): it hops happily, squeaks, its
 * tear goes away and it follows the player through SA.follow (stepAll) while the 'follow' step is current. Near mamá it gets
 * excited: it bounces and squeaks, more and faster the closer it is, so the walk is a warmer / colder hint. Nothing here names an
 * animal id: the baby and mamá are the mission's spawned animals (SA.missionSpawn), the rules come from the step rows.
 *
 *   SA.missionBaby.EXCITE_DIST (12)        distance to mamá inside which the baby gets excited
 *   SA.missionBaby.excitement(dist)        0 at EXCITE_DIST or farther, rising to 1 right beside mamá
 *   SA.missionBaby.isExcited(baby, mama)   true when the two are closer than EXCITE_DIST (positions { x, z })
 *   SA.missionBaby.create({ missions?, runtime?, spawn?, follow?, track? })   an instance (the default one is SA.missionBaby.*):
 *     useTarget()      -> { id: 'baby', kind: 'npc', x, z, reach } while it waits to be found (the E / Enter chooser takes it), else null
 *     canTap(player)   a tap on it is in reach
 *     use()            using it: reports 'found'; true when the step moved on (the follow starts in update)
 *     update(dt, player, solids) -> view | null, once per frame. solids is the walk list or a function returning it (the same
 *                      form SA.missionSpawn.sync takes). view = { following, x, z, heading, lift, moving, excited (0..1),
 *                      hop (true once: the happy hop), squeak (true when it should squeak now) }; null with no mission spawn
 *     view()           the last view
 * view.reunion is true on the one frame the baby reaches mamá (SA.missionReunion.check, AS-0235; opts.reunion overrides it).
 * Following runs only while the 'follow' step is current; a reload on that step resumes it quietly (no hop, no tracking).
 * Telemetry: mission.babyFound { id }, mission.babyExcited { id } (first time per run it gets excited).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var EXCITE_DIST = 12, USE_REACH = 2.8, TAP_REACH = 3.5, SQUEAK_FAR = 2.4, SQUEAK_NEAR = 0.9;

  function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  /** 0 when mamá is EXCITE_DIST or farther, rising linearly to 1 beside her. */
  function excitement(d) {
    if (typeof d !== 'number' || !isFinite(d) || d >= EXCITE_DIST) return 0;
    return Math.max(0, Math.min(1, 1 - d / EXCITE_DIST));
  }
  function isExcited(baby, mama) { return !!baby && !!mama && dist(baby, mama) < EXCITE_DIST; }

  function create(opts) {
    opts = opts || {};
    var f = null, key = null, sawWaiting = false, excitedOnce = false, pendingHop = false, squeakIn = 0, last = null;
    function missions() { return opts.missions || SA.missions; }
    function spawn() { return opts.spawn || SA.missionSpawn; }
    function runtime() { return opts.runtime || SA.missionRuntime; }
    function follower() { return opts.follow || SA.follow; }
    function reunionMod() { return opts.reunion === undefined ? SA.missionReunion : opts.reunion; }
    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }
    function stepData() {
      var a;
      try { a = missions().active(); } catch (e) { return null; }
      return a && a.stepData ? a.stepData : null;
    }
    function reset() { f = null; key = null; sawWaiting = false; excitedOnce = false; pendingHop = false; squeakIn = 0; last = null; }

    function waitingSpawn() {
      var cur = spawn().current(), s = stepData();
      return cur && spawn().waiting(s) ? cur : null;
    }

    function useTarget() {
      var cur = waitingSpawn();
      return cur ? { id: 'baby', kind: 'npc', x: cur.baby.x, z: cur.baby.z, reach: USE_REACH } : null;
    }

    function canTap(player) {
      var cur = waitingSpawn();
      return !!cur && !!player && dist(player, cur.baby) <= TAP_REACH;
    }

    function use() {
      var cur = waitingSpawn();
      if (!cur) return false;
      sawWaiting = true;
      var r = runtime().report({ type: 'found', target: cur.baby.id });
      return r.status === 'step' || r.status === 'complete';
    }

    function begin(cur, announce) {
      f = follower().create({ x: cur.baby.x, z: cur.baby.z, heading: cur.baby.rotY });
      key = cur.key;
      if (announce) {
        pendingHop = true;
        squeakIn = 0;
        track('mission.babyFound', { id: cur.id });
      }
    }

    function update(dt, player, solids) {
      var cur = spawn().current(), s = stepData();
      if (!cur) { reset(); return null; }
      if (key && key !== cur.key) reset();
      if (spawn().waiting(s)) { sawWaiting = true; return (last = { following: false, x: cur.baby.x, z: cur.baby.z, heading: cur.baby.rotY,
        lift: 0, moving: false, excited: 0, hop: false, squeak: false }); }
      var follow = !!s && s.kind === 'follow' && s.animal === cur.baby.id;
      if (!f && follow) begin(cur, sawWaiting);
      if (!f) return (last = null);
      if (follow && player) {
        if (typeof solids === 'function') solids = solids();
        follower().stepAll([f], player, Array.isArray(solids) ? solids : [], dt);
      }
      // Reached mamá (AS-0235): SA.missionReunion reports 'followed', logs the rescue and speaks; the view says `reunion` once
      // so the renderer bursts hearts and nuzzles. The step moves on, so the baby stops following and stays beside her.
      var reunion = false;
      if (follow && reunionMod()) { try { reunion = reunionMod().check(f, cur.mama); } catch (e) { reunion = false; } }
      var near = excitement(dist(f, cur.mama));
      var squeak = false;
      if (pendingHop) squeak = true;
      squeakIn -= dt || 0;
      if (near > 0) {
        if (!excitedOnce) { excitedOnce = true; track('mission.babyExcited', { id: cur.id }); }
        if (squeakIn <= 0) { squeak = true; squeakIn = SQUEAK_NEAR + (SQUEAK_FAR - SQUEAK_NEAR) * (1 - near); }
      } else if (squeakIn < 0) squeakIn = 0;
      if (pendingHop) squeakIn = SQUEAK_FAR;
      last = { following: true, x: f.x, z: f.z, heading: f.heading, lift: f.lift || 0, moving: !!f.moving, excited: near,
        hop: pendingHop, squeak: squeak, pop: f.pop || null, reunion: reunion };
      pendingHop = false;
      return last;
    }

    return { useTarget: useTarget, canTap: canTap, use: use, update: update, view: function () { return last; }, create: create };
  }

  var api = create();
  api.EXCITE_DIST = EXCITE_DIST;
  api.excitement = excitement;
  api.isExcited = isExcited;
  SA.missionBaby = api;
})(typeof window !== 'undefined' ? window : globalThis);
