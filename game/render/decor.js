/* SA.render.buildDecor(THREE): procedural low-poly trees, rocks and flowers per biome.
 * Trees are 2-3 kinds per biome (game/render/trees.js; which decor id is which kind is `kind` in game/data/decor.js), each with seeded
 * colour variation and a slight canopy sway: the returned group has userData.update(dt) (the wind; no per-frame allocation).
 * Placement is the pure, seeded SA.decorPlan (identical every load; covers the whole map, avoids water, spawn and station).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  /** Tag a decor object with its data id (game/data/decor.js decides whether it blocks the player). */
  function tag(obj, id) { obj.userData.decor = id; return obj; }

  function mat(THREE, color) { return new THREE.MeshPhongMaterial({ color: color, flatShading: true, specular: 0x000000 }); }

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
      leaf: mat(THREE, '#2c9a46'), rock: mat(THREE, '#9a9a96'), flower: mat(THREE, (biomes.selva && biomes.selva.accent) || '#e8b84a'),
    };
    var group = new THREE.Group();
    group.name = 'decor';
    var D = SA.render.dryDecor, dm = D ? D.materials(THREE) : null;
    var T = SA.render.trees ? SA.render.trees.create(THREE) : null;
    // What each decor id is built from; where, how big and which way it faces is the pure SA.decorPlan (AS-0248).
    var builders = {
      roca: function (e) { return rock(THREE, m, e.size); },
      flor: function () { return flower(THREE, m); },
    };
    if (D) {
      builders.cactus = function (e) { return D.builders.cactus(THREE, dm, e.size); };
      builders.rocaarena = function (e) { return D.builders.sandRock(THREE, dm, e.size); };
    }
    SA.decorPlan.plan({ seed: 42 }).forEach(function (e) {
      var row = SA.data.get('decor', e.decor), kind = row && row.kind;
      var obj = builders[e.decor] ? builders[e.decor](e) : T && kind && T.has(kind) ? T.build(kind, e.size, e.tint) : null;
      if (!obj) return;
      tag(obj, e.decor);
      obj.position.x += e.x; obj.position.z += e.z; obj.position.y += e.y;
      obj.rotation.y = e.rot;
      group.add(obj);
    });
    if (D && SA.peaks) addPeaks(THREE, group);
    group.userData.update = function (dt) { if (T) T.update(dt); };   // the canopy sway
    group.userData.trees = T;
    return group;
  };
})(typeof window !== 'undefined' ? window : globalThis);
