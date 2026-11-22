/* SA.audio: procedural Web Audio sound effects + persistent mute (see CLAUDE.md "Audio").
 *
 * - No audio files: every effect is synthesised from oscillators and filtered noise.
 * - The AudioContext is created/resumed only on a user gesture (SA.audio.unlock(), wired by game/audio-ui.js).
 *   Before that, sfx() does nothing and never throws.
 * - Mute is stored in the save settings (SA.save, settings.muted) so it survives reloads.
 * - If Web Audio is unavailable (or anything throws), everything is a silent no-op.
 * Pure logic (no THREE/DOM): loads in node:vm for tests with a fake AudioContext.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  // Recipes: a list of voices. tone: {w: wave, f: start Hz, f2: end Hz (glide), t: start s, d: duration s, g: gain}
  // noise: {n: 1, hp/lp: filter Hz, t, d, g}. Kept as data so sounds are easy to tune.
  function arp(freqs, step, d, g, w) {
    return freqs.map(function (f, i) { return { w: w || 'sine', f: f, t: i * step, d: d, g: g }; });
  }
  var RECIPES = {
    chime: arp([880, 1318.5], 0.11, 0.5, 0.28),
    boing: [{ w: 'sine', f: 420, f2: 130, t: 0, d: 0.45, g: 0.35, wob: 18 }, { w: 'triangle', f: 210, f2: 65, t: 0, d: 0.45, g: 0.2 }],
    pop: [{ w: 'sine', f: 600, f2: 200, t: 0, d: 0.09, g: 0.35 }, { n: 1, hp: 2500, t: 0, d: 0.03, g: 0.12 }],
    splash: [{ n: 1, lp: 1800, hp: 300, t: 0, d: 0.5, g: 0.3 }, { n: 1, hp: 3000, t: 0.08, d: 0.3, g: 0.12 },
             { w: 'sine', f: 300, f2: 700, t: 0, d: 0.12, g: 0.15 }],
    fanfare: arp([523.25, 659.25, 783.99, 1046.5], 0.14, 0.3, 0.25, 'triangle')
      .concat([{ w: 'triangle', f: 1046.5, t: 0.56, d: 0.7, g: 0.25 }, { w: 'sine', f: 659.25, t: 0.56, d: 0.7, g: 0.18 },
               { w: 'sine', f: 783.99, t: 0.56, d: 0.7, g: 0.18 }]),
    giggle: [{ w: 'sine', f: 700, f2: 1100, t: 0, d: 0.09, g: 0.25 }, { w: 'sine', f: 800, f2: 1250, t: 0.1, d: 0.09, g: 0.25 },
             { w: 'sine', f: 700, f2: 1150, t: 0.2, d: 0.12, g: 0.22 }],
    sparkle: arp([1568, 2093, 2637, 3136, 4186], 0.06, 0.25, 0.14)
  };
  var NAMES = Object.keys(RECIPES);

  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var muted = null; // null = not read from the save yet
  var failed = false;

  function Ctor() { return root.AudioContext || root.webkitAudioContext || null; }
  function available() { return !failed && typeof Ctor() === 'function'; }

  function isMuted() {
    if (muted === null) {
      muted = false;
      try { muted = !!(SA.save && SA.save.get().settings.muted); } catch (e) { muted = false; }
    }
    return muted;
  }

  function applyMaster() {
    if (master && master.gain) master.gain.value = isMuted() ? 0 : 0.8;
  }

  // Callbacks run when mute turns on, so voice output (game/speech.js) can stop what is already playing.
  var muteListeners = [];
  function onMute(fn) { if (typeof fn === 'function') muteListeners.push(fn); }

  function setMuted(v) {
    muted = !!v;
    applyMaster();
    if (muted) muteListeners.forEach(function (fn) { try { fn(); } catch (e) { /* best effort */ } });
    try { if (SA.save) SA.save.update({ settings: { muted: muted } }); } catch (e) { /* best effort */ }
    return muted;
  }

  // Create/resume the context. Call only from a user-gesture handler. Returns true when sound can play.
  function unlock() {
    if (!available()) return false;
    try {
      if (!ctx) {
        var C = Ctor();
        ctx = new C();
        master = ctx.createGain();
        master.connect(ctx.destination);
        applyMaster();
      }
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        var p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
      return true;
    } catch (e) {
      failed = true; ctx = null; master = null;
      return false;
    }
  }

  function noise() {
    if (!noiseBuf) {
      var len = Math.floor(ctx.sampleRate * 1);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function envelope(node, t0, d, g) {
    var gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.linearRampToValueAtTime(g, t0 + Math.min(0.015, d / 4));
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    node.connect(gn);
    gn.connect(master);
    return gn;
  }

  function voice(v, now) {
    var t0 = now + v.t, src, out;
    if (v.n) {
      src = ctx.createBufferSource();
      src.buffer = noise();
      out = src;
      if (v.hp) { var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = v.hp; out.connect(hp); out = hp; }
      if (v.lp) { var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = v.lp; out.connect(lp); out = lp; }
    } else {
      src = ctx.createOscillator();
      src.type = v.w;
      src.frequency.setValueAtTime(v.f, t0);
      if (v.f2) src.frequency.exponentialRampToValueAtTime(v.f2, t0 + v.d);
      out = src;
      if (v.wob) { // funny wobble: a fast LFO on the pitch
        var lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = v.wob; depth.gain.value = v.f * 0.08;
        lfo.connect(depth); depth.connect(src.frequency);
        lfo.start(t0); lfo.stop(t0 + v.d + 0.05);
      }
    }
    envelope(out, t0, v.d, v.g);
    src.start(t0);
    src.stop(t0 + v.d + 0.05);
  }

  // Plays a named effect. Returns true if it was started; false (never throws) when locked, muted, unknown or unsupported.
  function sfx(name) {
    if (!ctx || !master || !RECIPES.hasOwnProperty(name) || isMuted()) return false;
    try {
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume();
      var now = ctx.currentTime;
      RECIPES[name].forEach(function (v) { voice(v, now); });
      return true;
    } catch (e) {
      return false;
    }
  }

  SA.audio = {
    NAMES: NAMES,
    sfx: sfx,
    unlock: unlock,
    isUnlocked: function () { return !!ctx; },
    isAvailable: available,
    isMuted: isMuted,
    setMuted: setMuted,
    onMute: onMute,
    toggleMute: function () { return setMuted(!isMuted()); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
