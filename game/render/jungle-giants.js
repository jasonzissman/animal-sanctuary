/* SA.render.createJungleGiants(THREE, { scene }): draws the selva's giant trees (SA.junglePlan, AS-0388, slice 1/4 of AS-0137), built once.
 * Each giant is a tall wide trunk with a root flare, a broad canopy of three stacked tiers (the top tier is the flat top you stand on, at
 * SA.junglePlan topY) and hanging vines. Everything is shared geometry in a few InstancedMeshes (trunks, root flares, one per canopy tier, and ONE
 * for every vine segment, each vine a chain of slightly bent cylinders), so the whole stand costs ~6 draw calls. Static: no update(), nothing
 * allocated per frame. Flat-shaded Phong like game/render/trees.js; no textures.
 *   view.group  THREE.Group (already added to the scene)   view.stats() { giants, drawCalls, vineSegments }
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SEG = 9;                 // radial segments of the trunk and tiers: low-poly
  var VINE_SEGS = 4, VINE_R = 0.1;
  // The canopy tiers, top to bottom: radius as a fraction of the canopy radius (the top tier is the walkable topR), thickness, and how far its top face sits below topY.
  var TIERS = [{ rf: 0, h: 0.9, drop: 0, color: '#2f9e4a' }, { rf: 0.78, h: 1.2, drop: 1, color: '#2a8a44' }, { rf: 1, h: 1.3, drop: 2.2, color: '#237a3c' }];

  SA.render.createJungleGiants = function (THREE, opts) {
    var giants = SA.junglePlan.get().giants, group = new THREE.Group(), meshes = [], o = new THREE.Object3D(), c = new THREE.Color();
    var up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    group.name = 'jungle-giants';

    function flat() { return new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, specular: 0x000000 }); }
    function make(geo, n, name, shadow) {
      var m = new THREE.InstancedMesh(geo, flat(), n);
      m.name = name;
      m.castShadow = !!shadow;
      m.frustumCulled = false;   // the instances are spread over the whole selva: the unit geometry's bounding sphere would cull them wrongly
      group.add(m);
      meshes.push(m);
      return m;
    }
    function done(m) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    var n = giants.length;
    var trunk = make(new THREE.CylinderGeometry(0.72, 1, 1, SEG), n, 'jungle-giant-trunks', true);
    var flare = make(new THREE.CylinderGeometry(0.8, 1, 1, SEG), n, 'jungle-giant-roots', true);   // a wider, short base: the buttress roots
    var tiers = TIERS.map(function (t, i) { return make(new THREE.CylinderGeometry(0.82, 1, 1, SEG + 1), n, 'jungle-giant-canopy-' + i, true); });
    var segCount = 0;
    giants.forEach(function (g) { segCount += g.vines.length * VINE_SEGS; });
    var vines = make(new THREE.CylinderGeometry(1, 1, 1, 5), segCount, 'jungle-giant-vines', false);

    var vi = 0;
    giants.forEach(function (g, i) {
      // Trunk: sunk a little into the ground, up to just under the top tier. Roots: a short wide flare at its foot.
      o.rotation.set(0, g.yaw, 0);
      o.position.set(g.x, g.y - 1 + (g.height - 1) / 2, g.z);
      o.scale.set(g.trunkR, g.height - 0.5 + 1, g.trunkR);
      o.updateMatrix(); trunk.setMatrixAt(i, o.matrix); trunk.setColorAt(i, c.set('#7a5a3a'));
      o.position.set(g.x, g.y + 1.2, g.z);
      o.scale.set(g.trunkR * 1.55, 3.4, g.trunkR * 1.55);
      o.updateMatrix(); flare.setMatrixAt(i, o.matrix); flare.setColorAt(i, c.set('#6a4c30'));
      TIERS.forEach(function (t, k) {
        var r = t.rf ? g.canopyR * t.rf : g.topR;
        o.position.set(g.x, g.topY - t.drop - t.h / 2, g.z);
        o.scale.set(r, t.h, r);
        o.updateMatrix(); tiers[k].setMatrixAt(i, o.matrix);
        tiers[k].setColorAt(i, c.set(t.color).offsetHSL((g.tint - 0.5) * 0.04, 0, (g.tint - 0.5) * 0.06));
      });
      // Vines: each a short chain of cylinders that bends sideways as it hangs, from the canopy rim down towards the ground.
      g.vines.forEach(function (v) {
        var sx = g.x + Math.cos(v.a) * v.r, sz = g.z + Math.sin(v.a) * v.r, px = sx, py = v.y, pz = sz, seg = v.len / VINE_SEGS;
        for (var s = 0; s < VINE_SEGS; s++) {
          var k = (s + 1) / VINE_SEGS, nx = sx + Math.cos(v.a + Math.PI / 2) * v.sway * Math.sin(k * Math.PI) * 0.7, nz = sz + Math.sin(v.a + Math.PI / 2) * v.sway * Math.sin(k * Math.PI) * 0.7;
          var ny = py - seg, dx = nx - px, dz = nz - pz, len = Math.sqrt(dx * dx + seg * seg + dz * dz);
          dir.set(dx / len, -seg / len, dz / len);
          o.quaternion.setFromUnitVectors(up, dir);
          o.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
          o.scale.set(VINE_R * (1 - 0.25 * k), len, VINE_R * (1 - 0.25 * k));
          o.updateMatrix(); vines.setMatrixAt(vi, o.matrix); vines.setColorAt(vi, c.set(s % 2 ? '#2e7d3a' : '#3d9447'));
          vi++; px = nx; py = ny; pz = nz;
        }
      });
    });
    meshes.forEach(done);
    if (opts && opts.scene) opts.scene.add(group);
    return { group: group, stats: function () { return { giants: n, drawCalls: meshes.length, vineSegments: segCount }; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
