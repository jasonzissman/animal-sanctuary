/* SA.render.createBridges(THREE, { scene }): the river bridges of SA.surfaces (AS-0158) as ONE merged mesh of flat-coloured boxes.
 * Planks lie across the deck at exactly the standing height SA.surfaces.deckHeight gives the player (they pitch along the sloped ends so the
 * deck joins the ground), two side rails with posts run along the flat part (the same span the rail solids block), and piers stand in the water.
 * Built once; no per-frame work. The mesh casts a sun shadow.
 *
 *   bridges.group  THREE.Group (already added to the scene)   bridges.mesh  the merged mesh, named 'bridges'
 *   bridges.stats() { bridges, triangles }
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var PLANK = 0.5, PLANK_T = 0.12, RAIL_H = 0.85, POST_STEP = 1.6;
  var WOOD = [[0.62, 0.45, 0.27], [0.56, 0.4, 0.23]], DARK = [0.4, 0.27, 0.15];

  /** Adds one box (size sx along the deck, sy up, sz across) centred at c, pitched by `slope` (rise / run) along the deck. */
  function box(THREE, out, d, c, sx, sy, sz, slope, color) {
    var g = new THREE.BoxGeometry(sx, sy, sz), pos = g.attributes.position, idx = g.index.array, i;
    var p = Math.atan(slope || 0), cs = Math.cos(p), sn = Math.sin(p);
    var m = new THREE.Matrix4().makeBasis(new THREE.Vector3(d.dx * cs, sn, d.dz * cs), new THREE.Vector3(-d.dx * sn, cs, -d.dz * sn), new THREE.Vector3(-d.dz, 0, d.dx));
    m.setPosition(c[0], c[1], c[2]);
    g.applyMatrix4(m);
    var base = out.pos.length / 3;
    for (i = 0; i < pos.count; i++) {
      out.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      out.col.push(color[0], color[1], color[2]);
    }
    for (i = 0; i < idx.length; i++) out.idx.push(base + idx[i]);
    g.dispose();
  }

  function at(d, u, v) { return [d.x + d.dx * u - d.dz * v, d.z + d.dz * u + d.dx * v]; }

  function build(THREE, d, out) {
    var M = SA.map, S = SA.surfaces, n = Math.floor(2 * d.halfLen / PLANK), k, side;
    for (k = 0; k < n; k++) {   // planks, each following the deck surface (flat in the middle, sloped on the ends)
      var u = -d.halfLen + (k + 0.5) * (2 * d.halfLen / n), p = at(d, u, 0), e = 0.2;
      var h = S.deckHeight(d, p[0], p[1]), a = at(d, u - e, 0), b = at(d, u + e, 0);
      var ha = S.deckHeight(d, a[0], a[1]), hb = S.deckHeight(d, b[0], b[1]);
      var slope = ha !== null && hb !== null ? (hb - ha) / (2 * e) : 0;
      box(THREE, out, d, [p[0], (h === null ? d.y : h) - PLANK_T / 2 + 0.02, p[1]], PLANK - 0.06, PLANK_T, 2 * d.halfWid, slope, WOOD[k % 2]);
    }
    var span = d.halfLen - d.ramp, rail = d.halfWid - d.railR;
    for (side = -1; side <= 1; side += 2) {
      var mid = at(d, 0, rail * side);
      box(THREE, out, d, [mid[0], d.y + RAIL_H, mid[1]], 2 * span, 0.12, 0.12, 0, DARK);               // top rail
      box(THREE, out, d, [mid[0], d.y + RAIL_H * 0.5, mid[1]], 2 * span, 0.08, 0.08, 0, DARK);          // low rail
      var posts = Math.max(1, Math.round(2 * span / POST_STEP));
      for (k = 0; k <= posts; k++) {
        var pu = -span + (2 * span * k) / posts, pp = at(d, pu, rail * side);
        box(THREE, out, d, [pp[0], d.y + RAIL_H / 2 - 0.05, pp[1]], 0.16, RAIL_H + 0.1, 0.16, 0, DARK);
      }
      for (k = 0; k <= 2; k++) {   // piers under the flat part, down to the river bed
        var qu = -span + (span * k), qq = at(d, qu, (d.halfWid - 0.25) * side), gh = M.groundHeight(qq[0], qq[1]), top = d.y - PLANK_T, hgt = Math.max(0.3, top - gh + 0.4);
        box(THREE, out, d, [qq[0], top - hgt / 2, qq[1]], 0.3, hgt, 0.3, 0, DARK);
      }
    }
  }

  SA.render.createBridges = function (THREE, opts) {
    var list = SA.surfaces.bridges(), out = { pos: [], col: [], idx: [] }, group = new THREE.Group();
    group.name = 'bridges-group';
    list.forEach(function (d) { build(THREE, d, out); });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
    geo.setIndex(out.idx);
    geo.computeVertexNormals();
    var mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, specular: 0x000000 }));
    mesh.name = 'bridges';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    opts.scene.add(group);
    return { group: group, mesh: mesh, stats: function () { return { bridges: list.length, triangles: out.idx.length / 3 }; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
