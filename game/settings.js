/* SA.settings: grown-up settings logic (pure; no THREE, no DOM; unit-tested in node:vm). Needs SA.save.
 *
 *   SA.settings.DIFFICULTIES      ['auto','beginner','intermediate','challenge']
 *   SA.settings.get()             -> { english, difficulty, muted }
 *   SA.settings.setEnglish(on)    persists settings.english (default off)
 *   SA.settings.setDifficulty(d)  persists settings.difficulty. 'auto' lets SA.scaffold adapt; the others pin
 *                                 settings.scaffold to 1/2/3 and stop auto adaptation. Unknown values are ignored.
 *   SA.settings.setMuted(on)      via SA.audio when present (keeps the Web Audio master gain in sync), else the save
 *   SA.settings.resetProgress()   back to a fresh save but KEEPS the grown-up settings; returns the new save
 *   SA.settings.feedbackContext() -> { level, stars, round } for SAT.feedback
 *   SA.settings.sendFeedback(text, kind?) -> event | null (empty text sends nothing)
 *   SA.settings.createHold({ ms?, onOpen, setTimer?, clearTimer? }) -> { down(), up(), cancel() }
 *       Press-and-hold gate: onOpen fires only if the press lasts `ms` (default 1500). A quick tap does nothing.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var DIFFICULTIES = ['auto', 'beginner', 'intermediate', 'challenge'];
  var HOLD_MS = 1500;

  function difficultyOf(s) {
    return s && DIFFICULTIES.indexOf(s.difficulty) >= 0 ? s.difficulty : 'auto';
  }

  function get() {
    var s = SA.save.get().settings;
    return { english: !!s.english, difficulty: difficultyOf(s), muted: !!s.muted };
  }

  function setEnglish(on) { SA.save.update({ settings: { english: !!on } }); return !!on; }

  function setDifficulty(d) {
    var i = DIFFICULTIES.indexOf(d);
    if (i < 0) return false;
    var patch = { difficulty: d };
    if (i > 0) patch.scaffold = i;          // beginner=1, intermediate=2, challenge=3
    SA.save.update({ settings: patch });
    return true;
  }

  function setMuted(on) {
    if (SA.audio && SA.audio.setMuted) return SA.audio.setMuted(!!on);
    SA.save.update({ settings: { muted: !!on } });
    return !!on;
  }

  function resetProgress() {
    var keep = SA.save.get().settings;
    SA.save.reset();
    SA.save.update({ settings: keep });
    SA.save.flush();
    return SA.save.get();
  }

  function feedbackContext() {
    var s = SA.save.get();
    return { level: s.settings.scaffold, stars: s.stars, round: s.rounds.completed };
  }

  function sendFeedback(text, kind) {
    var t = String(text == null ? '' : text).trim();
    if (!t || !root.SAT || !root.SAT.feedback) return null;
    return root.SAT.feedback(t, kind || 'feedback', feedbackContext());
  }

  function createHold(o) {
    o = o || {};
    var ms = typeof o.ms === 'number' ? o.ms : HOLD_MS;
    var set = o.setTimer || function (fn, t) { return root.setTimeout(fn, t); };
    var clear = o.clearTimer || function (h) { root.clearTimeout(h); };
    var handle = null;
    function cancel() { if (handle !== null) { clear(handle); handle = null; } }
    return {
      down: function () {
        cancel();
        handle = set(function () { handle = null; if (o.onOpen) o.onOpen(); }, ms);
      },
      up: cancel,
      cancel: cancel
    };
  }

  SA.settings = {
    DIFFICULTIES: DIFFICULTIES, HOLD_MS: HOLD_MS, get: get, setEnglish: setEnglish, setDifficulty: setDifficulty,
    setMuted: setMuted, resetProgress: resetProgress, feedbackContext: feedbackContext, sendFeedback: sendFeedback,
    createHold: createHold
  };
})(typeof window !== 'undefined' ? window : globalThis);
