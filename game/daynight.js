/* SA.daynight: the day/night clock (AS-0170; pure, no THREE, no DOM; unit-tested in node:vm). The renderer (render/daynight.js) and the
 * station bed only read it.
 *
 * One cycle is day -> dusk -> night -> dawn, lengths in milliseconds (data constants, SA.daynight.DAY_MS / DUSK_MS / NIGHT_MS / DAWN_MS):
 * a ~7 minute day, 45 s of dusk, 2.5 minutes of night and 45 s of dawn (~11 minutes in all). Time `t` is ms into the cycle (0 = the start of day).
 *
 *   SA.daynight.create({ t?, track? }) -> a clock (SA.daynight.instance() is the shared one, restored from the save):
 *       update(dt)     dt in seconds: advance the clock, fire onPhase listeners on every phase change, save the time every few seconds
 *       time()         ms into the cycle
 *       phase()        'day' | 'dusk' | 'night' | 'dawn'
 *       light()        0..1 how bright the world is: 1 by day, falls through dusk to MIN_LIGHT (0.3, so night is always readable), rises again in dawn
 *       dark()         0..1 how night-like it is (0 day, 1 night): the sky, stars, moon, fireflies and lamps follow this
 *       isNight()      true in dusk's last half, the night and dawn's first half (what badges mean by "at night")
 *       sun()          { up, x, y } the sun's place on its arc: x -1 (east, rising) .. 1 (west, setting), y 0..1 height; up false at night
 *       moon()         { up, x, y } the same for the moon (up from dusk through dawn)
 *       sleep()        in the dusk or the night: jump to the start of dawn (the morning); false by day or in the dawn (nothing to sleep through)
 *       onPhase(fn)    fn({ from, to }) on every change (also after sleep()); returns an unsubscribe function
 *   SA.daynight.phaseAt(t), lightAt(t), darkAt(t), CYCLE_MS: the same maths for any time.
 * Saved as save.daynight = { t } (ms, optional); a bad or missing value starts the game in the morning of a day. Telemetry: 'daynight.phase', 'daynight.sleep'.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  var DAY_MS = 420000, DUSK_MS = 45000, NIGHT_MS = 150000, DAWN_MS = 45000;
  var CYCLE_MS = DAY_MS + DUSK_MS + NIGHT_MS + DAWN_MS;
  var MIN_LIGHT = 0.3;          // night is dim but always readable for kids
  var START_MS = 30000;         // a new game begins a little after the sun came up
  var SAVE_EVERY_MS = 5000;
  var DUSK_AT = DAY_MS, NIGHT_AT = DAY_MS + DUSK_MS, DAWN_AT = NIGHT_AT + NIGHT_MS;

  function wrap(t) { t = t % CYCLE_MS; return t < 0 ? t + CYCLE_MS : t; }
  function smooth(u) { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); }

  function phaseAt(t) {
    t = wrap(t);
    return t < DUSK_AT ? 'day' : t < NIGHT_AT ? 'dusk' : t < DAWN_AT ? 'night' : 'dawn';
  }
  /** 0 by day .. 1 at night, easing through dusk and dawn. */
  function darkAt(t) {
    t = wrap(t);
    if (t < DUSK_AT) return 0;
    if (t < NIGHT_AT) return smooth((t - DUSK_AT) / DUSK_MS);
    if (t < DAWN_AT) return 1;
    return 1 - smooth((t - DAWN_AT) / DAWN_MS);
  }
  function lightAt(t) { return 1 - darkAt(t) * (1 - MIN_LIGHT); }
  function nightAt(t) { t = wrap(t); return t >= DUSK_AT + DUSK_MS / 2 && t < DAWN_AT + DAWN_MS / 2; }

  // The sun climbs from the start of dawn to the end of dusk (so it is low, then high, then low and orange); the moon from the start of
  // dusk to the end of dawn. u runs 0..1 along the arc; x is east -> west, y is the height.
  function arc(u) { return { up: true, x: -Math.cos(Math.PI * u), y: Math.sin(Math.PI * u) }; }
  function sunAt(t) {
    t = wrap(t);
    if (t >= NIGHT_AT && t < DAWN_AT) return { up: false, x: 1, y: 0 };
    return arc((t >= DAWN_AT ? t - DAWN_AT : t + DAWN_MS) / (DAWN_MS + DAY_MS + DUSK_MS));
  }
  function moonAt(t) {
    t = wrap(t);
    var span = DUSK_MS + NIGHT_MS + DAWN_MS;
    return t >= DUSK_AT ? arc((t - DUSK_AT) / span) : { up: false, x: 1, y: 0 };
  }

  function create(opts) {
    opts = opts || {};
    var t = typeof opts.t === 'number' && isFinite(opts.t) ? wrap(opts.t) : START_MS;
    var last = phaseAt(t), listeners = [], sinceSave = 0;

    function track(type, fields) {
      try { if (opts.track) opts.track(type, fields); else if (root.SAT && root.SAT.track) root.SAT.track(type, fields); } catch (e) { /* telemetry never breaks play */ }
    }
    function save() { try { if (opts.save !== false && SA.save && SA.save.update) SA.save.update({ daynight: { t: Math.round(t) } }); } catch (e) { /* saving never breaks play */ } }
    function check() {
      var now = phaseAt(t);
      if (now === last) return;
      var ev = { from: last, to: now };
      last = now;
      track('daynight.phase', { phase: now });
      listeners.slice().forEach(function (fn) { try { fn(ev); } catch (e) { /* a listener never breaks the clock */ } });
    }

    return {
      update: function (dt) {
        if (!(dt > 0) || !isFinite(dt)) return;
        t = wrap(t + dt * 1000);
        check();
        sinceSave += dt * 1000;
        if (sinceSave >= SAVE_EVERY_MS) { sinceSave = 0; save(); }
      },
      time: function () { return t; },
      phase: function () { return last; },
      light: function () { return lightAt(t); },
      dark: function () { return darkAt(t); },
      isNight: function () { return nightAt(t); },
      sun: function () { return sunAt(t); },
      moon: function () { return moonAt(t); },
      sleep: function () {
        var p = phaseAt(t);
        if (p !== 'dusk' && p !== 'night') return false;
        t = DAWN_AT;
        track('daynight.sleep', {});
        check();
        save();
        return true;
      },
      onPhase: function (fn) {
        if (typeof fn !== 'function') return function () {};
        listeners.push(fn);
        return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
      },
      save: save
    };
  }

  var shared = null;
  /** The one clock of the game, restored from the save the first time it is asked for. */
  function instance() {
    if (!shared) {
      var saved = null;
      try { var s = SA.save && SA.save.get(); saved = s && s.daynight && s.daynight.t; } catch (e) { saved = null; }
      shared = create({ t: saved });
    }
    return shared;
  }

  SA.daynight = {
    DAY_MS: DAY_MS, DUSK_MS: DUSK_MS, NIGHT_MS: NIGHT_MS, DAWN_MS: DAWN_MS, CYCLE_MS: CYCLE_MS, MIN_LIGHT: MIN_LIGHT, START_MS: START_MS,
    create: create, instance: instance, phaseAt: phaseAt, lightAt: lightAt, darkAt: darkAt,
    isNight: function () { return shared ? shared.isNight() : false; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
