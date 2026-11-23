/* SA.render.buildDecor(THREE): procedural low-poly trees, rocks and flowers per biome.
 * Bosque = conifers + grey rocks; selva = tall broad-leaf trees + gold flowers (biome accent).
 * Placement is the pure, seeded SA.decorPlan (identical every load; covers the whole map, avoids water, spawn and station).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  /** Tag a decor object with its data id (game/data/decor.js decides whether it blocks the player). */
  function tag(obj, id) { obj.userData.decor = id; return obj; }

  function mat(THREE, color) { return new THREE.MeshPhongMaterial({ color: color, flatShading: true, specular: 0x000000 }); }

  /** A thin flat leafy disc at the canopy standing height (SA.perch.KINDS): the treetop you can stand and jump from (AS-0166). */
  function canopyPad(THREE, material, kindId, radius) {
    var K = SA.perch && SA.perch.KINDS && SA.perch.KINDS[kindId], h = K ? K.height : 4;
    var pad = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.14, 8), material);
    pad.position.y = h - 0.07;
    return pad;
  }

  function pine(THREE, m, s) {
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.2, 6), m.trunk);
    trunk.position.y = 0.6;
    var low = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 7), m.pine);
    low.position.y = 2.1;
    var high = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 7), m.pine);
    high.position.y = 3.3;
    g.add(trunk, low, high, canopyPad(THREE, m.pine, 'pine', 1.0));
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
    g.add(trunk, top, canopyPad(THREE, m.leaf, 'jungle', 1.5));
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

  /** The climbable peaks come from data (SA.peaks): a flat-topped grey cone over each terrain mound, solid like any 'pico'. */
  function addPeaks(THREE, group) {
    var b = SA.render.dryDecor.builders, dm = SA.render.dryDecor.materials(THREE);
    SA.peaks.LIST.forEach(function (p) {
      var obj = tag(b.peak(THREE, dm, SA.peaks.shape(p)), 'pico');
      obj.position.set(p.x, SA.peaks.shape(p).baseY, p.z);
      obj.userData.peak = p.id;
      obj.userData.climbId = p.id;   // the Space-target outline finds the mesh by its climb target's id
      group.add(obj);
    });
  }

  SA.render.buildDecor = function (THREE) {
    var biomes = {};
    SA.data.all('biomes').forEach(function (b) { biomes[b.id] = b; });
    var m = {
      trunk: mat(THREE, '#7a5230'), pine: mat(THREE, '#2f7a4a'), leaf: mat(THREE, '#2c9a46'),
      rock: mat(THREE, '#9a9a96'), flower: mat(THREE, (biomes.selva && biomes.selva.accent) || '#e8b84a'),
    };
    var group = new THREE.Group();
    group.name = 'decor';
    var D = SA.render.dryDecor, dm = D ? D.materials(THREE) : null;
    // What each decor id is built from; where, how big and which way it faces is the pure SA.decorPlan (AS-0248).
    var builders = {
      pino: function (e) { return pine(THREE, m, e.size); },
      jungle: function (e) { return jungleTree(THREE, m, e.size); },
      roca: function (e) { return rock(THREE, m, e.size); },
      flor: function () { return flower(THREE, m); },
    };
    if (D) {
      builders.cactus = function (e) { return D.builders.cactus(THREE, dm, e.size); };
      builders.rocaarena = function (e) { return D.builders.sandRock(THREE, dm, e.size); };
      builders.pinonieve = function (e) { return D.builders.snowPine(THREE, dm, e.size); };
    }
    SA.decorPlan.plan({ seed: 42 }).forEach(function (e) {
      if (!builders[e.decor]) return;
      var obj = tag(builders[e.decor](e), e.decor);
      obj.position.x += e.x; obj.position.z += e.z; obj.position.y += e.y;
      obj.rotation.y = e.rot;
      group.add(obj);
    });
    if (D && SA.peaks) addPeaks(THREE, group);
    return group;
  };
})(typeof window !== 'undefined' ? window : globalThis);
