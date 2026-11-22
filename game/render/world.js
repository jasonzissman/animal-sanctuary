/* SA.render.buildWorld(THREE): low-poly terrain (flat-shaded, coloured per biome from data), river and pond.
 * Only game/render/* touches THREE. Heights come from SA.map.groundHeight.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var STEP = 1.6;

  function buildGround(THREE, biomes) {
    var M = SA.map, B = M.BOUNDS;
    var w = B.maxX - B.minX, d = B.maxZ - B.minZ;
    var geo = new THREE.PlaneGeometry(w, d, Math.round(w / STEP), Math.round(d / STEP));
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) pos.setY(i, M.groundHeight(pos.getX(i), pos.getZ(i)));
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();

    var p = geo.attributes.position;
    var colors = new Float32Array(p.count * 3);
    var rand = M.rng(7);
    var sand = new THREE.Color('#d8c58a');
    var tmp = new THREE.Color(), snow = new THREE.Color();
    for (var f = 0; f < p.count; f += 3) {
      var cx = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
      var cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
      var biome = biomes[M.biomeAt(cx)];
      tmp.set(biome ? biome.ground : '#6fae5e');
      if (cy < M.WATER_LEVEL + 0.35 && M.nearWater(cx, (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3, 2.5)) tmp.lerp(sand, 0.8);
      // Snow caps: a biome with a `peak` colour blends to it on high ground.
      if (biome && biome.peak && cy > 2.2) tmp.lerp(snow.set(biome.peak), Math.min(1, (cy - 2.2) / 1.2));
      var shade = 0.92 + rand() * 0.14 + Math.max(-0.1, Math.min(0.1, cy * 0.06));
      tmp.multiplyScalar(shade);
      for (var k = 0; k < 3; k++) {
        colors[(f + k) * 3] = tmp.r; colors[(f + k) * 3 + 1] = tmp.g; colors[(f + k) * 3 + 2] = tmp.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, specular: 0x000000 }));
  }

  function waterMaterial(THREE, color) {
    return new THREE.MeshPhongMaterial({ color: color, transparent: true, opacity: 0.85, flatShading: true, specular: 0x000000 });
  }

  function buildRiver(THREE, color) {
    var M = SA.map, B = M.BOUNDS, n = 32;
    var hw = M.RIVER.halfWidth + 0.8;
    var geo = new THREE.PlaneGeometry(2 * hw, B.maxZ - B.minZ, 1, n);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var z = pos.getZ(i);
      pos.setX(i, pos.getX(i) + M.riverX(z));
      pos.setY(i, M.WATER_LEVEL);
    }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, waterMaterial(THREE, color));
  }

  function buildPond(THREE, color) {
    var M = SA.map;
    var mesh = new THREE.Mesh(new THREE.CircleGeometry(M.POND.radius + 0.6, 14), waterMaterial(THREE, color));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(M.POND.x, M.WATER_LEVEL, M.POND.z);
    return mesh;
  }

  /** Returns a THREE.Group with ground, river and pond. */
  SA.render.buildWorld = function (THREE) {
    var biomes = {};
    SA.data.all('biomes').forEach(function (b) { biomes[b.id] = b; });
    var group = new THREE.Group();
    group.name = 'world';
    group.add(buildGround(THREE, biomes));
    var river = (biomes.bosque && biomes.bosque.accent) || '#4aa3c7';
    group.add(buildRiver(THREE, river));
    group.add(buildPond(THREE, '#3f9fb0'));
    return group;
  };
})(typeof window !== 'undefined' ? window : globalThis);
