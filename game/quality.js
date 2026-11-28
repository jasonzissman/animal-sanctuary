/* SA.quality (AS-0412): the graphics quality level, driven by measured fps. Pure logic: no THREE, no DOM, no clock.
 *
 * A discrete level ('low' | 'medium' | 'high', start 'high' = how the game always looked). Feed it fps samples, each about a second of play:
 *   SA.quality.sample(fps, hidden, seconds)  - one measured fps; hidden-tab samples are skipped (a throttled tab says nothing)
 *   SA.quality.frame(dt, hidden)             - per-frame helper: folds frame times into 1 s samples (no allocation) and calls sample()
 * It settles for the first seconds (shader compiles, texture uploads), then averages the last WINDOW samples (a ring buffer):
 *   - steps DOWN one level when that average is under DOWN_FPS (40);
 *   - steps UP one level only when it stays above UP_FPS (55) for UP_SUSTAIN_S, and not within UP_COOLDOWN_S of the last change.
 * 40..55 is a dead band, every change has a cooldown, and an up-step that is undone by a down-step within FLIP_S makes that higher level
 * off-limits for auto-raising, so the level never flip-flops. pin(level) overrides auto changes (pin(null) hands control back).
 * onChange(fn) calls fn({ from, to, fps, params, pinned }); the renderer applies params(); scene.js tracks 'quality.change'.
 * Time is only the sum of the `seconds` passed in, so tests need no fake clock.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var LEVELS = ['low', 'medium', 'high'];
  // grass: density multiplier for grass/clutter; shadow: shadow map size (px); fogFar: draw distance; pixelRatio: renderer cap.
  var PARAMS = {
    low:    { grass: 0.4, shadow: 512,  fogFar: 90,  pixelRatio: 1 },
    medium: { grass: 0.7, shadow: 1024, fogFar: 120, pixelRatio: 1.5 },
    high:   { grass: 1,   shadow: 2048, fogFar: 150, pixelRatio: 2 },
  };
  var CFG = {
    DOWN_FPS: 40, UP_FPS: 55,
    SETTLE_S: 2,          // samples in the first seconds are ignored
    WINDOW: 4,            // samples averaged
    DOWN_COOLDOWN_S: 8,   // after any change, no step down before this
    UP_COOLDOWN_S: 30,    // after any change, no step up before this
    UP_SUSTAIN_S: 20,     // the average must stay above UP_FPS this long
    FLIP_S: 60,           // a down-step this soon after an up-step bans that higher level from auto-raising
  };

  var level = 'high', idx = LEVELS.length - 1, ceiling = idx, pinned = null;
  var ring = [0, 0, 0, 0], head = 0, count = 0, sum = 0;
  var elapsed = 0, sinceChange = 1e9, upRun = 0, lastUpAt = -1e9;   // the cooldowns only apply after a real change
  var accT = 0, accN = 0;
  var listeners = [];

  function clearWindow() { head = 0; count = 0; sum = 0; upRun = 0; }

  function change(to, fps, isPin) {
    if (to === level) return false;
    var info = { from: level, to: to, fps: Math.round(fps * 10) / 10, params: PARAMS[to], pinned: !!isPin };
    level = to; idx = LEVELS.indexOf(to);
    sinceChange = 0; clearWindow();
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](info); } catch (e) { /* a listener never breaks the loop */ } }
    return true;
  }

  function avg() { return count ? sum / count : 0; }

  function sample(fps, hidden, seconds) {
    if (hidden || !(fps > 0)) return;
    var s = seconds > 0 ? seconds : 1;
    elapsed += s; sinceChange += s;
    if (elapsed <= CFG.SETTLE_S) return;
    if (count === CFG.WINDOW) sum -= ring[head]; else count++;
    ring[head] = fps; sum += fps; head = (head + 1) % CFG.WINDOW;
    if (pinned || count < CFG.WINDOW) return;
    var a = avg();
    if (a < CFG.DOWN_FPS) {
      upRun = 0;
      if (idx > 0 && sinceChange >= CFG.DOWN_COOLDOWN_S) {
        if (elapsed - lastUpAt < CFG.FLIP_S) ceiling = Math.min(ceiling, idx - 1);   // raising it again just made it slow: stay down
        change(LEVELS[idx - 1], a);
      }
    } else if (a > CFG.UP_FPS) {
      upRun += s;
      if (upRun >= CFG.UP_SUSTAIN_S && sinceChange >= CFG.UP_COOLDOWN_S && idx < Math.min(LEVELS.length - 1, ceiling)) {
        lastUpAt = elapsed;
        change(LEVELS[idx + 1], a);
      }
    } else upRun = 0;   // the dead band 40..55 resets the sustain run
  }

  // Folds per-frame times into one-second samples: no allocation. A hidden frame drops the partial second.
  function frame(dt, hidden) {
    if (hidden) { accT = 0; accN = 0; return; }
    if (!(dt > 0)) return;
    accT += dt; accN++;
    if (accT >= 1) { var f = accN / accT, t = accT; accT = 0; accN = 0; sample(f, false, t); }
  }

  SA.quality = {
    LEVELS: LEVELS,
    PARAMS: PARAMS,
    CONFIG: CFG,
    level: function () { return level; },
    /** The params table row for a level (default: the current one). */
    params: function (l) { return PARAMS[l || level]; },
    average: avg,
    isPinned: function () { return pinned !== null; },
    sample: sample,
    frame: frame,
    /** pin('low'|'medium'|'high') holds that level and stops auto changes; pin(null) resumes auto from the current level. */
    pin: function (l) {
      if (l === null || l === undefined) { pinned = null; sinceChange = 0; clearWindow(); return level; }
      if (LEVELS.indexOf(l) < 0) return level;
      pinned = l;
      change(l, avg(), true);
      return level;
    },
    /** onChange(fn): fn({ from, to, fps, params, pinned }) after every change. Returns an unsubscribe function. */
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
