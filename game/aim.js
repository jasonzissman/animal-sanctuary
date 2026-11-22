/* SA.aim: pure forgiving-aim target selection (no THREE, no DOM; unit-tested in node:vm).
 *
 *   SA.aim.nearest(pointer, candidates, opts?) -> { candidate, dist } | null
 *       pointer     { x, y } in screen px (the mouse, a tap, or the screen centre for keyboard/touch play)
 *       candidates  [{ id, x, y, r?, direct? }] projected in-reach parts: x,y screen px, r = on-screen radius of the part
 *                   (up to SLACK_MAX of it is forgiven, so a big part is easier to hit), direct = the pointer is exactly over
 *                   the part's pick volume (distance 0, an exact hit always wins)
 *       opts        { radius?, touch? }  the acquire radius (default RADIUS px, times TOUCH_SCALE for touch)
 *       Nearest candidate within the radius; ties go to the direct hit, then the smaller part (feet beat the body around them).
 *   SA.aim.create(opts?) -> aim: a sticky target with hysteresis so the highlight does not flicker
 *       aim.update(pointer, candidates, { touch? }) -> the current candidate | null
 *           A new target must be inside the radius. The current target is kept while it is still a candidate and within
 *           LEAVE x radius, unless another candidate is closer than SWITCH x its distance. Nobody close = no target.
 *       aim.target() -> the current candidate | null;  aim.clear()
 *   SA.aim.partsActive(animalId, careTask) -> bool (AS-0128): body parts are individually aimable (glow, chip, name speech) ONLY while a
 *       care/help task (SA.care current task: clean, heal, feed, a rescue mission's help step) is active ON THAT animal. With no task, or a
 *       task on another animal, the animal is ONE target (whole-animal outline, Use/tap acts on the animal, no part is named).
 * Generous on purpose: a 7-year-old should never fight the aim.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var RADIUS = 48;        // px: how far from a part the pointer may be and still aim at it
  var TOUCH_SCALE = 1.5;  // fingers are fatter than mouse pointers
  var LEAVE = 1.3;        // the current target is kept out to this x radius
  var SWITCH = 0.7;       // a challenger must be this fraction of the current target's distance (or closer) to steal it
  var SLACK_MAX = 16;     // px of a part's own on-screen radius that count as "already on it"

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  function radiusFor(opts) {
    var r = num(opts && opts.radius, RADIUS);
    return opts && opts.touch ? r * TOUCH_SCALE : r;
  }

  function distance(pointer, c) {
    if (c.direct) return 0;
    var d = Math.sqrt(Math.pow(num(c.x, Infinity) - pointer.x, 2) + Math.pow(num(c.y, Infinity) - pointer.y, 2));
    return Math.max(0, d - Math.min(Math.max(num(c.r, 0), 0), SLACK_MAX));
  }

  function closest(pointer, candidates) {
    var best = null;
    (candidates || []).forEach(function (c) {
      if (!c || c.id === undefined) return;
      var d = distance(pointer, c);
      if (!isFinite(d)) return;
      var tie = best && d === best.dist;
      if (!best || d < best.dist || (tie && !!c.direct > !!best.candidate.direct) ||
          (tie && !!c.direct === !!best.candidate.direct && num(c.r, 0) < num(best.candidate.r, 0))) best = { candidate: c, dist: d };
    });
    return best;
  }

  function nearest(pointer, candidates, opts) {
    if (!pointer || !isFinite(pointer.x) || !isFinite(pointer.y)) return null;
    var best = closest(pointer, candidates);
    return best && best.dist <= radiusFor(opts) ? best : null;
  }

  function create(baseOpts) {
    var current = null;

    function update(pointer, candidates, opts) {
      var o = { radius: baseOpts && baseOpts.radius, touch: !!(opts && opts.touch) };
      if (!pointer || !isFinite(pointer.x) || !isFinite(pointer.y)) { current = null; return null; }
      var best = closest(pointer, candidates), radius = radiusFor(o);
      var mine = null;
      if (current) {
        (candidates || []).forEach(function (c) { if (c && c.id === current.id) mine = c; });   // fresh position, same part
      }
      if (mine) {
        var d = distance(pointer, mine);
        if (d <= radius * LEAVE && !(best && best.candidate.id !== mine.id && best.dist <= radius && best.dist < d * SWITCH)) {
          current = mine;
          return current;
        }
      }
      current = best && best.dist <= radius ? best.candidate : null;
      return current;
    }

    return { update: update, target: function () { return current; }, clear: function () { current = null; } };
  }

  function partsActive(animalId, careTask) {
    return typeof animalId === 'string' && !!animalId && !!careTask && !careTask.done && careTask.animalId === animalId;
  }

  SA.aim = { partsActive: partsActive, RADIUS: RADIUS, TOUCH_SCALE: TOUCH_SCALE, LEAVE: LEAVE, SWITCH: SWITCH, SLACK_MAX: SLACK_MAX, nearest: nearest, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
