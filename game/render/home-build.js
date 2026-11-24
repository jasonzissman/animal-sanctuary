/* SA.render.buildHome(THREE, r) -> { group, layers: { abajo, encima, dentro }, pick }  (AS-0352, slice 3 of AS-0188: Construir un hogar)
 * The rabbit home that Mission 9 builds on its spot, one procedural low-poly layer per 'place' step (flat materials, no textures). Everything is group-local
 * (origin on the ground at the spot's centre, the doorway toward local +z, which the caller turns to face the way you come from):
 *   abajo   sticks: a woven ring of laid sticks (four rows) with a doorway gap
 *   encima  leaves: a leafy cone roof with a few big leaves on it, resting on the sticks
 *   dentro  soft grass: a bed of pale grass with tufts inside the walls
 *   pick    an invisible, generous pick volume over the whole spot (a tap anywhere near the home places the item)
 * Every layer starts hidden (`visible = false`); render/mission-home.js reveals them as view().layers grows and pops each one in.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var ROOF_Y = 1.0, STICK =[0x7a5230, 0x8a6a45, 0x6b4a2b], LEAF = [0x4f9d3a, 0x6dbb4a, 0x3f8a33], GRASS = [0xc9d977, 0xb5cc5e, 0xdde58f];

  function lam(THREE, c) { return new THREE.MeshLambertMaterial({ color: c }); }

  function sticks(THREE) {
    var g = new THREE.Group(), RING = 1.5, PER = 9, i, row;
    for (row = 0; row < 4; row++) {
      for (i = 0; i < PER; i++) {
        var a = (i + (row % 2) * 0.5) / PER * Math.PI * 2;          // angle from +x; the doorway is the gap round +z (a = PI/2)
        if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.55) continue;
        var s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.15), lam(THREE, STICK[(i + row) % 3]));
        s.position.set(Math.cos(a) * RING, 0.14 + row * 0.22, Math.sin(a) * RING);
        s.rotation.y = -a + 0.12 * ((i + row) % 3 - 1);   // lying along the ring, a little uneven
        g.add(s);
      }
    }
    return g;
  }

  function leaves(THREE) {
    var g = new THREE.Group(), i;
    var roof = new THREE.Mesh(new THREE.ConeGeometry(2.05, 1.05, 8), lam(THREE, LEAF[0]));
    roof.position.y = ROOF_Y + 0.525;
    g.add(roof);
    for (i = 0; i < 8; i++) {          // big leaves laid on the roof
      var a = i / 8 * Math.PI * 2 + 0.3;
      var leaf = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.9), lam(THREE, LEAF[1 + (i % 2)]));
      leaf.position.set(Math.cos(a) * 0.95, ROOF_Y + 0.6,Math.sin(a) * 0.95);
      leaf.rotation.set(0.5, Math.PI / 2 - a, 0, 'YXZ');
      g.add(leaf);
    }
    var tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.45, 5), lam(THREE, LEAF[2]));
    tip.position.y = ROOF_Y + 1.2;
    g.add(tip);
    return g;
  }

  function grass(THREE) {
    var g = new THREE.Group(), i;
    var bed = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.3, 0.14, 8), lam(THREE, GRASS[0]));
    bed.position.y = 0.1;
    g.add(bed);
    for (i = 0; i < 9; i++) {
      var a = i / 9 * Math.PI * 2, d = 0.3 + (i % 3) * 0.3;
      var tuft = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 4), lam(THREE, GRASS[1 + (i % 2)]));
      tuft.position.set(Math.cos(a) * d, 0.32, Math.sin(a) * d);
      tuft.rotation.z = 0.2 * Math.sin(i * 2);
      g.add(tuft);
    }
    return g;
  }

  SA.render.buildHome = function (THREE, r) {
    var group = new THREE.Group();
    var layers = { abajo: sticks(THREE), encima: leaves(THREE), dentro: grass(THREE) };
    Object.keys(layers).forEach(function (k) { layers[k].visible = false; group.add(layers[k]); });
    var pick = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2.6, 8), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.y = 1.3;
    pick.userData = { homePick: true };
    group.add(pick);
    return { group: group, layers: layers, pick: pick };
  };
})(typeof window !== 'undefined' ? window : globalThis);
