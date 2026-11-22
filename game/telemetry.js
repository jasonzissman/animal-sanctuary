/* window.SAT: browser telemetry client (see CLAUDE.md "SDLC contract" and the header of src/health.js).
 *
 * Events {id, ts, sid, type, ...fields} are queued (localStorage, falling back to memory) and POSTed in batches
 * to the optional local receiver on 127.0.0.1:5100. An event leaves the queue only when the receiver lists its id
 * in `accepted`. If the receiver is down (a classroom) everything stays queued (capped, oldest dropped), flushes
 * back off exponentially and nothing is thrown. No names or identifiers: `sid` is random per page load.
 * Classroom build: scripts/bundle.js sets window.SA_CLASSROOM = true before this file loads. Then flush() never
 * touches the network (no fetch, no flush timer); events still queue locally.
 * Pure logic: no THREE, no DOM beyond optional window/document hooks, so it loads in node:vm for tests.
 */
(function (root) {
  'use strict';
  var ENDPOINT = 'http://127.0.0.1:5100/api/events';
  var KEY = 'santuario_telemetry_q_v1';
  var CAP = 2000;
  var BATCH = 100;
  var UNLOAD_BATCH = 40; // keepalive requests are limited to ~64KB
  var FLUSH_MS = 10000;
  var TICK_MS = 15000;
  var FPS_WINDOW_S = 10;
  var MAX_ERRORS = 20; // per page load, so a render-loop error cannot flood the queue
  var TYPE_RE = /^[a-z][a-z0-9._-]{0,40}$/;

  var clock = function () { return Date.now(); };
  var queue = [];
  var storageOk = true;
  var sid = rid();
  var startedAt = null;
  var timers = [];
  var inFlight = false;
  var fails = 0;
  var retryAt = 0;
  var errorCount = 0;
  var fpsFrames = 0;
  var fpsTime = 0;
  var fpsHidden = false;
  var ended = false;

  function rid() {
    var s = '';
    try {
      var c = root.crypto;
      if (c && c.getRandomValues) {
        var a = c.getRandomValues(new Uint8Array(12));
        for (var i = 0; i < a.length; i++) s += (a[i] % 36).toString(36);
      }
    } catch (e) { s = ''; }
    while (s.length < 12) s += Math.floor(Math.random() * 36).toString(36);
    return s; // ids only need to match /^[a-z0-9]{6,40}$/
  }

  function storage() {
    if (!storageOk) return null;
    try { return root.localStorage || null; } catch (e) { storageOk = false; return null; }
  }

  function load() {
    var st = storage();
    if (!st) return;
    try {
      var raw = JSON.parse(st.getItem(KEY) || '[]');
      if (Array.isArray(raw)) queue = raw.filter(function (e) { return e && typeof e.id === 'string'; }).slice(-CAP);
    } catch (e) { /* unreadable queue: start empty in memory, do not wipe it until we persist new events */ }
  }

  function persist() {
    var st = storage();
    if (!st) return;
    try { st.setItem(KEY, JSON.stringify(queue)); } catch (e) { /* quota/denied: memory queue keeps working */ }
  }

  function enqueue(ev) {
    queue.push(ev);
    if (queue.length > CAP) queue.splice(0, queue.length - CAP);
    persist();
  }

  function seconds() { return startedAt === null ? 0 : Math.max(0, Math.round((clock() - startedAt) / 1000)); }

  function track(type, fields) {
    try {
      if (typeof type !== 'string' || !TYPE_RE.test(type)) return null;
      var ev = { id: rid(), ts: new Date(clock()).toISOString(), sid: sid, type: type };
      if (fields && typeof fields === 'object') {
        var safe = JSON.parse(JSON.stringify(fields));
        for (var k in safe) if (k !== 'id' && k !== 'ts' && k !== 'sid' && k !== 'type') ev[k] = safe[k];
      }
      enqueue(ev);
      return ev;
    } catch (e) { return null; }
  }

  function flush(opts) {
    var unloading = !!(opts && opts.unloading);
    try {
      if (root.SA_CLASSROOM) return Promise.resolve(false); // classroom build: no network at all
      if (inFlight || !queue.length || typeof root.fetch !== 'function') return Promise.resolve(false);
      if (clock() < retryAt) return Promise.resolve(false); // receiver known to be down: stay quiet
      var batch = queue.slice(0, unloading ? UNLOAD_BATCH : BATCH);
      inFlight = true;
      return Promise.resolve(root.fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' }, // simple request: no CORS preflight from file://
        body: JSON.stringify(batch),
        keepalive: unloading,
      })).then(function (res) {
        if (!res || !res.ok) throw new Error('receiver ' + (res && res.status));
        return res.json();
      }).then(function (body) {
        var ack = {};
        var list = body && Array.isArray(body.accepted) ? body.accepted : [];
        for (var i = 0; i < list.length; i++) ack[list[i]] = true;
        queue = queue.filter(function (e) { return !ack[e.id]; });
        persist();
        fails = 0;
        retryAt = 0;
        inFlight = false;
        return true;
      }).catch(function () {
        fails++;
        retryAt = clock() + Math.min(300000, FLUSH_MS * Math.pow(2, fails));
        inFlight = false;
        return false;
      });
    } catch (e) {
      inFlight = false;
      return Promise.resolve(false);
    }
  }

  function tick() { track('session.tick', { seconds: seconds() }); }

  function startSession() {
    if (startedAt !== null) return sid;
    startedAt = clock();
    ended = false;
    track('session.start', {});
    if (typeof root.setInterval === 'function') {
      timers.push(root.setInterval(tick, TICK_MS));
      if (!root.SA_CLASSROOM) timers.push(root.setInterval(function () { flush(); }, FLUSH_MS));
    }
    return sid;
  }

  function endSession() {
    if (ended || startedAt === null) return;
    ended = true;
    track('session.end', { seconds: seconds() });
    flush({ unloading: true });
  }

  /** Call once per rendered frame with the frame time in seconds. Emits perf.fps every ~10s. */
  function frame(dt) {
    try {
      if (!(dt > 0)) return;
      fpsFrames++;
      fpsTime += dt;
      if (root.document && root.document.hidden) fpsHidden = true;
      if (fpsTime >= FPS_WINDOW_S) {
        track('perf.fps', { fps: Math.round((fpsFrames / fpsTime) * 10) / 10, hidden: fpsHidden });
        fpsFrames = 0;
        fpsTime = 0;
        fpsHidden = false;
      }
    } catch (e) { /* never break the render loop */ }
  }

  function feedback(text, kind, context) {
    var t = String(text == null ? '' : text).trim().slice(0, 4000);
    if (!t) return null;
    var ev = track('feedback', { text: t, kind: kind === 'bug' || kind === 'idea' ? kind : 'feedback', context: context });
    flush();
    return ev;
  }

  function reportError(message, source, line, stack) {
    if (errorCount >= MAX_ERRORS) return;
    errorCount++;
    track('error', {
      message: String(message == null ? 'unknown' : message).slice(0, 500),
      source: String(source == null ? '' : source).slice(0, 300),
      line: Number(line) || 0,
      stack: String(stack == null ? '' : stack).slice(0, 2000),
    });
  }

  function install() {
    var prev = root.onerror;
    root.onerror = function (message, source, line, col, err) {
      try { reportError(message, source, line, err && err.stack); } catch (e) { /* ignore */ }
      return typeof prev === 'function' ? prev.apply(this, arguments) : false;
    };
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('unhandledrejection', function (ev) {
        var r = ev && ev.reason;
        reportError(r && r.message ? r.message : r, 'unhandledrejection', 0, r && r.stack);
      });
      root.addEventListener('pagehide', endSession);
    }
  }

  load();
  install();

  root.SAT = {
    track: track,
    startSession: startSession,
    feedback: feedback,
    frame: frame,
    flush: flush,
    sid: function () { return sid; },
    queued: function () { return queue.slice(); },
    /* test hooks */
    _setClock: function (fn) { clock = fn; },
    _timers: function () { return timers.length; },
  };
  root.SA = root.SA || {};
  root.SA.telemetry = root.SAT; // so node:vm tests can reach it via loadGame()
})(typeof window !== 'undefined' ? window : globalThis);
