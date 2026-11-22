/* SA.unlockFlow: what the player sees and hears when an easter-egg animal unlocks (no THREE calls; testable with plain
 * objects). Logic of WHEN to unlock lives in SA.unlocks; this only celebrates.
 *
 *   var flow = SA.unlockFlow.create({ group, fx?, celebrate?, audio?, later? })
 *     group      the 'animals' Group from buildAnimals (its hidden easter-egg child is made visible)
 *     fx         SA.render.createRoundFx (plays a boing on the new friend)
 *     celebrate  function (message) -> toast + confetti
 *   flow.reveal(animal) -> boolean   sparkle fanfare, the creature appears and boings, its name is spoken.
 * After this the animal is in the clue rotation (SA.round) and can be picked for care like any other.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var SAY_DELAY_MS = 1300;     // let the fanfare finish before the name is spoken

  function create(o) {
    var audio = o.audio || SA.audio;
    var later = o.later || function (fn, ms) { return typeof root.setTimeout === 'function' ? root.setTimeout(fn, ms) : null; };
    function sfx(name) { try { if (audio && audio.sfx) audio.sfx(name); } catch (e) { /* silent */ } }

    function reveal(animal) {
      var g = o.group && o.group.getObjectByName(animal.id);
      if (!g) return false;
      g.visible = true;
      sfx('fanfare');
      sfx('sparkle');
      if (o.fx) o.fx.play(animal.id, 'boing');
      var icon = (SA.prompt && SA.prompt.ICONS && SA.prompt.ICONS[animal.id]) || '🐾';
      if (o.celebrate) o.celebrate('✨ ' + icon + ' ' + (SA.vocab && SA.vocab.get('animal:' + animal.id) ? SA.vocab.get('animal:' + animal.id).es : animal.name.es) + ' ✨');
      later(function () { try { if (audio && audio.say) audio.say('animal:' + animal.id); } catch (e) { /* silent */ } }, SAY_DELAY_MS);
      return true;
    }

    return { reveal: reveal };
  }

  SA.unlockFlow = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
