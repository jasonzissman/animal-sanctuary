/* SA.spaceTarget: the ONE thing Space acts on (pure, no THREE or DOM; loads in node:vm).
 *   var chooser = SA.spaceTarget.create();
 *   chooser.choose({ player, part, trees, pickups, doors }) -> { kind: 'part'|'tree'|'pickup'|'door', ref } | null
 *     player   { x, z, heading, climb? }   (heading 0 faces +z, like SA.player)
 *     part     the AS-0081 aim target (an in-reach body part hit, or null/undefined)
 *     trees    [{ x, z, ... }]: climbable when within SA.climb.RANGE and the player is not already up a tree
 *     pickups  [{ x, z, ... }]: finds already in collect reach (SA.pickups world.reachable(player, SPACE_RADIUS, out))
 *     doors    [{ x, z, reach? }]: e.g. the station doorway (AS-0146); in reach within `reach` (default DOOR_REACH) of its centre.
 *              It scores like everything else (distance, penalty for behind), so it hands off to a tree/pickup by proximity.
 *   Priority: the aim-target part first; otherwise the best trees/pickups, scored by distance with a penalty for being
 *   behind the player (nearest AND most in front wins). Hysteresis: the current target stays until it leaves reach or a
 *   rival scores clearly better (under KEEP of its score), so the choice (and the outline built on it) never flickers.
 *   Allocation-free per call: the returned object is reused (copy kind/ref if you keep them). Same inputs, same answer.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var BEHIND_PENALTY = 0.6;   // score = distance * (1 + 0.6 * (1 - cos(angle off heading))): 1x dead ahead, 2.2x directly behind
  var KEEP = 0.75;            // a rival must score under 75% of the current target to take over
  var FALLBACK_RANGE = 3.2;
  var DOOR_REACH = 2.6;       // default reach of a door target, from its centre

  function create() {
    var out = { kind: null, ref: null };
    var curKind = null, curRef = null;

    function score(p, x, z) {
      var dx = x - p.x, dz = z - p.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1e-6) return 0;
      var f = (Math.sin(p.heading || 0) * dx + Math.cos(p.heading || 0) * dz) / d;
      return d * (1 + BEHIND_PENALTY * (1 - f));
    }
    function num(v) { return typeof v === 'number' && isFinite(v); }

    function choose(input) {
      var p = input && input.player;
      if (!p || !num(p.x) || !num(p.z)) { curKind = curRef = null; return null; }
      if (input.part) {
        curKind = out.kind = 'part'; curRef = out.ref = input.part;
        return out;
      }
      var bestKind = null, bestRef = null, bestScore = Infinity, curScore = Infinity;
      var range = SA.climb && SA.climb.RANGE ? SA.climb.RANGE : FALLBACK_RANGE;
      var i, s, o, list = input.trees;
      if (!p.climb && list) {
        for (i = 0; i < list.length; i++) {
          o = list[i];
          if (!o || !num(o.x) || !num(o.z)) continue;
          // Every climb target (tree, peak, building: AS-0163) is in reach by the same measure SA.climb uses: within EDGE_RANGE of its base edge.
          if (SA.climb && SA.climb.edgeDistance) { if (SA.climb.edgeDistance(o, p.x, p.z) > SA.climb.EDGE_RANGE) continue; }
          else if (Math.sqrt((o.x - p.x) * (o.x - p.x) + (o.z - p.z) * (o.z - p.z)) > range) continue;
          var fp = SA.climb && SA.climb.focusPoint ? SA.climb.focusPoint(o, p.x, p.z) : o;   // a building: its nearest wall, so a wall beside the doorway beats the door
          s = score(p, fp.x, fp.z);
          if (curKind === 'tree' && curRef === o) curScore = s;
          if (s < bestScore) { bestScore = s; bestKind = 'tree'; bestRef = o; }
        }
      }
      list = input.pickups;
      if (list) {
        for (i = 0; i < list.length; i++) {
          o = list[i];
          if (!o || !num(o.x) || !num(o.z)) continue;
          s = score(p, o.x, o.z);
          if (curKind === 'pickup' && curRef === o) curScore = s;
          if (s < bestScore) { bestScore = s; bestKind = 'pickup'; bestRef = o; }
        }
      }
      list = input.doors;
      if (list) {
        for (i = 0; i < list.length; i++) {
          o = list[i];
          if (!o || !num(o.x) || !num(o.z)) continue;
          var dr = num(o.reach) ? o.reach : DOOR_REACH;
          if ((o.x - p.x) * (o.x - p.x) + (o.z - p.z) * (o.z - p.z) > dr * dr) continue;
          s = score(p, o.x, o.z);
          if (curKind === 'door' && curRef === o) curScore = s;
          if (s < bestScore) { bestScore = s; bestKind = 'door'; bestRef = o; }
        }
      }
      if (bestKind === null) { curKind = curRef = null; return null; }
      if (curScore < Infinity && bestScore > curScore * KEEP) { bestKind = curKind; bestRef = curRef; }
      curKind = out.kind = bestKind; curRef = out.ref = bestRef;
      return out;
    }

    return { choose: choose, reset: function () { curKind = curRef = null; } };
  }

  SA.spaceTarget = { DOOR_REACH: DOOR_REACH, BEHIND_PENALTY: BEHIND_PENALTY, KEEP: KEEP, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
