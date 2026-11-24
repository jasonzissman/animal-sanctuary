/* SA.missionFriends: the animal friends of a party mission (AS-0327, slice 2 of AS-0183: the monkey's birthday). Pure (no THREE, no DOM;
 * unit-tested in node:vm). A mission row declares `friends: { animals, tree, monkey?, biome?, friendBiome?, say? }` (game/data/missions.js):
 * the friends stand in `friendBiome` (default 'bosque'), the monkey's tree in `biome` (default 'selva'), ONLY while that mission runs.
 * An 'invite' step { kind: 'invite', animal } is met when the player walks up to that friend (INVITE_REACH). From then on the friend
 * follows the player (SA.follow.stepGroup: every invited friend trails the player at once, waits at the water and follows again when
 * the player returns), for the rest of the mission. The 'goTo' step to the tree only counts when every friend is there too. Nothing here
 * knows a mission or an animal id; "invited" is derived from the saved step index, so a reload resumes with the friends at your side.
 *
 *   SA.missionFriends.place(spec, seed, opts?) -> { friends: [{ id, x, z, y, rotY }], tree: { id, x, z, y, monkey } } | null   PURE and
 *                                                  deterministic from the seed; opts.solids [[x, z, r], ...] are kept clear
 *   SA.missionFriends.sync(opts?)      the current { key, spec, friends, tree } | null; places on a new mission/seed, clears when none runs
 *   SA.missionFriends.update(player)   polled each frame (SA.missionRuntime calls it): walking up to the friend of the current 'invite'
 *                                      step reports { type: 'invited', animal }; the friend's word is spoken (one `say` key per invite)
 *   SA.missionFriends.step(dt, player, solids?) -> [{ id, x, z, heading, lift, moving, following, pop, dancing }] | null   moves the invited
 *                                      friends (the renderer draws these); the others stand where they were placed. While a 'party' or 'photo' step is
 *                                      current (AS-0328, SA.missionParty) they stop following, gather round the tree facing it and `dancing` is true
 *   SA.missionFriends.locate(id)       -> { x, z, r } | null   the tree, but only while every friend is invited and near it
 *   SA.missionFriends.target(step, from?) -> { x, z, role, id } | null   compass: the friend of an 'invite' step, then the tree
 *   SA.missionFriends.invited(id)      true once that friend follows;  current() the state;  onChange(fn) -> unsubscribe
 *   SA.missionFriends.create({ missions?, audio?, report?, follow?, track?, later?, solids? })   a separate instance (tests)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var PARTY_RING = 2.7, PARTY_ANGLE = 2.2, PARTY_STEP = 2.0;   // where the friends dance round the tree (AS-0328)
  var INVITE_REACH = 2.8, TREE_REACH = 3, GATHER = 6.5, APART = 8, EDGE = 4, TRIES = 800, MIN_FROM_START = 8, MAX_FROM_START = 55, SAY_DELAY_MS = 1700;

  function startPoint() {
    try { if (SA.station && SA.station.spawn) return SA.station.spawn(); } catch (e) { /* fall through */ }
    return { x: 0, z: 0 };
  }

  function dryOk(x, z, biome, solids) {
    var M = SA.map, B = M.BOUNDS;
    if (x < B.minX + EDGE || x > B.maxX - EDGE || z < B.minZ + EDGE || z > B.maxZ - EDGE || M.biomeAt(x) !== biome) return false;
    var h = M.groundHeight(x, z);
    if (M.isWater(x, z) || M.nearWater(x, z, 1.5) || h < M.WATER_LEVEL + 0.45) return false;
    if (Math.abs(M.groundHeight(x + 1, z) - h) > 0.6 || Math.abs(M.groundHeight(x, z + 1) - h) > 0.6) return false;
    if (SA.station && SA.station.inFootprint(x, z, 2.5)) return false;
    if (SA.player && SA.player.inSpawnZone && SA.player.inSpawnZone(x, z)) return false;
    for (var i = 0; i < solids.length; i++) if (Math.hypot(solids[i][0] - x, solids[i][1] - z) < solids[i][2] + 1.2) return false;
    return true;
  }

  function place(spec, seed, opts) {
    var M = SA.map, tr = spec && M && M.biomeRange ? M.biomeRange(spec.biome || 'selva') : null, fr = spec && M ? M.biomeRange(spec.friendBiome || 'bosque') : null;
    if (!tr || !fr) return null;
    var solids = (opts && opts.solids) || [], S = startPoint(), rand = M.rng(((typeof seed === 'number' ? seed : 1) >>> 0) + 9377);
    var placed = [];
    function pick(range, biome) {
      for (var t = 0; t < TRIES; t++) {
        var x = range.lo + EDGE + rand() * (range.hi - range.lo - 2 * EDGE), z = M.BOUNDS.minZ + EDGE + rand() * (M.BOUNDS.maxZ - M.BOUNDS.minZ - 2 * EDGE);
        var d = Math.hypot(x - S.x, z - S.z);
        if (d < MIN_FROM_START || (t < TRIES / 2 && d > MAX_FROM_START) || !dryOk(x, z, biome, solids)) continue;
        if (placed.some(function (o) { return Math.hypot(o.x - x, o.z - z) < APART; })) continue;
        var p = { x: x, z: z, y: M.groundHeight(x, z) };
        placed.push(p);
        return p;
      }
      return null;
    }
    var tp = pick(tr, spec.biome || 'selva');
    if (!tp) return null;
    var friends = [];
    for (var i = 0; i < spec.animals.length; i++) {
      var p = pick(fr, spec.friendBiome || 'bosque');
      if (!p) return null;
      friends.push({ id: spec.animals[i], x: p.x, z: p.z, y: p.y, rotY: rand() * Math.PI * 2 });
    }
    return { friends: friends, tree: { id: spec.tree, x: tp.x, z: tp.z, y: tp.y, monkey: spec.monkey || null } };
  }

  function create(opts) {
    opts = opts || {};
    var cur = null, listeners = [], solidsSrc = opts.solids || null, last = null;
    function missions() { return opts.missions || SA.missions; }
    function audio() { return opts.audio || SA.audio; }
    function follower() { return opts.follow || SA.follow; }
    function emit() { listeners.slice().forEach(function (f) { try { f(cur); } catch (e) { /* a view never breaks the loop */ } }); }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }
    function report(ev) { return opts.report ? opts.report(ev) : (SA.missionRuntime ? SA.missionRuntime.report(ev) : { status: 'none' }); }
    function later(fn, ms) { return opts.later ? opts.later(fn, ms) : root.setTimeout(fn, ms); }
    function active() { try { return missions().active(); } catch (e) { return null; } }

    function sync(o) {
      var a = active(), spec = a && a.mission && a.mission.friends;
      var key = spec ? a.id + ':' + a.seed : null;
      if ((cur && cur.key) === key) return cur;
      var src = (o && o.solids) || solidsSrc;
      var p = spec ? place(spec, a.seed, { solids: typeof src === 'function' ? src() : src || [] }) : null;
      cur = p ? { key: key, spec: spec, friends: p.friends.map(function (f) { f.f = null; return f; }), tree: p.tree } : null;
      last = null;
      emit();
      return cur;
    }

    // A friend is invited once the mission is past its 'invite' step (the step index is saved, so a reload keeps the friends with you).
    function inviteIndex(a, id) {
      var steps = a.mission.steps;
      for (var i = 0; i < steps.length; i++) if (steps[i].kind === 'invite' && steps[i].animal === id) return i;
      return -1;
    }
    function isInvited(a, fr) { var i = a ? inviteIndex(a, fr.id) : -1; return i >= 0 && i < a.step; }
    function pos(fr) { return fr.f || fr; }
    // From the 'party' step on (AS-0328) the invited friends stay at the tree and dance instead of following.
    function partying(a) { var s = a && a.stepData; return !!s && (s.kind === 'party' || s.kind === 'photo'); }

    function say(a, id) {
      var words = (cur && cur.spec.say) || [];
      if (!words.length) return;
      var k = words[Math.max(0, cur.spec.animals.indexOf(id)) % words.length];
      later(function () { try { var au = audio(); if (au && au.say) au.say(k); } catch (e) { /* sound is best effort */ } }, SAY_DELAY_MS);   // the pill speaks the new step first
    }

    function update(player) {
      sync();
      var a = active(), s = a && a.stepData;
      if (!cur || !player || !s || s.kind !== 'invite') return null;
      var fr = cur.friends.filter(function (f) { return f.id === s.animal; })[0];
      if (!fr || Math.hypot(player.x - fr.x, player.z - fr.z) > INVITE_REACH) return null;
      var r = report({ type: 'invited', animal: fr.id });
      if (r && (r.status === 'step' || r.status === 'complete')) {
        track('mission.invite', { id: a.id, animal: fr.id });
        say(a, fr.id);
        emit();
      }
      return r;
    }

    function step(dt, player, solids) {
      sync();
      var a = active();
      if (!cur) return (last = null);
      var group = [], party = partying(a), t = cur.tree;
      cur.friends.forEach(function (fr, i) {
        if (!fr.f && isInvited(a, fr)) fr.f = follower().create({ x: fr.x, z: fr.z, heading: fr.rotY });
        if (fr.f && isInvited(a, fr) && !party) group.push(fr.f);
        if (fr.f && party) {          // the party (AS-0328): they stop following, gather in a ring round the tree and face it
          var ang = PARTY_ANGLE + i * PARTY_STEP, sx = t.x + Math.sin(ang) * PARTY_RING, sz = t.z + Math.cos(ang) * PARTY_RING, k = Math.min(1, (dt || 0) * 2.5);
          var dx = sx - fr.f.x, dz = sz - fr.f.z;
          fr.f.moving = Math.hypot(dx, dz) > 0.15;
          fr.f.x += dx * k; fr.f.z += dz * k;
          fr.f.heading = Math.atan2(t.x - fr.f.x, t.z - fr.f.z);
        }
      });
      if (group.length && player) follower().stepGroup(group, player, typeof solids === 'function' ? solids() : solids || [], dt || 0);
      last = cur.friends.map(function (fr) {
        var p = pos(fr);
        return { id: fr.id, x: p.x, z: p.z, heading: fr.f ? fr.f.heading : fr.rotY, lift: fr.f ? fr.f.lift || 0 : 0, moving: !!(fr.f && fr.f.moving),
          following: !!fr.f && isInvited(a, fr), pop: fr.f && fr.f.pop || null, dancing: party && !!fr.f };
      });
      return last;
    }

    // The tree counts only with every friend invited and standing near it: arriving alone does nothing (the friends catch up, or you fetch them).
    function locate(id) {
      if (!cur || id !== cur.tree.id) return null;
      var a = active();
      var all = cur.friends.every(function (fr) { var p = pos(fr); return isInvited(a, fr) && Math.hypot(p.x - cur.tree.x, p.z - cur.tree.z) <= GATHER; });
      return all ? { x: cur.tree.x, z: cur.tree.z, r: TREE_REACH } : null;
    }

    function target(s) {
      if (!cur || !s) return null;
      if (s.kind === 'invite') {
        var fr = cur.friends.filter(function (f) { return f.id === s.animal; })[0];
        return fr ? { x: fr.x, z: fr.z, role: 'friend', id: fr.id } : null;
      }
      if (s.kind === 'goTo' && s.place === cur.tree.id) return { x: cur.tree.x, z: cur.tree.z, role: 'place', id: cur.tree.id };
      return null;
    }

    function invited(id) {
      var a = active();
      return !!cur && cur.friends.some(function (fr) { return fr.id === id && isInvited(a, fr); });
    }

    return { sync: sync, update: update, step: step, locate: locate, target: target, invited: invited, view: function () { return last; },
      current: function () { return cur; }, setSolids: function (s) { solidsSrc = s; },
      onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      create: create, INVITE_REACH: INVITE_REACH, TREE_REACH: TREE_REACH, GATHER: GATHER };
  }

  var api = create();
  api.place = place;
  SA.missionFriends = api;
})(typeof window !== 'undefined' ? window : globalThis);
