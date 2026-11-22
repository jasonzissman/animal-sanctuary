/* SA.introDialogue: the scientist's intro conversation on a new game (pure; no THREE, no DOM; unit-tested in node:vm).
 * Lines are data (game/data/intro.js: { n, es, icon, vocabKey }); the overlay is game/ui/intro-view.js.
 *
 *   SA.introDialogue.shouldPlay()   -> true only on a new save (save.introSeen false) with lines to say
 *   SA.introDialogue.begin()        -> state | null           state = { lines, index, done, skipped }
 *   SA.introDialogue.view(state)    -> { index, total, line, last, done, skipped, label }   label: 'Siguiente' | '¡Vamos!'
 *   SA.introDialogue.next(state)    -> state                  next line; on the last line it finishes (done, not skipped)
 *   SA.introDialogue.skip(state)    -> state                  one tap: the whole conversation ends (done, skipped)
 *   SA.introDialogue.finish(state)  -> { ok, skipped, camera, mission }   call once when done: sets introSeen, puts la cámara in
 *       the hotbar if it is missing (SA.inventory) and starts the next mission (Mission 1) through SA.missions.start.
 *       Never starts twice: a state or save that is already seen returns { ok:false, reason:'seen' }.
 *       After this, new missions only start at the Misiones board.
 *   SA.introDialogue.create({ save?, inventory?, missions?, lines?, track? })  a separate instance (tests); the default instance
 *       reads SA.save, SA.inventory, SA.missions and SA.data 'intro'.
 *   SA.introDialogue.MIN_MS / MAX_MS   how long the overlay holds a line before it may move on by itself (speech done / safety).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var MIN_MS = 3500, MAX_MS = 8000, LAST = '¡Vamos!', NEXT = 'Siguiente';

  function create(opts) {
    opts = opts || {};
    function store() { return opts.save || SA.save; }
    function lines() {
      var all = opts.lines || (SA.data ? SA.data.all('intro') : []);
      return all.slice().sort(function (a, b) { return a.n - b.n; });
    }
    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }
    function seen() { return store().get().introSeen === true; }

    function shouldPlay() { return !seen() && lines().length > 0; }

    function begin() {
      var l = lines();
      return l.length ? { lines: l, index: 0, done: false, skipped: false } : null;
    }

    function view(state) {
      if (!state) return null;
      var last = state.index >= state.lines.length - 1;
      return { index: state.index, total: state.lines.length, line: state.lines[state.index], last: last,
        done: state.done, skipped: state.skipped, label: last ? LAST : NEXT };
    }

    function next(state) {
      if (!state || state.done) return state;
      var last = state.index >= state.lines.length - 1;
      return { lines: state.lines, index: last ? state.index : state.index + 1, done: last, skipped: false };
    }

    function skip(state) {
      if (!state || state.done) return state;
      return { lines: state.lines, index: state.index, done: true, skipped: true };
    }

    // The camera is part of the starting kit; a save that lost it gets it back so the photo step is always possible.
    function ensureCamera() {
      var inv = opts.inventory || SA.inventory;
      try {
        if (!inv) return false;
        if (inv.has('camara')) return true;
        return inv.add('camara', 1) === true;
      } catch (e) { return false; }
    }

    function startFirstMission() {
      var m = opts.missions || SA.missions;
      try {
        if (!m || m.active()) return null;
        var nxt = m.next();
        if (!nxt) return null;
        var r = m.start(nxt.id);
        return r && r.ok ? nxt.id : null;
      } catch (e) { return null; }
    }

    function finish(state) {
      if (!state || !state.done || seen()) return { ok: false, reason: 'seen' };
      store().update({ introSeen: true });
      var camera = ensureCamera();
      var mission = startFirstMission();
      track('intro.done', { skipped: state.skipped, line: state.index + 1, mission: mission || '' });
      return { ok: true, skipped: state.skipped, camera: camera, mission: mission };
    }

    return { shouldPlay: shouldPlay, begin: begin, view: view, next: next, skip: skip, finish: finish };
  }

  var def = create();
  SA.introDialogue = { create: create, shouldPlay: def.shouldPlay, begin: def.begin, view: def.view, next: def.next,
    skip: def.skip, finish: def.finish, MIN_MS: MIN_MS, MAX_MS: MAX_MS, LAST: LAST, NEXT: NEXT };
})(typeof window !== 'undefined' ? window : globalThis);
