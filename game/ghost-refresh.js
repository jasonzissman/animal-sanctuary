/* SA.ghostRefresh: pure "show the placement ghost right now?" decision (no THREE, no DOM; node:vm tested).
 *   SA.ghostRefresh.decide({ active, selected, last })
 *     active    true while the sandbox is open
 *     selected  the tray-selected prop id (or null)
 *     last      the last known mouse position over the canvas { x, y } in client pixels, or null (unknown / touch)
 *   -> { show: true, propId, x, y } when the ghost should appear straight away (a prop was just picked from the tray and
 *      the mouse position is known), otherwise { show: false } and the render layer does nothing extra.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function decide(state) {
    var s = state || {};
    var p = s.last;
    if (!s.active || !s.selected || !p || typeof p.x !== 'number' || typeof p.y !== 'number' || !isFinite(p.x) || !isFinite(p.y)) {
      return { show: false };
    }
    return { show: true, propId: s.selected, x: p.x, y: p.y };
  }

  SA.ghostRefresh = { decide: decide };
})(typeof window !== 'undefined' ? window : globalThis);
