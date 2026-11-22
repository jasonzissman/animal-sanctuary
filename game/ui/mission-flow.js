/* SA.missionFlow: plays the rescue mission (SA.mission) on the prompt card. Pure wiring with injectable collaborators, so it
 * is unit-tested in node:vm with stubs. It replaces "the photo answers the round" (AS-0084) and has the same controller API as
 * SA.prompt.createController, so game/main.js, SA.reroll and SA.hintFlow treat both alike.
 *
 *   var flow = SA.missionFlow.create({ mission, view, fx?, audio?, care?, later?, biomeFx?, onProgress? })
 *     mission    SA.mission.create(...)       care   SA.careFlow instance (offer(animalId, force, kind) / active / onPick / replay)
 *   flow.begin()      starts a mission: the clue on the card, spoken (step find)
 *   flow.onPick(p)    { animalId, part, item? } from SA.picking:
 *       find   any pick (any item, or empty hands) of an animal that fits the clue celebrates (chime, boing, confetti, toast with
 *              its name, say('animal:<id>')) and the mission goes on with that animal; a pick of another animal is a gentle
 *              boing + wobble (no penalty). A camera shot here also saves the photo in the album.
 *       help   once the name is said, the animal's first help task starts at once (care.offer(id, true, kind): no random
 *              chance); each finished task (flow.onCareDone) starts the next one, then the photo step.
 *       photo  only a la cámara shot of the found animal (SA.photo.take -> mission.photo) finishes the mission. 'wrong' (another
 *              animal) and 'early' (help not done) are friendly nudges; 'correct' celebrates with a level cue and the next
 *              mission begins after NEXT_MS.
 *   The card for every step comes from SA.missionCard (find: clue + animal icon; help: the care-flow card with its tool/food icon;
 *   photo: "Tómale una foto" + camera badge). Option `pin` = { pin(id), unpin(id) } (the render ambient system): the found animal
 *   is pinned (stops wandering) from the find until the photo is taken, or until the mission is replaced (begin / reroll).
 *   flow.onCareDone(task)   the care-flow onDone hook (task.taskId says which help task ended)
 *   flow.replay()     says the current step again; flow.hint() the silhouette; flow.canReroll()/reroll() only in the find step
 *   flow.game         the round-like adapter (current, hint, biomeHint, pointerHint, hasBiomePool) for SA.hintFlow and SA.reroll
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var NEXT_MS = 2200;        // celebration time before the next mission
  var HELP_WAIT_MS = 1800;   // if the animal's name is never reported finished, the help task starts after this anyway
  var AUTO_HINT_MS = 20000;  // stuck on the find step this long: reveal the next hint stage
  var PHOTO_KEY = 'phrase:tomalefoto';

  function iconFor(animalId) {
    var a = SA.data && SA.data.get('animals', animalId);
    return (a && a.icon) || '🐾';
  }

  function create(o) {
    var mission = o.mission, view = o.view, fx = o.fx, audio = o.audio || SA.audio, care = o.care || null;
    var biomeFx = o.biomeFx || null;
    var later = o.later || function (fn, ms) { return typeof root.setTimeout === 'function' ? root.setTimeout(fn, ms) : null; };
    var cardKey = '';       // what Replay says for the current step

    // The found animal stays put from the find until the photo (o.pin = { pin(id), unpin(id) }, e.g. the render ambient system).
    var pinned = null;
    function pin(id) {
      unpin();
      try { if (o.pin && o.pin.pin) { o.pin.pin(id); pinned = id; } } catch (e) { pinned = null; /* a pin never breaks play */ }
    }
    function unpin() {
      var id = pinned;
      pinned = null;
      try { if (id && o.pin && o.pin.unpin) o.pin.unpin(id); } catch (e) { /* silent */ }
    }

    function say(key, done) {
      try {
        if (audio && audio.say) { if (done) audio.say(key, done); else audio.say(key); return; }
      } catch (e) { /* silent */ }
      if (done) done();
    }
    function sfx(name) { try { if (audio && audio.sfx) audio.sfx(name); } catch (e) { /* silent */ } }
    function stars() { return SA.save.get().stars; }
    function cur() { return mission.current(); }
    function animalName(id) { var v = SA.vocab && SA.vocab.get('animal:' + id); return v ? v.es : ''; }
    function react(id, name) { if (fx && fx.play) fx.play(id, name); }

    function trackTap(p, correct) {
      var part = String(p.part || 'cuerpo');
      if (SA.stats && SA.stats.recordTap) SA.stats.recordTap(part, correct);
      try { if (root.SAT && root.SAT.track) root.SAT.track('part.tap', { part: part, correct: correct }); } catch (e) { /* telemetry never breaks play */ }
    }

    function levelCue(change) {
      var lc = SA.levelCue, cue = lc ? lc.cueFor(change) : null;
      if (!cue) return;
      try { if (view.levelCue) view.levelCue(cue); } catch (e) { /* a cue never breaks play */ }
      var name = lc.sfxFor(cue);
      if (name) sfx(name);
    }

    // Stuck on the find step: after each delay show the next hint stage (SA.hintStage). Hints never fail a mission.
    function scheduleHint(m, seconds) {
      if (!SA.hintStage || m.stage >= SA.hintStage.MAX_STAGE) return;
      later(function () {
        if (cur() !== m || m.done || m.step !== 'find') return;
        var stage = SA.hintStage.next(m.level, seconds, m.stage);
        if (stage === 1) hint();
        else if (stage === 2) biomeHint();
        scheduleHint(m, seconds + AUTO_HINT_MS / 1000);
      }, AUTO_HINT_MS);
    }

    function begin() {
      if (o.onProgress) { try { o.onProgress(); } catch (e) { /* unlocks never break play */ } }
      var m = mission.start();
      if (!m) { unpin(); view.clear(); return null; }
      m.hintShown = m.level <= 1;
      m.stage = SA.hintStage ? SA.hintStage.initial(m.level) : (m.level <= 1 ? 1 : 0);
      unpin();                          // a replaced mission (new clue, reroll) frees the animal it had pinned
      var card = SA.missionCard.find(m);
      view.showRound({ text: card.text, icon: card.icon, hintShown: m.hintShown, stars: stars(), camera: card.camera });
      cardKey = card.key;
      say(cardKey);
      if (biomeFx) biomeFx.hide();
      scheduleHint(m, AUTO_HINT_MS / 1000);
      return m;
    }

    function showPhotoCard(m) {
      var card = SA.missionCard.photo(m);
      view.showRound({ text: card.text, icon: card.icon, hintShown: card.silhouette, stars: stars(), camera: card.camera });
      cardKey = card.key;
      say(cardKey);
    }

    // Starts the next pending help task (no random chance), or moves on to the photo step.
    function startNextTask() {
      var m = cur();
      if (!m || m.done) return;
      var t = m.step === 'help' ? m.tasks.filter(function (x) { return !x.done; })[0] : null;
      if (!t) { if (m.step === 'photo') showPhotoCard(m); return; }
      if (care && care.offer(m.animalId, true, t.kind)) return;
      mission.taskDone(t.id);       // the task cannot be shown: skip it so the mission never gets stuck
      startNextTask();
    }

    function onCareDone(task) {
      var m = cur();
      if (!m || m.done) { begin(); return; }
      mission.taskDone(task && task.taskId);
      startNextTask();
    }

    function celebrate(animalId, starCount) {
      sfx('chime');
      react(animalId, 'boing');
      view.celebrate({ icon: iconFor(animalId), stars: starCount });
      view.confetti();
      view.toast('¡Muy bien! ⭐ ' + animalName(animalId));
    }

    function onFind(p) {
      var m = cur();
      if (SA.photo && SA.photo.isShot(p)) { sfx('shutter'); snap(p); SA.photo.record(p.animalId); }
      m.picks = (m.picks || 0) + 1;
      var res = mission.found(p.animalId);
      trackTap(p, res.status === 'found');
      if (res.status === 'wrong') {
        sfx('boing');
        react(p.animalId, 'wobble');
        view.toast('¡Casi! 🙈');
        view.shake();
      } else if (res.status === 'found') {
        m.answerId = p.animalId;        // the hint arrow and Replay now follow the animal that was found
        pin(p.animalId);                // it stops wandering until the photo is taken
        if (biomeFx) biomeFx.hide();
        celebrate(p.animalId, stars());
        var started = false;
        var go = function () { if (started) return; started = true; if (cur() === m) startNextTask(); };
        say('animal:' + p.animalId, go);        // the help starts right after the name is said
        later(go, HELP_WAIT_MS);
      }
      return res;
    }

    function snap(p) {
      var a = SA.data && SA.data.get('animals', p.animalId);
      if (view.snapshot) view.snapshot({ icon: iconFor(p.animalId), text: a && a.name ? a.name.es : '' });
    }

    function onShot(p) {
      var m = cur();
      sfx('shutter');
      snap(p);
      var res = SA.photo.take(mission, p);
      trackTap(p, res.status === 'correct');
      if (res.status === 'correct') {
        unpin();                        // the mission is complete: the animal wanders again
        levelCue(res.levelChange);
        celebrate(res.animalId, res.stars);
        say('animal:' + res.animalId);
        later(begin, NEXT_MS);
      } else if (res.status === 'wrong' || res.status === 'early') {   // a friendly nudge back to the step (nothing is lost)
        react(p.animalId, 'wobble');
        view.toast(res.status === 'wrong' ? '¡Qué foto! Pero busca…' : '¡Primero ayuda! 💛');
        if (res.status === 'wrong') say('phrase:quefoto');
        later(function () { if (cur() === m && !m.done) replay(); }, 1500);
      }
      return res;
    }

    function onPick(p) {
      if (care && care.active()) return care.onPick(p);
      var m = cur();
      if (!m || m.done || !p || typeof p.animalId !== 'string') return { status: 'ignored' };
      if (m.step === 'find') return onFind(p);
      if (!SA.photo || !SA.photo.isShot(p)) return { status: 'ignored' };   // help gap / photo step: only la cámara counts
      return onShot(p);
    }

    function replay() {
      if (care && care.active()) { care.replay(); return; }
      if (cur() && cardKey) say(cardKey);
    }

    function hint() {
      var m = cur();
      if (!m || m.done) return;
      if (!m.hintShown) { m.hintShown = true; mission.hint(); m.stage = Math.max(m.stage || 0, 1); }
      view.showHint();
    }

    function biomeHint() {
      var m = cur(), a = m && !m.done ? SA.data.get('animals', m.answerId) : null;
      if (!a || !a.biome || !biomeFx) return null;
      if (!m.biomeShown) { m.biomeShown = true; mission.hint(); m.stage = 2; }
      try { biomeFx.show(a.biome); } catch (e) { return null; }      // the glow never breaks play
      var key = SA.vocab && SA.vocab.biomeKey ? SA.vocab.biomeKey(a.biome) : null;
      var muted = false;
      try { muted = !!(audio && audio.isMuted && audio.isMuted()); } catch (e) { muted = false; }
      if (key && !muted) say(key);
      return a.biome;
    }

    function pointerHint() {      // the off-screen arrow was tapped: one hint, once per mission
      var m = cur();
      if (!m || m.done) return null;
      if (!m.pointerUsed) { m.pointerUsed = true; mission.hint(); }
      return m;
    }

    /** The biome reroll only happens while looking for the animal (never during help or the photo). */
    function canReroll() {
      var m = cur();
      return !!m && !m.done && m.step === 'find' && !(care && care.active());
    }

    function reroll() {
      if (!canReroll()) return null;
      var from = cur().answerId;
      var m = begin();
      if (m) {
        view.toast('🌿');
        if (SA.reroll && SA.reroll.track) SA.reroll.track(root.SAT, from, m.answerId);
      }
      return m;
    }

    function equipCamera() {
      if (!SA.inventory || !SA.inventory.equip(SA.photo.CAMERA)) return false;
      say('item:' + SA.photo.CAMERA);
      return true;
    }

    return { begin: begin, onPick: onPick, replay: replay, hint: hint, canReroll: canReroll, reroll: reroll, equipCamera: equipCamera,
      onCareDone: onCareDone,
      game: { current: mission.current, hint: function () { hint(); return cur(); }, biomeHint: biomeHint, pointerHint: pointerHint,
        hasBiomePool: mission.hasBiomePool } };
  }

  SA.missionFlow = { NEXT_MS: NEXT_MS, HELP_WAIT_MS: HELP_WAIT_MS, AUTO_HINT_MS: AUTO_HINT_MS, PHOTO_KEY: PHOTO_KEY, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
