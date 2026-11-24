/* SA.station missions-board target and menu hook (pure, no THREE or DOM; node:vm tested). Extends SA.station (game/station.js).
 * The "Lista de misiones" board inside the research station (layout().board, AS-0210) is the "Use" target that opens the missions
 * (AS-0211): SA.spaceTarget kind 'board', outlined like every other target. E / Enter (SA.spaceUse) or a tap on the board calls
 * SA.station.open(); ui/missions-board-view.js (and the customizer) attach to that hook, so nothing here knows what the menu shows.
 * The door frame is NOT a target: walking through the doorway just enters.
 *
 *   SA.station.boardTarget()           -> { id: 'station-board', kind: 'board', x, y, z, reach } (the board's centre; one stable object)
 *   SA.station.badgesTarget()          -> { id: 'station-badges', kind: 'board', source: 'badges', x, y, z, reach }: the "Insignias" board
 *                                         on the front wall (AS-0239). Same Use pattern; it opens the card with source 'badges'
 *   SA.station.bedTarget()             -> { id: 'station-bed', kind: 'board', source: 'bed', x, y, z, reach }: the bed (AS-0170); it sleeps, it opens no card
 *   SA.station.boardTargets()          -> [boardTarget(), badgesTarget(), bedTarget()] (the list SA.spaceUse feeds the chooser; stable array, nothing allocated)
 *   SA.station.canTapBoard(player, target?) -> true when a tap on a board (default: the missions one) may open it (within TAP_REACH of it)
 *   SA.station.openSource()            -> the source the card was opened with ('board' | 'tap' | 'badges' | ...), null while closed
 *   SA.station.open(source?)           -> true when it newly opened, false when it already was open. Fires onOpen listeners and
 *                                         SAT.track('station.open', { source: 'board' | 'tap' | ... }) once per opening
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

  var BOARD_REACH = 3.0;  // the board is the Use target when the player is this close to it (SA.spaceTarget.BOARD_REACH)
  var TAP_REACH = 8;      // a tap on the board opens it from this far (generous: little hands, small screens; the room is ~5 deep)
  var board = null, badges = null, bed = null, list = null, opened = false, openSource = null, openers = [], closers = [];

  function boardTarget() {
    if (!board) {
      var B = SA.station.layout().board;
      board = { id: 'station-board', kind: 'board', x: B.x, y: B.y, z: B.z, reach: BOARD_REACH };
    }
    return board;
  }
  function badgesTarget() {
    if (!badges) {
      var K = SA.station.layout().badgesBoard;
      badges = { id: 'station-badges', kind: 'board', source: 'badges', x: K.x, y: K.y, z: K.z, reach: BOARD_REACH };
    }
    return badges;
  }
  // The bed (AS-0170): the same Use pattern with source 'bed'. The scene turns it into SA.daynight.sleep() (no card opens).
  function bedTarget() {
    if (!bed) {
      var B = SA.station.layout().bed;
      bed = { id: 'station-bed', kind: 'board', source: 'bed', x: B.x, y: SA.station.layout().floorY + B.h, z: B.z, reach: BOARD_REACH };
    }
    return bed;
  }
  function boardTargets() { return list || (list = [boardTarget(), badgesTarget(), bedTarget()]); }

  function canTapBoard(p, target) {
    if (!p || typeof p.x !== 'number' || typeof p.z !== 'number' || !isFinite(p.x) || !isFinite(p.z)) return false;
    var b = target || boardTarget(), dx = p.x - b.x, dz = p.z - b.z;
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

  SA.station.boardTarget = boardTarget;
  SA.station.badgesTarget = badgesTarget;
  SA.station.bedTarget = bedTarget;
  SA.station.boardTargets = boardTargets;
  SA.station.openSource = function () { return opened ? openSource : null; };
  SA.station.canTapBoard = canTapBoard;
  SA.station.open = open;
  SA.station.close = close;
  SA.station.toggle = toggle;
  SA.station.isOpen = function () { return opened; };
  SA.station.onOpen = function (fn) { return listen(openers, fn); };
  SA.station.onClose = function (fn) { return listen(closers, fn); };
  SA.station.BOARD_REACH = BOARD_REACH;
  SA.station.TAP_REACH = TAP_REACH;
})(typeof window !== 'undefined' ? window : globalThis);
