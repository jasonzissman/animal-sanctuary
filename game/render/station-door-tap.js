/* SA.render.createStationDoorTap(THREE, { canvas, camera, node, getPlayer, hitsAnimal }) -> { tapAt(clientX, clientY) -> boolean }
 * A tap or click (pointerdown + pointerup without dragging) on the station doorway opens the station menu hook (SA.station.open).
 * Only the door's pick volume (node = the frame group from SA.render.buildStation, children flagged userData.stationDoor) is
 * raycast. An animal in front of the door wins (hitsAnimal), and taps are ignored while taps are paused (SA.picking.isPaused,
 * e.g. the album is open) or when the player is too far away (SA.station.canTapDoor). Thin: the rules live in game/station-door.js.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.createStationDoorTap = function (THREE, opts) {
    var canvas = opts.canvas, camera = opts.camera, node = opts.node;
    var raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
    var tracker = SA.picking.createTapTracker();

    function hitsDoor(x, y) {
      var r = canvas.getBoundingClientRect();
      if (!node || !r.width || !r.height) return false;
      ndc.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      var hit = raycaster.intersectObject(node, true)[0];
      return !!(hit && hit.object && hit.object.userData && hit.object.userData.stationDoor);
    }

    /** Open the menu when (x, y) is on the door. Returns true when the tap was on the door and handled. */
    function tapAt(x, y) {
      if (SA.picking.isPaused() || !SA.station || !SA.station.open) return false;
      if (opts.hitsAnimal && opts.hitsAnimal(x, y)) return false;
      if (!hitsDoor(x, y)) return false;
      if (!SA.station.canTapDoor(opts.getPlayer ? opts.getPlayer() : null)) return false;
      SA.station.open('tap');
      return true;
    }

    canvas.addEventListener('pointerdown', function (e) { tracker.down(e.pointerId, e.clientX, e.clientY); });
    canvas.addEventListener('pointermove', function (e) { tracker.move(e.pointerId, e.clientX, e.clientY); });
    canvas.addEventListener('pointercancel', function () { tracker.cancel(); });
    canvas.addEventListener('pointerup', function (e) {
      var t = tracker.up(e.pointerId, e.clientX, e.clientY);
      if (t) tapAt(t.x, t.y);
    });

    return { tapAt: tapAt };
  };
})(typeof window !== 'undefined' ? window : globalThis);
