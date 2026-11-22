/* SA.render.createTreeTap(THREE, { canvas, camera, decor, hitsAnimal, onTap }): tapping a tree in the decor.
 * A tap (pointerdown + pointerup without dragging) that does not land on an animal makes the tree wobble and calls
 * onTap({ id, biome }) where id is the tree's stable index in the decor group and biome the biome id under it.
 * Only objects flagged userData.tree are raycast. Ignored while the habitat sandbox owns taps (SA.picking.isPaused).
 * Returns { update(dt), tapAt(clientX, clientY) -> {id, biome} | null }. Call update(dt) every frame.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.createTreeTap = function (THREE, opts) {
    var canvas = opts.canvas, camera = opts.camera, decor = opts.decor;
    var raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
    var tracker = SA.picking.createTapTracker();
    var trees = decor.children.filter(function (o) { return o.userData && o.userData.tree; });
    var wobbling = [];    // { tree, t }

    function tapAt(x, y) {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      ndc.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      var hit = raycaster.intersectObjects(trees, true)[0];
      if (!hit) return null;
      var tree = hit.object;
      while (tree && !(tree.userData && tree.userData.tree)) tree = tree.parent;
      if (!tree) return null;
      return { tree: tree, id: decor.children.indexOf(tree), biome: SA.map.biomeAt(tree.position.x) };
    }

    canvas.addEventListener('pointerdown', function (e) { tracker.down(e.pointerId, e.clientX, e.clientY); });
    canvas.addEventListener('pointermove', function (e) { tracker.move(e.pointerId, e.clientX, e.clientY); });
    canvas.addEventListener('pointercancel', function () { tracker.cancel(); });
    canvas.addEventListener('pointerup', function (e) {
      var t = tracker.up(e.pointerId, e.clientX, e.clientY);
      if (!t || SA.picking.isPaused()) return;
      if (opts.hitsAnimal && opts.hitsAnimal(t.x, t.y)) return;   // an animal in front of the tree wins
      var hit = tapAt(t.x, t.y);
      if (!hit) return;
      wobbling = wobbling.filter(function (w) { if (w.tree !== hit.tree) return true; w.tree.rotation.z = 0; return false; });
      wobbling.push({ tree: hit.tree, t: 0 });
      if (SA.audio && SA.audio.sfx) SA.audio.sfx('pop');
      if (opts.onTap) opts.onTap({ id: hit.id, biome: hit.biome });
    });

    return {
      tapAt: tapAt,
      update: function (dt) {
        wobbling = wobbling.filter(function (w) {
          w.t += dt;
          if (w.t >= SA.picking.DURATION) { w.tree.rotation.z = 0; return false; }
          w.tree.rotation.z = SA.picking.reactionPose('wobble', w.t).rz * 0.5;
          return true;
        });
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
