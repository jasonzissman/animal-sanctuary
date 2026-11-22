/* SA.render.createAutoClimbRing(THREE, { scene, getAutoClimb }) -> { mesh, update(dt) }
 * The "keep pushing and you will climb" cue (AS-0157): a flat warm-yellow ring round the trunk that fills clockwise as the push
 * timer (SA.climb.autoStep) runs, and vanishes when the push stops. No text. getAutoClimb() -> { tree: {x,z,y?}, progress 0..1 } | null.
 * The arc geometry is rebuilt only when the progress moved by a visible step (never per frame); the mesh and material are made once.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var INNER = 1.5, OUTER = 1.85, SEGMENTS = 32, STEP = 0.03, LIFT = 0.12;

  SA.render.createAutoClimbRing = function (THREE, opts) {
    var mat = new THREE.MeshBasicMaterial({ color: 0xffcc1a, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false, fog: false });
    var mesh = new THREE.Mesh(new THREE.RingGeometry(INNER, OUTER, SEGMENTS, 1, 0, 0.01), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 999;
    mesh.visible = false;
    mesh.raycast = function () {};
    opts.scene.add(mesh);
    var shown = -1;

    function setProgress(p) {
      if (Math.abs(p - shown) < STEP && p < 1) return;
      shown = p;
      mesh.geometry.dispose();
      mesh.geometry = new THREE.RingGeometry(INNER, OUTER, SEGMENTS, 1, Math.PI / 2, -Math.PI * 2 * Math.max(0.01, p));   // from the top, clockwise
    }

    return {
      mesh: mesh,
      update: function () {
        var a = opts.getAutoClimb ? opts.getAutoClimb() : null;
        if (!a || !a.tree || !(a.progress > 0)) { mesh.visible = false; shown = -1; return; }
        setProgress(a.progress);
        var y = typeof a.tree.y === 'number' ? a.tree.y : SA.map.groundHeight(a.tree.x, a.tree.z);
        mesh.position.set(a.tree.x, y + LIFT, a.tree.z);
        var k = a.tree.radius > 1 ? (a.tree.radius + 0.5) / INNER : 1;   // a wider base (a peak) gets a wider ring
        if (mesh.scale) mesh.scale.set(k, k, 1);
        mesh.visible = true;
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
