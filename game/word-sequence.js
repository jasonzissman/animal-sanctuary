/* SA.wordSeq: pure sequencing of a feed ask spoken word by word (no THREE/DOM; loads in node:vm for tests).
 *
 *   SA.wordSeq.plan(words) -> [{ key, at, food }]   when each vocab key is spoken (ms from the start) and, for a food
 *                                                   word ('foodsg:fresa' / 'foodpl:fresa'), the food id to highlight
 *   SA.wordSeq.foodOf(key) -> food id | null
 *   SA.wordSeq.play(words, { say, later, onWord?, onEnd?, alive?, safetyMs?, pauseMs? }) -> { cancel }
 *       say(key, done) speaks a word and calls done() when it has finished (SA.audio.say's completion callback). The next
 *       word starts after done() plus a short pause, or after safetyMs if done() never comes (so it can never stall).
 *       onWord(step) fires as each word starts (to pulse its food); onEnd() after the last word; alive() is checked before
 *       each word (false = the task is over, so stop quietly); cancel() stops the rest.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var GAP = { number: 650, phrase: 450, foodsg: 900, foodpl: 900 };
  var DEFAULT_GAP = 700;
  var SAFETY_MS = 4000;   // give up waiting for one word's completion after this long
  var PAUSE_MS = 150;     // a small breath between words once the previous one has finished

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
    var safety = o.safetyMs != null ? o.safetyMs : SAFETY_MS;
    var pause = o.pauseMs != null ? o.pauseMs : PAUSE_MS;
    function ok() { return !cancelled && (!o.alive || o.alive()); }
    function next(i) {
      if (!ok()) return;
      if (i >= steps.length) { if (o.onEnd) o.onEnd(); return; }
      var advanced = false;
      function advance() {
        if (advanced) return;
        advanced = true;
        if (i + 1 < steps.length) later(function () { next(i + 1); }, pause);
        else next(i + 1);
      }
      later(advance, safety);
      if (o.onWord) o.onWord(steps[i]);
      o.say(steps[i].key, advance);
    }
    later(function () { next(0); }, 0);
    return { cancel: function () { cancelled = true; } };
  }

  SA.wordSeq = { plan: plan, play: play, foodOf: foodOf };
})(typeof window !== 'undefined' ? window : globalThis);
