/* SA.unlockFlow: what the player sees and hears when an easter-egg animal unlocks (no THREE calls; testable with plain
 * objects). Logic of WHEN to unlock lives in SA.unlocks; this only celebrates.
 *
 *   var flow = SA.unlockFlow.create({ group, fx?, celebrate?, audio?, later? })
 *     group      the 'animals' Group from buildAnimals (its hidden easter-egg child is made visible)
 *     fx         SA.render.createRoundFx (plays a boing on the new friend)
 *     celebrate  function (message) -> toast + confetti
 *     rig        optional camera rig ({ glideTo }): turns the player (and the chase camera behind them) toward the new animal
 *   flow.reveal(animal) -> boolean   sparkle fanfare, the creature appears and boings, its name is spoken.
 * After this the animal is in the clue rotation (SA.round) and can be picked for care like any other.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var SAY_DELAY_MS = 1300;     // let the fanfare finish before the name is spoken

  // Thin helper: the ground point to turn toward for this animal group, or null when there is nothing to face.
  function focusTarget(group, rig) {
    if (!group || !group.position || !rig || typeof rig.glideTo !== 'function') return null;
    var x = group.position.x, z = group.position.z;
    if (typeof x !== 'number' || typeof z !== 'number' || x !== x || z !== z) return null;
    return { x: x, z: z };
  }

  function create(o) {
    var audio = o.audio || SA.audio;
    var later = o.later || function (fn, ms) { return typeof root.setTimeout === 'function' ? root.setTimeout(fn, ms) : null; };
    function sfx(name) { try { if (audio && audio.sfx) audio.sfx(name); } catch (e) { /* silent */ } }

    // Turn the player (and so the chase camera behind them) toward the new friend; the camera never leaves the player.
    function faceTo(g) {
      try {
        var t = focusTarget(g, o.rig);
        if (t) o.rig.glideTo(t.x, t.z);
      } catch (e) { /* the camera never breaks the reveal */ }
    }

    function reveal(animal) {
      var g = o.group && (SA.render && SA.render.instances ? SA.render.instances.get(o.group, animal.id) : o.group.getObjectByName(animal.id));
      if (!g) return false;
      g.visible = true;
      faceTo(g);
      sfx('fanfare');
      sfx('sparkle');
      if (o.fx) o.fx.play(animal.id, 'boing');
      var icon = animal.icon || '🐾';
      if (o.celebrate) o.celebrate('✨ ' + icon + ' ' + (SA.vocab && SA.vocab.get('animal:' + animal.id) ? SA.vocab.get('animal:' + animal.id).es : animal.name.es) + ' ✨');
      later(function () { try { if (audio && audio.say) audio.say('animal:' + animal.id); } catch (e) { /* silent */ } }, SAY_DELAY_MS);
      return true;
    }

    return { reveal: reveal };
  }

  SA.unlockFlow = { create: create, focusTarget: focusTarget };
})(typeof window !== 'undefined' ? window : globalThis);
