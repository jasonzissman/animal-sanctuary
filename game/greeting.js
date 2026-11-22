/* SA.greeting: the scientist's one-card hello on every load (AS-0213; pure, no THREE, no DOM; unit-tested in node:vm).
 * Replaces the long first-run intro: it starts nothing. Missions are chosen at the board in the station.
 * All lines show on ONE card at the same time; one press (or walking away) closes it. Never stepped through.
 * The text is the scientist's own message (AS-0227): the same lines, in the same order, as SA.scientistTalk.reminder().
 *
 *   SA.greeting.lines()            -> [{ es, en, key }, ...]   = SA.scientistTalk.reminder().lines (no icons), key = vocab key for SA.audio.say
 *   SA.greeting.create({ moveDist?, track? }) -> a controller (SA.greeting is the default instance's functions too):
 *       open(player?)   -> true       shows it (player = { x, z } where the kid stands, to notice walking away); false if already open
 *       isOpen()        -> bool
 *       close(reason)   -> bool       reason: 'x' | 'key' | 'tap' | 'move' | 'api'; false when it was not open
 *       onKey(e)        -> 'closed' | 'moved' | 'none'
 *           Enter / E close it ('closed': the view swallows the key so it does not also talk to her).
 *           A walking key (WASD / arrows) closes it too ('moved': the key is left alone so the kid walks on).
 *       onTap()         -> bool       a tap anywhere on the card or around it closes it
 *       update(player)  -> bool       call each frame: closes once the player is more than moveDist (0.35) from where it opened
 *   Telemetry: 'greeting.shown' and 'greeting.closed' { reason }.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var MOVE_KEYS = { w: 1, a: 1, s: 1, d: 1, arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1 };

  // AS-0227: the startup card says exactly what talking to the scientist says right now (SA.scientistTalk.reminder()).
  function lines() {
    var r = root.SA.scientistTalk && root.SA.scientistTalk.reminder ? root.SA.scientistTalk.reminder() : { lines: [] };
    return r.lines.map(function (l) { return { es: l.es, en: l.en || '', key: l.key }; });
  }

  function create(opts) {
    opts = opts || {};
    var moveDist = typeof opts.moveDist === 'number' ? opts.moveDist : 0.35;
    var opened = false, origin = null;

    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }
    function finite(p) { return !!p && typeof p.x === 'number' && typeof p.z === 'number' && isFinite(p.x) && isFinite(p.z); }

    function open(player) {
      if (opened) return false;
      opened = true;
      origin = finite(player) ? { x: player.x, z: player.z } : null;
      track('greeting.shown', {});
      return true;
    }
    function close(reason) {
      if (!opened) return false;
      opened = false;
      origin = null;
      track('greeting.closed', { reason: reason || 'api' });
      return true;
    }
    function isUse(e) {
      if (!e || e.ctrlKey || e.metaKey || e.altKey) return false;
      var k = String(e.key || '').toLowerCase();
      return k === 'e' || k === 'enter' || e.code === 'KeyE' || e.code === 'Enter' || e.code === 'NumpadEnter';
    }
    function onKey(e) {
      if (!opened || !e || e.ctrlKey || e.metaKey || e.altKey) return 'none';
      if (isUse(e)) { close('key'); return 'closed'; }
      if (MOVE_KEYS[String(e.key || '').toLowerCase()] === 1) { close('move'); return 'moved'; }
      return 'none';
    }
    function onTap() { return close('tap'); }
    function update(player) {
      if (!opened || !origin || !finite(player)) return false;
      if (Math.hypot(player.x - origin.x, player.z - origin.z) > moveDist) return close('move');
      return false;
    }

    return { open: open, isOpen: function () { return opened; }, close: close, onKey: onKey, onTap: onTap, update: update };
  }

  SA.greeting = { lines: lines, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
