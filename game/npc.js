/* SA.npc: pure state for the permanent NPCs (no THREE, no DOM; node:vm tested). Needs SA.station (game/station.js).
 * Today there is one: the scientist on the station porch (AS-0203). She never wanders; she reads her clipboard and waves
 * when the player comes near.
 *
 *   SA.npc.scientist()                -> { id: 'scientist', x, z, heading, nearRadius, farRadius } the fixed post in front of the station,
 *                                        beside the door (heading PI = facing -z, out toward where the kid spawns); computed once
 *   SA.npc.mode(prev, dist, cfg?)     -> 'wave' | 'idle': wave once dist <= nearRadius, back to idle only beyond farRadius
 *                                        (the gap stops flicker at the edge); prev is the previous mode
 *   SA.npc.create(cfg?)               -> a tracker { update(dt, player) -> { mode, wave, t }, state() }
 *       wave: 0..1 how far the wave pose has eased in (smooth blend), t: seconds of animation time for the idle/wave cycles
 *   SA.npc.distance(npc, player)      -> metres on the x/z plane (Infinity when the player has no finite x/z)
 *   SA.npc.obstacle()                 -> [x, z, r] a circle so the player walks around her
 * Rendering is game/render/scientist.js.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var NEAR = 4.2, FAR = 5.4, BLOCK_R = 0.45, EASE = 6;
  var post = null;

  function scientist() {
    if (!post) {
      var L = SA.station.layout();
      post = { id: 'scientist', x: L.cx + 1.9, z: L.door.z - L.wallT / 2 - 0.9, heading: Math.PI, nearRadius: NEAR, farRadius: FAR };
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

  SA.npc = { scientist: scientist, distance: distance, mode: mode, create: create, obstacle: obstacle, NEAR: NEAR, FAR: FAR };
})(typeof window !== 'undefined' ? window : globalThis);
