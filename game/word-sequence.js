/* SA.wordSeq: pure sequencing of a feed ask spoken word by word (no THREE/DOM; loads in node:vm for tests).
 *
 *   SA.wordSeq.plan(words) -> [{ key, at, food }]   when each vocab key is spoken (ms from the start) and, for a food
 *                                                   word ('foodsg:fresa' / 'foodpl:fresa'), the food id to highlight
 *   SA.wordSeq.foodOf(key) -> food id | null
 *   SA.wordSeq.play(words, { say, later, onWord?, onEnd?, alive? }) -> { cancel }
 *       calls say(key) for each word in order via later(fn, ms); onWord(step) right after each word (to pulse its food);
 *       alive() is checked before each word (false = the task is over, so stop quietly); cancel() stops the rest.
 * Each say() interrupts the previous voice, so words are spaced out by a per-kind pause.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var GAP = { number: 650, phrase: 450, foodsg: 900, foodpl: 900 };
  var DEFAULT_GAP = 700;

  function foodOf(key) {
    var m = /^food(?:sg|pl):(.+)$/.exec(String(key));
    return m ? m[1] : null;
  }

  function plan(words) {
    var at = 0;
    return (words || []).map(function (key) {
      var step = { key: key, at: at, food: foodOf(key) };
      at += GAP[String(key).split(':')[0]] || DEFAULT_GAP;
      return step;
    });
  }

  function play(words, o) {
    var steps = plan(words), cancelled = false;
    var later = o.later;
    function ok() { return !cancelled && (!o.alive || o.alive()); }
    steps.forEach(function (step, i) {
      later(function () {
        if (!ok()) return;
        o.say(step.key);
        if (o.onWord) o.onWord(step);
        if (i === steps.length - 1 && o.onEnd) o.onEnd();
      }, step.at);
    });
    return { cancel: function () { cancelled = true; } };
  }

  SA.wordSeq = { plan: plan, play: play, foodOf: foodOf };
})(typeof window !== 'undefined' ? window : globalThis);
