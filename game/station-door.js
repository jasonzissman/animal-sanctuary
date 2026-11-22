/* SA.station door and menu hook (pure, no THREE or DOM; node:vm tested). Extends SA.station (game/station.js).
 * The doorway of the research station is a "Use" target (SA.spaceTarget kind 'door', outlined like every other target).
 * E / Enter (SA.spaceUse) or a tap on the door calls SA.station.open(); the real character customizer (AS-0144) attaches
 * to this hook and renders into the same place, so nothing here knows what the menu shows.
 *
 *   SA.station.doorTarget()            -> { id: 'station-door', kind: 'door', x, y, z, reach } (the doorway centre; one stable object)
 *   SA.station.doorTargets()           -> [doorTarget()] (the list SA.spaceUse feeds the chooser; stable array, nothing allocated)
 *   SA.station.canTapDoor(player)      -> true when a tap on the door may open it (within TAP_REACH of the doorway)
 *   SA.station.open(source?)           -> true when it newly opened, false when it already was open. Fires onOpen listeners and
 *                                         SAT.track('station.open', { source: 'use' | 'tap' | ... }) once per opening
 *   SA.station.close()                 -> true when it closed, false when it was not open. Fires onClose listeners
 *   SA.station.toggle(source?)         -> open or close, returns true when the menu is open afterwards
 *   SA.station.isOpen()
 *   SA.station.onOpen(fn) / onClose(fn)   register a listener (fn(source)); returns an unsubscribe function
 * Space is the jump key (AS-0112), so the "use" keys are E / Enter; no key is bound here (SA.spaceUse owns them).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  if (!SA || !SA.station) return;

  var DOOR_REACH = 2.6;   // the door is the Use target when the player is this close to the doorway
  var TAP_REACH = 7;      // a tap on the door opens it from this far (generous: little hands, small screens)
  var door = null, list = null, opened = false, openSource = null, openers = [], closers = [];

  function doorTarget() {
    if (!door) {
      var L = SA.station.layout();
      door = { id: 'station-door', kind: 'door', x: L.door.x, y: L.floorY + L.door.height / 2, z: L.door.z, reach: DOOR_REACH };
    }
    return door;
  }
  function doorTargets() { return list || (list = [doorTarget()]); }

  function canTapDoor(p) {
    if (!p || typeof p.x !== 'number' || typeof p.z !== 'number' || !isFinite(p.x) || !isFinite(p.z)) return false;
    var d = doorTarget(), dx = p.x - d.x, dz = p.z - d.z;
    return dx * dx + dz * dz <= TAP_REACH * TAP_REACH;
  }

  function fire(fns, arg) {
    fns.slice().forEach(function (fn) { try { fn(arg); } catch (e) { /* a listener never breaks play */ } });
  }
  function listen(fns, fn) {
    if (typeof fn !== 'function') return function () {};
    fns.push(fn);
    return function () { var i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); };
  }

  function open(source) {
    if (opened) return false;
    opened = true; openSource = source || 'api';
    try { if (root.SAT && root.SAT.track) root.SAT.track('station.open', { source: openSource }); } catch (e) { /* telemetry never blocks */ }
    fire(openers, openSource);
    return true;
  }
  function close() {
    if (!opened) return false;
    opened = false;
    fire(closers, openSource);
    return true;
  }
  function toggle(source) { if (opened) close(); else open(source); return opened; }

  SA.station.doorTarget = doorTarget;
  SA.station.doorTargets = doorTargets;
  SA.station.canTapDoor = canTapDoor;
  SA.station.open = open;
  SA.station.close = close;
  SA.station.toggle = toggle;
  SA.station.isOpen = function () { return opened; };
  SA.station.onOpen = function (fn) { return listen(openers, fn); };
  SA.station.onClose = function (fn) { return listen(closers, fn); };
  SA.station.DOOR_REACH = DOOR_REACH;
  SA.station.TAP_REACH = TAP_REACH;
})(typeof window !== 'undefined' ? window : globalThis);
