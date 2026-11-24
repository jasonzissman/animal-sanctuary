/* SA.render.trees: the procedural low-poly tree kinds (AS-0296), 2-3 per biome. Only touches THREE; used by game/render/decor.js.
 * Which kind a decor id builds is data (game/data/decor.js `kind`); where trees stand is the pure SA.decorPlan; canopy heights per kind
 * are SA.perch.KINDS (every kind here has an entry, so climbing, the perch, tree-tap, treetop tells and pickups work unchanged).
 *
 *   var trees = SA.render.trees.create(THREE)
 *   trees.has(kind)                       -> whether a builder exists for a perch kind
 *   trees.build(kind, size, tint?)        -> Group { userData.tree: true, userData.kind: kind }, scaled by `size`; `tint` 0..1 (SA.decorPlan)
 *                                            picks one of VARIANTS shared leaf colours (a few materials in all, never one per tree)
 *   trees.update(dt)                      -> advance the wind: each canopy rotates a few hundredths of a radian about its trunk top;
 *                                            no per-frame allocation (a preallocated list of nodes, two rotation writes each)
 *   trees.swayCount()                     -> how many canopies sway
 * Every kind has a trunk (static), a foliage group (the swaying part, pivot at the trunk top) and a flat canopy pad at the SA.perch height.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var VARIANTS = 5;
  var SWAY_AMP = 0.035;   // radians
  var SWAY_SPEED = 1.1;
  var TRUNK = { brown: '#7a5230', dark: '#5f4126', birch: '#e6e2d6', grey: '#8a7a64', ceiba: '#8c7b66' };
  // Leaf colour per kind; tint picks a hue/lightness shift around it.
  var LEAF = { pine: '#2f7a4a', jungle: '#2c9a46', oak: '#4e9a3a', birch: '#8cbb3e', palm: '#35a652', kapok: '#2a8a4a',
    acacia: '#9aa845', yucca: '#7fa07a', snowpine: '#2a6a4c', fir: '#1f5f48' };

  function create(THREE) {
    var mats = {}, items = [], time = 0;

    function flat(color) { return new THREE.MeshPhongMaterial({ color: color, flatShading: true, specular: 0x000000 }); }
    function solid(key, color) { return mats[key] || (mats[key] = flat(color)); }
    function leaf(kind, tint) {
      var v = Math.max(0, Math.min(VARIANTS - 1, Math.floor((typeof tint === 'number' ? tint : 0.5) * VARIANTS))), key = kind + v;
      if (!mats[key]) {
        var c = new THREE.Color(LEAF[kind]);
        c.offsetHSL((v - 2) * 0.012, 0, (v - 2) * 0.03);
        mats[key] = flat(c);
      }
      return mats[key];
    }

    function mesh(geo, m, x, y, z) { var o = new THREE.Mesh(geo, m); o.position.set(x || 0, y, z || 0); return o; }
    function cyl(r0, r1, h, seg, m, y, x, z) { return mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m, x, y, z); }
    function cone(r, h, seg, m, y) { return mesh(new THREE.ConeGeometry(r, h, seg), m, 0, y, 0); }
    function blob(r, sy, m, x, y, z) { var o = mesh(new THREE.IcosahedronGeometry(r, 0), m, x, y, z); o.scale.y = sy; return o; }

    /** The tree group: static trunk bits plus a foliage group pivoting at height `pivot` (children are added at WORLD heights via fol()).
     *  `padY` = the canopy pad's centre = SA.perch.KINDS[kind].height - 0.07 (the 0.14 thick pad's top is the standing height). */
    function shell(kind, pivot, padY, padR, padMat) {
      var g = new THREE.Group(), foliage = new THREE.Group();
      foliage.position.y = pivot;
      var pad = cyl(padR, padR, 0.14, 8, padMat, padY);
      g.add(foliage, pad);
      g.userData.tree = true;      // tappable (SA.render.createTreeTap), climbable
      g.userData.kind = kind;      // canopy size for SA.perch
      g.userData.foliage = foliage;
      return g;
    }
    function fol(g, o) { o.position.y -= g.userData.foliage.position.y; g.userData.foliage.add(o); }

    var B = {
      pine: function (t) {
        var L = leaf('pine', t), g = shell('pine', 1.2, 3.13, 1.0, L);
        g.add(cyl(0.2, 0.3, 1.2, 6, solid('t1', TRUNK.brown), 0.6));
        fol(g, cone(1.3, 2.2, 7, L, 2.1)); fol(g, cone(0.9, 1.8, 7, L, 3.3));
        return g;
      },
      jungle: function (t) {
        var L = leaf('jungle', t), g = shell('jungle', 3.4, 5.13, 1.5, L);
        g.add(cyl(0.25, 0.4, 3.4, 6, solid('t1', TRUNK.brown), 1.7));
        fol(g, blob(1.7, 0.7, L, 0, 4.1, 0));
        return g;
      },
      oak: function (t) {
        var L = leaf('oak', t), g = shell('oak', 2.0, 4.13, 1.0, L);
        g.add(cyl(0.3, 0.45, 2.2, 6, solid('t2', TRUNK.dark), 1.1));
        fol(g, blob(1.7, 0.85, L, 0, 3.3, 0)); fol(g, blob(1.1, 0.8, L, 0.9, 3.8, 0.4)); fol(g, blob(0.9, 0.8, L, -0.9, 3.6, -0.5));
        return g;
      },
      birch: function (t) {
        var L = leaf('birch', t), g = shell('birch', 2.4, 3.73, 0.8, L);
        g.add(cyl(0.14, 0.22, 3.2, 6, solid('t3', TRUNK.birch), 1.6));
        g.add(cyl(0.23, 0.23, 0.06, 6, solid('t4', '#3b3b3b'), 1.0)); g.add(cyl(0.18, 0.18, 0.06, 6, solid('t4', '#3b3b3b'), 2.0));   // dark bark bands
        fol(g, blob(1.0, 1.25, L, 0, 3.7, 0)); fol(g, blob(0.7, 1.2, L, 0.35, 4.5, 0.15));
        return g;
      },
      palm: function (t) {
        var L = leaf('palm', t), g = shell('palm', 4.2, 4.93, 0.9, L), tm = solid('t5', TRUNK.grey);
        g.add(cyl(0.2, 0.3, 1.6, 6, tm, 0.8, 0, 0), cyl(0.17, 0.2, 1.6, 6, tm, 2.3, 0.15, 0), cyl(0.15, 0.17, 1.4, 6, tm, 3.7, 0.3, 0));
        for (var i = 0; i < 6; i++) {
          var a = i * Math.PI / 3, f = cone(0.32, 2.0, 4, L, 4.55);
          f.scale.z = 0.35;
          f.rotation.order = 'YZX'; f.rotation.y = -a; f.rotation.z = -1.25;   // a frond drooping outward from the crown
          f.position.x = 0.3 + Math.cos(a) * 0.8; f.position.z = Math.sin(a) * 0.8;
          fol(g, f);
        }
        fol(g, blob(0.4, 1, solid('t6', '#5a4630'), 0.3, 4.4, 0));
        return g;
      },
      kapok: function (t) {
        var L = leaf('kapok', t), g = shell('kapok', 4.8, 5.73, 1.6, L), tm = solid('t7', TRUNK.ceiba);
        g.add(cyl(0.35, 0.55, 5.0, 7, tm, 2.5));
        for (var i = 0; i < 3; i++) {   // buttress flanges at the foot
          var b = mesh(new THREE.BoxGeometry(0.9, 1.4, 0.12), tm, Math.cos(i * 2.1) * 0.35, 0.6, Math.sin(i * 2.1) * 0.35);
          b.rotation.y = -i * 2.1; g.add(b);
        }
        fol(g, blob(2.3, 0.4, L, 0, 5.5, 0)); fol(g, blob(1.3, 0.5, L, 0.8, 6.1, 0.4));
        return g;
      },
      acacia: function (t) {
        var L = leaf('acacia', t), g = shell('acacia', 2.4, 3.03, 1.4, L);
        var tr = cyl(0.16, 0.28, 2.6, 6, solid('t8', TRUNK.dark), 1.3);
        tr.rotation.z = 0.08; g.add(tr);
        fol(g, cyl(2.0, 1.7, 0.6, 8, L, 2.85)); fol(g, cyl(1.1, 0.9, 0.5, 7, L, 3.05, 1.1, 0.5));
        return g;
      },
      yucca: function (t) {
        var L = leaf('yucca', t), g = shell('yucca', 1.8, 2.53, 0.7, L), tm = solid('t9', TRUNK.grey);
        g.add(cyl(0.2, 0.3, 1.8, 6, tm, 0.9));
        [[-1, 1.5], [1, 1.2]].forEach(function (b) {
          var br = cyl(0.12, 0.16, 1.0, 5, tm, b[1], b[0] * 0.35, 0);
          br.rotation.z = -b[0] * 0.5; g.add(br);
          tuft(g, L, b[0] * 0.7, b[1] + 0.6, 0.75);
        });
        tuft(g, L, 0, 2.15, 1);
        return g;
      },
      snowpine: function (t) {
        var L = leaf('snowpine', t), g = shell('snowpine', 1.2, 3.13, 0.9, L);
        g.add(cyl(0.2, 0.3, 1.2, 6, solid('t1', TRUNK.brown), 0.6));
        fol(g, cone(1.3, 2.2, 7, L, 2.1)); fol(g, cone(0.9, 1.8, 7, L, 3.3)); fol(g, cone(0.5, 0.9, 7, solid('snow', '#f4f8fb'), 4.0));
        return g;
      },
      fir: function (t) {
        var L = leaf('fir', t), g = shell('fir', 1.6, 4.53, 0.6, L);
        g.add(cyl(0.18, 0.28, 1.6, 6, solid('t2', TRUNK.dark), 0.8));
        [[1.15, 1.8, 2.5], [0.95, 1.6, 3.5], [0.75, 1.5, 4.5], [0.5, 1.3, 5.4]].forEach(function (c) { fol(g, cone(c[0], c[1], 7, L, c[2])); });
        fol(g, cone(0.2, 0.7, 6, solid('snow', '#f4f8fb'), 6.2));
        return g;
      },
    };

    /** A yucca rosette of spiky leaves: a few thin cones fanning out of one point. */
    function tuft(g, m, x, y, s) {
      for (var i = 0; i < 6; i++) {
        var a = i * Math.PI / 3, c = cone(0.1 * s, 1.0 * s, 4, m, 0);
        c.geometry.translate(0, 0.5 * s, 0);
        c.rotation.order = 'YZX'; c.rotation.y = -a; c.rotation.z = i === 0 ? 0 : -0.9;
        c.position.set(x, y, 0);
        fol(g, c);
      }
    }

    function build(kind, size, tint) {
      var fn = B[kind];
      if (!fn) return null;
      var g = fn(tint), s = typeof size === 'number' && size > 0 ? size : 1;
      g.scale.setScalar(s);
      items.push({ node: g.userData.foliage, phase: ((tint || 0) * 37.3 + items.length * 1.7) % (Math.PI * 2), amp: SWAY_AMP * (0.7 + 0.6 * ((tint || 0) * 7 % 1)) });
      return g;
    }

    function update(dt) {
      time += Math.min(dt || 0, 0.1) * SWAY_SPEED;
      for (var i = 0; i < items.length; i++) {
        var it = items[i], r = it.node.rotation;
        r.z = Math.sin(time + it.phase) * it.amp;
        r.x = Math.cos(time * 0.8 + it.phase) * it.amp * 0.6;
      }
    }

    return { has: function (k) { return !!B[k]; }, build: build, update: update, swayCount: function () { return items.length; } };
  }

  SA.render.trees = { VARIANTS: VARIANTS, KINDS: Object.keys(LEAF), create: create };
})(typeof window !== 'undefined' ? window : globalThis);
