/* SA.joystick: pure mapping from a thumb position on the on-screen joystick to walking input (no DOM, no THREE).
 *
 *   SA.joystick.vector(dx, dy, radius) -> { x, y, mag }  thumb offset from the joystick centre in px (screen: +x right,
 *     +y down) -> unit-disc vector. Inside the dead zone it is { 0, 0, 0 }; outside, the magnitude is eased from 0 at
 *     the dead-zone edge to 1 at the rim (and stays 1 beyond it), so small thumb wobbles never move the player.
 *   SA.joystick.toInput(v) -> { forward, back, left, right }  analog 0..1 axes for SA.player.step: up = forward,
 *     down = back, left/right turn the avatar (the same meaning as the arrow keys).
 *   SA.joystick.isTouch(pointerType) -> true for 'touch' and 'pen', so the stick only appears once a finger is used.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var DEAD_ZONE = 0.18;   // fraction of the radius

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

  function vector(dx, dy, radius) {
    dx = num(dx); dy = num(dy);
    if (!(radius > 0) || !isFinite(radius)) return { x: 0, y: 0, mag: 0 };
    var d = Math.sqrt(dx * dx + dy * dy) / radius;
    if (d <= DEAD_ZONE) return { x: 0, y: 0, mag: 0 };
    var mag = Math.min(1, (d - DEAD_ZONE) / (1 - DEAD_ZONE));
    var k = mag / d;   // scale the raw ratio so the direction is kept and the length becomes `mag`
    return { x: dx / radius * k, y: dy / radius * k, mag: mag };
  }

  function toInput(v) {
    var x = v ? num(v.x) : 0, y = v ? num(v.y) : 0;
    return { forward: Math.max(0, -y), back: Math.max(0, y), left: Math.max(0, -x), right: Math.max(0, x) };
  }

  function isTouch(pointerType) { return pointerType === 'touch' || pointerType === 'pen'; }

  SA.joystick = { DEAD_ZONE: DEAD_ZONE, vector: vector, toInput: toInput, isTouch: isTouch };
})(typeof window !== 'undefined' ? window : globalThis);
