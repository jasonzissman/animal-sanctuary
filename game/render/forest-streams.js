/* SA.render.createForestStreams(THREE, { scene, world }): the small forest streams and their stepping stones (AS-0301).
 *   - Water: ONE merged ribbon mesh for every stream (3 vertices across, a vertex per metre along), laid on the terrain (each vertex sits a hand
 *     above SA.map.groundHeight, so it follows the slopes) and ending inside the river. It uses the same shader wave as the river and pond
 *     (SA.render.applyWaterWave, game/render/world.js) on the world's shared clock, so the surface moves with no per-frame allocation.
 *   - Stones: ONE InstancedMesh of flat-topped stones. A stone's top is `h` above the ground, exactly what SA.forestStreams.stoneSolids()
 *     tells SA.player (a low solid: hop onto it and stand on top, AS-0176).
 * The layout is the pure, seeded SA.forestStreams (game/forest-streams.js). The ground is not carved, so wading is the existing shallows rule (AS-0109).
 *
 *   fs.group  THREE.Group (already added to the scene)     fs.meshes  [water, stones]; names 'forest-stream-water', 'forest-stream-stones'
 *   fs.stats() { streams, stones, waterTriangles }
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var LIFT_MID = 0.13, LIFT_EDGE = 0.08;   // water above the ground (the wave is +-0.045): a shallow film that hugs the bed

  function waterGeometry(THREE, list) {
    var M = SA.map, F = SA.forestStreams, pos = [], idx = [];
    list.forEach(function (st) {
      var pts = st.points, base = pos.length / 3;
      pts.forEach(function (p, i) {
        var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
        var nx = -dz / l, nz = dx / l, hw = F.halfAt(i), lx = p[0] + nx * hw, lz = p[1] + nz * hw, rx = p[0] - nx * hw, rz = p[1] - nz * hw;
        pos.push(lx, M.groundHeight(lx, lz) + LIFT_EDGE, lz, p[0], M.groundHeight(p[0], p[1]) + LIFT_MID, p[1], rx, M.groundHeight(rx, rz) + LIFT_EDGE, rz);
        if (i > 0) {
          var q = base + (i - 1) * 3, c = base + i * 3;
          idx.push(q, q + 1, c, q + 1, c + 1, c, q + 1, q + 2, c + 1, q + 2, c + 2, c + 1);
        }
      });
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    return geo;
  }

  function stoneGeometry(THREE) {
    var g = new THREE.CylinderGeometry(0.85, 1, 1, 7, 1);   // flat top at y = 0.5, a slightly wider foot
    g.translate(0, 0.5, 0);                                  // y 0..1, scaled by the stone's top height
    return g;
  }

  function stoneMesh(THREE, stones) {
    var mesh = new THREE.InstancedMesh(stoneGeometry(THREE), new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, specular: 0x000000 }), Math.max(1, stones.length));
    var o = new THREE.Object3D(), lo = new THREE.Color('#8a8d86'), hi = new THREE.Color('#bdb59c'), c = new THREE.Color();
    stones.forEach(function (s, i) {
      var y = SA.map.groundHeight(s.x, s.z);
      o.position.set(s.x, y - 0.06, s.z);                    // sunk a little so the foot never floats on a slope
      o.rotation.set(0, s.rot, 0);
      o.scale.set(s.r, s.h + 0.06, s.r);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.copy(lo).lerp(hi, s.tone));
    });
    mesh.count = stones.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = 'forest-stream-stones';
    mesh.frustumCulled = false;
    return mesh;
  }

  SA.render.createForestStreams = function (THREE, opts) {
    var list = SA.forestStreams.streams(), group = new THREE.Group(), uTime = opts.world && opts.world.userData.uTime ? opts.world.userData.uTime : { value: 0 };
    group.name = 'forest-streams';
    var mat = new THREE.MeshPhongMaterial({ color: '#5bb4cf', transparent: true, opacity: 0.8, flatShading: true, specular: 0x000000, side: THREE.DoubleSide, depthWrite: false });
    if (SA.render.applyWaterWave) SA.render.applyWaterWave(mat, uTime, 'stream');
    var water = new THREE.Mesh(waterGeometry(THREE, list), mat);
    water.name = 'forest-stream-water';
    water.renderOrder = 1;
    water.frustumCulled = false;
    var stones = [];
    list.forEach(function (st) { stones = stones.concat(st.stones); });
    var stoneM = stoneMesh(THREE, stones);
    group.add(water, stoneM);
    opts.scene.add(group);
    return {
      group: group, meshes: [water, stoneM],
      stats: function () { return { streams: list.length, stones: stones.length, waterTriangles: water.geometry.index.count / 3 }; },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
