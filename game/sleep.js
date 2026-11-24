/* SA.sleep: who is awake and who is asleep (AS-0171; pure, no THREE, no DOM; unit-tested in node:vm).
 *
 * Every real animal has `active: 'day' | 'night'` in its data (default 'day'). A day animal is awake in the day and the dawn and dozes off at
 * dusk; a night animal (búho, murciélago) is awake from dusk through the night and sleeps from dawn through the day. Story animals, easter
 * eggs and anything a mission has pinned never sleep (a mission is never cut off by the clock).
 *
 *   SA.sleep.activeOf(animal)            'day' | 'night'
 *   SA.sleep.isAsleep(animal, phase?)    by schedule alone (phase defaults to the shared SA.daynight clock; no clock = day)
 *   SA.sleep.awake(list, phase?)         the animals (data objects) that are awake; strict, may be empty (encounters)
 *   SA.sleep.awakeOr(list, phase?)       the same, but the whole list when nobody would be awake (clues and missions never run dry)
 *   SA.sleep.set(id, asleep) / SA.sleep.asleep(id)   the renderer reports each instance ('conejo#2') it has put to bed; picking asks
 *   SA.sleep.cue()                       { icon, es, key }: the gentle '¡Shh! Está durmiendo'
 *   SA.sleep.disturb(id)                 using a sleeper: yawn + the cue spoken (throttled); it stays asleep. Returns the cue.
 *   SA.sleep.ease(amount, asleep, dt)    0..1 lying-down amount, eased (~0.7 s)
 *   SA.sleep.zPose(t, i, n)              { y, scale, alpha } of the i-th of n floating Z letters at time t (s)
 *   SA.sleep.snoreStep(state, dist, dt)  -> { state, play, volume }: a soft snore every ~4 s while within SNORE_RANGE of a sleeper
 * Telemetry: 'sleep.shh' { animalId }.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  var ACTIVE = ['day', 'night'];
  var EASE_RATE = 1.5, Z_CYCLE = 3.2, SNORE_EVERY = 4, SNORE_RANGE = 7, SNORE_GAIN = 0.22, CUE_MS = 1800;
  var states = {}, listeners = [], lastSaid = -Infinity;

  function activeOf(a) { return a && a.active === 'night' ? 'night' : 'day'; }

  function currentPhase() {
    try { return SA.daynight && SA.daynight.instance ? SA.daynight.instance().phase() : 'day'; } catch (e) { return 'day'; }
  }

  function sleepsAt(animal, phase) {
    var dark = phase === 'dusk' || phase === 'night';
    return (activeOf(animal) === 'night') === !dark;   // a night animal sleeps in the light, a day animal in the dark
  }

  function isAsleep(animal, phase) {
    if (!animal || animal.story || animal.easterEgg) return false;
    return sleepsAt(animal, phase || currentPhase());
  }

  function resolve(a) { return typeof a === 'string' && SA.data ? SA.data.get('animals', a) : a; }

  function awake(list, phase) {
    var ph = phase || currentPhase();
    return (list || []).filter(function (a) { var d = resolve(a); return d && !isAsleep(d, ph); });
  }

  function awakeOr(list, phase) {
    var ok = awake(list, phase);
    return ok.length ? ok : (list || []);
  }

  function set(id, asleep) { if (asleep) states[id] = true; else delete states[id]; }
  function asleep(id) { return !!states[id]; }

  function cue() { return { icon: '😴', es: '¡Shh! Está durmiendo', key: 'phrase:shh' }; }

  function disturb(id, now) {
    var c = cue(), t = typeof now === 'number' ? now : Date.now();
    try { if (root.SAT && root.SAT.track) root.SAT.track('sleep.shh', { animalId: String(id).split('#')[0] }); } catch (e) { /* telemetry never breaks play */ }
    if (t - lastSaid >= CUE_MS) {
      lastSaid = t;
      try { if (SA.audio && SA.audio.sfx) SA.audio.sfx('yawn', 0.5); } catch (e) { /* sound is best effort */ }
      try { if (SA.audio && SA.audio.say) SA.audio.say(c.key); } catch (e) { /* speech is best effort */ }
    }
    listeners.slice().forEach(function (cb) { try { cb(id, c); } catch (e) { /* a listener never breaks play */ } });
    return c;
  }

  function onDisturb(cb) {
    if (typeof cb !== 'function') return function () {};
    listeners.push(cb);
    return function () { var i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
  }

  function ease(amount, toSleep, dt) {
    var step = EASE_RATE * Math.min(Math.max(dt || 0, 0), 0.1);
    var to = toSleep ? 1 : 0;
    return amount < to ? Math.min(to, amount + step) : Math.max(to, amount - step);
  }

  function zPose(t, i, n) {
    var u = (((t / Z_CYCLE) + i / n) % 1 + 1) % 1;
    return { y: u * 1.3, scale: 0.6 + 0.5 * u, alpha: Math.pow(Math.sin(Math.PI * u), 0.7) };
  }

  function snoreStep(state, dist, dt) {
    var s = { t: state && typeof state.t === 'number' ? state.t : SNORE_EVERY * 0.5 };
    if (!(dist <= SNORE_RANGE)) return { state: s, play: false, volume: 0 };
    s.t += Math.max(0, dt || 0);
    if (s.t < SNORE_EVERY) return { state: s, play: false, volume: 0 };
    s.t = 0;
    return { state: s, play: true, volume: SNORE_GAIN * (1 - dist / SNORE_RANGE) };
  }

  SA.sleep = {
    ACTIVE: ACTIVE, SNORE_RANGE: SNORE_RANGE, SNORE_EVERY: SNORE_EVERY, Z_CYCLE: Z_CYCLE,
    activeOf: activeOf, isAsleep: isAsleep, awake: awake, awakeOr: awakeOr, set: set, asleep: asleep, cue: cue,
    disturb: disturb, onDisturb: onDisturb, ease: ease, zPose: zPose, snoreStep: snoreStep
  };
})(typeof window !== 'undefined' ? window : globalThis);
