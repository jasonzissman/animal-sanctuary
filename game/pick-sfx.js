/* SA.pickSfx: a short "pop" for every animal / body-part pick.
 *   SA.pickSfx.install(picking?, audioGetter?) -> unsubscribe fn (no-op fn when SA.picking is missing).
 * Pure logic (no THREE/DOM). SA.audio is looked up at pick time, so a missing or throwing SA.audio is harmless.
 * The wrong-part "boing" is played by the round/care controllers (game/ui/prompt.js, game/ui/care-flow.js),
 * which are the only code that knows whether a pick was wrong; doing it here too would play it twice.
 * Rubbing a care target (many emits per drag) stays quiet here: care-flow plays its own splash for those. */
(function (root) {
  'use strict';
  var SA = root.SA;

  function install(picking, audioGetter) {
    picking = picking || SA.picking;
    if (!picking || typeof picking.onPick !== 'function') return function () {};
    audioGetter = audioGetter || function () { return SA.audio; };
    return picking.onPick(function (pick) {
      if (picking.isRubTarget && picking.isRubTarget(pick)) return;
      try {
        var audio = audioGetter();
        if (audio && typeof audio.sfx === 'function') audio.sfx('pop');
      } catch (e) { /* sound never breaks play */ }
    });
  }

  SA.pickSfx = { install: install };
})(window);
