/* SA.orbitButtons: pure mapping from the on-screen rotate/tilt buttons to camera orbit axes.
 * Axes use the same convention as the keyboard (Q/E = yaw -1/+1, F/R = pitch -1/+1), so the camera rig feeds
 * them through the same clamped SA.camera.orbitByKeys path. No DOM, no THREE: unit-testable in node:vm.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var MIN_SIZE = 44;   // px: smallest allowed touch target
  var BUTTONS = [
    { id: 'rotLeft', icon: '↺', label: 'Girar a la izquierda', yaw: -1, pitch: 0 },    // = Q
    { id: 'rotRight', icon: '↻', label: 'Girar a la derecha', yaw: 1, pitch: 0 },      // = E
    { id: 'tiltUp', icon: '▲', label: 'Mirar desde arriba', yaw: 0, pitch: 1 },        // = R
    { id: 'tiltDown', icon: '▼', label: 'Mirar desde abajo', yaw: 0, pitch: -1 },      // = F
  ];

  function find(id) {
    for (var i = 0; i < BUTTONS.length; i++) if (BUTTONS[i].id === id) return BUTTONS[i];
    return null;
  }

  /** Axes { yaw, pitch } (each -1, 0 or 1) for one button id; unknown ids give { 0, 0 }. */
  function axesFor(id) {
    var b = find(id);
    return b ? { yaw: b.yaw, pitch: b.pitch } : { yaw: 0, pitch: 0 };
  }

  /** Combined axes for every button currently held (ids array). Opposite buttons cancel out. */
  function combine(ids) {
    var yaw = 0, pitch = 0;
    (ids || []).forEach(function (id) { var a = axesFor(id); yaw += a.yaw; pitch += a.pitch; });
    return { yaw: Math.max(-1, Math.min(1, yaw)), pitch: Math.max(-1, Math.min(1, pitch)) };
  }

  SA.orbitButtons = { BUTTONS: BUTTONS, MIN_SIZE: MIN_SIZE, axesFor: axesFor, combine: combine };
})(typeof window !== 'undefined' ? window : globalThis);
