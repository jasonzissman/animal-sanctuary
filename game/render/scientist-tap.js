/* SA.render.createScientistTap(THREE, { canvas, camera, node, getPlayer, hitsAnimal }) -> { tapAt(clientX, clientY) -> boolean }
 * A tap or click (pointerdown + pointerup without dragging) on the porch scientist talks to her (SA.npc.talk, AS-0204).
 * Only her invisible pick volume (node = the scientist group, a child flagged userData.scientist) is raycast.
 * Returns { tapAt, hits(x, y) }; hits is the bare ray test (scene.js lets the doorway tap defer to her). An animal in front
 * wins (hitsAnimal); taps are ignored while taps are paused (SA.picking.isPaused: an overlay is open) or when the player is too
 * far away (SA.npc.canTap). Thin: the rules live in game/npc.js; talking never starts a mission.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.createScientistTap = function (THREE, opts) {
    var canvas = opts.canvas, camera = opts.camera, node = opts.node;
    var raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
    var tracker = SA.picking.createTapTracker();

    function hitsScientist(x, y) {
      var r = canvas.getBoundingClientRect();
      if (!node || !r.width || !r.height) return false;
      ndc.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      var hit = raycaster.intersectObject(node, true)[0];
      return !!(hit && hit.object && hit.object.userData && hit.object.userData.scientist);
    }

    /** Talk when (x, y) is on her. Returns true when the tap was on her and handled. */
    function tapAt(x, y) {
      if (SA.picking.isPaused() || !SA.npc || !SA.npc.talk) return false;
      if (opts.hitsAnimal && opts.hitsAnimal(x, y)) return false;
      if (!hitsScientist(x, y)) return false;
      if (!SA.npc.canTap(opts.getPlayer ? opts.getPlayer() : null)) return false;
      return SA.npc.talk('tap');
    }

    canvas.addEventListener('pointerdown', function (e) { tracker.down(e.pointerId, e.clientX, e.clientY); });
    canvas.addEventListener('pointermove', function (e) { tracker.move(e.pointerId, e.clientX, e.clientY); });
    canvas.addEventListener('pointercancel', function () { tracker.cancel(); });
    canvas.addEventListener('pointerup', function (e) {
      var t = tracker.up(e.pointerId, e.clientX, e.clientY);
      if (t) tapAt(t.x, t.y);
    });

    // `hits` lets the doorway tap defer to her where the two pick volumes overlap.
    return { tapAt: tapAt, hits: hitsScientist };
  };
})(typeof window !== 'undefined' ? window : globalThis);
