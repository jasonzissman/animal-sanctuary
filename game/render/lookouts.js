/* SA.render.createLookouts(THREE, { scene }): the wooden lookout towers of SA.lookouts (AS-0160) as ONE merged mesh of flat-coloured boxes.
 * Per tower: four legs with cross braces, a plank platform whose top is exactly the tower's topY (the standing height SA.climb gives the player),
 * a railing on the same posts SA.lookouts.railSolids blocks with, and the ladder up the ladder side (two rails and rungs, from the ground to above
 * the platform edge). Built once; no per-frame work. The mesh casts a sun shadow. userData.climbId = the tower ids, so the Space-target outline can find a node.
 *
 *   lookouts.group  THREE.Group (already added to the scene)   lookouts.mesh  the merged mesh, named 'lookouts'
 *   lookouts.nodeFor(id) -> the group for an outline (the whole tower glows)   lookouts.stats() { towers, triangles }
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var WOOD = [0.6, 0.43, 0.25], PLANK = [0.67, 0.5, 0.3], DARK = [0.4, 0.27, 0.15], LEG = [0.46, 0.32, 0.18];
  var LEG_W = 0.34, PLATFORM_T = 0.22, RUNG_STEP = 0.4;

  /** Adds an axis-aligned box centred at (cx, cy, cz). */
  function box(THREE, out, cx, cy, cz, sx, sy, sz, color) {
    var g = new THREE.BoxGeometry(sx, sy, sz), pos = g.attributes.position, idx = g.index.array, i;
    var base = out.pos.length / 3;
    for (i = 0; i < pos.count; i++) {
      out.pos.push(pos.getX(i) + cx, pos.getY(i) + cy, pos.getZ(i) + cz);
      out.col.push(color[0], color[1], color[2]);
    }
    for (i = 0; i < idx.length; i++) out.idx.push(base + idx[i]);
    g.dispose();
  }

  function tower(THREE, t, out) {
    var M = SA.map, S = SA.lookouts, h = t.base / 2 - 0.17, ph = t.platform / 2, top = t.topY, f = t.face, k, sx, sz;
    // Legs: from below the lowest ground under each, up to the platform.
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      var x = t.x + c[0] * h, z = t.z + c[1] * h, low = Math.min(M.groundHeight(x, z), t.groundY) - 0.4, len = top - low;
      box(THREE, out, x, low + len / 2, z, LEG_W, len, LEG_W, LEG);
    });
    // Cross braces on all four sides, a third and two thirds of the way up.
    [0.35, 0.7].forEach(function (fr) {
      var y = t.groundY + (top - t.groundY) * fr;
      box(THREE, out, t.x, y, t.z - h, 2 * h, 0.12, 0.12, DARK); box(THREE, out, t.x, y, t.z + h, 2 * h, 0.12, 0.12, DARK);
      box(THREE, out, t.x - h, y, t.z, 0.12, 0.12, 2 * h, DARK); box(THREE, out, t.x + h, y, t.z, 0.12, 0.12, 2 * h, DARK);
    });
    // Platform: planks across, top at exactly topY.
    var planks = Math.round(2 * ph / 0.5);
    for (k = 0; k < planks; k++) box(THREE, out, t.x - ph + (k + 0.5) * (2 * ph / planks), top - PLATFORM_T / 2, t.z, 2 * ph / planks - 0.04, PLATFORM_T, 2 * ph, k % 2 ? PLANK : WOOD);
    // Railing: a post at every blocking circle, plus a top and a mid rail on each side.
    S.railSolids(t).forEach(function (c) { box(THREE, out, c[0], top + t.railH / 2, c[1], 0.14, t.railH, 0.14, DARK); });
    var rh = ph - 0.18;
    [top + t.railH, top + t.railH * 0.5].forEach(function (y, i) {
      var w = i ? 0.07 : 0.1;
      box(THREE, out, t.x, y, t.z - rh, 2 * rh, w, w, WOOD); box(THREE, out, t.x, y, t.z + rh, 2 * rh, w, w, WOOD);
      box(THREE, out, t.x - rh, y, t.z, w, w, 2 * rh, WOOD); box(THREE, out, t.x + rh, y, t.z, w, w, 2 * rh, WOOD);
    });
    // Ladder: against the platform edge on the ladder side, from the ground to a little above the platform.
    var u = ph + 0.08, vx = -f.z, vz = f.x, lx = t.x + f.x * u, lz = t.z + f.z * u;
    var base = Math.min(M.groundHeight(lx, lz), t.groundY) - 0.1, len = top + 0.8 - base, ry = base + len / 2;
    [-0.34, 0.34].forEach(function (v) {
      box(THREE, out, lx + vx * v, ry, lz + vz * v, 0.1, len, 0.1, LEG);
    });
    sx = Math.abs(f.x) * 0.06 + Math.abs(f.z) * 0.68; sz = Math.abs(f.z) * 0.06 + Math.abs(f.x) * 0.68;
    for (var y = base + 0.3; y < top + 0.75; y += RUNG_STEP) box(THREE, out, lx, y, lz, sx, 0.07, sz, WOOD);
  }

  SA.render.createLookouts = function (THREE, opts) {
    var list = SA.lookouts.towers(), out = { pos: [], col: [], idx: [] }, group = new THREE.Group();
    group.name = 'lookouts-group';
    list.forEach(function (t) { tower(THREE, t, out); });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
    geo.setIndex(out.idx);
    geo.computeVertexNormals();
    var mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, specular: 0x000000 }));
    mesh.name = 'lookouts';
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    group.userData.climbId = list.map(function (t) { return t.id; });
    opts.scene.add(group);
    return { group: group, mesh: mesh, nodeFor: function (id) { return list.some(function (t) { return t.id === id; }) ? mesh : null; },
      stats: function () { return { towers: list.length, triangles: out.idx.length / 3 }; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
