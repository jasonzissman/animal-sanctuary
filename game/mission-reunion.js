/* SA.missionReunion: the baby reaches mamá (AS-0235, slice 4 of AS-0173). Pure wiring (no THREE, no DOM; node:vm tested).
 * While a 'follow' step is current and the following baby gets within REUNION_DIST of mamá, `check` reports the 'followed' event
 * (SA.missionRuntime), which moves the mission on to the family photo step. Once per run it also: logs a 'reunion' rescue
 * (SA.rescueLog, which counts toward the 'Reúne familias' badge), fires the `onReunion` hook (main.js shows the line and confetti),
 * and speaks the family words through SA.audio.say in order: la mamá, la cría, el bebé, la familia, ¡La familia está junta!
 * The hearts burst and the nuzzle are drawn by SA.render.createMissionSpawn when SA.missionBaby's view says `reunion: true`.
 * Nothing here names an animal id: the step row says who follows.
 *
 *   SA.missionReunion.REUNION_DIST (2.6)   distance between baby and mamá that counts as together
 *   SA.missionReunion.WORDS                the vocab keys spoken, in order
 *   SA.missionReunion.check(baby, mama)    positions { x, z } -> true on the frame the reunion happens (the step moved on), else false
 *   SA.missionReunion.create({ missions?, runtime?, log?, audio?, wordSeq?, later?, track? })   an instance (tests); onReunion(result)
 * Telemetry: mission.reunion { id }.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var REUNION_DIST = 2.6, START_DELAY_MS = 1700;     // the pill speaks the new step first; the family words follow it
  var WORDS = ['phrase:mama', 'phrase:cria', 'phrase:bebe', 'phrase:familia', 'phrase:familiajunta'];

  function create(opts) {
    opts = opts || {};
    function missions() { return opts.missions || SA.missions; }
    function runtime() { return opts.runtime || SA.missionRuntime; }
    function log() { return opts.log || SA.rescueLog; }
    function later(fn, ms) { return opts.later ? opts.later(fn, ms) : root.setTimeout(fn, ms); }
    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }

    function speak() {
      var audio = opts.audio || SA.audio, seq = opts.wordSeq || SA.wordSeq;
      if (!audio || !audio.say) return;
      later(function () {
        try {
          if (seq && seq.play) seq.play(WORDS, { say: function (k, done) { return audio.say(k, done); }, later: later });
          else WORDS.forEach(function (k, i) { later(function () { audio.say(k); }, i * 900); });
        } catch (e) { /* sound is best effort */ }
      }, START_DELAY_MS);
    }

    function check(baby, mama) {
      var a;
      try { a = missions().active(); } catch (e) { return false; }
      var s = a && a.stepData;
      if (!s || s.kind !== 'follow' || !baby || !mama) return false;
      if (Math.hypot(baby.x - mama.x, baby.z - mama.z) >= REUNION_DIST) return false;
      var r = runtime().report({ type: 'followed', animal: s.animal });
      if (r.status !== 'step' && r.status !== 'complete') return false;
      var rec = { added: false, earned: [] };
      try { rec = log().record({ kind: 'reunion', mission: a.id, animal: s.animal, key: a.id + ':' + a.seed }); } catch (e) { /* the log never blocks play */ }
      track('mission.reunion', { id: a.id });
      speak();
      if (api.onReunion) { try { api.onReunion({ mission: a.id, animal: s.animal, badges: rec.earned }); } catch (e) { /* the view never breaks play */ } }
      return true;
    }

    var api = { check: check, create: create, onReunion: null };
    return api;
  }

  var api = create();
  api.REUNION_DIST = REUNION_DIST;
  api.WORDS = WORDS.slice();
  SA.missionReunion = api;
})(typeof window !== 'undefined' ? window : globalThis);
