/* SA.spaceUse.create({ getPlayer, trees, pickups, picking, rig, collect, root? }) -> { update(), target(), use() }
 * The single Space dispatcher. Each frame update() asks SA.spaceTarget which one thing Space would act on (the aim part, else
 * the best tree / pickup in reach); pressing Space acts on exactly that: use the part (picking.useTarget), climb the tree
 * (rig.climbTree) or collect the pickup (collect(spot)). Never two actions. With no target Space does nothing, except that up
 * a tree it still climbs down (rig.climbPrompt() === 'down'). The C key (camera rig) and the touch use/climb buttons are
 * separate paths. Arrow keys / WASD are never touched here. No THREE or DOM needed; deps are injected.
 *   getPlayer() -> { x, z, heading, climb }   trees() -> [tree]   pickups.reachable(player, radius, out) fills `out`
 *   picking { target(), useTarget() }   rig { climbTree(tree), toggleClimb(), climbPrompt() }
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.spaceUse = SA.spaceUse || {};

  SA.spaceUse.create = function (opts) {
    var chooser = SA.spaceTarget.create(), found = [], input = { player: null, part: null, trees: null, pickups: found };
    var current = null;
    var radius = SA.pickups && SA.pickups.SPACE_RADIUS ? SA.pickups.SPACE_RADIUS : 2.4;

    function update() {
      var p = opts.getPlayer && opts.getPlayer();
      input.player = p;
      input.part = opts.picking && opts.picking.target ? opts.picking.target() : null;
      input.trees = opts.trees ? opts.trees() : null;
      found.length = 0;
      if (p && !input.part && opts.pickups && opts.pickups.reachable) opts.pickups.reachable(p, radius, found);
      current = chooser.choose(input);
      return current;
    }

    function canDescend() { return !!(opts.rig && opts.rig.climbPrompt && opts.rig.climbPrompt() === 'down'); }

    /** Act on the chosen target. Returns true when something was done. */
    function use() {
      var t = update();
      if (t) {
        if (t.kind === 'part') return !!opts.picking.useTarget();
        if (t.kind === 'tree') { opts.rig.climbTree(t.ref); return true; }
        if (t.kind === 'pickup') return !!opts.collect(t.ref);
        return false;
      }
      if (canDescend()) { opts.rig.toggleClimb(); return true; }
      return false;
    }

    function onKey(e) {
      if ((e.key !== ' ' && e.code !== 'Space') || e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      if (!update() && !canDescend()) return;   // nothing to act on: Space is left alone
      if (e.preventDefault) e.preventDefault();
      if (!e.repeat) use();
    }
    var target = opts.root || root;
    if (typeof target.addEventListener === 'function') target.addEventListener('keydown', onKey);

    return { update: update, use: use, target: function () { return current; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
