/* SA.gait: pure, data-driven limb motion (no THREE, no DOM; unit-tested in node:vm). Never looks at an animal id.
 *
 *   SA.gait.kind(movement)            'flap' (traits.movement 'vuela': wings), 'none' (no legs: 'repta'), else 'swing' (legs)
 *   SA.gait.ease(amp, active, dt)     moves a 0..1 amplitude toward 1 (active) or 0 (rest) so limbs ease in and settle
 *   SA.gait.flap(t, amp, side, phase) wing roll (radians, rotation.z offset); mirrored for the 'right' wing
 *   SA.gait.swing(t, amp, side, index, phase)  leg swing (radians, rotation.x offset); diagonal legs move together
 *   SA.gait.pivot(h, angle)           { y, z } shift of a leg's centre so it swings from its top, not its middle
 *   SA.gait.rotateAbout(py, pz, y, z, angle)  { y, z } of a point at (y, z) turned by `angle` (rotation.x) about the pivot
 *                                     (py, pz): extra pieces (knees, feet) ride along with their parent leg
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var FLAP_RATE = 11, FLAP_AMP = 0.7;      // wing beats per second (rad/s) and peak roll
  var HOVER_AMP = 0.3;                      // flyers keep a gentle flutter while idle-hovering
  var SWING_RATE = 7, SWING_AMP = 0.5;
  var EASE_RATE = 5;                        // amplitude units per second

  function kind(movement) {
    if (movement === 'vuela') return 'flap';
    if (movement === 'repta') return 'none';
    return 'swing';
  }

  function ease(amp, active, dt) {
    var goal = active ? 1 : 0, step = EASE_RATE * Math.max(0, dt);
    if (Math.abs(goal - amp) <= step) return goal;
    return amp + (goal > amp ? step : -step);
  }

  function flap(t, amp, side, phase) {
    var beat = Math.sin(t * FLAP_RATE + (phase || 0));
    var a = HOVER_AMP + (1 - HOVER_AMP) * amp;       // hovering (amp 0) still flutters, moving flaps wide
    return -(side === 'right' ? -1 : 1) * FLAP_AMP * a * (0.35 + 0.65 * beat);
  }

  function swing(t, amp, side, index, phase) {
    var diagonal = ((side === 'right' ? 1 : 0) + ((index || 0) & 1)) & 1;
    return Math.sin(t * SWING_RATE + (phase || 0) + diagonal * Math.PI) * SWING_AMP * amp;
  }

  function pivot(h, angle) {
    var half = h / 2;
    return { y: half * (1 - Math.cos(angle)), z: -half * Math.sin(angle) };
  }

  function rotateAbout(py, pz, y, z, angle) {
    var dy = y - py, dz = z - pz, c = Math.cos(angle), s = Math.sin(angle);
    return { y: py + dy * c - dz * s, z: pz + dy * s + dz * c };
  }

  SA.gait = { kind: kind, ease: ease, flap: flap, swing: swing, pivot: pivot, rotateAbout: rotateAbout, HOVER_AMP: HOVER_AMP };
})(typeof window !== 'undefined' ? window : globalThis);
