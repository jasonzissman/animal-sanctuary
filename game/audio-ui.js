/* Mute/sound button + first-gesture unlock for SA.audio. Always visible, large (touch friendly).
 * SA.audioUI.mount(doc, target) builds the button; it is a harmless no-op without a DOM. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var GESTURES = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
  var muteBtn = null;

  function paint(btn) {
    var muted = SA.audio.isMuted();
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.setAttribute('aria-label', muted ? 'Sonido apagado' : 'Sonido encendido');
    btn.title = muted ? 'Sonido apagado' : 'Sonido encendido';
  }

  // Unlock the AudioContext on the first user gesture, then stop listening.
  function hookGestures(target) {
    if (!target || typeof target.addEventListener !== 'function') return;
    function once() {
      SA.audio.unlock();
      GESTURES.forEach(function (g) { target.removeEventListener(g, once, true); });
    }
    GESTURES.forEach(function (g) { target.addEventListener(g, once, true); });
  }

  function mount(doc, target) {
    hookGestures(root);
    if (!doc || typeof doc.createElement !== 'function') return null;
    var btn = doc.createElement('button');
    btn.id = 'mute-btn';
    btn.type = 'button';
    var s = btn.style;
    s.position = 'fixed'; s.zIndex = '10'; s.lineHeight = '1';
    s.borderRadius = '50%'; s.border = '4px solid #24543a'; s.background = '#fff8d6';
    s.cursor = 'pointer'; s.padding = '0'; s.touchAction = 'manipulation';
    paint(btn);
    // The rect comes from SA.hud 'audioUi' (SA.hudPlace sets left/top/width/height; index.html always loads it before mount()).
    if (SA.hudPlace) SA.hudPlace.register('audioUi', btn, { reserve: true, onPlace: function (r) { s.fontSize = Math.round(r.height * 0.53) + 'px'; } });
    btn.addEventListener('click', function () {
      SA.audio.unlock();
      SA.audio.toggleMute();
      paint(btn);
      SA.audio.sfx('pop');
    });
    muteBtn = btn;
    var host = target || doc.body;
    if (host && typeof host.appendChild === 'function') host.appendChild(btn);
    return btn;
  }

  // Repaints the mute button after the mute state changed elsewhere (e.g. the grown-up drawer).
  function refresh() { if (muteBtn) paint(muteBtn); }

  SA.audioUI = { mount: mount, hookGestures: hookGestures, refresh: refresh };
})(typeof window !== 'undefined' ? window : globalThis);
