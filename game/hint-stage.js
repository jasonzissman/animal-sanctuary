/* SA.hintStage: pure decision of which Scout & Spot hint stage to show next (no THREE, no DOM; unit-tested in node:vm).
 *
 * Stages (what the child sees):  1 = the animal's silhouette,  2 = the target's biome glows on the ground.
 * Beginner (level <= 1) already sees the silhouette from the start, so its only extra help is stage 2.
 * Higher levels get stage 1 after the delay and stage 2 one delay later.
 *
 *   SA.hintStage.next(level, seconds, hintsUsed) -> 0 | 1 | 2
 *       level      scaffold level (1 = beginner)
 *       seconds    elapsed seconds on the round with no correct pick
 *       hintsUsed  hint stages already shown this round (0..2); beginner starts at 1 because the silhouette is up
 *       Returns the stage to show now, or 0 for nothing yet. Never fails a round and never penalises.
 *   SA.hintStage.initial(level) -> hint stages already shown when a round starts (1 for beginner, else 0)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var DELAY_SECONDS = 20;     // matches SA.prompt.AUTO_HINT_MS
  var MAX_STAGE = 2;

  function initial(level) { return typeof level === 'number' && level > 1 ? 0 : 1; }

  function next(level, seconds, hintsUsed) {
    var used = typeof hintsUsed === 'number' && hintsUsed > 0 ? Math.floor(hintsUsed) : 0;
    if (used >= MAX_STAGE) return 0;
    used = Math.max(used, initial(level));            // beginner always counts the silhouette as shown
    if (used >= MAX_STAGE) return 0;
    var stage = used + 1;
    var beginner = initial(level) === 1;
    var due = DELAY_SECONDS * (beginner ? 1 : stage);
    return typeof seconds === 'number' && seconds >= due ? stage : 0;
  }

  SA.hintStage = { DELAY_SECONDS: DELAY_SECONDS, MAX_STAGE: MAX_STAGE, initial: initial, next: next };
})(typeof window !== 'undefined' ? window : globalThis);
