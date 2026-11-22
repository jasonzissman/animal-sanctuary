/* SA.render.dryDecor: procedural low-poly builders for the desierto (cacti, sandstone) and the montaña (snowy
 * pines, snow-capped peaks), plus their placement counts. Used by game/render/decor.js. Only touches THREE.
 *   SA.render.dryDecor.materials(THREE) -> shared flat materials
 *   SA.render.dryDecor.builders        { cactus, snowPine, peak, sandRock }  each (THREE, mats, size) -> Object3D (peak takes SA.peaks.shape(peak) instead of a size)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  function mat(THREE, color) { return new THREE.MeshPhongMaterial({ color: color, flatShading: true, specular: 0x000000 }); }

  function materials(THREE) {
    return {
      cactus: mat(THREE, '#4f9a4c'), sand: mat(THREE, '#c9a463'), snow: mat(THREE, '#f4f8fb'),
      stone: mat(THREE, '#7d8793'), trunk: mat(THREE, '#6b4a2b'), snowPine: mat(THREE, '#2a6a4c'),
    };
  }

  /** Saguaro: tall trunk with one or two arms. */
  function cactus(THREE, m, s) {
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 2.6, 7), m.cactus);
    trunk.position.y = 1.3;
    var top = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 5), m.cactus);
    top.position.y = 2.6;
    g.add(trunk, top);
    [-1, 1].forEach(function (side, i) {
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9 - i * 0.2, 6), m.cactus);
      arm.position.set(side * 0.55, 1.4 + i * 0.3, 0);
      var elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 6), m.cactus);
      elbow.rotation.z = Math.PI / 2;
      elbow.position.set(side * 0.35, 0.95 + i * 0.3, 0);
      g.add(arm, elbow);
    });
    g.scale.setScalar(s);
    return g;
  }

  /** Pine with a snow cap on each tier. */
  function snowPine(THREE, m, s) {
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.2, 6), m.trunk);
    trunk.position.y = 0.6;
    var low = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 7), m.snowPine);
    low.position.y = 2.1;
    var high = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 7), m.snowPine);
    high.position.y = 3.3;
    var cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 7), m.snow);
    cap.position.y = 4.0;
    g.add(trunk, low, high, cap);
    g.scale.setScalar(s);
    return g;
  }

  /** Grey rocky peak with a flat white summit: a cone frustum that hides the terrain mound SA.peaks raises (AS-0193).
   *  `p` = SA.peaks.shape(peak); the group sits at the mound's base height, y 0 = foot, y = topY - baseY = the flat top. */
  function peak(THREE, m, p) {
    var g = new THREE.Group(), h = p.topY - p.baseY, slope = (p.baseR - p.topR) / h;
    var r = function (y) { return p.topR + p.pad + (h - y) * slope; };   // cone radius at height y (a hair wider than the terrain)
    var split = 0.72 * h, foot = -1.5;                                   // the foot is buried below the base so no gap shows
    var body = new THREE.Mesh(new THREE.CylinderGeometry(r(split), r(foot), split - foot, 8), m.stone);
    body.position.y = (split + foot) / 2;
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(r(h), r(split) + 0.04, h - split + 0.03, 8), m.snow);
    cap.position.y = (split + h + 0.03) / 2;
    g.add(body, cap);
    return g;
  }

  function sandRock(THREE, m, s) {
    var r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), m.sand);
    r.scale.set(s, s * 0.6, s * 0.9);
    r.position.y = 0.2 * s;
    return r;
  }

  SA.render.dryDecor = {
    materials: materials,
    builders: { cactus: cactus, snowPine: snowPine, peak: peak, sandRock: sandRock },
  };
})(typeof window !== 'undefined' ? window : globalThis);
