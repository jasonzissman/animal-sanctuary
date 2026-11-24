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

  // The gentle surface wave (AS-0298): two crossing sines in the vertex shader, driven by one shared time uniform, so the per-frame
  // cost is advancing a number. Water geometry is baked in world coordinates (identity transform), so `position` is the world x/z.
  // Flat shading takes its normals from the displaced positions, so the facets catch the light as they move.
  function applyWave(material, uTime, key) {
    var W = SA.waterBanks ? SA.waterBanks.WAVE : { amp: 0.045, speed: 1.3, freqX: 0.9, freqZ: 0.7 };
    material.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
          'transformed.y += (sin(position.x * ' + W.freqX.toFixed(3) + ' + uTime * ' + W.speed.toFixed(3) + ') + sin(position.z * ' + W.freqZ.toFixed(3) +
          ' - uTime * ' + (W.speed * 0.8).toFixed(3) + ' + position.x * 0.3)) * ' + W.amp.toFixed(3) + ';');
    };
    material.customProgramCacheKey = function () { return 'water-wave-' + (key || 'surface'); };
    return material;
  }
  SA.render.applyWaterWave = applyWave;

  function waterMaterial(THREE, color, uTime) {
    return applyWave(new THREE.MeshPhongMaterial({ color: color, transparent: true, opacity: 0.85, flatShading: true, specular: 0x000000 }), uTime);
  }

  function buildRiver(THREE, color, uTime) {
    var M = SA.map, B = M.BOUNDS, n = 96;   // fine enough along the river for the wave to show as facets
    var hw = M.RIVER.halfWidth + 0.8;
    var geo = new THREE.PlaneGeometry(2 * hw, B.maxZ - B.minZ, 8, n);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var z = pos.getZ(i);
      pos.setX(i, pos.getX(i) + M.riverX(z));
      pos.setY(i, M.WATER_LEVEL);
    }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, waterMaterial(THREE, color, uTime));
  }

  function buildPond(THREE, color, uTime) {
    var M = SA.map;
    var geo = new THREE.RingGeometry(0.001, M.POND.radius + 0.6, 24, 5);
    geo.rotateX(-Math.PI / 2);
    geo.translate(M.POND.x, M.WATER_LEVEL, M.POND.z);   // baked in world coordinates, like the river
    return new THREE.Mesh(geo, waterMaterial(THREE, color, uTime));
  }

  /** Returns a THREE.Group with ground, river and pond. group.userData.update(dt) advances the water wave; userData.uTime is its clock. */
  SA.render.buildWorld = function (THREE) {
    var biomes = {};
    SA.data.all('biomes').forEach(function (b) { biomes[b.id] = b; });
    var group = new THREE.Group();
    group.name = 'world';
    group.add(buildGround(THREE, biomes));
    var river = (biomes.bosque && biomes.bosque.accent) || '#4aa3c7';
    var uTime = { value: 0 };
    group.userData.uTime = uTime;
    group.userData.update = function (dt) { uTime.value += dt || 0; };   // the wave clock; allocates nothing
    group.add(buildRiver(THREE, river, uTime));
    group.add(buildPond(THREE, '#3f9fb0', uTime));
    return group;
  };
})(typeof window !== 'undefined' ? window : globalThis);
