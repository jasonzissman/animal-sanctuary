/* SA.render.createFallenLogs(THREE, { scene }): the fallen logs of SA.fallenLogs (AS-0302) as ONE merged mesh.
 * Each trunk is a low-poly 7-sided tapered cylinder with flat bark-brown vertex colours (a seeded tone per log) and lighter wood-coloured end
 * caps. It lies along the ground: the axis runs from one end to the other following the terrain slope, and sits so the TOP of the trunk is
 * exactly `h` above the ground (the standing height SA.fallenLogs.solids() gives SA.player), the trunk sinking a little into the soil.
 * Built once: no per-frame work and no allocation after construction. The mesh casts a sun shadow.
 *
 *   logs.group  THREE.Group (already added to the scene)   logs.mesh  the merged mesh, named 'fallen-logs'
 *   logs.stats() { logs, triangles }
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SIDES = 7;
  var BARK_LO = [0.34, 0.23, 0.14], BARK_HI = [0.47, 0.33, 0.2], CAP = [0.8, 0.66, 0.43];

  function trunk(THREE, l, out) {
    var g = new THREE.CylinderGeometry(l.r * 0.9, l.r, l.length, SIDES, 1), pos = g.attributes.position, nor = g.attributes.normal;
    var colors = new Float32Array(pos.count * 3), i, k;
    for (i = 0; i < pos.count; i++) {
      var cap = Math.abs(nor.getY(i)) > 0.5, shade = 0.85 + 0.3 * ((i * 37) % 7) / 7;
      for (k = 0; k < 3; k++) colors[i * 3 + k] = cap ? CAP[k] : (BARK_LO[k] + (BARK_HI[k] - BARK_LO[k]) * l.tone) * shade;
    }
    var M = SA.map, ga = M.groundHeight(l.ax, l.az), gb = M.groundHeight(l.bx, l.bz);
    // The axis (the cylinder's +Y) runs a -> b; the trunk's top is h above the ground under its centre line.
    var axis = new THREE.Vector3(l.bx - l.ax, gb - ga, l.bz - l.az).normalize();
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    var m = new THREE.Matrix4().compose(new THREE.Vector3(l.x, (ga + gb) / 2 + l.h - l.r, l.z), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    var base = out.pos.length / 3, idx = g.index.array;
    for (i = 0; i < pos.count; i++) {
      out.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      out.col.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
    }
    for (i = 0; i < idx.length; i++) out.idx.push(base + idx[i]);
    g.dispose();
  }

  SA.render.createFallenLogs = function (THREE, opts) {
    var list = SA.fallenLogs.logs(), out = { pos: [], col: [], idx: [] }, group = new THREE.Group();
    group.name = 'fallen-logs-group';
    list.forEach(function (l) { trunk(THREE, l, out); });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
    geo.setIndex(out.idx);
    geo.computeVertexNormals();
    var mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, specular: 0x000000 }));
    mesh.name = 'fallen-logs';
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    opts.scene.add(group);
    return { group: group, mesh: mesh, stats: function () { return { logs: list.length, triangles: out.idx.length / 3 }; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
