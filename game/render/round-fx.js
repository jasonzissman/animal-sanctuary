/* SA.render.createRoundFx({ animals }): whole-animal reactions for the Scout & Spot round (no THREE calls; it only
 * moves the animal groups from buildAnimals, so it is testable with plain objects).
 *   fx.play(animalId, reaction)  'wobble' (wrong pick) | 'boing' (correct): pose from SA.picking.reactionPose.
 *   fx.update(dt)                call every frame; each animal returns exactly to rest when its reaction ends.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.createRoundFx = function (opts) {
    var animals = opts.animals;
    var playing = {};

    function restore(p) {
      var o = p.obj, b = p.base;
      o.position.y = b.py;
      o.rotation.x = b.rx;
      o.rotation.z = b.rz;
      o.scale.set(b.sx, b.sy, b.sz);
    }

    function play(animalId, reaction) {
      var obj = animals.getObjectByName(animalId);
      if (!obj) return false;
      if (playing[animalId]) restore(playing[animalId]);
      playing[animalId] = { obj: obj, reaction: reaction || 'wobble', t: 0, base: {
        py: obj.position.y, rx: obj.rotation.x, rz: obj.rotation.z,
        sx: obj.scale.x, sy: obj.scale.y, sz: obj.scale.z } };
      return true;
    }

    function update(dt) {
      Object.keys(playing).forEach(function (id) {
        var p = playing[id];
        p.t += dt;
        if (p.t >= SA.picking.DURATION) { restore(p); delete playing[id]; return; }
        var o = SA.picking.reactionPose(p.reaction, p.t), b = p.base;
        p.obj.position.y = b.py + o.py * 4;
        p.obj.rotation.x = b.rx + o.rx * 1.5;
        p.obj.rotation.z = b.rz + o.rz * 1.5;
        p.obj.scale.set(b.sx * o.sx, b.sy * o.sy, b.sz * o.sz);
      });
    }

    return { play: play, update: update };
  };
})(typeof window !== 'undefined' ? window : globalThis);
