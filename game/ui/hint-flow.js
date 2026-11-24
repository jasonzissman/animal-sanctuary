/* SA.hintFlow.create({ doc, game, animals, rig, camera }) -> { update(dt) }: wires the pure SA.hintPointer to the round,
 * the camera and the DOM arrow (SA.hintArrow). Call update(dt) once per frame (seconds).
 *   game     SA.round game (current(), pointerHint())      animals  THREE group with getObjectByName(animalId)
 *   rig      camera rig (getState(), glideTo(x, z))        camera   object with `aspect`
 * A new round restarts the idle clock; a done round (correct pick, care task) hides the arrow. Never fails a round.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function create(o) {
    var current = null, shown = false;
    function targetPos() {
      var r = o.game.current();
      // AS-0256: any animal that fits the clue is right (r.answerIds), so point at the nearest instance of any of them.
      var obj = r && o.animals && SA.render && SA.render.instances
        ? SA.render.instances.nearest(o.animals, r.answerIds && r.answerIds.length ? r.answerIds : [r.answerId])
        : r && o.animals && o.animals.getObjectByName(r.answerId);
      return obj ? { x: obj.position.x, y: obj.position.y, z: obj.position.z } : null;
    }
    var arrow = SA.hintArrow.create(o.doc, function () { pointer.tap(targetPos()); });
    var pointer = SA.hintPointer.create({
      onHint: function () { o.game.pointerHint(); },
      glide: function (x, z) { o.rig.glideTo(x, z); },
    });

    if (SA.reach && SA.reach.onFar) SA.reach.onFar(function () { pointer.nudge(); });   // too-far tap: point the way now

    function viewport() {   // pixel size of the window; null (no avoidance) outside a browser
      var w = root.innerWidth, h = root.innerHeight;
      return w > 0 && h > 0 ? { w: w, h: h } : null;
    }
    function hide() { if (shown) { arrow.hide(); shown = false; } }

    return {
      pointer: pointer,
      update: function (dt) {
        var r = o.game.current();
        if (r !== current) { current = r; if (r && !r.done) pointer.start(); else pointer.stop(); }
        if (!r || r.done) { if (pointer.isActive()) pointer.stop(); hide(); return null; }
        var res = pointer.update(dt, targetPos(), o.rig.getState(), o.camera.aspect, viewport());
        if (!res) { hide(); return null; }
        arrow.show(res.ex, res.ey, res.angle);
        shown = true;
        return res;
      },
    };
  }

  SA.hintFlow = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
