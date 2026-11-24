/* SA.render.rocks.create(THREE): thin builder that turns SA.rocks specs into low-poly, flat-shaded rock meshes (AS-0299).
 *   .build(spec, size) -> Group (scale = size, so SA.blocking reads the placed scale), userData.rock = spec.kind
 *   .geometry(kind, variant) -> the shared BufferGeometry (12 are built, lazily, and reused by every rock of that kind and variant)
 *   .material(color) -> the shared flat material for a palette colour
 * Every kind is a single merged BufferGeometry (the stack merges its stones, the spire its two points), jittered with a hash of the
 * vertex position so shared corners move together and the facets stay crisp. Normalised so the top sits at HEIGHTS[kind], matching the
 * collision data (game/data/decor.js). Only touches THREE; nothing is allocated per frame (rocks never move).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var HEIGHTS = { boulder: 0.72, flat: 0.28, stack: 0.8, jagged: 0.95 };   // top of each kind at scale 1 (data height is 0.8 for rocks)
  var SINK = 0.12;                                                         // the foot is buried so a rock never floats on a slope

  function hash(x, y, z, seed) {
    var h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
    return h - Math.floor(h) - 0.5;   // -0.5..0.5
  }

  /** Append `geo`'s triangles to `out`, scaled, moved and jittered (jx/jy/jz = jitter amount per axis). */
  function addPiece(out, geo, seed, s, o, j) {
    var src = geo.index ? geo.toNonIndexed() : geo, p = src.attributes.position.array;
    for (var i = 0; i + 2 < p.length; i += 3) {
      var x = p[i], y = p[i + 1], z = p[i + 2];
      var qx = Math.round(x * 100), qy = Math.round(y * 100), qz = Math.round(z * 100);   // equal corners hash equal
      out.push(
        (x + hash(qx, qy, qz, seed) * j[0]) * s[0] + o[0],
        (y + hash(qy, qz, qx, seed + 1) * j[1]) * s[1] + o[1],
        (z + hash(qz, qx, qy, seed + 2) * j[2]) * s[2] + o[2]);
    }
  }

  /** The vertex list for one kind + variant (pure numbers; THREE is only used for the primitive shapes). */
  function pieces(THREE, kind, v) {
    var out = [], sd = v * 7 + 1;
    if (kind === 'boulder') {
      addPiece(out, new THREE.IcosahedronGeometry(0.75, 1), sd, [1 + v * 0.08, 0.68, 0.9], [0, 0, 0], [0.34, 0.3, 0.34]);
    } else if (kind === 'flat') {
      addPiece(out, new THREE.CylinderGeometry(0.85, 1, 0.3, 6 + v, 1), sd, [1, 1, 0.85 + v * 0.05], [0, 0, 0], [0.3, 0.1, 0.3]);
    } else if (kind === 'stack') {
      addPiece(out, new THREE.IcosahedronGeometry(0.8, 0), sd, [1, 0.5, 0.9], [0, 0.1, 0], [0.22, 0.12, 0.22]);
      addPiece(out, new THREE.IcosahedronGeometry(0.55, 0), sd + 3, [1, 0.6, 1], [0.1 * (v - 1), 0.5, 0.05], [0.18, 0.12, 0.18]);
      addPiece(out, new THREE.IcosahedronGeometry(0.34, 0), sd + 5, [1, 0.7, 1], [-0.08 * (v - 1), 0.85, -0.04], [0.12, 0.1, 0.12]);
    } else {   // jagged: a leaning spire with a shorter companion
      addPiece(out, new THREE.ConeGeometry(0.42, 1.7, 5 + (v % 2), 2), sd, [1, 1, 1], [0, 0.85, 0], [0.3, 0.16, 0.3]);
      addPiece(out, new THREE.ConeGeometry(0.28, 0.9, 5, 1), sd + 4, [1, 1, 1], [0.4 + v * 0.05, 0.45, 0.15], [0.2, 0.1, 0.2]);
    }
    return out;
  }

  /** Move the foot to -SINK and squash/stretch so the top is HEIGHTS[kind]. */
  function normalise(v, kind) {
    var lo = Infinity, hi = -Infinity, i;
    for (i = 1; i < v.length; i += 3) { if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i]; }
    if (!(hi > lo)) return v;
    var k = (HEIGHTS[kind] + SINK) / (hi - lo);
    for (i = 1; i < v.length; i += 3) v[i] = (v[i] - lo) * k - SINK;
    return v;
  }

  function create(THREE) {
    var geos = {}, mats = {};

    function geometry(kind, variant) {
      var key = kind + variant;
      if (!geos[key]) {
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(normalise(pieces(THREE, kind, variant), kind), 3));
        g.computeVertexNormals();   // non-indexed, so every triangle is its own flat facet
        geos[key] = g;
      }
      return geos[key];
    }

    function material(color) {
      if (!mats[color]) mats[color] = new THREE.MeshPhongMaterial({ color: color, flatShading: true, specular: 0x000000 });
      return mats[color];
    }

    function build(spec, size) {
      var g = new THREE.Group(), mesh = new THREE.Mesh(geometry(spec.kind, spec.variant), material(spec.color));
      mesh.scale.set(spec.scale[0], spec.scale[1], spec.scale[2]);
      mesh.rotation.set(spec.tilt[0], spec.yaw, spec.tilt[1]);
      g.add(mesh);
      g.scale.setScalar(size);
      g.userData.rock = spec.kind;
      return g;
    }

    return { build: build, geometry: geometry, material: material };
  }

  SA.render.rocks = { create: create, HEIGHTS: HEIGHTS };
})(typeof window !== 'undefined' ? window : globalThis);
