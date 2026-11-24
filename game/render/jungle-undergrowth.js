/* SA.render.createJungleUndergrowth(THREE, { scene }): draws the selva's dense big-leaf undergrowth (SA.junglePlan.undergrowth, AS-0390, slice 3/4 of AS-0137).
 * Two InstancedMeshes, one per shape (fern, elephant-ear 'bigleaf'), each with shared geometry from SA.render.plantShapes, written once at build time.
 * Plants are soft scenery: nothing here is ever an obstacle, the player walks straight through them. They sway with one shared time uniform in the
 * vertex shader (the same trick as game/render/ground-cover.js), so update(dt) only advances a number and allocates nothing.
 *   view.group  THREE.Group (already added to the scene)   view.update(dt)   advance the wind   view.stats() { plants, drawCalls }   view.meshes
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SWAY = 0.12;   // bend (m) at the top of a unit-height shape: a little bigger than the grass, the leaves are broad
  var TINTS = { fern: ['#2e8a3e', '#3fa04a', '#68bd55'], bigleaf: ['#237a3c', '#2f9a48', '#58b85a'] };   // dark, mid, light by `tone`

  function windMaterial(THREE, uTime) {
    var m = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, specular: 0x000000 });
    m.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
          'float swayPhase = uTime * 1.3 + instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.5;\n' +
          'float swayBend = position.y * position.y * ' + SWAY.toFixed(3) + ';\n' +
          'transformed.x += sin(swayPhase) * swayBend;\n' +
          'transformed.z += cos(swayPhase * 0.8) * swayBend * 0.6;');
    };
    m.customProgramCacheKey = function () { return 'jungle-undergrowth-sway'; };
    return m;
  }

  SA.render.createJungleUndergrowth = function (THREE, opts) {
    var plants = SA.junglePlan.undergrowthGet().plants, S = SA.render.plantShapes, group = new THREE.Group(), meshes = [], uTime = { value: 0 };
    var mat = windMaterial(THREE, uTime), o = new THREE.Object3D(), c = new THREE.Color(), total = 0;
    group.name = 'jungle-undergrowth';
    ['fern', 'bigleaf'].forEach(function (kind) {
      var list = plants.filter(function (p) { return p.kind === kind; });
      if (!list.length || !S.SHAPES[kind]) return;
      var mesh = new THREE.InstancedMesh(S.SHAPES[kind](THREE), mat, list.length), cols = TINTS[kind].map(function (h) { return new THREE.Color(h); });
      mesh.name = 'jungle-undergrowth-' + kind;
      mesh.frustumCulled = false;   // spread over the whole selva: the unit geometry's own bounding sphere would cull it wrongly
      list.forEach(function (p, i) {
        o.position.set(p.x, p.y - 0.05, p.z);
        o.rotation.set(0, p.rot, 0);
        o.scale.set(p.scale, p.scale * (0.9 + p.lean * 0.3), p.scale);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        var lo = p.tone < 0.5 ? 0 : 1;   // dark -> mid -> light across `tone`
        mesh.setColorAt(i, c.lerpColors(cols[lo], cols[lo + 1], (p.tone - lo * 0.5) * 2));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
      meshes.push(mesh);
      total += list.length;
    });
    if (opts && opts.scene) opts.scene.add(group);
    return {
      group: group, meshes: meshes,
      update: function (dt) { uTime.value += dt || 0; },
      stats: function () { return { plants: total, drawCalls: meshes.length }; },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
