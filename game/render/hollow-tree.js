/* The hollow tree prop builder (AS-0346, Mission 8): registers SA.render.propBuilders.hollowtree (game/render/props.js must load first).
 * A fat trunk made of bark slabs round a hollow, open towards local +z (the doorway), a leafy crown, and inside: a plank floor, two shelves piled with
 * strawberries (red balls with a green cap), a crate of them on the floor and a warm lantern glow so the doorway reads as a secret home. Flat low-poly
 * primitives only, drawn from the prop's data `builder` key like every prop. The mouse family (game/render/mission-pantry.js) stands inside.
 * Sizes: hollow radius ~1.35, doorway ~1.8 wide and 3.1 tall, trunk 4.2 tall; the tree's origin is the centre of the floor.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};
  SA.render.propBuilders = SA.render.propBuilders || {};

  var R = 1.7, SLABS = 12, GAP = 0.9;        // trunk ring radius, slab count, half-angle (radians) of the doorway
  var BERRY = 0xe8553d, CAP = 0x4caf50, BARK2 = 0x5f4125, FLOOR = 0x4a3320, GLOW = 0xffe08a;

  function lam(THREE, c) { return new THREE.MeshLambertMaterial({ color: c }); }
  function put(g, mesh, x, y, z) { mesh.position.set(x, y, z); g.add(mesh); return mesh; }

  function berries(THREE, g, cx, cy, cz, n, spread) {       // a little heap of strawberries (a red ball with a green cap each)
    var red = lam(THREE, BERRY), green = lam(THREE, CAP);
    for (var i = 0; i < n; i++) {
      var a = i * 2.4, rr = spread * Math.sqrt((i + 0.5) / n), x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr * 0.5, y = cy + (1 - rr / spread) * 0.12;
      put(g, new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), red), x, y + 0.12, z);
      put(g, new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.06, 5), green), x, y + 0.25, z);
    }
  }

  SA.render.propBuilders.hollowtree = function (THREE, m) {
    var g = new THREE.Group();
    var bark = [m.trunk, lam(THREE, BARK2)];
    for (var i = 0; i < SLABS; i++) {                          // the trunk: slabs round the ring, none across the doorway (local +z)
      var ang = (i / SLABS) * Math.PI * 2;                     // angle round the ring, 0 = the doorway side (+z)
      if (Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) < GAP) continue;
      put(g, new THREE.Mesh(new THREE.BoxGeometry(1.15, 4.2, 0.7), bark[i % 2]), Math.sin(ang) * R, 2.1, Math.cos(ang) * R).rotation.y = ang;
    }
    put(g, new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.1, 0.7), bark[1]), 0, 3.65, R);     // the lintel over the doorway
    var crown = put(g, new THREE.Mesh(new THREE.IcosahedronGeometry(2.7, 0), m.leaf), 0, 5.0, 0);
    crown.scale.y = 0.7;
    put(g, new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.08, 10), lam(THREE, FLOOR)), 0, 0.05, 0);   // plank floor
    // The pantry at the back: two shelves of planks on posts, piled with strawberries, and a crate of them on the floor.
    [0.85, 1.65].forEach(function (y) {
      put(g, new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.5), m.wood), 0, y, -0.95);
      berries(THREE, g, 0, y + 0.04, -0.95, 9, 0.8);
    });
    [-0.95, 0.95].forEach(function (x) { put(g, new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.08), m.wood), x, 0.85, -0.7); });
    put(g, new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.5), m.wood), -1.0, 0.2, -0.2);
    berries(THREE, g, -1.0, 0.35, -0.2, 6, 0.22);
    put(g, new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: GLOW })), 0, 3.0, -0.3);   // the lantern
    return g;
  };
})(typeof window !== 'undefined' ? window : globalThis);
