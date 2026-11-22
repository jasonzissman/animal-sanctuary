/* SA.save: persistent progress under localStorage key `santuario_save_v1` (see CLAUDE.md "Persistence").
 *
 * Shape: { version, stars, unlockedAnimals, placedProps, rounds: {completed, streak},
 *          settings: {muted, english, scaffold}, stats }.
 * - A bad read NEVER wipes a save: unparseable / unknown-version data is copied to `santuario_save_v1_corrupt`
 *   and the game starts from defaults.
 * - Older versions are upgraded by SA.save.migrations[v](old) -> v+1 (see migrate()).
 * - If localStorage is missing or throws, state lives in memory only and the game keeps running.
 * - Writes are debounced (~500ms) and flushed on `pagehide`.
 * Pure logic (no THREE/DOM) so it loads in node:vm for tests.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  var KEY = 'santuario_save_v1';
  var CORRUPT_KEY = 'santuario_save_v1_corrupt';
  var VERSION = 1;
  var DEBOUNCE_MS = 500;

  var state = null;
  var dirty = false;
  var timer = null;
  var persistent = true;
  var hooked = false;

  function defaults() {
    return {
      version: VERSION,
      stars: 0,
      unlockedAnimals: [],
      placedProps: [],
      rounds: { completed: 0, streak: 0 },
      settings: { muted: false, english: false, scaffold: 1 },
      stats: {}
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function count(n, d) { return typeof n === 'number' && isFinite(n) && n >= 0 ? Math.floor(n) : d; }

  // migrations[v] upgrades a version-v save to v+1. Version 0 = an unversioned legacy object.
  var migrations = {
    0: function (old) { old.version = 1; return old; }
  };

  // Brings any older save up to VERSION. Returns null if the data cannot be migrated (unknown/future version).
  function migrate(old) {
    if (!isObj(old)) return null;
    var cur = clone(old);
    var v = cur.version === undefined ? 0 : cur.version;
    if (typeof v !== 'number' || v !== Math.floor(v) || v < 0 || v > VERSION) return null;
    while (v < VERSION) {
      var step = migrations[v];
      if (typeof step !== 'function') return null;
      cur = step(cur);
      if (!isObj(cur)) return null;
      v += 1;
      cur.version = v;
    }
    return normalize(cur);
  }

  // Fills missing/invalid fields from defaults; keeps unknown extra fields so nothing is lost.
  function normalize(s) {
    var d = defaults();
    var out = clone(s);
    out.version = VERSION;
    out.stars = count(s.stars, d.stars);
    out.unlockedAnimals = Array.isArray(s.unlockedAnimals) ? s.unlockedAnimals.slice() : d.unlockedAnimals;
    out.placedProps = Array.isArray(s.placedProps) ? s.placedProps.slice() : d.placedProps;
    var r = isObj(s.rounds) ? s.rounds : {};
    out.rounds = Object.assign({}, r, { completed: count(r.completed, 0), streak: count(r.streak, 0) });
    var st = isObj(s.settings) ? s.settings : {};
    out.settings = Object.assign({}, st, {
      muted: typeof st.muted === 'boolean' ? st.muted : d.settings.muted,
      english: typeof st.english === 'boolean' ? st.english : d.settings.english,
      scaffold: count(st.scaffold, d.settings.scaffold)
    });
    out.stats = isObj(s.stats) ? clone(s.stats) : d.stats;
    return out;
  }

  function storage() {
    if (!persistent) return null;
    try {
      var st = root.localStorage;
      if (st) return st;
    } catch (e) { /* access can throw (privacy modes) */ }
    persistent = false;
    return null;
  }

  function backupCorrupt(st, raw) {
    try { st.setItem(CORRUPT_KEY, raw); } catch (e) { /* best effort */ }
  }

  function hookPageHide() {
    if (hooked) return;
    hooked = true;
    try {
      if (typeof root.addEventListener === 'function') root.addEventListener('pagehide', flush);
    } catch (e) { /* no window events */ }
  }

  // Reads the save (or defaults). Safe to call repeatedly; it re-reads storage each time.
  function load() {
    hookPageHide();
    if (timer !== null) { clearTimer(); }
    dirty = false;
    var st = storage();
    var raw = null;
    if (st) {
      try { raw = st.getItem(KEY); } catch (e) { persistent = false; st = null; }
    }
    if (raw === null || raw === undefined) {
      state = defaults();
      return clone(state);
    }
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    var migrated = parsed === null ? null : migrate(parsed);
    if (!migrated) {
      if (st) backupCorrupt(st, String(raw));
      state = defaults();
      dirty = true; // a fresh save will replace the unreadable one; the backup is kept
      schedule();
    } else {
      state = migrated;
    }
    return clone(state);
  }

  function ensure() { if (!state) load(); }

  function get() { ensure(); return clone(state); }

  function merge(target, patch) {
    Object.keys(patch).forEach(function (k) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
      var v = patch[k];
      if (isObj(v) && isObj(target[k])) merge(target[k], v);
      else target[k] = (v !== null && typeof v === 'object') ? clone(v) : v;
    });
  }

  // Deep-merges plain objects (arrays and scalars replace), validates, and schedules a debounced write.
  function update(patch) {
    ensure();
    if (isObj(patch)) {
      var next = clone(state);
      merge(next, patch);
      state = normalize(next);
      dirty = true;
      schedule();
    }
    return clone(state);
  }

  function clearTimer() {
    if (timer !== null && typeof root.clearTimeout === 'function') root.clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    if (timer !== null) return;
    if (typeof root.setTimeout !== 'function') return; // flush() still works on pagehide/manual
    timer = root.setTimeout(function () { timer = null; flush(); }, DEBOUNCE_MS);
  }

  // Writes now if there are unsaved changes. Returns true when state is safely stored (or nothing to store).
  function flush() {
    clearTimer();
    if (!dirty || !state) return true;
    var st = storage();
    if (!st) { dirty = false; return false; }
    try {
      st.setItem(KEY, JSON.stringify(state));
      dirty = false;
      return true;
    } catch (e) {
      dirty = false; // quota/security error: keep playing from memory
      return false;
    }
  }

  // Back to defaults (written immediately). The corrupt backup, if any, is left alone.
  function reset() {
    state = defaults();
    dirty = true;
    hookPageHide();
    flush();
    return clone(state);
  }

  SA.save = {
    KEY: KEY,
    CORRUPT_KEY: CORRUPT_KEY,
    VERSION: VERSION,
    DEBOUNCE_MS: DEBOUNCE_MS,
    defaults: defaults,
    migrations: migrations,
    migrate: migrate,
    load: load,
    get: get,
    update: update,
    flush: flush,
    reset: reset,
    isPersistent: function () { storage(); return persistent; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
