/* SA.render.createJungleFlowers(THREE, { scene }): draws the selva's bright flowers (SA.junglePlan.flowersGet, AS-0391, slice 4/4 of AS-0137).
 * Three InstancedMeshes over the same instance list (stems, blooms, centres), each with its own small shared geometry and ONE shared material per
 * look (the bloom's colour is per instance), all written once at build time: update() does not exist, nothing is allocated per frame.
 * Flowers are soft scenery: never an obstacle.   view.group (already added to the scene)   view.stats() { flowers, colors, drawCalls }   view.meshes
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.createJungleFlowers = function (THREE, opts) {
    var list = SA.junglePlan.flowersGet(), group = new THREE.Group(), meshes = [], o = new THREE.Object3D(), c = new THREE.Color(), n = list.length;
    var palette = SA.junglePlan.FLOWER_COLORS, used = {};
    group.name = 'jungle-flowers';
    function mat(hex) { return new THREE.MeshPhongMaterial({ color: hex, flatShading: true, specular: 0x000000 }); }
    function mesh(name, geo, material) {
      var m = new THREE.InstancedMesh(geo, material, n);
      m.name = name;
      m.frustumCulled = false;   // spread over the whole selva
      group.add(m);
      meshes.push(m);
      return m;
    }
    if (n) {
      var stems = mesh('jungle-flower-stems', new THREE.CylinderGeometry(0.025, 0.035, 1, 4), mat(0x3f9a45));
      var blooms = mesh('jungle-flower-blooms', new THREE.CylinderGeometry(0.2, 0.07, 0.12, 7), mat(0xffffff));   // a petal cup: colour per instance
      var hearts = mesh('jungle-flower-hearts', new THREE.SphereGeometry(0.075, 5, 4), mat(0xffc531));
      list.forEach(function (f, i) {
        used[f.color] = true;
        o.rotation.set(0, f.rot, 0);
        o.scale.set(1, f.h, 1);
        o.position.set(f.x, f.y + f.h / 2 - 0.03, f.z);
        o.updateMatrix();
        stems.setMatrixAt(i, o.matrix);
        o.scale.set(1, 1, 1);
        o.position.set(f.x, f.y + f.h, f.z);
        o.updateMatrix();
        blooms.setMatrixAt(i, o.matrix);
        blooms.setColorAt(i, c.set(palette[f.color]));
        o.position.set(f.x, f.y + f.h + 0.07, f.z);
        o.updateMatrix();
        hearts.setMatrixAt(i, o.matrix);
      });
      meshes.forEach(function (m) { m.instanceMatrix.needsUpdate = true; });
      if (blooms.instanceColor) blooms.instanceColor.needsUpdate = true;
    }
    if (opts && opts.scene) opts.scene.add(group);
    return { group: group, meshes: meshes, stats: function () { return { flowers: n, colors: Object.keys(used).length, drawCalls: meshes.length }; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
