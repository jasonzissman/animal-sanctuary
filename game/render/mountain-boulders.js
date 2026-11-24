/* SA.render.createMountainBoulders(THREE, { scene }): draws the montaña's seeded boulder field (SA.mountainPlan, AS-0309) with THREE.InstancedMesh,
 * built once, no per-frame work. One InstancedMesh per rock kind + variant that is used (at most 12, usually fewer), each sharing the
 * flat-shaded geometry of game/render/rocks.js; the grey granite colours come per instance (setColorAt), so the whole field costs a handful
 * of draw calls. Needs SA.render.rocks (the geometry) and SA.mountainPlan.
 *   field.group  THREE.Group (already added to the scene)   field.stats() { boulders, drawCalls }
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.createMountainBoulders = function (THREE, opts) {
    var list = SA.mountainPlan.get().boulders, group = new THREE.Group(), R = SA.render.rocks.create(THREE), buckets = {}, keys = [];
    group.name = 'mountain-boulders';
    list.forEach(function (b) {
      var k = b.kind + b.variant;
      if (!buckets[k]) { buckets[k] = []; keys.push(k); }
      buckets[k].push(b);
    });
    var mat = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, specular: 0x000000 });
    var o = new THREE.Object3D(), c = new THREE.Color();
    keys.forEach(function (k) {
      var bs = buckets[k], mesh = new THREE.InstancedMesh(R.geometry(bs[0].kind, bs[0].variant), mat, bs.length);
      bs.forEach(function (b, i) {
        o.position.set(b.x, b.y, b.z);
        o.rotation.set(b.tilt[0], b.yaw, b.tilt[1]);
        o.scale.set(b.size * b.scale[0], b.size * b.scale[1], b.size * b.scale[2]);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        mesh.setColorAt(i, c.set(b.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.name = 'mountain-boulders-' + k;
      mesh.frustumCulled = false;   // the instances are spread over the whole mountain; the bounding sphere would be the unit rock
      mesh.castShadow = true;
      group.add(mesh);
    });
    if (opts && opts.scene) opts.scene.add(group);
    return { group: group, stats: function () { return { boulders: list.length, drawCalls: keys.length }; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
