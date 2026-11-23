/* SA.careFlow: wires a care task (SA.care) to the prompt view, audio and the 3D care effects. Pure wiring with
 * injectable collaborators, so it is unit-tested in node:vm with stubs.
 *
 *   var flow = SA.careFlow.create({ care, view, fx?, audio?, later?, onDone?, react?, inventory? })
 *   (react(animalId, reaction) plays an animal reaction; inventory defaults to SA.inventory)
 *   flow.offer(animalId, force?, kind?, quiet?) -> boolean   (quiet: do not speak the prompt; an encounter speaks its own call first) maybe starts a task (force = no random chance, kind = only that task kind; shows "Lava las patas" with the tool's icon, speaks it, makes
 *                                     the part rub-able); false when no task was started
 *   flow.active()                     a task is in progress
 *   flow.onPick({ animalId, part, item? })  routes a Space/click/tap/rub with the equipped item: the right tool on the right
 *                                     part (action table, game/data/actions.js) plays the action's sfx and reaction and takes
 *                                     spots away; any other pairing = boing + the tool and part names toasted and spoken (no
 *                                     penalty). The last rub celebrates, awards the star (in SA.care), calls onDone after NEXT_MS.
 *                                     On a feed task the item must be a food from the inventory: it is given and used up.
 *   flow.onFeed(foodId)               feed task: a tray food was tapped; the asked food is counted aloud, anything else
 *                                     bounces back with a giggle and its name (no penalty); exactly `count` finishes
 *   (desenredar: "Quita la hoja de las alas"; each tug pulls a leaf bit off; the last one calls fx.fly(animalId), gives nothing
 *   (the leaf just falls and fades; an action's optional `gives` item still goes to the inventory) and speaks the action's `say` ("¡Ya puede volar!"))
 *   (curar: "Cura las alas" is one tap on the scraped part; finishing draws a bandage via fx.bandage())
 *   flow.cancel()                   a story mission started (SA.focus): the task on screen is put away quietly (no star, no miss)
 *   flow.replay()                   speaks the prompt again (a feed ask word by word, pulsing each food: view.pulseFood(id))
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var NEXT_MS = 2200;
  var WORD_GAP_MS = 900;      // pause between the spoken tool name and part name

  function create(o) {
    var care = o.care, view = o.view, fx = o.fx, audio = o.audio || SA.audio;
    var later = o.later || function (fn, ms) { return root.setTimeout(fn, ms); };

    function say(key, done) {
      try {
        if (audio && audio.say) { if (done) audio.say(key, done); else audio.say(key); return; }
      } catch (e) { /* silent */ }
      if (done) done();
    }
    function sfx(name) { try { if (audio && audio.sfx) audio.sfx(name); } catch (e) { /* silent */ } }
    function stars() { return SA.save.get().stars; }

    function vcall(name, arg) { if (typeof view[name] === 'function') view[name](arg); }
    function food(id) { return SA.data.get('foods', id); }

    // The icon of the tool that fits the task (🪮 🧽 🩹), or an open hand: the prompt shows what to hold.
    function itemDef(id) { try { return id ? SA.data.get('items', id) : null; } catch (e) { return null; } }
    function toolIcon(task) {
      if (SA.missionCard) return SA.missionCard.helpIcon(task);      // the one step -> icon mapping (game/mission-card.js)
      var it = task.item && task.item !== 'hands' && task.item !== 'food' ? itemDef(task.item) : null;
      return it ? it.icon : '✋';
    }

    function offer(animalId, force, kind, quiet) {
      // A story mission is running: no random care offer. A forced offer (the mission's own 'help' step) always works (AS-0222).
      if (!force && SA.focus && !SA.focus.allowsSmall()) return false;
      var task = care.maybeStart(animalId, force, kind);
      if (!task) return false;
      if (SA.picking && SA.picking.setActiveTask) SA.picking.setActiveTask(task);   // its animal's parts become aimable (AS-0128)
      if (fx) fx.show(task);
      if (task.kind === 'alimentar') {
        view.showCare({ text: task.text, icon: food(task.food).icon, stars: stars() });
        vcall('showFeed', { count: task.count, given: 0, icon: food(task.food).icon,
          items: task.items.map(function (it) { return { icon: food(it.food).icon, count: it.count, given: 0 }; }),
          tray: task.tray.map(function (id) { return { id: id, icon: food(id).icon, label: SA.vocab.get('food:' + id).es }; }) });
      } else {
        // washing, brushing and petting are rubbed; healing is a single tap on the scraped part
        if (task.kind !== 'curar' && SA.picking && SA.picking.setRubTarget) SA.picking.setRubTarget(task.animalId, task.part);
        view.showCare({ text: task.text, icon: toolIcon(task), stars: stars() });
      }
      if (!quiet) say(task.text);       // quiet: SA.encounterFlow speaks the animal's call and hint first, then replay()
      return true;
    }

    function finish(res) {
      var finished = care.current();      // handed to onDone: a rescue mission needs to know which task ended
      stopSeq();
      if (SA.picking && SA.picking.setActiveTask) SA.picking.setActiveTask(null);
      if (SA.picking && SA.picking.setRubTarget) SA.picking.setRubTarget(null);
      if (fx) fx.scrub(0);
      if (res.kind === 'curar' && fx && fx.bandage) fx.bandage();
      vcall('hideFeed');
      sfx(res.sfx || 'pop');
      react(res.animalId, res.reaction);
      view.celebrate({ icon: '✨', stars: res.stars });
      view.confetti();
      // A visible cue (action.cue) is over: a tangled bird flies a happy loop, a limping animal walks normally again; the
      // action's `gives` item is yours and its `say` phrase is spoken ("¡Ya puede volar!", "¡Ya camina bien!").
      if (res.cue && fx && fx.free) fx.free(res.animalId, res.cue);
      else if (res.tangled && fx && fx.fly) fx.fly(res.animalId);
      var inv = o.inventory || SA.inventory;
      if (res.gives && inv && inv.add) { try { inv.add(res.gives, 1); } catch (e) { /* inventory never breaks play */ } }
      var phrase = res.say && SA.vocab && SA.vocab.get(res.say);
      view.toast((phrase ? phrase.es : '¡Muy bien!') + ' ⭐');
      say(phrase ? res.say : 'phrase:muybien');
      later(function () {
        if (fx) fx.hide();
        if (o.onDone) o.onDone(finished);
      }, NEXT_MS);
    }

    function react(animalId, name) { try { if (o.react && animalId && name) o.react(animalId, name); } catch (e) { /* silent */ } }

    // A wrong tool or part: a funny harmless reaction, then the Spanish names ("el cepillo", "las patas") are said and shown.
    function wrongPairing(animalId, itemKey, itemEs, part) {
      sfx('boing');
      react(animalId, 'wobble');
      var partDef = part && SA.data.get('parts', part);
      view.toast('🙈 ' + (itemEs ? itemEs + ' · ' : '') + (partDef ? partDef.label.es : ''));
      var keys = (itemKey ? ['item:' + itemKey] : []).concat(partDef ? ['part:' + part] : []);
      keys.forEach(function (k, i) { if (i) later(function () { say(k); }, WORD_GAP_MS); else say(k); });
    }

    function onPick(p) {
      var cur = care.current();
      if (cur && cur.kind === 'alimentar') return onFeedPick(cur, p);
      var res = care.tap(p);
      if (res.status === 'scrub') {
        sfx(cur.sfx || 'splash');
        react(cur.animalId, cur.reaction);
        if (fx) fx.scrub(res.spotsLeft);
      } else if (res.status === 'wrong') {
        wrongPairing(cur.animalId, res.item, res.itemLabel, res.part);
      } else if (res.status === 'done') {
        finish(res);
      }
      return res;
    }

    // Feeding by hand: Space with a food item equipped gives it to the animal and uses it up. Anything else held (a tool, or
    // empty hands) is a funny miss that names it. Foods only leave the inventory when the animal accepts them.
    function onFeedPick(task, p) {
      if (!p || p.animalId !== task.animalId) return { status: 'ignored' };
      var held = typeof p.item === 'string' && p.item ? p.item : null;
      if (!held || !SA.data.get('foods', held)) {
        var it = itemDef(held);
        wrongPairing(task.animalId, held, it ? it.name.es : null, p.part);
        return { status: 'wrong', reason: 'tool', item: held };
      }
      var inv = o.inventory || SA.inventory;
      if (inv && inv.count && inv.count(held) < 1) return { status: 'ignored' };
      return onFeed(held, inv);
    }

    // A tray food was tapped: each right one is counted aloud ("uno, dos, tres"); anything else bounces back with a giggle.
    // `hand` (the inventory, when the food came from the player's hand) is where an accepted food is removed from.
    function onFeed(foodId, hand) {
      var res = care.feed(foodId, !!hand);
      if (hand && (res.status === 'fed' || res.status === 'done') && hand.remove) hand.remove(foodId, 1);
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

    // A story mission starts while a task is on screen: put it away quietly (no star, no miss; highlight and tray removed).
    function cancel() {
      if (!care.active()) return false;
      stopSeq();
      care.cancel();
      if (SA.picking && SA.picking.setActiveTask) SA.picking.setActiveTask(null);
      if (SA.picking && SA.picking.setRubTarget) SA.picking.setRubTarget(null);
      if (fx) { fx.scrub(0); fx.hide(); }
      vcall('hideFeed');
      return true;
    }

    return { offer: offer, active: care.active, onPick: onPick, onFeed: onFeed, replay: replay, cancel: cancel };
  }

  SA.careFlow = { NEXT_MS: NEXT_MS, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
