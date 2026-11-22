/* SA.careFlow: wires a care task (SA.care) to the prompt view, audio and the 3D care effects. Pure wiring with
 * injectable collaborators, so it is unit-tested in node:vm with stubs.
 *
 *   var flow = SA.careFlow.create({ care, view, fx?, audio?, later?, onDone? })
 *   flow.offer(animalId) -> boolean   maybe starts a task (shows "Limpia las patas", speaks it, eases the camera in,
 *                                     makes the part rub-able); false when no task was started
 *   flow.active()                     a task is in progress
 *   flow.onPick({ animalId, part })   routes a tap/rub: splash + fewer spots; wrong part = boing + its name (no penalty);
 *                                     the last rub celebrates, awards the star (in SA.care) and calls onDone after NEXT_MS
 *   flow.replay()                     speaks the prompt again
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var NEXT_MS = 2200;

  function create(o) {
    var care = o.care, view = o.view, fx = o.fx, audio = o.audio || SA.audio;
    var later = o.later || function (fn, ms) { return root.setTimeout(fn, ms); };

    function say(key) { try { if (audio && audio.say) audio.say(key); } catch (e) { /* silent */ } }
    function sfx(name) { try { if (audio && audio.sfx) audio.sfx(name); } catch (e) { /* silent */ } }
    function stars() { return SA.save.get().stars; }

    function offer(animalId) {
      var task = care.maybeStart(animalId);
      if (!task) return false;
      if (fx) fx.show(task);
      if (SA.picking && SA.picking.setRubTarget) SA.picking.setRubTarget(task.animalId, task.part);
      view.showCare({ text: task.text, icon: '🧽', stars: stars() });
      say(task.text);
      return true;
    }

    function finish(res) {
      if (SA.picking && SA.picking.setRubTarget) SA.picking.setRubTarget(null);
      if (fx) fx.scrub(0);
      sfx('splash');
      sfx('chime');
      sfx('sparkle');
      view.celebrate({ icon: '✨', stars: res.stars });
      view.confetti();
      view.toast('¡Muy bien! ⭐');
      say('phrase:muybien');
      later(function () {
        if (fx) fx.hide();
        if (o.onDone) o.onDone();
      }, NEXT_MS);
    }

    function onPick(p) {
      var res = care.tap(p);
      if (res.status === 'scrub') {
        sfx('splash');
        if (fx) fx.scrub(res.spotsLeft);
      } else if (res.status === 'wrong') {
        sfx('boing');
        view.toast('🙈 ' + res.label);        // the picking layer already played the part's funny reaction
      } else if (res.status === 'done') {
        finish(res);
      }
      return res;
    }

    function replay() { var t = care.current(); if (t && care.active()) say(t.text); }

    return { offer: offer, active: care.active, onPick: onPick, replay: replay };
  }

  SA.careFlow = { NEXT_MS: NEXT_MS, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
