/* SA.render.createJungleClearings(THREE, { scene }): a soft shaft of sunlight over each sunny clearing (SA.junglePlan.get().clearings, AS-0391).
 * One open cone per clearing, ONE shared additive material (the ground tint itself lives in game/terrain-color.js). The shaft fades out at night:
 * update(dt) only writes one number (the material's opacity) from the shared day/night clock and allocates nothing.
 *   view.group (already added to the scene)   view.update(dt)   view.stats() { shafts, drawCalls }   view.meshes
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var OPACITY = 0.12, HEIGHT = 16;

  SA.render.createJungleClearings = function (THREE, opts) {
    var list = SA.junglePlan.get().clearings, group = new THREE.Group(), meshes = [];
    var mat = new THREE.MeshBasicMaterial({ color: 0xfff0a8, transparent: true, opacity: OPACITY, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    group.name = 'jungle-clearings';
    list.forEach(function (cl) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(cl.shaftR * 0.55, cl.shaftR, HEIGHT, 14, 1, true), mat);   // narrow at the sky, wide on the grass
      m.name = 'jungle-shaft-' + cl.id;
      m.position.set(cl.x, cl.y + HEIGHT / 2 - 0.2, cl.z);
      m.frustumCulled = false;
      m.raycast = function () {};   // never picked
      group.add(m);
      meshes.push(m);
    });
    if (opts && opts.scene) opts.scene.add(group);
    return {
      group: group, meshes: meshes,
      update: function () {
        var clock = SA.daynight && SA.daynight.instance && SA.daynight.instance();
        mat.opacity = OPACITY * (clock && clock.dark ? 1 - clock.dark() : 1);
      },
      stats: function () { return { shafts: meshes.length, drawCalls: meshes.length }; },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
