/* SA.render.createDesertLandmarks(THREE, { scene }): the desierto's rock arch and oasis of SA.desertPlan (AS-0308), built once, no per-frame work.
 *   - the arch: two tapered 7-sided sandstone pillars with a flat lintel across the top (flat-shaded, banded warm tones), merged into ONE mesh;
 *     the walkway between the pillars is open (the player walks under it).
 *   - the oasis: a flat low-poly blue pool with a pale sand rim, plus a few palms. The palm trunks and fronds are drawn with THREE.InstancedMesh
 *     (one trunk mesh, one frond mesh) so five palms cost two draw calls.
 *   landmarks.group  THREE.Group (already added to the scene)   landmarks.stats() { archTriangles, palms, drawCalls }
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var STONE = [[0.78, 0.55, 0.36], [0.7, 0.46, 0.3], [0.84, 0.62, 0.42]];   // sandstone bands, low to high
  var WATER = 0x3aa6d8, RIM = 0xe8d49a, TRUNK = 0x8a6238, FROND = 0x3f9a4a;

  function push(out, g, colorOf) {
    var pos = g.attributes.position, base = out.pos.length / 3, idx = g.index ? g.index.array : null, i;
    for (i = 0; i < pos.count; i++) {
      out.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      var c = colorOf(pos.getY(i), i);
      out.col.push(c[0], c[1], c[2]);
    }
    for (i = 0; i < idx.length; i++) out.idx.push(base + idx[i]);
    g.dispose();
  }

  function band(y, y0, y1, i) {
    var t = (y - y0) / Math.max(0.001, y1 - y0), k = t < 0.34 ? 0 : t < 0.7 ? 1 : 2, s = 0.94 + 0.12 * ((i * 29) % 5) / 5;
    return [STONE[k][0] * s, STONE[k][1] * s, STONE[k][2] * s];
  }

  function buildArch(THREE, a, out) {
    var bottom = a.groundY - 1.2, top = a.topY;
    a.pillars.forEach(function (p, n) {
      var g = new THREE.CylinderGeometry(a.pillarR * 0.82, a.pillarR * 1.12, top - bottom, 7, 3);
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(p.x, (top + bottom) / 2, p.z));
      push(out, g, function (y, k) { return band(y, bottom, top, k + n * 3); });
    });
    // The lintel: a chunky box laid across the two pillar tops, along the line joining them.
    var len = a.gap + 2 * a.pillarR * 1.1, th = 1.5, lg = new THREE.BoxGeometry(len, th, a.pillarR * 1.6);
    lg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(a.x, top - th / 2 + 0.2, a.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a.ang), new THREE.Vector3(1, 1, 1)));
    push(out, lg, function (y, k) { return band(y, top - th, top, k + 1); });
  }

  function flatDisc(THREE, x, y, z, r, color, h) {
    var g = new THREE.CylinderGeometry(r, r * 1.05, h, 12, 1);
    var m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: color, flatShading: true, specular: 0x222222 }));
    m.position.set(x, y, z);
    return m;
  }

  SA.render.createDesertLandmarks = function (THREE, opts) {
    var L = SA.desertPlan.get(), group = new THREE.Group(), draw = 0, archTris = 0;
    group.name = 'desert-landmarks';
    if (L.arch) {
      var out = { pos: [], col: [], idx: [] };
      buildArch(THREE, L.arch, out);
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
      geo.setIndex(out.idx);
      geo.computeVertexNormals();
      var arch = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, specular: 0x000000 }));
      arch.name = 'desert-arch';
      arch.castShadow = true;
      arch.frustumCulled = false;
      group.add(arch);
      archTris = out.idx.length / 3;
      draw++;
    }
    var palmCount = 0;
    if (L.oasis) {
      var o = L.oasis, top = o.groundY;
      // The pool sits at the highest ground in its ring so the low side never shows sand over the water; a sand rim hides the join.
      var depth = top - o.lowY + 0.5, rim = flatDisc(THREE, o.x, top + 0.05 - depth / 2, o.z, o.poolR + 1.1, RIM, depth), pool = flatDisc(THREE, o.x, top + 0.09, o.z, o.poolR, WATER, 0.1);
      pool.name = 'oasis-pool';
      rim.receiveShadow = true;
      group.add(rim);
      group.add(pool);
      draw += 2;
      var n = o.palms.length, trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6, 1), frondGeo = new THREE.ConeGeometry(1.5, 0.5, 6, 1);
      trunkGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.5, 0));   // pivot at the foot
      var trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshPhongMaterial({ color: TRUNK, flatShading: true, specular: 0x000000 }), n);
      var fronds = new THREE.InstancedMesh(frondGeo, new THREE.MeshPhongMaterial({ color: FROND, flatShading: true, specular: 0x000000 }), n);
      var m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      o.palms.forEach(function (p, i) {
        // Lean away from the pool centre a little: tilt about the axis perpendicular to the outward direction.
        e.set(Math.sin(p.rot) * p.lean, 0, -Math.cos(p.rot) * p.lean);
        q.setFromEuler(e);
        pos.set(p.x, p.y - 0.3, p.z);
        sc.set(1, p.h + 0.3, 1);
        m.compose(pos, q, sc);
        trunks.setMatrixAt(i, m);
        // The crown sits on the trunk's tip (rotated top of the unit trunk), with a spread of fronds.
        var tip = new THREE.Vector3(0, p.h, 0).applyQuaternion(q).add(pos.set(p.x, p.y - 0.3, p.z));
        sc.set(0.9 + p.tone * 0.4, 1, 0.9 + p.tone * 0.4);
        m.compose(tip, q.setFromAxisAngle(up, p.rot), sc);
        fronds.setMatrixAt(i, m);
      });
      trunks.instanceMatrix.needsUpdate = fronds.instanceMatrix.needsUpdate = true;
      trunks.name = 'oasis-palm-trunks';
      fronds.name = 'oasis-palm-fronds';
      trunks.castShadow = fronds.castShadow = true;
      trunks.frustumCulled = fronds.frustumCulled = false;
      group.add(trunks);
      group.add(fronds);
      draw += 2;
      palmCount = n;
    }
    opts.scene.add(group);
    return { group: group, stats: function () { return { archTriangles: archTris, palms: palmCount, drawCalls: draw }; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
