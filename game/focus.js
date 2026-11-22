/* SA.focus: the one rule for "may a small task start now?" (pure; no THREE, no DOM; unit-tested in node:vm).
 * Small tasks = the free-roam rescue/clue rounds (SA.mission, SA.round + ui/mission-flow.js, ui/prompt.js), random encounters
 * (AS-0179) and random care offers (ui/care-flow.js). While a story mission chosen at the station board runs, they all pause.
 *
 *   SA.focus.active()      -> 'mission' while SA.missions.active() is a story mission, else 'free'
 *   SA.focus.allowsSmall() -> true when active() is 'free'. Every starter of a small task asks this first.
 *   SA.focus.onChange(fn)  fn('mission' | 'free') on a change seen by update(); returns an unsubscribe function
 *   SA.focus.update()      polled once per frame by game/main.js; fires onChange when the rule flipped (mission start: put the
 *                          small task on screen away quietly; mission over, done or abandoned: small tasks start again)
 *   SA.focus.create({ missions? })   a separate instance (tests); the default reads SA.missions.
 * It never special-cases a mission or animal id: the only input is "is a mission running".
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function create(opts) {
    opts = opts || {};
    var listeners = [], last = 'free';

    function active() {
      try {
        var m = opts.missions || SA.missions;
        return m && m.active && m.active() ? 'mission' : 'free';
      } catch (e) { return 'free'; }      // a broken save never blocks free play
    }

    function allowsSmall() { return active() === 'free'; }

    function onChange(fn) {
      listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    }

    function update() {
      var now = active();
      if (now === last) return now;
      last = now;
      listeners.slice().forEach(function (fn) { try { fn(now); } catch (e) { /* a listener never breaks play */ } });
      return now;
    }

    return { active: active, allowsSmall: allowsSmall, onChange: onChange, update: update, create: create };
  }

  SA.focus = create();
})(typeof window !== 'undefined' ? window : globalThis);
