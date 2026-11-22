/* SA.missionRun: pure mission step engine (no THREE, no DOM; unit-tested in node:vm). Steps are data rows
 * { kind, ...params, line } run against the step-kind rows in game/data/step-kinds.js. The engine never special-cases a kind
 * or an animal id: a kind's event type, match rule and progress all come from its row.
 *
 *   SA.missionRun.validate(steps)       throws a clear Error for an unknown kind or a missing/mistyped param (or an empty list)
 *   SA.missionRun.start(steps, at?)     -> state { steps, index, progress, done }  (validates; `at` = saved step index, to resume)
 *   SA.missionRun.step(state, event)    -> { state, advanced, progressed, done }   PURE: never mutates `state`
 *       event is { type, ...fields } ('found' {target}, 'helped' {animal, careTask}, 'collected' {item}...). It advances only when the
 *       current step's event type and match rule fit; anything else returns the same state. A counted kind (collect) adds 1 per
 *       matching event (progressed:true) and advances at n. done is true ONLY on the call that completes the last step; a finished
 *       state ignores every later event, so a repeated event never completes it twice.
 *   SA.missionRun.current(state)        -> the current step object, or null when finished
 *   SA.missionRun.count(state)          -> { have, need } for the current step (need 1 for kinds without progress)
 *   SA.missionRun.kinds()               -> the registered kind ids
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function row(kind) { return typeof kind === 'string' ? SA.data.get('stepKinds', kind) : null; }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function kinds() { return SA.data.all('stepKinds').map(function (r) { return r.id; }); }

  function validateStep(s, i) {
    var at = 'SA.missionRun: step ' + (i + 1);
    if (!isObj(s) || typeof s.kind !== 'string' || !s.kind) throw new Error(at + ': must be an object with a "kind" string');
    var r = row(s.kind);
    if (!r) throw new Error(at + ': unknown kind "' + s.kind + '" (known: ' + kinds().join(', ') + ')');
    at += ' (kind "' + s.kind + '")';
    Object.keys(r.required).forEach(function (p) {
      if (s[p] === undefined || s[p] === null) throw new Error(at + ': missing param "' + p + '" (' + r.required[p] + ')');
      if (typeof s[p] !== r.required[p] || (r.required[p] === 'string' && !s[p].trim())) {
        throw new Error(at + ': param "' + p + '" must be a ' + (r.required[p] === 'string' ? 'non-empty string' : r.required[p]));
      }
    });
    Object.keys(r.optional || {}).forEach(function (p) {
      if (s[p] !== undefined && typeof s[p] !== r.optional[p]) throw new Error(at + ': param "' + p + '" must be a ' + r.optional[p]);
    });
    if (r.progress) {
      var n = s[r.progress.total];
      if (n < 1 || n !== Math.floor(n)) throw new Error(at + ': param "' + r.progress.total + '" must be a whole number >= 1');
    }
  }

  function validate(steps) {
    if (!Array.isArray(steps) || !steps.length) throw new Error('SA.missionRun: steps must be a non-empty array');
    steps.forEach(validateStep);
  }

  function start(steps, at) {
    validate(steps);
    var i = typeof at === 'number' && at > 0 ? Math.min(Math.floor(at), steps.length) : 0;
    return { steps: steps, index: i, progress: 0, done: i >= steps.length };
  }

  function current(state) { return state.done ? null : state.steps[state.index] || null; }

  function count(state) {
    var s = current(state);
    var r = s && row(s.kind);
    return { have: state.progress || 0, need: r && r.progress ? s[r.progress.total] : 1 };
  }

  function matches(r, s, event) {
    if (event.type !== r.event) return false;
    return Object.keys(r.match).every(function (p) { return s[p] === undefined || s[p] === event[r.match[p]]; });
  }

  function step(state, event) {
    var same = { state: state, advanced: false, progressed: false, done: false };
    var s = current(state);
    if (!s || !isObj(event)) return same;
    var r = row(s.kind);
    if (!r || !matches(r, s, event)) return same;
    var have = (state.progress || 0) + 1;
    if (r.progress && have < s[r.progress.total]) {
      return { state: { steps: state.steps, index: state.index, progress: have, done: false }, advanced: false, progressed: true, done: false };
    }
    var index = state.index + 1;
    var done = index >= state.steps.length;
    return { state: { steps: state.steps, index: index, progress: 0, done: done }, advanced: true, progressed: false, done: done };
  }

  SA.missionRun = { validate: validate, start: start, step: step, current: current, count: count, kinds: kinds };
})(typeof window !== 'undefined' ? window : globalThis);
