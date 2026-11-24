/* SA.compassView.create({ doc, runtime?, rig, camera, track? }) -> { update(dt) }: the mission compass arrow (AS-0228).
 * One big soft arrow near the top centre that points toward the current mission step's world target (SA.missionRuntime.target()),
 * turning with the camera every frame (pure maths: SA.compass). It pulses and shrinks a little when the target is close, hides when
 * the target is near and on screen (or reached), ignores taps (pointer-events: none) and is placed by SA.compass.place so it never
 * sits on the prompt pill, the star badge or the fixed buttons. No text, no numbers. A no-op without a DOM.
 * `faint: true` (AS-0365) makes the same arrow a low-opacity (0.35) hint pointer: it shows only while SA.missionDirections.hint() is true (after the 2nd
 * 🔊 repeat of a listen-only step) and points at SA.missionRuntime.hintTarget(); it hides again when the next step starts. Same placement and maths.
 *   rig  camera rig (getPlayer(), getState())      camera  object with `aspect`
 */
(function (root) {
  'use strict';
  var SA = root.SA, FAINT = 0.35;

  var CSS = 'position:fixed;z-index:3;display:none;margin:0;padding:0;pointer-events:none;' +
    'filter:drop-shadow(0 .1em .25em rgba(0,0,0,.35));';
  var SVG = '<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">' +
    '<path d="M8 36 H52 V12 L94 50 L52 88 V64 H8 Z" fill="#ffd94a" stroke="#24543a" stroke-width="6" stroke-linejoin="round"/></svg>';

  function create(o) {
    var doc = o && o.doc;
    if (!doc || typeof doc.createElement !== 'function' || !doc.body) return { update: function () { return null; } };
    var el = doc.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = CSS;
    el.innerHTML = SVG;
    doc.body.appendChild(el);
    if (o.faint) el.style.opacity = String(FAINT);
    var tracker = SA.compass.create({ track: o.faint ? function () {} : o.track }), shown = false, clock = 0, spot = null, spotKey = '';

    function runtime() { return o.runtime || SA.missionRuntime; }
    function directions() { return o.directions || SA.missionDirections; }
    function viewport() {
      var hp = SA.hudPlace;
      return hp && hp.viewport ? hp.viewport() : { width: root.innerWidth || 1280, height: root.innerHeight || 800 };
    }
    function hide() { if (shown) { el.style.display = 'none'; shown = false; } }

    return {
      update: function (dt) {
        clock += Math.max(0, dt || 0);
        var target = null;
        try {
          if (!o.faint) target = runtime() && runtime().target ? runtime().target() : null;
          else if (directions() && directions().hint()) target = runtime() && runtime().hintTarget ? runtime().hintTarget() : null;   // faint: only after the repeats
        } catch (e) { target = null; }
        var res = tracker.update(dt, { target: target, player: o.rig.getPlayer(), cam: o.rig.getState(), aspect: o.camera && o.camera.aspect });
        if (!res.show) { hide(); return res; }
        var vp = viewport(), key = vp.width + 'x' + vp.height;
        if (key !== spotKey || !spot) { spot = SA.compass.place(vp); spotKey = key; }   // the spot only changes with the window
        var pulse = res.pulse ? 1 + 0.08 * Math.sin(clock * 6) : 1;
        el.style.left = spot.left + 'px'; el.style.top = spot.top + 'px';
        el.style.width = spot.size + 'px'; el.style.height = spot.size + 'px';
        el.style.transform = 'rotate(' + (-res.angle) + 'rad) scale(' + (res.scale * pulse).toFixed(3) + ')';
        el.style.display = 'block';
        shown = true;
        return res;
      },
    };
  }

  SA.compassView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
