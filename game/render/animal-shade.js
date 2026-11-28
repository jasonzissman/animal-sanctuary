/* SA.render.animalShade: the two coat details of AS-0407, kept out of animals.js (the only code here that touches THREE).
 *
 *   gradientGeometry(THREE, geo)  a CLONE of a unit geometry with a `color` vertex attribute: 1 (the part's own colour) at the
 *                                 lowest point, fading to BACK_SHADE (darker) at the top, so the back reads darker than the
 *                                 belly. Used with a vertexColors material whose `color` is the part colour (vertex colours
 *                                 multiply it), so one cached clone per unit geometry serves every colour.
 *   markingsMesh(THREE, plan, ctx)  ONE InstancedMesh holding every spot or band an animal has, built once from
 *                                 SA.animalMarkings.plan(...). Geometry and material come from the shared `ctx` ({ geos, mats })
 *                                 caches. It is decor (userData.decor, no `part`, no pick volume), so it is never a tap target.
 * Nothing here runs per frame: matrices are written once at build time.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var BACK_SHADE = 0.72;   // colour multiplier at the top of the part (1 at the bottom)

  /** Colour multiplier for a vertex at height fraction t (0 = lowest, 1 = highest): smooth from 1 down to BACK_SHADE. Pure. */
  function shade(t) {
    var k = Math.max(0, Math.min(1, t));
    return 1 + (BACK_SHADE - 1) * k * k * (3 - 2 * k);
  }

  function gradientGeometry(THREE, geo) {
    var g = geo.clone(), pos = g.attributes.position, lo = Infinity, hi = -Infinity, i, y, col = [];
    for (i = 0; i < pos.count; i++) { y = pos.getY(i); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    for (i = 0; i < pos.count; i++) {
      y = shade(hi > lo ? (pos.getY(i) - lo) / (hi - lo) : 0);
      col.push(y, y, y);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }

  var UNIT = {
    disc: function (THREE) { return new THREE.CylinderGeometry(0.5, 0.5, 1, 10); },
    ring: function (THREE) { return new THREE.CylinderGeometry(0.5, 0.5, 1, 14); },
    slab: function (THREE) { return new THREE.BoxGeometry(1, 1, 1); }
  };

  /** One InstancedMesh for the plan, or null when there is nothing to draw. `tag` is merged into userData (animalId, instanceId). */
  function markingsMesh(THREE, plan, ctx, tag) {
    if (!plan || !plan.items.length) return null;
    var gkey = 'mark:' + plan.shape, mkey = 'mark:' + plan.color;
    var geo = ctx.geos[gkey] || (ctx.geos[gkey] = UNIT[plan.shape](THREE));
    var mat = ctx.mats[mkey] || (ctx.mats[mkey] = new THREE.MeshPhongMaterial({ color: plan.color, flatShading: false, specular: 0x000000 }));
    var mesh = new THREE.InstancedMesh(geo, mat, plan.items.length), dummy = new THREE.Object3D();
    plan.items.forEach(function (it, i) {
      dummy.position.set(it.position[0], it.position[1], it.position[2]);
      dummy.rotation.set(it.rotation[0], it.rotation[1], it.rotation[2]);
      dummy.scale.set(it.size[0], it.size[1], it.size[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;   // the instances lie outside the unit geometry's bounding sphere
    mesh.userData = { animalId: tag.animalId, instanceId: tag.instanceId, decor: true, markings: plan.type };
    return mesh;
  }

  SA.render.animalShade = { BACK_SHADE: BACK_SHADE, shade: shade, gradientGeometry: gradientGeometry, markingsMesh: markingsMesh };
})(typeof window !== 'undefined' ? window : globalThis);
