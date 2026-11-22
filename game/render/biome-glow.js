/* SA.render.createBiomeGlow(THREE, { scene }) -> { show(biomeId), hide(), update(dt), visible() }
 * The second-stage Scout & Spot hint: a soft translucent glow that pulses on the ground of one biome strip.
 * It follows SA.map.groundHeight so it hugs hills and never hides under them. Only game/render/* touches THREE.
 * The glow is purely visual: it never blocks picking (it is not part of the raycast set) and never fails a round.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var STEP = 2, LIFT = 0.25, PULSE_HZ = 0.6;

  SA.render.createBiomeGlow = function (THREE, o) {
    var M = SA.map, B = M.BOUNDS;
    var mesh = null, mat = null, t = 0;

    function build(range, color) {
      var w = range.hi - range.lo, d = B.maxZ - B.minZ;
      var geo = new THREE.PlaneGeometry(w, d, Math.round(w / STEP), Math.round(d / STEP));
      geo.rotateX(-Math.PI / 2);
      var pos = geo.attributes.position;
      for (var i = 0; i < pos.count; i++) {
        var x = pos.getX(i) + range.centerX, z = pos.getZ(i);
        pos.setXYZ(i, x, Math.max(M.groundHeight(x, z), -0.3) + LIFT, z);
      }
      mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.3, depthWrite: false });
      var m = new THREE.Mesh(geo, mat);
      m.renderOrder = 2;
      return m;
    }

    function hide() {
      if (!mesh) return;
      if (o.scene && o.scene.remove) o.scene.remove(mesh);
      if (mesh.geometry && mesh.geometry.dispose) mesh.geometry.dispose();
      if (mat && mat.dispose) mat.dispose();
      mesh = null; mat = null;
    }

    function show(biomeId) {
      hide();
      var range = M.biomeRange(biomeId);
      if (!range) return false;
      var biome = SA.data && SA.data.get('biomes', biomeId);
      mesh = build(range, (biome && biome.accent) || '#ffe9a0');
      t = 0;
      o.scene.add(mesh);
      return true;
    }

    function update(dt) {
      if (!mat) return;
      t += dt;
      mat.opacity = 0.22 + 0.16 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * PULSE_HZ));   // gentle breathing glow
    }

    return { show: show, hide: hide, update: update, visible: function () { return !!mesh; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
