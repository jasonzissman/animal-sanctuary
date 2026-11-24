/* SA.render.createMissionNest(THREE, { scene, thing? }): draws Mission 6's feather and the eagle's nest (AS-0336). It follows SA.missionNest
 * (pure: where the feather lies, where the nest peak is). The feather is a big, glowing-white quill (a flattened cone vane on a thin shaft)
 * that bobs and turns beside the mountain trail until it is picked up. The nest is a ring of brown twigs (boxes round a cylinder bowl)
 * on top of the nest peak, with the chick and mamá sitting in it: both are built through the normal animal path (SA.render.animalBuilder)
 * from the animal ids in the data, the chick small. Nothing here knows a mission id or an animal id.
 *   update(dt)   once per frame; returns the group it manages
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var VANE = 0xf4f1ea, SHAFT = 0xc9b48a, TWIG = 0x7a5530, TWIG2 = 0x5f4125, LIFT = 0.9;
  var CHICK_SCALE = 0.3, MAMA_SCALE = 0.42, BACK = 0.55;      // the nest sits a little past the summit centre, away from the bridge

  function flat(THREE, c) { return new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 0 }); }

  function featherModel(THREE) {
    var g = new THREE.Group();
    var vane = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), new THREE.MeshBasicMaterial({ color: VANE }));
    vane.scale.set(1, 1, 0.22);
    vane.position.y = 0.45;
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.0, 5), flat(THREE, SHAFT));
    shaft.position.y = 0.45;
    var glow = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.22, depthWrite: false }));
    glow.position.y = 0.45;
    g.add(vane, shaft, glow);
    g.rotation.z = 0.5;
    g.scale.set(1.6, 1.6, 1.6);   // big and readable for small hands
    return g;
  }

  function nestModel(THREE) {
    var g = new THREE.Group();
    var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.45, 0.22, 10), flat(THREE, TWIG2));
    bowl.position.y = 0.11;
    g.add(bowl);
    for (var i = 0; i < 14; i++) {      // twigs laid around the rim
      var a = (i / 14) * Math.PI * 2, tw = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.07), flat(THREE, i % 2 ? TWIG : TWIG2));
      tw.position.set(Math.cos(a) * 0.62, 0.2 + (i % 3) * 0.04, Math.sin(a) * 0.62);
      tw.rotation.y = -a + Math.PI / 2 + (i % 2 ? 0.3 : -0.3);
      g.add(tw);
    }
    return g;
  }

  SA.render.createMissionNest = function (THREE, opts) {
    var thing = opts.thing || SA.missionNest;
    if (opts.solids && thing.setSolids) thing.setSolids(opts.solids);
    var build = SA.render.animalBuilder(THREE);
    var group = new THREE.Group();
    group.name = 'missionNest';
    opts.scene.add(group);
    var key = null, feather = null, t = 0;

    function rebuild(cur) {
      while (group.children.length) group.remove(group.children[0]);
      feather = null;
      if (!cur) return;
      feather = featherModel(THREE);
      var n = cur.nest, s = cur.summit, dx = n.x - s.x, dz = n.z - s.z, len = Math.hypot(dx, dz) || 1;
      var nx = n.x + dx / len * BACK, nz = n.z + dz / len * BACK, ny = n.y;
      var bowl = nestModel(THREE);
      bowl.position.set(nx, ny, nz);
      group.add(feather, bowl);
      var face = Math.atan2(-dx, -dz);        // they look back toward the bridge
      [[cur.spec.mama, MAMA_SCALE, -0.18, 0.05], [cur.spec.chick, CHICK_SCALE, 0.2, -0.05]].forEach(function (c) {
        var spec = SA.data.get('animals', c[0]);
        if (!spec) return;
        var m = build(spec, { id: spec.id, x: nx + c[2], z: nz + c[3], y: ny + 0.15, rotY: face });
        m.scale.set(c[1], c[1], c[1]);
        group.add(m);
      });
    }

    function update(dt) {
      var cur = thing.current();
      var k = cur ? cur.key : null;
      if (k !== key) { key = k; rebuild(cur); }
      t += dt || 0;
      var f = cur && cur.feather;
      if (feather && f) {
        feather.visible = !f.taken;
        feather.position.set(f.x, f.y + LIFT + Math.sin(t * 2.2) * 0.12, f.z);
        feather.rotation.y = t * 1.4;
      }
      return group;
    }

    return { group: group, update: update };
  };
})(typeof window !== 'undefined' ? window : globalThis);
