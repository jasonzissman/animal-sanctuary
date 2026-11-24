/* SA.render.createMissionBananas(THREE, { scene, thing? }): draws the mission's banana pickups (AS-0326): a small curved bunch of three
 * yellow fingers with brown tips, from primitives. They follow SA.missionBananas (pure: where they are, which are still untaken), bob and
 * turn gently ("pick me up"), and vanish when taken or when the mission ends. Nothing here knows a mission id.
 *   update(dt)   once per frame; returns the group it manages
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var YELLOW = 0xf6d33c, TIP = 0x6b4a22, LIFT = 0.7;

  function flat(THREE, c) { return new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 0 }); }

  // One bunch: three bent fingers fanned around a stalk (each finger = two tilted cylinders and a brown tip).
  function bunchModel(THREE) {
    var g = new THREE.Group();
    for (var i = 0; i < 3; i++) {
      var f = new THREE.Group();
      var lower = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.34, 6), flat(THREE, YELLOW));
      lower.position.set(0, 0.17, 0);
      lower.rotation.z = 0.25;
      var upper = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.3, 6), flat(THREE, YELLOW));
      upper.position.set(0.1, 0.45, 0);
      upper.rotation.z = -0.1;
      var tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), flat(THREE, TIP));
      tip.position.set(0.09, 0.62, 0);
      f.add(lower, upper, tip);
      f.rotation.y = (i / 3) * Math.PI * 2;
      f.position.set(Math.cos(f.rotation.y) * 0.06, 0, Math.sin(f.rotation.y) * 0.06);
      g.add(f);
    }
    g.scale.set(1.5, 1.5, 1.5);   // big and readable for small hands
    return g;
  }

  SA.render.createMissionBananas = function (THREE, opts) {
    var thing = opts.thing || SA.missionBananas;
    if (opts.solids && thing.setSolids) thing.setSolids(opts.solids);
    var group = new THREE.Group();
    group.name = 'missionBananas';
    opts.scene.add(group);
    var key = null, bunches = [], t = 0;

    function rebuild(cur) {
      while (group.children.length) group.remove(group.children[0]);
      bunches = [];
      if (!cur) return;
      cur.items.forEach(function (it) {
        // AS-0348: an item with a hand model in the data (the strawberry) is drawn from it, big; otherwise the banana bunch.
        var held = SA.render.buildItemModel ?SA.render.buildItemModel(THREE, cur.spec.item) : null;
        if (held) held.scale.set(3.2, 3.2, 3.2);
        var b = held || bunchModel(THREE);
        b.position.set(it.x, it.y + LIFT, it.z);
        group.add(b);
        bunches.push({ item: it, mesh: b });
      });
    }

    function update(dt) {
      var cur = thing.current();
      var k = cur ? cur.key : null;
      if (k !== key) { key = k; rebuild(cur); }
      t += dt || 0;
      bunches.forEach(function (b, i) {
        b.mesh.visible = !b.item.taken && (!thing.shown || thing.shown());
        b.mesh.position.y = b.item.y + LIFT + Math.sin(t * 2.2 + i) * 0.1;
        b.mesh.rotation.y = t * 1.2 + i;
      });
      return group;
    }

    return { group: group, update: update };
  };
})(typeof window !== 'undefined' ? window : globalThis);
