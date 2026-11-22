/* SA.render.createTreeTap(THREE, { canvas, camera, decor, hitsAnimal, onTap }): tapping a tree in the decor.
 * A tap (pointerdown + pointerup without dragging) that does not land on an animal makes the tree wobble and calls
 * onTap({ id, biome }) where id is the tree's stable index in the decor group and biome the biome id under it.
 * Only objects flagged userData.tree are raycast. Ignored while the habitat sandbox owns taps (SA.picking.isPaused).
 * Returns { update(dt), tapAt(clientX, clientY) -> {id, biome} | null, sparkle(id) -> boolean (glints above tree id) }. Call update(dt) every frame.
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
    var sparkles = [];    // { tree, t, bits }: the subtle "keep tapping" cue (SA.treeCue), never any text
    var sparkleMat = new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0 });
    var sparkleGeo = new THREE.OctahedronGeometry(1, 0);

    function dropSparkle(sp) { sp.bits.forEach(function (b) { sp.tree.remove(b); b.material.dispose(); }); }

    // A few tiny star glints rise above the tree (id = decor child index).
    function sparkle(id) {
      var tree = decor.children[id];
      if (!tree || !(tree.userData && tree.userData.tree) || !SA.treeCue) return false;
      sparkles = sparkles.filter(function (s) { if (s.tree !== tree) return true; dropSparkle(s); return false; });
      var box = new THREE.Box3().setFromObject(tree), top = (box.max.y - tree.position.y) / (tree.scale.y || 1);
      var bits = [];
      for (var i = 0; i < SA.treeCue.COUNT; i++) {
        var m = new THREE.Mesh(sparkleGeo, sparkleMat.clone());
        m.userData.baseY = top * 0.8;
        m.visible = false;
        tree.add(m);
        bits.push(m);
      }
      sparkles.push({ tree: tree, t: 0, bits: bits });
      return true;
    }

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
      sparkle: sparkle,
      update: function (dt) {
        sparkles = sparkles.filter(function (sp) {
          sp.t += dt;
          var live = sp.t < SA.treeCue.DURATION;
          sp.bits.forEach(function (b, i) {
            var p = live ? SA.treeCue.pose(i, sp.t) : null;
            b.visible = !!p;
            if (!p) return;
            b.position.set(p.dx, b.userData.baseY + p.dy, i % 2 ? 0.3 : -0.3);
            b.scale.setScalar(p.scale);
            b.material.opacity = p.opacity;
            b.rotation.y += dt * 3;
          });
          if (!live) dropSparkle(sp);
          return live;
        });
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
