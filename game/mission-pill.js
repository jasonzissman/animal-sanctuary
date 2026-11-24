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
 *
 * Census checklist (AS-0342, slice 3 of AS-0186): while the step is 'census' (SA.missionCensus.view() has a list) the pill also shows one
 * compact chip per list entry, "🩶 0/3", and "🩶 3/3 ✓" when it is complete. Each photo that ticks an entry updates its chip right away and
 * the view bounces it (view.showChecklist(rows, bounced)). No words, so the English toggle has nothing to add.
 *   SA.missionPill.checklistRows(progress) -> [{ icon, have, need, done, text }]   progress = SA.census.progress(state)
 *   create({ ..., census? })   census = an object with view() (default SA.missionCensus)
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function lineFor(active) {
    var l = active && active.stepData && active.stepData.line;
    return l && typeof l.es === 'string' ? l : null;
  }

  // Pure formatting of the census progress into pill chips: icon + n/total, plus a check once the entry is complete.
  function checklistRows(progress) {
    return (progress || []).map(function (p) {
      var icon = (p.entry && p.entry.icon) || '🐾';
      var have = Math.max(0, Math.min(p.need, p.have | 0));
      var done = !!p.done || have >= p.need;
      return { icon: icon, have: have, need: p.need, done: done, text: icon + ' ' + have + '/' + p.need + (done ? ' ✓' : '') };
    });
  }

  function create(o) {
    o = o || {};
    var shown = null, line = null, sig = null, counts = null, countsKey = null;
    function census() { return o.census || SA.missionCensus; }
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
      if (key !== shown) {
        shown = key; line = l; sig = null; counts = null; countsKey = null;
        try { if (o.view && o.view.showStep) o.view.showStep({ text: l.es, icon: l.icon, en: l.en }); } catch (e) { /* the pill never breaks play */ }
        say(l.es);
      }
      if (act.stepData.kind === 'census') checklist();
      return true;
    }

    // Census step: redraw the chips when a count changed (or the list is new); the chips whose count went up bounce.
    function checklist() {
      var v = null;
      try { v = census() && census().view ? census().view() : null; } catch (e) { v = null; }
      if (!v || !v.progress) return;
      var rows = checklistRows(v.progress);
      var lk = v.list && v.list.key || '';
      var s = lk + '|' + rows.map(function (r) { return r.text; }).join('|');
      if (s === sig) return;
      var next = rows.map(function (r) { return r.have; });
      var bounced = [];
      if (counts && countsKey === lk && counts.length === next.length) next.forEach(function (n, i) { if (n > counts[i]) bounced.push(i); });
      sig = s; counts = next; countsKey = lk;
      try { if (o.view && o.view.showChecklist) o.view.showChecklist(rows, bounced); } catch (e) { /* the pill never breaks play */ }
    }

    function replay() {
      if (!shown || !line) return false;
      say(line.es);
      return true;
    }

    return { update: update, replay: replay, showing: function () { return shown !== null; } };
  }

  SA.missionPill = { lineFor: lineFor, checklistRows: checklistRows, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
