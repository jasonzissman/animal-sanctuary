/* SA.npc: pure state for the permanent NPCs (no THREE, no DOM; node:vm tested). Needs SA.station (game/station.js).
 * Today there is one: the scientist on the station porch (AS-0203). She never wanders; she reads her clipboard and waves
 * when the player comes near.
 *
 *   SA.npc.scientist()                -> { id: 'scientist', x, z, heading, nearRadius, farRadius } the fixed post in front of the station,
 *                                        beside the door (heading PI = facing -z, out toward the kid, who spawns straight in front of her facing her, AS-0212); computed once
 *   SA.npc.mode(prev, dist, cfg?)     -> 'wave' | 'idle': wave once dist <= nearRadius, back to idle only beyond farRadius
 *                                        (the gap stops flicker at the edge); prev is the previous mode
 *   SA.npc.create(cfg?)               -> a tracker { update(dt, player) -> { mode, wave, t }, state() }
 *       wave: 0..1 how far the wave pose has eased in (smooth blend), t: seconds of animation time for the idle/wave cycles
 *   SA.npc.distance(npc, player)      -> metres on the x/z plane (Infinity when the player has no finite x/z)
 *   SA.npc.obstacle()                 -> [x, z, r] a circle so the player walks around her
 *   SA.npc.useTarget() / useTargets() -> { id:'scientist', kind:'npc', x, z, reach } (stable; SA.spaceUse's doors list takes it, E / Enter)
 *   SA.npc.canTap(player)             -> true within TAP_REACH of her (a tap on her generous pick volume may talk)
 *   SA.npc.talk(source) / onTalk(fn)  the hook: talk fires the listeners (game/ui/scientist-view.js shows the reminder card);
 *                                     it never starts a mission. Returns true when a listener handled it.
 * Rendering is game/render/scientist.js.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var NEAR = 4.2, FAR = 5.4, BLOCK_R = 0.45, EASE = 6, USE_REACH = 2.8, TAP_REACH = 7;
  var post = null;

  function scientist() {
    if (!post) {
      var L = SA.station.layout();
      post = { id: 'scientist', x: L.scientist.x, z: L.scientist.z, heading: Math.PI, nearRadius: NEAR, farRadius: FAR };
    }
    return post;
  }

  function distance(npc, p) {
    if (!npc || !p || typeof p.x !== 'number' || typeof p.z !== 'number' || !isFinite(p.x) || !isFinite(p.z)) return Infinity;
    var dx = p.x - npc.x, dz = p.z - npc.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function mode(prev, dist, cfg) {
    var near = (cfg && cfg.nearRadius) || NEAR, far = Math.max(near, (cfg && cfg.farRadius) || FAR);
    if (!(dist >= 0)) return 'idle';
    if (dist <= near) return 'wave';
    if (dist > far) return 'idle';
    return prev === 'wave' ? 'wave' : 'idle';
  }

  function create(cfg) {
    var npc = (cfg && cfg.npc) || scientist(), s = { mode: 'idle', wave: 0, t: 0 };
    function update(dt, player) {
      dt = Math.max(0, Math.min(0.1, +dt || 0));
      s.mode = mode(s.mode, distance(npc, player), npc);
      s.wave += ((s.mode === 'wave' ? 1 : 0) - s.wave) * Math.min(1, dt * EASE);
      s.t += dt;
      return s;
    }
    return { update: update, state: function () { return s; } };
  }

  function obstacle() { var p = scientist(); return [p.x, p.z, BLOCK_R]; }

  // Using her (AS-0204): a Use target for SA.spaceTarget's list, a generous tap range, and a hook the talk card listens to.
  var target = null, targets = null, talkers = [];
  function useTarget() {
    if (!target) { var p = scientist(); target = { id: 'scientist', kind: 'npc', x: p.x, z: p.z, reach: USE_REACH }; }
    return target;
  }
  function useTargets() { return targets || (targets = [useTarget()]); }
  function canTap(player) { return distance(scientist(), player) <= TAP_REACH; }
  /** Fire the talk listeners (the reminder card). Returns true when at least one listener handled it. */
  function talk(source) {
    var handled = false;
    talkers.slice().forEach(function (fn) { try { if (fn(source || 'api') !== false) handled = true; } catch (e) { /* a listener never breaks play */ } });
    return handled;
  }
  function onTalk(fn) {
    if (typeof fn !== 'function') return function () {};
    talkers.push(fn);
    return function () { var i = talkers.indexOf(fn); if (i >= 0) talkers.splice(i, 1); };
  }

  SA.npc = { scientist: scientist, distance: distance, mode: mode, create: create, obstacle: obstacle, NEAR: NEAR, FAR: FAR,
    useTarget: useTarget, useTargets: useTargets, canTap: canTap, talk: talk, onTalk: onTalk, USE_REACH: USE_REACH, TAP_REACH: TAP_REACH };
})(typeof window !== 'undefined' ? window : globalThis);
