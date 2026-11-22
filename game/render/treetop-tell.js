/* SA.render.createTreetopTell(THREE, opts): the "look up!" tell for tree animals (AS-0117). Thin: rules are in SA.treetopTell.
 *   opts = { animals: Group, trees: [{x,z}], treeNodes: [Object3D] (same order as trees), getPlayer, scene }
 *   -> { update(dt), entries }
 * Per perched animal (userData.perched): a round shadow on the ground below it, and now and then the tree under it
 * rustles (a small lean) with a soft call while the player is near. Meshes are created once; update() allocates nothing.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.createTreetopTell = function (THREE, opts) {
    var T = SA.treetopTell, M = SA.map, entries = [], clock = 0, seed = 300;
    var geo = new THREE.CircleGeometry(1, 14);
    var mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
    opts.animals.children.forEach(function (g) {
      if (!g.userData || !g.userData.perched) return;
      var m = new THREE.Mesh(geo, mat.clone());
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 1;
      opts.scene.add(m);
      entries.push({ g: g, shadow: m, tell: T.create({ seed: seed++ }), tree: -1 });
    });

    function lean(i, x, z) { var n = opts.treeNodes[i]; if (n) { n.rotation.x = x; n.rotation.z = z; } }

    function update(dt) {
      clock += dt;
      var p = opts.getPlayer && opts.getPlayer();
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i], g = e.g, shown = g.visible !== false;
        e.shadow.visible = shown;
        if (shown) {
          var ground = M.groundHeight(g.position.x, g.position.z), sh = T.shadow(g.position.y - ground);
          e.shadow.position.set(g.position.x, ground + 0.06, g.position.z);
          e.shadow.scale.set(sh.scale, sh.scale, 1);
          e.shadow.material.opacity = sh.opacity;
        }
        var r = e.tell.update(dt, shown && p ? Math.hypot(p.x - g.position.x, p.z - g.position.z) : null);
        if (r.call > 0 && SA.audio) SA.audio.sfx('chirp', r.call);
        var ti = r.rustle > 0 ? T.treeIndex(opts.trees, g.position.x, g.position.z) : -1;
        if (ti !== e.tree && e.tree >= 0) lean(e.tree, 0, 0);   // hopped to another tree mid-rustle, or it ended: settle the old one
        e.tree = ti;
        if (ti >= 0) lean(ti, T.shake(r.rustle, clock + 1.3) * 0.7, T.shake(r.rustle, clock));
      }
    }
    return { update: update, entries: entries };
  };
})(typeof window !== 'undefined' ? window : globalThis);
