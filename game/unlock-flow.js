/* SA.unlockFlow: what the player sees and hears when an easter-egg animal unlocks (no THREE calls; testable with plain
 * objects). Logic of WHEN to unlock lives in SA.unlocks; this only celebrates.
 *
 *   var flow = SA.unlockFlow.create({ group, fx?, celebrate?, audio?, later? })
 *     group      the 'animals' Group from buildAnimals (its hidden easter-egg child is made visible)
 *     fx         SA.render.createRoundFx (plays a boing on the new friend)
 *     celebrate  function (message) -> toast + confetti
 *     rig        optional camera rig ({ focusOn, release, getState }): eases to the new animal for ~1.5 s, then hands control back
 *   flow.reveal(animal) -> boolean   sparkle fanfare, the creature appears and boings, its name is spoken.
 * After this the animal is in the clue rotation (SA.round) and can be picked for care like any other.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var SAY_DELAY_MS = 1300;     // let the fanfare finish before the name is spoken
  var PAN_MS = 1500;           // how long the camera stays on the new friend before the child has control again

  // Thin helper: where should the camera go for this animal group? null when there is nothing to focus on.
  function focusTarget(group, rig) {
    if (!group || !group.position || !rig || typeof rig.focusOn !== 'function') return null;
    var x = group.position.x, z = group.position.z;
    if (typeof x !== 'number' || typeof z !== 'number' || x !== x || z !== z) return null;
    var st = typeof rig.getState === 'function' ? rig.getState() : null;
    return { x: x, z: z, dist: st && typeof st.dist === 'number' ? st.dist : undefined };   // keep the current zoom
  }

  function create(o) {
    var audio = o.audio || SA.audio;
    var later = o.later || function (fn, ms) { return typeof root.setTimeout === 'function' ? root.setTimeout(fn, ms) : null; };
    function sfx(name) { try { if (audio && audio.sfx) audio.sfx(name); } catch (e) { /* silent */ } }

    function panTo(g) {
      try {
        var t = focusTarget(g, o.rig);
        if (!t) return;
        o.rig.focusOn(t.x, t.z, t.dist);
        later(function () { try { if (o.rig.release) o.rig.release(); } catch (e) { /* silent */ } }, PAN_MS);
      } catch (e) { /* the camera never breaks the reveal */ }
    }

    function reveal(animal) {
      var g = o.group && o.group.getObjectByName(animal.id);
      if (!g) return false;
      g.visible = true;
      panTo(g);
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

  SA.unlockFlow = { create: create, focusTarget: focusTarget, PAN_MS: PAN_MS };
})(typeof window !== 'undefined' ? window : globalThis);
