/* SA.render.buildWorld(THREE): low-poly terrain (flat-shaded, coloured per biome from data), river and pond.
 * Only game/render/* touches THREE. Heights come from SA.map.groundHeight.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var STEP = 1;     // terrain segment size in metres (AS-0291: finer so colour varies; ~32k static triangles)
  var SEED = 7;     // seed for SA.terrain.groundColor

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
    var sand = new THREE.Color('#d8c58a');
    var tmp = new THREE.Color();
    // Every vertex is coloured by SA.terrain.groundColor (AS-0291): seeded noise per biome with soft blends across borders.
    // Vertices at the same spot get the same colour, so flat-shaded faces show smooth colour gradients, not one tint each.
    for (var v = 0; v < p.count; v++) {
      var vx = p.getX(v), vy = p.getY(v), vz = p.getZ(v);
      if (SA.terrain) SA.terrain.groundColor(vx, vz, vy, SEED, tmp);
      else tmp.set((biomes[M.biomeAt(vx)] || {}).ground || '#6fae5e');
      if (vy < M.WATER_LEVEL + 0.35 && M.nearWater(vx, vz, 2.5)) tmp.lerp(sand, 0.8);   // sandy shores
      colors[v * 3] = tmp.r; colors[v * 3 + 1] = tmp.g; colors[v * 3 + 2] = tmp.b;
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
