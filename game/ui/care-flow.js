/* SA.careFlow: wires a care task (SA.care) to the prompt view, audio and the 3D care effects. Pure wiring with
 * injectable collaborators, so it is unit-tested in node:vm with stubs.
 *
 *   var flow = SA.careFlow.create({ care, view, fx?, audio?, later?, onDone? })
 *   flow.offer(animalId) -> boolean   maybe starts a task (shows "Limpia las patas", speaks it, eases the camera in,
 *                                     makes the part rub-able); false when no task was started
 *   flow.active()                     a task is in progress
 *   flow.onPick({ animalId, part })   routes a tap/rub: splash + fewer spots; wrong part = boing + its name (no penalty);
 *                                     the last rub celebrates, awards the star (in SA.care) and calls onDone after NEXT_MS
 *   flow.onFeed(foodId)               feed task: a tray food was tapped; the asked food is counted aloud, anything else
 *                                     bounces back with a giggle and its name (no penalty); exactly `count` finishes
 *   (curar: "Cura las alas" is one tap on the scraped part; finishing draws a bandage via fx.bandage())
 *   flow.replay()                   speaks the prompt again (a feed ask word by word, pulsing each food: view.pulseFood(id))
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

    function vcall(name, arg) { if (typeof view[name] === 'function') view[name](arg); }
    function food(id) { return SA.data.get('foods', id); }

    function offer(animalId) {
      var task = care.maybeStart(animalId);
      if (!task) return false;
      if (fx) fx.show(task);
      if (task.kind === 'alimentar') {
        view.showCare({ text: task.text, icon: food(task.food).icon, stars: stars() });
        vcall('showFeed', { count: task.count, given: 0, icon: food(task.food).icon,
          items: task.items.map(function (it) { return { icon: food(it.food).icon, count: it.count, given: 0 }; }),
          tray: task.tray.map(function (id) { return { id: id, icon: food(id).icon, label: SA.vocab.get('food:' + id).es }; }) });
      } else {
        // only cleaning is rubbed; healing is a single tap on the scraped part
        if (task.kind === 'limpiar' && SA.picking && SA.picking.setRubTarget) SA.picking.setRubTarget(task.animalId, task.part);
        view.showCare({ text: task.text, icon: task.kind === 'curar' ? '🩹' : '🧽', stars: stars() });
      }
      say(task.text);
      return true;
    }

    function finish(res) {
      stopSeq();
      if (SA.picking && SA.picking.setRubTarget) SA.picking.setRubTarget(null);
      if (fx) fx.scrub(0);
      if (res.kind === 'curar' && fx && fx.bandage) fx.bandage();
      vcall('hideFeed');
      sfx(res.kind === 'alimentar' ? 'pop' : 'splash');
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

    // A tray food was tapped: each right one is counted aloud ("uno, dos, tres"); anything else bounces back with a giggle.
    function onFeed(foodId) {
      var res = care.feed(foodId);
      if (res.status === 'fed' || res.status === 'done') {
        var t = care.current();
        sfx('pop');
        var item = t.items.filter(function (it) { return it.food === foodId; })[0];
        say('number:' + item.given);        // counts each asked food on its own: "uno, dos" fresas, then "uno" zanahoria
        vcall('updateFeed', { given: t.given, items: t.items.map(function (it) { return { given: it.given }; }) });
        if (res.status === 'done') finish(res);
      } else if (res.status === 'wrong') {
        sfx('giggle');
        vcall('bounceFood', foodId);
        view.toast('😄 ' + res.label);
        say('food:' + foodId);
      }
      return res;
    }

    // Replay of a feed ask: each task.words key is spoken in turn and its tray food pulses (SA.wordSeq, pure timing).
    // Without audio, or while muted, nothing extra happens. Other tasks (and no SA.wordSeq) speak the whole phrase.
    var seq = null;
    function stopSeq() { if (seq) { seq.cancel(); seq = null; } }
    function muted() { try { return !!(audio && audio.isMuted && audio.isMuted()); } catch (e) { return false; } }
    function replay() {
      var t = care.current();
      if (!t || !care.active()) return;
      stopSeq();
      if (t.kind !== 'alimentar' || !t.words || !t.words.length || !SA.wordSeq) { say(t.text); return; }
      if (!audio || !audio.say || muted()) return;
      var mine = seq = SA.wordSeq.play(t.words, {
        say: say, later: later,
        alive: function () { return care.active() && care.current() === t; },
        onWord: function (step) { if (step.food) vcall('pulseFood', step.food); },
        onEnd: function () { if (seq === mine) seq = null; }
      });
    }

    return { offer: offer, active: care.active, onPick: onPick, onFeed: onFeed, replay: replay };
  }

  SA.careFlow = { NEXT_MS: NEXT_MS, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
