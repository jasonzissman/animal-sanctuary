/* SA.render.buildDecor(THREE): procedural low-poly trees, rocks and flowers per biome.
 * Bosque = conifers + grey rocks; selva = tall broad-leaf trees + gold flowers (biome accent).
 * Placement is seeded (identical every load) and avoids water via SA.map.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  /** Tag a decor object with its data id (game/data/decor.js decides whether it blocks the player). */
  function tag(obj, id) { obj.userData.decor = id; return obj; }

  function mat(THREE, color) { return new THREE.MeshPhongMaterial({ color: color, flatShading: true, specular: 0x000000 }); }

  function pine(THREE, m, s) {
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.2, 6), m.trunk);
    trunk.position.y = 0.6;
    var low = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 7), m.pine);
    low.position.y = 2.1;
    var high = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 7), m.pine);
    high.position.y = 3.3;
    g.add(trunk, low, high);
    g.userData.tree = true;      // tappable (SA.render.createTreeTap)
    g.userData.kind = 'pine';    // canopy size for SA.perch
    g.scale.setScalar(s);
    return g;
  }

  function jungleTree(THREE, m, s) {
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 3.4, 6), m.trunk);
    trunk.position.y = 1.7;
    var top = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 0), m.leaf);
    top.position.y = 4.1;
    top.scale.y = 0.7;
    g.add(trunk, top);
    g.userData.tree = true;
    g.userData.kind = 'jungle';
    g.scale.setScalar(s);
    return g;
  }

  function rock(THREE, m, s) {
    var r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), m.rock);
    r.scale.set(s, s * 0.65, s * 0.9);
    r.position.y = 0.2 * s;
    return r;
  }

  function flower(THREE, m) {
    var g = new THREE.Group();
    var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 4), m.leaf);
    stem.position.y = 0.25;
    var bloom = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), m.flower);
    bloom.position.y = 0.55;
    g.add(stem, bloom);
    return g;
  }

  /** Scatter `count` items inside [x0,x1] x zr (default [-23,23]), spaced apart, on dry ground. */
  function scatter(group, rand, count, x0, x1, make, minGap, taken, zr) {
    var M = SA.map, placed = 0, tries = 0, z0 = zr ? zr[0] : -23, z1 = zr ? zr[1] : 23;
    while (placed < count && tries++ < count * 40) {
      var x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
      var y = M.groundHeight(x, z);
      if (y < M.WATER_LEVEL + 0.45) continue;
      if (SA.player && SA.player.inSpawnZone(x, z)) continue;   // the spawn stays clear (SA.player.SPAWN_CLEAR)
      if (SA.station && SA.station.inFootprint(x, z, 1)) continue;   // and so does the research station's footprint
      var ok = true;
      for (var i = 0; i < taken.length; i++) {
        var dx = taken[i][0] - x, dz = taken[i][1] - z;
        if (dx * dx + dz * dz < minGap * minGap) { ok = false; break; }
      }
      if (!ok) continue;
      taken.push([x, z]);
      var obj = make(rand);
      obj.position.x = x; obj.position.z = z; obj.position.y += y;
      obj.rotation.y = rand() * Math.PI * 2;
      group.add(obj);
      placed++;
    }
    return placed;
  }

  /** Desierto: cacti + sandstone. Montaña: snowy pines + big peaks kept at the north/south edges (animals live between). */
  function addDry(THREE, group, rand, sz, taken) {
    var D = SA.render.dryDecor, b = D.builders, dm = D.materials(THREE);
    var desert = SA.map.biomeRange('desierto'), mount = SA.map.biomeRange('montana');
    if (desert) {
      scatter(group, rand, 22, desert.lo + 2, desert.hi - 1.5, function (r) { return tag(b.cactus(THREE, dm, sz(r)), 'cactus'); }, 3, taken);
      scatter(group, rand, 10, desert.lo + 2, desert.hi - 1.5, function (r) { return tag(b.sandRock(THREE, dm, 0.8 + r()), 'rocaarena'); }, 2, taken);
    }
    if (mount) {
      // The climbable peaks come from data (SA.peaks): a flat-topped grey cone over each terrain mound, solid like any 'pico'.
      if (SA.peaks) SA.peaks.LIST.forEach(function (p) {
        var obj = tag(b.peak(THREE, dm, SA.peaks.shape(p)), 'pico');
        obj.position.set(p.x, SA.peaks.shape(p).baseY, p.z);
        obj.userData.peak = p.id;
        obj.userData.climbId = p.id;   // the Space-target outline finds the mesh by its climb target's id
        group.add(obj);
        taken.push([p.x, p.z]);
        for (var a = 0; a < 8; a++) taken.push([p.x + 2 * Math.cos(a * Math.PI / 4), p.z + 2 * Math.sin(a * Math.PI / 4)]);   // keeps pines off the slope
      });
      scatter(group, rand, 24, mount.lo + 1.5, mount.hi - 4, function (r) { return tag(b.snowPine(THREE, dm, sz(r)), 'pinonieve'); }, 3, taken);
    }
  }

  SA.render.buildDecor = function (THREE) {
    var biomes = {};
    SA.data.all('biomes').forEach(function (b) { biomes[b.id] = b; });
    var m = {
      trunk: mat(THREE, '#7a5230'), pine: mat(THREE, '#2f7a4a'), leaf: mat(THREE, '#2c9a46'),
      rock: mat(THREE, '#9a9a96'), flower: mat(THREE, (biomes.selva && biomes.selva.accent) || '#e8b84a'),
    };
    var rand = SA.map.rng(42);
    var group = new THREE.Group();
    group.name = 'decor';
    var taken = [];
    var sz = function (r) { return 0.8 + r() * 0.6; };
    scatter(group, rand, 28, -38, -1.5, function (r) { return tag(pine(THREE, m, sz(r)), 'pino'); }, 3, taken);
    scatter(group, rand, 10, -38, -1.5, function (r) { return tag(rock(THREE, m, 0.8 + r()), 'roca'); }, 2, taken);
    scatter(group, rand, 34, 1.5, 38, function (r) { return tag(jungleTree(THREE, m, sz(r)), 'jungle'); }, 3.2, taken);
    scatter(group, rand, 8, 1.5, 38, function (r) { return tag(rock(THREE, m, 0.8 + r()), 'roca'); }, 2, taken);
    scatter(group, rand, 16, 1.5, 38, function () { return tag(flower(THREE, m), 'flor'); }, 1.5, taken);
    if (SA.render.dryDecor) addDry(THREE, group, rand, sz, taken);
    return group;
  };
})(typeof window !== 'undefined' ? window : globalThis);
