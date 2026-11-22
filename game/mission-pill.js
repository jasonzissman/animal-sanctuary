/* SA.missionPill: while a story mission runs, the top-left prompt pill shows ONLY the mission's current step (AS-0223,
 * slice 2 of AS-0221). Pure wiring (no THREE, no DOM; unit-tested in node:vm); the pill itself is the view from ui/prompt.js.
 *
 *   SA.missionPill.lineFor(active) -> { es, icon, en? } | null   the step's `line` from game/data/missions.js
 *   SA.missionPill.create({ view, audio?, missions?, focus? }) -> { update, replay, showing }
 *       update()  polled once per frame (main.js, after SA.focus.update()). On a mission it calls view.showStep({ text, icon, en })
 *                 and speaks the line through audio.say each time the step changes; when the mission is over it forgets the
 *                 step (the free-roam text comes back through the prompt controller's begin(), called by the focus rule).
 *       replay()  speaks the current step line again; returns true when the pill is showing a step (so the caller skips its own replay)
 *       showing() true while the pill shows a mission step
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function lineFor(active) {
    var l = active && active.stepData && active.stepData.line;
    return l && typeof l.es === 'string' ? l : null;
  }

  function create(o) {
    o = o || {};
    var shown = null, line = null;
    function missions() { return o.missions || SA.missions; }
    function focus() { return o.focus || SA.focus; }
    function say(text) {
      var a = o.audio || SA.audio;
      try { if (a && a.say) a.say(text); } catch (e) { /* silent */ }
    }

    function update() {
      var act = null;
      try { act = focus() && focus().active() === 'mission' ? missions().active() : null; } catch (e) { act = null; }
      var l = lineFor(act);
      if (!l) { shown = null; line = null; return false; }
      var key = act.id + ':' + act.seed + ':' + act.step;
      if (key === shown) return true;
      shown = key; line = l;
      try { if (o.view && o.view.showStep) o.view.showStep({ text: l.es, icon: l.icon, en: l.en }); } catch (e) { /* the pill never breaks play */ }
      say(l.es);
      return true;
    }

    function replay() {
      if (!shown || !line) return false;
      say(line.es);
      return true;
    }

    return { update: update, replay: replay, showing: function () { return shown !== null; } };
  }

  SA.missionPill = { lineFor: lineFor, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
