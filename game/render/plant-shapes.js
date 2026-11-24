/* SA.render.plantShapes: procedural low-poly geometry for the ground plants (AS-0294, AS-0295). Only touches THREE; load before ground-cover.js.
 * Every shape is ONE merged BufferGeometry (position, normal, colour) so a whole plant is a single instance of an InstancedMesh.
 * The vertex colour is a grey ramp (dark base, light tip) times an optional part tint `rgb`; the per-instance colour from the plant's
 * data tints multiplies it, so a plant varies in colour without any extra geometry. Shapes stand at the origin, about 0.4-1.6 m tall.
 *
 *   SA.render.plantShapes.merge(THREE, parts)   parts [{ geo, shade0, shade1, rgb? }] -> BufferGeometry
 *   SA.render.plantShapes.placed(THREE, geo, yaw, lean, off, lift)  tilt a part `lean` rad out toward `yaw`, `off` from the centre
 *   SA.render.plantShapes.SHAPES                { name: function (THREE) -> BufferGeometry }; names are the `shape` of game/data/plants.js
 *   SA.render.plantShapes.grass(THREE)          the grass tuft (AS-0294)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  function merge(THREE, parts) {
    var pos = [], nor = [], col = [];
    parts.forEach(function (p) {
      var g = p.geo.index ? p.geo.toNonIndexed() : p.geo, pa = g.attributes.position.array, na = g.attributes.normal.array, t = p.rgb || [1, 1, 1];
      g.computeBoundingBox();
      var y0 = g.boundingBox.min.y, span = Math.max(0.001, g.boundingBox.max.y - y0);
      for (var i = 0; i < pa.length; i += 3) {
        pos.push(pa[i], pa[i + 1], pa[i + 2]); nor.push(na[i], na[i + 1], na[i + 2]);
        var s = p.shade0 + (p.shade1 - p.shade0) * Math.min(1, Math.max(0, (pa[i + 1] - y0) / span));
        col.push(s * t[0], s * t[1], s * t[2]);
      }
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }

  function placed(THREE, geo, yaw, lean, off, lift) {
    var m = new THREE.Matrix4().makeRotationY(yaw);
    m.multiply(new THREE.Matrix4().makeTranslation(off, lift, 0));
    m.multiply(new THREE.Matrix4().makeRotationZ(-lean));
    return geo.applyMatrix4(m);
  }

  /** A part moved by (x, y, z) after an optional non-uniform scale. */
  function at(geo, x, y, z, sx, sy, sz) {
    if (sx !== undefined) geo.scale(sx, sy, sz);
    return geo.translate(x, y, z);
  }

  function grass(THREE) {
    var parts = [];
    [0.55, 0.42, 0.5, 0.36, 0.46].forEach(function (h, i) {
      var blade = new THREE.ConeGeometry(0.045, h, 3);
      blade.translate(0, h / 2, 0);
      parts.push({ geo: placed(THREE, blade, i * 1.26, 0.18 + (i % 3) * 0.1, 0.05, 0), shade0: 0.55, shade1: 1 });
    });
    return merge(THREE, parts);
  }

  /** A ring of long leaves leaning out at `lean`, each `h` tall and `w` wide, flattened to `thin`. */
  function leafRing(THREE, n, w, h, thin, lean, off, shade0, shade1, rgb) {
    var parts = [];
    for (var i = 0; i < n; i++) {
      var leaf = new THREE.ConeGeometry(w, h, 4);
      leaf.scale(1, 1, thin); leaf.translate(0, h / 2, 0);
      parts.push({ geo: placed(THREE, leaf, i * 6.283 / n + (i % 2) * 0.2, lean + (i % 3) * 0.12, off, 0.02), shade0: shade0, shade1: shade1, rgb: rgb });
    }
    return parts;
  }

  /** Bosque bush: three overlapping squashed blobs, with a dark inside. */
  function bush(THREE) {
    var parts = [];
    [[0, 0.3, 0, 0.42], [0.3, 0.24, 0.12, 0.3], [-0.24, 0.26, -0.15, 0.32]].forEach(function (b) {
      parts.push({ geo: at(new THREE.IcosahedronGeometry(b[3], 0), b[0], b[1], b[2], 1, 0.8, 1), shade0: 0.6, shade1: 1 });
    });
    return merge(THREE, parts);
  }

  /** Bosque fern: a tall fountain of narrow arching fronds. */
  function fern(THREE) {
    var parts = leafRing(THREE, 8, 0.08, 0.78, 0.25, 0.6, 0.03, 0.55, 1);
    parts.push({ geo: at(new THREE.ConeGeometry(0.06, 0.5, 4), 0, 0.25, 0), shade0: 0.7, shade1: 1.05 });
    return merge(THREE, parts);
  }

  /** Selva big-leaf plant: a few huge broad leaves on a short stem. */
  function bigleaf(THREE) {
    var parts = leafRing(THREE, 5, 0.26, 1.0, 0.12, 0.5, 0.04, 0.6, 1);
    parts.push({ geo: at(new THREE.CylinderGeometry(0.03, 0.05, 0.4, 5), 0, 0.2, 0), shade0: 0.5, shade1: 0.8 });
    return merge(THREE, parts);
  }

  /** Selva vine: a zig-zag of thin stems rising 1.5 m with a diamond leaf at each bend. */
  function vine(THREE) {
    var parts = [], x = 0;
    for (var i = 0; i < 5; i++) {
      var seg = new THREE.CylinderGeometry(0.025, 0.03, 0.34, 4), dir = i % 2 ? -1 : 1;
      seg.rotateZ(dir * 0.22); seg.translate(x + dir * 0.04, 0.17 + i * 0.32, 0);
      parts.push({ geo: seg, shade0: 0.5, shade1: 0.8 });
      var leaf = new THREE.OctahedronGeometry(0.15, 0);
      parts.push({ geo: at(leaf, x + dir * 0.15, 0.3 + i * 0.32, (i % 3 - 1) * 0.06, 1, 0.8, 0.3), shade0: 0.8, shade1: 1.1 });
      x += dir * 0.08;
    }
    return merge(THREE, parts);
  }

  /** Desierto dry shrub: a tangle of thin bare twigs fanning out. */
  function dryshrub(THREE) {
    var parts = [];
    for (var i = 0; i < 9; i++) {
      var twig = new THREE.CylinderGeometry(0.012, 0.035, 0.7 - (i % 3) * 0.12, 3);
      twig.translate(0, 0.33, 0);
      parts.push({ geo: placed(THREE, twig, i * 2.4, 0.3 + (i % 4) * 0.18, 0.02, 0), shade0: 0.6, shade1: 1 });
    }
    parts.push({ geo: at(new THREE.IcosahedronGeometry(0.2, 0), 0, 0.25, 0, 1, 0.7, 1), shade0: 0.7, shade1: 1 });
    return merge(THREE, parts);
  }

  /** Cactus 1: a round ribbed barrel with a pale tip. */
  function barrel(THREE) {
    var body = at(new THREE.SphereGeometry(0.3, 7, 5), 0, 0.24, 0, 1, 0.85, 1);
    var tip = at(new THREE.SphereGeometry(0.1, 5, 3), 0, 0.46, 0);
    return merge(THREE, [{ geo: body, shade0: 0.7, shade1: 1 }, { geo: tip, shade0: 1.1, shade1: 1.2 }]);
  }

  /** Cactus 2: prickly pear, flat paddles stacked and tilted. */
  function paddle(THREE) {
    var parts = [];
    [[0, 0.3, 0, 0.0, 0.34], [-0.2, 0.7, 0.04, 0.5, 0.26], [0.22, 0.62, -0.02, -0.55, 0.24]].forEach(function (p) {
      var pad = new THREE.SphereGeometry(p[4], 7, 4);
      pad.scale(1, 1.2, 0.22); pad.rotateZ(p[3]); pad.translate(p[0], p[1], p[2]);
      parts.push({ geo: pad, shade0: 0.75, shade1: 1 });
    });
    return merge(THREE, parts);
  }

  /** Cactus 3: a slim column with one short arm. */
  function column(THREE) {
    var trunk = at(new THREE.CylinderGeometry(0.11, 0.14, 1.0, 6), 0, 0.5, 0);
    var top = at(new THREE.SphereGeometry(0.11, 6, 4), 0, 1.0, 0);
    var arm = at(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 5), 0.2, 0.62, 0);
    var elbow = at(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 5).rotateZ(Math.PI / 2), 0.1, 0.45, 0);
    return merge(THREE, [trunk, top, arm, elbow].map(function (g) { return { geo: g, shade0: 0.75, shade1: 1 }; }));
  }

  /** Montana alpine flower: three thin stems, each topped with a flat many-sided bloom and a gold heart. */
  function alpineflower(THREE) {
    var parts = [], green = [0.55, 0.85, 0.4];
    [[0, 0, 0.34], [0.1, 0.06, 0.26], [-0.08, -0.07, 0.3]].forEach(function (f) {
      parts.push({ geo: at(new THREE.CylinderGeometry(0.012, 0.016, f[2], 3), f[0], f[2] / 2, f[1]), shade0: 0.7, shade1: 0.9, rgb: green });
      var bloom = new THREE.CylinderGeometry(0.1, 0.07, 0.04, 6);
      parts.push({ geo: at(bloom, f[0], f[2] + 0.02, f[1]), shade0: 1, shade1: 1 });
      parts.push({ geo: at(new THREE.OctahedronGeometry(0.035, 0), f[0], f[2] + 0.05, f[1]), shade0: 1, shade1: 1, rgb: [1, 0.78, 0.2] });
    });
    parts.push({ geo: at(new THREE.ConeGeometry(0.1, 0.16, 4), 0, 0.08, 0, 1, 1, 0.3), shade0: 0.6, shade1: 0.8, rgb: green });
    return merge(THREE, parts);
  }

  /** Montana low pine: a squat two-tier cone, knee high and soft. */
  function lowpine(THREE) {
    var trunk = at(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 5), 0, 0.1, 0);
    var low = at(new THREE.ConeGeometry(0.42, 0.5, 6), 0, 0.42, 0);
    var high = at(new THREE.ConeGeometry(0.28, 0.4, 6), 0, 0.72, 0);
    return merge(THREE, [{ geo: trunk, shade0: 0.5, shade1: 0.6, rgb: [0.8, 0.55, 0.35] }, { geo: low, shade0: 0.6, shade1: 1 }, { geo: high, shade0: 0.7, shade1: 1.05 }]);
  }

  SA.render.plantShapes = {
    merge: merge, placed: placed, grass: grass,
    SHAPES: { bush: bush, fern: fern, bigleaf: bigleaf, vine: vine, dryshrub: dryshrub, barrel: barrel, paddle: paddle, column: column, alpineflower: alpineflower, lowpine: lowpine },
  };
})(typeof window !== 'undefined' ? window : globalThis);
