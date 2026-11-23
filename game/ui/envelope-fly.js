/* SA.envelopeFly: a proof photo "sent to the station" shows a little envelope flying to the station icon (AS-0208, slice 3 of AS-0143).
 *
 *   SA.envelopeFly.frame(t, from, to) -> { env: { x, y, scale, opacity }, chip: { opacity, scale }, done }   PURE timing/curve (node:vm tested)
 *       t seconds since the flight began; from / to are px points. The envelope eases from `from` to `to` along a small arc in FLY_S
 *       and is hidden on arrival; the 🏠 station chip fades in at `to`, pops when the envelope lands and fades out over LINGER_S.
 *   SA.envelopeFly.create({ doc, rig, camera, proofs?, audio?, viewport? }) -> { fly(), update(dt), isFlying(), element, chip }
 *       Subscribes to SA.proofs.onSent: every newly recorded proof (rescue or mission photo) starts one flight (a second proof restarts it).
 *       Flies from the screen centre (where the photo was framed) to the station's spot on screen: SA.hintPointer.locate of the station
 *       (its true spot while in view, otherwise pushed to the screen edge like the hint arrow). The target is re-projected every frame so it
 *       follows the camera. A soft SA.audio 'whoosh' plays (silent when muted: SA.audio.sfx honours Mute). Everything is pointer-events:none,
 *       never pauses input and never waits on anything, so the next mission starts right away. A no-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var FLY_S = 0.9, LINGER_S = 0.35, ARC_PX = 70, SIZE = 44;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(p) { return p * p * (3 - 2 * p); }

  function frame(t, from, to) {
    t = Math.max(0, +t || 0);
    var p = clamp01(t / FLY_S), e = ease(p), landed = t >= FLY_S;
    var env = {
      x: from.x + (to.x - from.x) * e,
      y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * p) * ARC_PX,
      scale: 1.5 - 0.7 * e,
      opacity: landed ? 0 : clamp01(p / 0.12)
    };
    var since = t - FLY_S, chip;
    if (landed) chip = { opacity: clamp01(1 - since / LINGER_S), scale: 1 + 0.4 * Math.sin(Math.PI * clamp01(since / 0.25)) };
    else chip = { opacity: clamp01(t / 0.2), scale: 1 };
    return { env: env, chip: chip, done: t >= FLY_S + LINGER_S };
  }

  // Click-through, top-left anchored layers moved with transform (no numeric offsets on fixed elements; see test/hud-place.test.js).
  var CSS = 'position:fixed;top:0;left:0;z-index:5;display:none;pointer-events:none;margin:0;padding:0;line-height:1;' +
    'width:' + SIZE + 'px;height:' + SIZE + 'px;font-size:' + SIZE + 'px;text-align:center;will-change:transform,opacity;';
  var CHIP_CSS = CSS + 'z-index:4;border-radius:50%;background:rgba(255,248,214,.9);border:.08em solid #24543a;font-size:' + Math.round(SIZE * 0.6) +
    'px;line-height:' + SIZE + 'px;box-sizing:border-box;';

  function create(o) {
    o = o || {};
    var doc = o.doc;
    var none = { fly: function () { return false; }, update: function () { return false; }, isFlying: function () { return false; } };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body) return none;
    var el = doc.createElement('div'), chip = doc.createElement('div');
    el.setAttribute('aria-hidden', 'true'); chip.setAttribute('aria-hidden', 'true');
    el.style.cssText = CSS; chip.style.cssText = CHIP_CSS;
    el.textContent = '✉️'; chip.textContent = '🏠';
    doc.body.appendChild(chip); doc.body.appendChild(el);
    var t = -1;   // < 0: not flying

    function proofs() { return o.proofs || SA.proofs; }
    function audio() { return o.audio || SA.audio; }
    function viewport() {
      if (o.viewport) return o.viewport();
      var hp = SA.hudPlace;
      return hp && hp.viewport ? hp.viewport() : { width: root.innerWidth || 1280, height: root.innerHeight || 800 };
    }
    // Where the station icon sits on screen (px, centre), or null when nothing can be projected.
    function stationSpot(vp) {
      try {
        var L = SA.station && SA.station.layout(), hp = SA.hintPointer;
        if (!L || !hp || !o.rig) return null;
        var r = hp.locate({ x: L.cx, y: L.floorY + L.wallH / 2, z: L.cz }, o.rig.getState(), o.camera && o.camera.aspect || vp.width / vp.height);
        var rect = { left: Math.round((r.ex + 1) / 2 * vp.width - SIZE / 2), top: Math.round((1 - r.ey) / 2 * vp.height - SIZE / 2), width: SIZE, height: SIZE };
        if (SA.hudPlace && SA.hudPlace.nudge && SA.hud) rect = SA.hudPlace.nudge(rect);
        return { x: rect.left + SIZE / 2, y: rect.top + SIZE / 2 };
      } catch (e) { return null; }
    }
    function fly() {
      t = 0;
      try { var a = audio(); if (a && a.sfx) a.sfx('whoosh'); } catch (e) { /* sound is best effort */ }
      return true;
    }
    function put(node, x, y, scale, opacity) {
      node.style.transform = 'translate(' + (x - SIZE / 2).toFixed(1) + 'px,' + (y - SIZE / 2).toFixed(1) + 'px) scale(' + scale.toFixed(3) + ')';
      node.style.opacity = opacity.toFixed(3);
      node.style.display = opacity > 0 ? 'block' : 'none';
    }
    function hide() { el.style.display = 'none'; chip.style.display = 'none'; t = -1; }

    function update(dt) {
      if (t < 0) return false;
      t += Math.max(0, Math.min(0.25, +dt || 0));
      var vp = viewport(), from = { x: vp.width / 2, y: vp.height / 2 }, to = stationSpot(vp);
      if (!to) { hide(); return false; }
      var f = frame(t, from, to);
      if (f.done) { hide(); return false; }
      put(el, f.env.x, f.env.y, f.env.scale, f.env.opacity);
      put(chip, to.x, to.y, f.chip.scale, f.chip.opacity);
      return true;
    }

    if (proofs() && proofs().onSent) proofs().onSent(function () { fly(); });
    return { fly: fly, update: update, isFlying: function () { return t >= 0; }, element: el, chip: chip };
  }

  SA.envelopeFly = { create: create, frame: frame, FLY_S: FLY_S, LINGER_S: LINGER_S };
})(typeof window !== 'undefined' ? window : globalThis);
