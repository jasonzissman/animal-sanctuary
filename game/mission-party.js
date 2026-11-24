/* SA.missionParty: the party at the monkey's tree, then the party photo (AS-0328, slice 3 of AS-0183). Pure (no THREE, no DOM; unit-tested in
 * node:vm). A mission row declares `party: { say, seconds? }` next to `friends` (game/data/missions.js) and ends with a 'party' step
 * { kind: 'party', place: <tree> } and a 'photo' step (target = the monkey). Nothing here names an animal: the tree and the monkey come from
 * SA.missionFriends, which also keeps the invited friends around the tree and dancing while these two steps are current.
 *
 *   phase  'none' -> 'party' (the 'party' step is current: confetti, balloons, dancing, the tune; never timed against the player) ->
 *          'photo' (the party goes on, quietly, until the picture is taken) -> 'done' (mission finished)
 *   SA.missionParty.tick(dt)     once per frame (the renderer calls it): starts the party when the 'party' step becomes current (the tune goes
 *                                through SA.audio.melody, silent when muted; `say` is spoken), reports { type: 'partied', place } when
 *                                the tune has played out. Resuming (a reload) on the photo step goes straight to 'photo' without the show.
 *   SA.missionParty.view()       -> { key, phase, t, tree: { x, z, y }, monkey, animals: [ids] } | null (null while there is no party to draw)
 *   SA.missionParty.snap(player?) a tap on the monkey or a friend with la cámara in hand while the 'photo' step is current, within SNAP_REACH
 *                                of the tree: takes the picture -> { status: 'none' | 'nocamera' | 'far' | 'complete' | 'step' | ... }.
 *                                It goes into the album (SA.photo.record), completes the mission (stars) and logs one rescue row
 *                                { kind: 'party', key: <mission id> } for the sticker (badge 'fiesta-feliz', once, never again on a replay).
 *   SA.missionParty.target(step) -> { x, z, role, id } | null   the compass points at the tree for the party and photo steps
 *   SA.missionParty.onSticker({ mission, badges })   hook for main.js
 *   SA.missionParty.create({ missions?, friends?, runtime?, audio?, photo?, rescueLog?, inventory?, melody?, later?, track? })   (tests)
 * Telemetry: party.start, party.done, party.photo { id }.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var SNAP_REACH = 14, SAY_DELAY_MS = 900;

  function create(opts) {
    opts = opts || {};
    var st = { key: null, phase: 'none', t: 0, snapped: false }, spec = null, fr = null;
    function missions() { return opts.missions || SA.missions; }
    function friends() { return opts.friends || SA.missionFriends; }
    function runtime() { return opts.runtime || SA.missionRuntime; }
    function audio() { return opts.audio || SA.audio; }
    function melody() { return opts.melody || SA.partyMelody; }
    function later(fn, ms) { return opts.later ? opts.later(fn, ms) : root.setTimeout(fn, ms); }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }
    function say(k) { try { var a = audio(); if (a && a.say) a.say(k); } catch (e) { /* sound is best effort */ } }
    function active() { try { return missions().active(); } catch (e) { return null; } }
    function seconds() { return spec && typeof spec.seconds === 'number' ? spec.seconds : melody().duration(); }

    function start(a) {
      st.phase = 'party';
      st.t = 0;
      track('party.start', { id: a.id });
      try { var au = audio(); if (au && au.melody) au.melody(melody().notes()); } catch (e) { /* sound is best effort */ }
      later(function () { say(spec.say); }, SAY_DELAY_MS);
    }

    function tick(dt) {
      var a = active(), cur = null;
      try { cur = friends().current(); } catch (e) { cur = null; }
      var key = a && a.mission && a.mission.party && cur ? a.id + ':' + a.seed : null;
      if (key !== st.key) {
        st = { key: key, phase: 'none', t: 0, snapped: false };
        spec = key ? a.mission.party : null;
      }
      fr = key ? cur : null;
      if (!key) return st.phase;
      var s = a.stepData;
      if (st.phase === 'none') {
        if (s && s.kind === 'party') start(a);
        else if (s && s.kind === 'photo') st.phase = 'photo';          // resumed after the party: it goes on, quietly
      }
      if (st.phase === 'party') {
        st.t += dt || 0;
        if (st.t >= seconds()) {
          var r = runtime().report({ type: 'partied', place: s && s.place });
          if (r && (r.status === 'step' || r.status === 'complete')) { st.phase = 'photo'; track('party.done', { id: a.id }); }
          else st.t = seconds();                                       // never stuck: the party simply waits for the step
        }
      }
      return st.phase;
    }

    function view() {
      if (!fr || (st.phase !== 'party' && st.phase !== 'photo')) return null;
      return { key: st.key, phase: st.phase, t: st.t, tree: { x: fr.tree.x, z: fr.tree.z, y: fr.tree.y }, monkey: fr.tree.monkey,
        animals: fr.friends.map(function (f) { return f.id; }) };
    }

    function snap(player) {
      var a = active(), s = a && a.stepData;
      if (!fr || !spec || !s || s.kind !== 'photo' || st.phase !== 'photo' || st.snapped) return { status: 'none' };
      var inv = opts.inventory || SA.inventory;
      if (!inv || inv.equipped() !== 'camara') return { status: 'nocamera' };
      if (player && Math.hypot(player.x - fr.tree.x, player.z - fr.tree.z) > SNAP_REACH) return { status: 'far' };
      try { var au = audio(); if (au && au.sfx) au.sfx('shutter'); } catch (e) { /* sound is best effort */ }
      var r = runtime().report({ type: 'photo', target: s.target });
      if (!r || (r.status !== 'complete' && r.status !== 'step')) return r || { status: 'none' };
      st.snapped = true;
      track('party.photo', { id: a.id });
      try { (opts.photo || SA.photo).record(s.target); } catch (e) { /* the album never blocks play */ }
      var rec = { earned: [] };
      try { rec = (opts.rescueLog || SA.rescueLog).record({ kind: 'party', mission: a.id, animal: s.target, key: a.id }) || rec; } catch (e) { /* the log never blocks play */ }
      say(spec.say);
      if (api.onSticker) { try { api.onSticker({ mission: a.id, badges: rec.earned || [] }); } catch (e) { /* the view never breaks play */ } }
      return r;
    }

    function target(s) {
      if (!fr || !s || (s.kind !== 'party' && s.kind !== 'photo')) return null;
      return { x: fr.tree.x, z: fr.tree.z, role: 'place', id: fr.tree.id };
    }

    var api = { tick: tick, view: view, snap: snap, target: target, onSticker: null, create: create, reach: SNAP_REACH };
    return api;
  }

  SA.missionParty = create();
})(typeof window !== 'undefined' ? window : globalThis);
