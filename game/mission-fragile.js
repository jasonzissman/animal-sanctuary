/* SA.missionFragile: the gentle "¡Despacio!" reaction when the kid runs or jumps while carrying something fragile (the lost egg,
 * AS-0314, slice 2 of AS-0181). Pure logic (no THREE, no DOM; unit-tested in node:vm). Whether a carried thing is fragile is DATA:
 * a 'carry' step's `fragile: true` flags it in SA.carry (SA.carry.fragile()); nothing here knows an item or mission id.
 * It only reacts: it never drops, breaks or resets anything, and never fails a step. SA.carry draws the wobble (render/hand-item.js,
 * render/mission-carry.js); this module says the word, shows it and plays a worried quack, at most once per COOLDOWN seconds.
 *
 *   SA.missionFragile.hurry(player)            -> 'jump' | 'run' | null: what the player did that a fragile thing dislikes
 *                                                 (player.jump 'takeoff' | 'double', or player.running while player.moving)
 *   SA.missionFragile.step(state, input, dt)   PURE. input { fragile, player }. -> { state, event } where event is
 *                                                 { kind, key, text, sfx } the frame the reaction fires, else null. state starts as null.
 *   SA.missionFragile.create({ carry?, audio?, toast?, track? })  -> { update(dt, player) -> event | null }
 *                                                 update() applies the event: SA.audio.sfx('quack'), SA.audio.say(key), toast(text).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var COOLDOWN = 4;                 // seconds between reactions, so running never nags
  var KEY = 'phrase:despacio', TEXT = '¡Despacio!', SFX = 'quack';

  function jumping(p) { return !!p && (p.jump === 'takeoff' || p.jump === 'double'); }
  function running(p) { return !!p && !!p.running && !!p.moving; }

  function hurry(player) {
    if (jumping(player)) return 'jump';
    return running(player) ? 'run' : null;
  }

  function step(state, input, dt) {
    var s = state || { wait: 0, prevJump: null };
    var p = (input && input.player) || null;
    var wait = Math.max(0, s.wait - Math.max(0, Math.min(0.25, +dt || 0)));
    var jump = jumping(p) ? p.jump : null;
    var kind = jump && jump !== s.prevJump ? 'jump' : running(p) ? 'run' : null;   // a held 'takeoff' event counts once
    var event = null;
    if (input && input.fragile && kind && wait <= 0) {
      event = { kind: kind, key: KEY, text: TEXT, sfx: SFX };
      wait = COOLDOWN;
    }
    return { state: { wait: wait, prevJump: jump }, event: event };
  }

  function create(opts) {
    opts = opts || {};
    var state = null;
    function carry() { return opts.carry || SA.carry; }
    function audio() { return opts.audio || SA.audio; }
    function update(dt, player) {
      var fragile = false;
      try { var c = carry(); fragile = !!(c && c.fragile && c.fragile()); } catch (e) { fragile = false; }
      var r = step(state, { fragile: fragile, player: player }, dt);
      state = r.state;
      var ev = r.event;
      if (!ev) return null;
      try { var a = audio(); if (a && a.sfx) a.sfx(ev.sfx); if (a && a.say) a.say(ev.key); } catch (e) { /* sound is best effort */ }
      try { if (opts.toast) opts.toast('🥚 ' + ev.text); } catch (e) { /* a view never breaks the loop */ }
      try {
        if (opts.track) opts.track('carry.despacio', { kind: ev.kind });
        else if (root.SAT && root.SAT.track) root.SAT.track('carry.despacio', { kind: ev.kind });
      } catch (e) { /* telemetry never breaks play */ }
      return ev;
    }
    return { update: update, create: create };
  }

  var api = create();
  api.hurry = hurry; api.step = step; api.COOLDOWN = COOLDOWN; api.KEY = KEY; api.SFX = SFX;
  SA.missionFragile = api;
})(typeof window !== 'undefined' ? window : globalThis);
