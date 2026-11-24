/* SA.save: persistent progress under localStorage key `santuario_save_v1` (see CLAUDE.md "Persistence").
 *
 * Shape: { version, stars, unlockedAnimals, placedProps, rounds: {completed, streak},
 *          settings: {muted, english, scaffold}, stats, inventory }.
 *          introSeen: retired (AS-0202 added it, AS-0213 replaced the first-run intro with a hello on every load). New saves do not
 *          have it; a save that already has it keeps it unchanged (a harmless boolean nothing reads).
 *          missions = { done: [id], active: null | { id, step, seed, replay, wait? }, celebrated?: [id], waiting?, completions? } (AS-0177, SA.missions;
 *          AS-0198 celebrated; absent until used). AS-0333: `wait` = { session, mark } stamps a mission sitting on a 'recover' step (it recovers on
 *          a new session or after `completions` passes `mark`); `waiting` is the same shape parked while another mission runs; optional, no version bump.
 *          rescues = [{ kind, mission, animal?, key?, animalId?, need?, biome?, night?, date? }] one row per finished rescue (AS-0235, AS-0167;
 *          SA.rescueLog), badges = [id] earned badge ids (SA.badges). Both optional: absent until the first rescue / badge.
 *          proofs = [{ id, kind: 'rescue'|'mission', animalId?, missionId?, date?, celebrated }] (v6, AS-0206, SA.proofs): proof photos sent to
 *          the station and whether the scientist already cheered each. Optional: absent until the first proof.
 *          names = { '<individualId>': { animalId, name, adj? } } (AS-0169, SA.names): pet names of rescued animals, keyed by herd instance id
 *          ('conejo#2'); name / adj are data ids ('luna', 'rapido'). Optional: absent until the first naming; no version bump.
 *          daynight = { t } (AS-0170, SA.daynight): ms into the day/night cycle; optional, no version bump.
 *          friend = { id, animalId } (AS-0175, SA.friend): the one rescued animal that follows you; id may be a herd instance ('conejo#2'); optional.
 *          album = { '<animalId>': { date: 'YYYY-MM-DD', pics: [{ id, date }] } } (v5, AS-0236): the first-photo date per photographed animal
 *          plus the kept picture entries (first ever + newest 3, SA.albumPics). Ids/dates only: the JPEGs live in IndexedDB (SA.photoStore).
 *          v4 saves had { '<animalId>':'YYYY-MM-DD' }; migrations[4] and normalize() turn that into { date, pics: [] } without loss.
 *          inventory = { items: [{ id, count }], equipped: id|null } (added in v3; an array so removals persist
 *          through update()'s deep merge). New and migrated saves get the starting kit (STARTING_KIT).
 *          stats.unlocks = { '<target>|<biome>|<item>': taps } is easter-egg tap progress (added in v2).
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
  var VERSION = 6;
  var STARTING_KIT = ['camara', 'cepillo', 'esponja', 'venda'];
  var DEBOUNCE_MS = 500;
  var RETIRED_ITEMS = { flor: true, platano: true, zanahoria: true, pez: true };   // removed items (AS-0154 flor, AS-0155 other foods): dropped from saved inventories. (AS-0351: 'hoja' is a real item again, Mission 9's leaves.)

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
      stats: { unlocks: {} },
      inventory: startingInventory()
    };
  }

  function startingInventory() {
    return { items: STARTING_KIT.map(function (id) { return { id: id, count: 1 }; }), equipped: null };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function count(n, d) { return typeof n === 'number' && isFinite(n) && n >= 0 ? Math.floor(n) : d; }

  // migrations[v] upgrades a version-v save to v+1. Version 0 = an unversioned legacy object.
  var migrations = {
    0: function (old) { old.version = 1; return old; },
    // v2 adds stats.unlocks ({ '<target>|<biome>|<item>': taps }). Everything already in the save is kept.
    1: function (old) {
      if (!isObj(old.stats)) old.stats = {};
      if (!isObj(old.stats.unlocks)) old.stats.unlocks = {};
      old.version = 2;
      return old;
    },
    // v3 adds the inventory with the starting kit (camera, brush, sponge, bandage). Everything else is kept.
    2: function (old) {
      old.inventory = startingInventory();
      old.version = 3;
      return old;
    },
    // v4 once added introSeen for the retired first-run intro (AS-0213: nothing reads it any more). Keep the version; leave the data alone.
    3: function (old) {
      old.version = 4;
      return old;
    },
    // v5 (AS-0236): album rows become { date, pics } so a species can keep small pictures. Every found species and its date is kept.
    4: function (old) {
      if (old.album !== undefined) old.album = normalizeAlbum(old.album);
      old.version = 5;
      return old;
    },
    // v6 (AS-0206): proofs = [{ id, kind, ..., date, celebrated }] sent to the station (SA.proofs). Old saves have none: absent means empty; nothing is dropped.
    5: function (old) {
      if (old.proofs !== undefined) old.proofs = normalizeProofs(old.proofs);
      old.version = 6;
      return old;
    }
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
    out.stats = isObj(s.stats) ? clone(s.stats) : {};
    var un = isObj(out.stats.unlocks) ? out.stats.unlocks : {};
    out.stats.unlocks = {};
    Object.keys(un).forEach(function (k) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
      var n = count(un[k], 0);
      if (n > 0) out.stats.unlocks[k] = n;
    });
    // stats.unlockTimes is optional (absent until the first unlock); when present keep only finite-number values.
    if (out.stats.unlockTimes !== undefined) {
      var ut = isObj(out.stats.unlockTimes) ? out.stats.unlockTimes : {};
      out.stats.unlockTimes = {};
      Object.keys(ut).forEach(function (k) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
        if (typeof ut[k] === 'number' && isFinite(ut[k])) out.stats.unlockTimes[k] = ut[k];
      });
    }
    out.inventory = normalizeInventory(s.inventory);
    if (s.introSeen !== undefined && typeof s.introSeen !== 'boolean') delete out.introSeen;   // retired flag: kept only when it is a boolean
    if (s.album !== undefined) out.album = normalizeAlbum(s.album);   // optional, like photos: absent until the first photo
    if (s.missions !== undefined) out.missions = normalizeMissions(s.missions);   // optional: absent until the first mission starts
    if (s.rescues !== undefined) out.rescues = normalizeRescues(s.rescues);       // optional rescue log (AS-0235): absent until the first rescue
    if (s.proofs !== undefined) out.proofs = normalizeProofs(s.proofs);           // optional proof photos sent to the station (AS-0206, SA.proofs)
    if (s.badges !== undefined) out.badges = normalizeBadges(s.badges);           // optional earned badge ids (AS-0167, SA.badges)
    if (s.names !== undefined) out.names = normalizeNames(s.names);               // optional pet names (AS-0169, SA.names)
    if (s.daynight !== undefined) out.daynight = normalizeDaynight(s.daynight);   // optional clock time (AS-0170, SA.daynight)
    var fr = normalizeFriend(s.friend);                                           // optional animal friend (AS-0175, SA.friend)
    if (fr) out.friend = fr; else delete out.friend;
    return out;
  }

  // Animal friend (AS-0175): { id, animalId } with id an animal id plus an optional '#n' herd instance; anything else drops the friend.
  function normalizeFriend(f) {
    if (!isObj(f) || typeof f.id !== 'string' || !/^[a-z0-9_-]+(#\d+)?$/.test(f.id)) return null;
    return { id: f.id, animalId: typeof f.animalId === 'string' && /^[a-z0-9_-]+$/.test(f.animalId) ? f.animalId : f.id.split('#')[0] };
  }

  // Day/night clock (AS-0170): { t } = ms into the cycle; anything else is dropped (the game then starts in the morning).
  function normalizeDaynight(d) {
    return isObj(d) && typeof d.t === 'number' && isFinite(d.t) && d.t >= 0 ? { t: Math.floor(d.t) } : {};
  }

  // Pet names (AS-0169): { '<individualId>': { animalId, name, adj? } }. The key is an animal id with an optional '#n' herd instance
  // ('conejo#2'); name / adj are data ids (lowercase words). Bad rows are dropped; at most 200 are kept.
  function normalizeNames(n) {
    var out = {}, word = /^[a-z][a-z0-9]*$/, key = /^[a-z0-9_-]+(#\d+)?$/, animal = /^[a-z0-9_-]+$/;
    if (!isObj(n)) return out;
    Object.keys(n).slice(0, 200).forEach(function (id) {
      var v = n[id];
      if (!key.test(id) || !isObj(v) || typeof v.name !== 'string' || !word.test(v.name)) return;
      var row = { animalId: typeof v.animalId === 'string' && animal.test(v.animalId) ? v.animalId : id.split('#')[0], name: v.name };
      if (typeof v.adj === 'string' && word.test(v.adj)) row.adj = v.adj;
      out[id] = row;
    });
    return out;
  }

  // Album: lowercase animal ids mapped to { date: 'YYYY-MM-DD', pics: [{ id, date }] }. A bare 'YYYY-MM-DD' (the v4 shape) becomes
  // { date, pics: [] }; anything else is dropped. Picture ids are short [a-z0-9_-] words; at most 4 are kept per species.
  function normalizeAlbum(a) {
    var out = {};
    if (!isObj(a)) return out;
    var day = /^\d{4}-\d{2}-\d{2}$/, word = /^[a-z0-9_-]{1,40}$/;
    Object.keys(a).forEach(function (id) {
      if (!/^[a-z0-9_-]+$/.test(id)) return;
      var v = a[id];
      if (typeof v === 'string') { if (day.test(v)) out[id] = { date: v, pics: [] }; return; }
      if (!isObj(v) || typeof v.date !== 'string' || !day.test(v.date)) return;
      var pics = [];
      (Array.isArray(v.pics) ? v.pics : []).forEach(function (p) {
        if (isObj(p) && typeof p.id === 'string' && word.test(p.id) && typeof p.date === 'string' && day.test(p.date) &&
          !pics.some(function (q) { return q.id === p.id; })) pics.push({ id: p.id, date: p.date });
      });
      out[id] = { date: v.date, pics: pics.slice(-4) };
    });
    return out;
  }

  // Rescue log (AS-0235, AS-0167): [{ kind, mission, animal?, key?, animalId?, need?, biome?, night?, date? }], newest last, capped at 200.
  // kind is a lowercase word ('reunion', or '' for a care rescue); an entry needs a kind or an animalId. Old rows (kind/mission only) stay valid.
  function normalizeRescues(r) {
    var ok = /^[a-z][a-z0-9-]*$/, out = [];
    function word(v) { return typeof v === 'string' && ok.test(v); }
    (Array.isArray(r) ? r : []).forEach(function (e) {
      if (!isObj(e) || !(word(e.kind) || word(e.animalId))) return;
      var row = { kind: word(e.kind) ? e.kind : '', mission: word(e.mission) ? e.mission : '' };
      if (word(e.animal)) row.animal = e.animal;
      if (word(e.animalId)) row.animalId = e.animalId;
      if (word(e.need)) row.need = e.need;
      if (word(e.biome)) row.biome = e.biome;
      if (typeof e.night === 'boolean') row.night = e.night;
      if (typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) row.date = e.date;
      if (typeof e.key === 'string' && e.key.length <= 40) row.key = e.key;
      out.push(row);
    });
    return out.slice(-200);
  }

  // Proof photos sent to the station (AS-0206): [{ id, kind: 'rescue'|'mission', animalId?, missionId?, date?, celebrated }], newest last, capped at 100.
  // id is a short unique key; celebrated is a boolean (the scientist cheers once per proof, then it is true).
  function normalizeProofs(p) {
    var ok = /^[a-z][a-z0-9-]*$/, out = [], seen = {};
    (Array.isArray(p) ? p : []).forEach(function (e) {
      if (!isObj(e) || typeof e.id !== 'string' || !/^[a-z0-9:_-]{1,60}$/.test(e.id) || seen[e.id]) return;
      if (e.kind !== 'rescue' && e.kind !== 'mission') return;
      seen[e.id] = true;
      var row = { id: e.id, kind: e.kind, celebrated: e.celebrated === true };
      if (typeof e.animalId === 'string' && ok.test(e.animalId)) row.animalId = e.animalId;
      if (typeof e.missionId === 'string' && ok.test(e.missionId)) row.missionId = e.missionId;
      if (typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) row.date = e.date;
      out.push(row);
    });
    return out.slice(-100);
  }

  // Earned badge ids (AS-0167): unique lowercase ids, so a badge is announced once even if the rescue log is capped.
  function normalizeBadges(b) {
    var out = [];
    (Array.isArray(b) ? b : []).forEach(function (id) {
      if (typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id) && out.indexOf(id) < 0) out.push(id);
    });
    return out;
  }

  // Missions (AS-0177): done = unique mission ids, active = null or { id, step, seed, replay } (one at a time).
  function normalizeMissions(m) {
    var out = { done: [], active: null };
    if (!isObj(m)) return out;
    var ok = /^[a-z][a-z0-9-]*$/;
    (Array.isArray(m.done) ? m.done : []).forEach(function (id) {
      if (typeof id === 'string' && ok.test(id) && out.done.indexOf(id) < 0) out.done.push(id);
    });
    var cel = [];
    (Array.isArray(m.celebrated) ? m.celebrated : []).forEach(function (id) {
      if (typeof id === 'string' && ok.test(id) && cel.indexOf(id) < 0) cel.push(id);
    });
    if (cel.length) out.celebrated = cel;   // AS-0198: finished missions the scientist already celebrated (once each)
    function mission(a) {
      var o = { id: a.id, step: count(a.step, 0), seed: count(a.seed, 0), replay: a.replay === true };
      var w = a.wait;     // AS-0333: a mission waiting on a 'recover' step remembers which session and how many finished missions it saw
      if (isObj(w) && typeof w.session === 'string' && w.session) o.wait = { session: w.session, mark: count(w.mark, 0) };
      return o;
    }
    var a = m.active;
    if (isObj(a) && typeof a.id === 'string' && ok.test(a.id)) out.active = mission(a);
    var w = m.waiting;   // AS-0333: a waiting mission parked while another one runs
    if (isObj(w) && typeof w.id === 'string' && ok.test(w.id)) out.waiting = mission(w);
    if (count(m.completions, 0) > 0) out.completions = count(m.completions, 0);   // finished missions this save has seen (replays count)
    return out;
  }

  // Valid items only (lowercase id, whole count >= 1, no duplicates); equipped must be an owned item or null.
  // A missing/non-object inventory gets the starting kit; an empty items array is kept (the player gave it all away).
  function normalizeInventory(inv) {
    if (!isObj(inv) || !Array.isArray(inv.items)) return startingInventory();
    var seen = {};
    var items = [];
    inv.items.forEach(function (it) {
      if (!isObj(it) || typeof it.id !== 'string' || !/^[a-z]+$/.test(it.id) || seen[it.id] || RETIRED_ITEMS[it.id]) return;
      var n = count(it.count, 0);
      if (n < 1) return;
      seen[it.id] = true;
      items.push({ id: it.id, count: n });
    });
    var eq = typeof inv.equipped === 'string' && seen[inv.equipped] ? inv.equipped : null;
    return { items: items, equipped: eq };
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
    STARTING_KIT: STARTING_KIT.slice(),
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
