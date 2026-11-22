/* SA.audio.say(keyOrText): speak a Spanish word or phrase. Pure logic (no THREE/DOM); loads in node:vm for tests.
 *
 * Order: (1) a vocab key (game/data/vocab.js) with a clip -> play the clip; (2) otherwise speechSynthesis with
 * the best Spanish voice (es-MX, es-US, es-ES, any es-*) at a slightly slower rate; (3) otherwise do nothing
 * (the text is already on screen). Muted -> silent. Never throws. Returns 'clip' | 'speech' | null.
 * say(keyOrText, done?): the optional done() fires exactly once, when the clip ends or the utterance ends/errors, or
 * at once when nothing will play (muted, empty, no audio). A voice stopped by stopVoice() or replaced by a newer
 * say() may never report back, so callers that chain words keep a safety timeout (SA.wordSeq).
 * Needs SA.audio (game/audio.js) loaded first; SA.vocab is optional.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var RATE = 0.85;
  var PREFERRED = ['es-mx', 'es-us', 'es-es'];

  // Best Spanish voice from a list of { lang, localService } (or null when none is Spanish).
  function pickVoice(voices) {
    var best = null, bestScore = -1;
    (voices || []).forEach(function (v) {
      var lang = String((v && v.lang) || '').toLowerCase().replace('_', '-');
      if (lang.indexOf('es') !== 0 || (lang.length > 2 && lang.charAt(2) !== '-')) return;
      var rank = PREFERRED.indexOf(lang);
      var score = (rank >= 0 ? 10 - rank : 1) * 2 + (v.localService ? 1 : 0);
      if (score > bestScore) { best = v; bestScore = score; }
    });
    return best;
  }

  var currentClip = null;

  // Stops any clip or utterance that is playing right now. Never throws; fine without speechSynthesis.
  function stopVoice() {
    try {
      if (currentClip) {
        var a = currentClip;
        currentClip = null;
        if (typeof a.pause === 'function') a.pause();
      }
    } catch (e) { /* best effort */ }
    try {
      var synth = root.speechSynthesis;
      if (synth && typeof synth.cancel === 'function') synth.cancel();
    } catch (e) { /* best effort */ }
  }

  // A clip that fails to load/decode (e.g. file missing) is replaced by speechSynthesis of `text`, unless
  // the browser merely blocked autoplay (NotAllowedError) or the clip was stopped/replaced meanwhile.
  function playClip(path, text, finish) {
    try {
      if (typeof root.Audio !== 'function') return false;
      var a = new root.Audio(path);
      currentClip = a;
      var fell = false;
      var fallback = function () {
        if (fell || currentClip !== a) return;
        fell = true;
        if (!speak(text, finish)) finish();
      };
      a.onended = finish;
      a.onerror = fallback;
      var p = a.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function (e) { if (!e || e.name !== 'NotAllowedError') fallback(); else finish(); });
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function speak(text, finish) {
    try {
      var synth = root.speechSynthesis;
      if (!synth || typeof root.SpeechSynthesisUtterance !== 'function' || typeof synth.speak !== 'function') return false;
      var u = new root.SpeechSynthesisUtterance(text);
      var voice = pickVoice(typeof synth.getVoices === 'function' ? synth.getVoices() : []);
      u.lang = voice ? voice.lang : 'es-MX';
      if (voice) u.voice = voice;
      u.rate = RATE;
      if (finish) { u.onend = finish; u.onerror = finish; }
      if (typeof synth.cancel === 'function') synth.cancel();   // never queue up a backlog of old words
      synth.speak(u);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Wraps done so it runs at most once and never throws into the audio code.
  function once(done) {
    var fired = false;
    return function () {
      if (fired) return;
      fired = true;
      if (typeof done !== 'function') return;
      try { done(); } catch (e) { /* a callback never breaks speech */ }
    };
  }

  function say(keyOrText, done) {
    var finish = once(done), result = null;
    try {
      if (typeof keyOrText === 'string' && keyOrText.trim() && !SA.audio.isMuted()) {
        var entry = SA.vocab && SA.vocab.get(keyOrText);
        if (entry && entry.clip && playClip(entry.clip, entry.es, finish)) result = 'clip';
        else if (speak(entry ? entry.es : keyOrText, finish)) result = 'speech';
      }
    } catch (e) {
      result = null;
    }
    if (!result) finish();
    return result;
  }

  SA.audio.say = say;
  SA.audio.stopVoice = stopVoice;
  if (typeof SA.audio.onMute === 'function') SA.audio.onMute(stopVoice);
  SA.audio.pickVoice = pickVoice;
})(typeof window !== 'undefined' ? window : globalThis);
