/* SA.render.createWaterBanks(THREE, { scene, world }): the edges of the streams and the pond (AS-0298).
 *   - Foam: a pale ribbon along the river's two shores and a ring round the pond, riding the same shader wave as the water surface
 *     (SA.render.applyWaterWave, game/render/world.js) so it never floats off it.
 *   - Pebbles and reeds: ONE InstancedMesh each, placed once by the pure, seeded SA.waterBanks.plan() (game/water-banks-plan.js).
 * Everything is static geometry built once; the only per-frame work is the world's wave clock (world.userData.update), so nothing allocates.
 * Pebbles and reeds are soft: they are in no obstacle list, so walking through the shallows (AS-0109) is unchanged.
 *
 *   wb.group     THREE.Group (already added to the scene)        wb.meshes   [foam, pebbles, reeds]; foam mesh name 'water-foam'
 *   wb.stats()   { pebbles, reeds, foamTriangles }
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var FOAM_IN = 0.55;     // foam reaches this far out over the water from the shore line
  var FOAM_OUT = 0.12;    // and this far up the bank
  var FOAM_LIFT = 0.03;   // above the still water level, so it does not z-fight with the surface

  /** One merged ribbon geometry from edge samples: each strip is [{ x0, z0, x1, z1 }] (inner then outer point); `gaps` break the strip. */
  function ribbon(THREE, strips) {
    var pos = [], idx = [], y = SA.map.WATER_LEVEL + FOAM_LIFT;
    strips.forEach(function (strip) {
      var base = pos.length / 3;
      strip.pts.forEach(function (p, i) {
        pos.push(p.x0, y, p.z0, p.x1, y, p.z1);
        if (i > 0 && !p.gap) { var a = base + (i - 1) * 2, b = base + i * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
      });
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    return geo;
  }

  function foamStrips() {
    var W = SA.waterBanks, left = { pts: [] }, right = { pts: [] }, ring = { pts: [] }, prevWet = false, P = SA.map.POND;
    W.riverShore().forEach(function (r) {
      var gap = !(r.wet && prevWet);
      prevWet = r.wet;
      if (!r.wet) { left.pts.push({ x0: r.xl, z0: r.z, x1: r.xl, z1: r.z, gap: true }); right.pts.push({ x0: r.xr, z0: r.z, x1: r.xr, z1: r.z, gap: true }); return; }
      left.pts.push({ x0: r.xl + FOAM_IN, z0: r.z, x1: r.xl - FOAM_OUT, z1: r.z, gap: gap });
      right.pts.push({ x0: r.xr - FOAM_IN, z0: r.z, x1: r.xr + FOAM_OUT, z1: r.z, gap: gap });
    });
    var shore = W.pondShore();
    for (var i = 0; i <= shore.length; i++) {
      var s = shore[i % shore.length], c = Math.cos(s.angle), sn = Math.sin(s.angle);
      ring.pts.push({ x0: P.x + c * Math.max(0.1, s.r - FOAM_IN), z0: P.z + sn * Math.max(0.1, s.r - FOAM_IN), x1: P.x + c * (s.r + FOAM_OUT), z1: P.z + sn * (s.r + FOAM_OUT), gap: i === 0 });
    }
    return [left, right, ring];
  }

  function pebbleGeometry(THREE) {
    var g = new THREE.IcosahedronGeometry(1, 0);
    g.scale(1, 0.55, 0.8);
    g.translate(0, 0.25, 0);
    return g;
  }

  function reedGeometry(THREE) {
    var S = SA.render.plantShapes, parts = [];
    [[0.95, 0.0, 0.0], [0.7, 1.9, 0.12], [0.85, 3.6, 0.2], [0.55, 5.1, 0.28]].forEach(function (b) {
      var blade = new THREE.ConeGeometry(0.035, b[0], 3);
      blade.translate(0, b[0] / 2, 0);
      parts.push({ geo: S.placed(THREE, blade, b[1], b[2], 0.06, 0), shade0: 0.6, shade1: 1 });
    });
    return S.merge(THREE, parts);
  }

  function instanced(THREE, name, geo, entries, lo, hi, flat) {
    var mesh = new THREE.InstancedMesh(geo, new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: !!geo.attributes.color, flatShading: true, specular: 0x000000 }), Math.max(1, entries.length));
    var o = new THREE.Object3D(), a = new THREE.Color(lo), b = new THREE.Color(hi), c = new THREE.Color();
    entries.forEach(function (e, i) {
      o.position.set(e.x, e.y - (flat ? 0.04 : 0.03), e.z);
      o.rotation.set(0, e.rot, 0);
      if (flat) o.scale.set(e.scale, e.scale * (0.8 + e.tone * 0.5), e.scale); else o.scale.set(e.scale, e.scale, e.scale);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.copy(a).lerp(b, e.tone));
    });
    mesh.count = entries.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = name;
    mesh.userData.waterBank = true;
    return mesh;
  }

  SA.render.createWaterBanks = function (THREE, opts) {
    var group = new THREE.Group(), uTime = opts.world && opts.world.userData.uTime ? opts.world.userData.uTime : { value: 0 };
    group.name = 'water-banks';
    var foamMat = new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    if (SA.render.applyWaterWave) SA.render.applyWaterWave(foamMat, uTime, 'foam');
    var foam = new THREE.Mesh(ribbon(THREE, foamStrips()), foamMat);
    foam.name = 'water-foam';
    foam.renderOrder = 1;
    foam.frustumCulled = false;
    var plan = SA.waterBanks.plan();
    var pebbles = instanced(THREE, 'water-pebbles', pebbleGeometry(THREE), plan.pebbles, '#8d8982', '#cfc4a8', true);
    var reeds = instanced(THREE, 'water-reeds', reedGeometry(THREE), plan.reeds, '#5f8f3f', '#b3b256', false);
    pebbles.frustumCulled = reeds.frustumCulled = false;
    group.add(foam, pebbles, reeds);
    opts.scene.add(group);
    return {
      group: group, meshes: [foam, pebbles, reeds],
      stats: function () { return { pebbles: plan.pebbles.length, reeds: plan.reeds.length, foamTriangles: foam.geometry.index.count / 3 }; },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
