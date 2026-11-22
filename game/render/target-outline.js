/* SA.render.createTargetOutline(THREE, { getTarget, nodeFor }) -> { update(dt), active() }
 * The single "this is what Space will use" highlight (AS-0101). Each frame update(dt) reads getTarget() (SA.spaceUse.target():
 * { kind: 'part'|'tree'|'pickup', ref } or null) and outlines exactly that one object with a warm yellow, gently pulsing rim.
 * The rim is a back-face inflated copy ("shell") of every mesh in the object, parented to the mesh so it follows animation. All
 * shells share ONE material (the only outline material; there is no second tree/pickup cue). Shells are built or attached only
 * when the target changes (cached per mesh, then re-attached), never per frame; the pulse mutates the shared material and the
 * live shells' scale in place, so a frame allocates nothing. Shells never take raycasts, so picking and tree taps ignore them.
 * The target already has hysteresis (SA.spaceTarget), so the outline only moves when the target really changes: no flicker.
 *   nodeFor(kind, ref) -> THREE.Object3D to outline: the part mesh, the decor tree group, or the pickup model (null = none)
 * No text, no DOM. Call update(dt) every frame.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var COLOR = [1, 0.8, 0.1];       // warm yellow (rgb 0..1)
  var COLOR_BRIGHT = [1, 0.93, 0.45];
  var PULSE_HZ = 1.4;
  var THICK = 0.085;               // rim width in local units (turned into a scale per mesh)
  var MIN_GROW = 0.1, MAX_GROW = 0.5;

  function noRaycast() {}

  SA.render.targetOutline = {
    COLOR: COLOR, PULSE_HZ: PULSE_HZ,
    /** Pulse level 0..1 at time t (seconds). */
    pulse: function (t) { return 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * PULSE_HZ); },
    /** Scale that inflates a shell of a geometry with bounding radius r by about THICK world-ish units. */
    grow: function (r) { return 1 + Math.min(MAX_GROW, Math.max(MIN_GROW, r > 0 ? THICK / r : MAX_GROW)); },
  };

  SA.render.createTargetOutline = function (THREE, opts) {
    var mat = new THREE.MeshBasicMaterial({ color: 0xffcc1a, side: THREE.BackSide, fog: false });
    var cache = typeof Map === 'function' ? new Map() : null;   // source mesh -> its shell (built once)
    var shells = [];            // live shells: [{ shell, base }]
    var curKind = null, curRef = null, node = null, t = 0;

    function shellFor(mesh) {
      var s = cache.get(mesh);
      if (s) return s;
      var g = mesh.geometry, r = 0.5, c = null;
      if (g && g.boundingSphere === null && g.computeBoundingSphere) g.computeBoundingSphere();
      if (g && g.boundingSphere) { r = g.boundingSphere.radius; c = g.boundingSphere.center; }
      var k = SA.render.targetOutline.grow(r);
      s = new THREE.Mesh(g, mat);
      s.scale.set(k, k, k);
      if (c) s.position.set(c.x * (1 - k), c.y * (1 - k), c.z * (1 - k));   // inflate about the geometry's centre
      s.raycast = noRaycast;
      s.renderOrder = -1;
      s.userData = { outline: true, base: k };
      cache.set(mesh, s);
      return s;
    }

    function detach() {
      for (var i = 0; i < shells.length; i++) if (shells[i].parent) shells[i].parent.remove(shells[i]);
      shells.length = 0;
    }

    function attach(obj) {
      var queue = [obj];
      while (queue.length) {
        var o = queue.pop(), kids = o.children || [];
        if (o.isMesh !== false && o.geometry && o.userData && !o.userData.outline && o.visible !== false) {
          var sh = shellFor(o);
          o.add(sh);
          shells.push(sh);
        }
        for (var i = 0; i < kids.length; i++) if (!(kids[i].userData && kids[i].userData.outline)) queue.push(kids[i]);
      }
    }

    function keyRef(target) { return target.kind === 'part' && target.ref ? target.ref.mesh || target.ref : target.ref; }

    function retarget(target) {
      var kind = target ? target.kind : null, ref = target ? keyRef(target) : null;
      if (kind === curKind && ref === curRef) return;
      detach();
      curKind = kind; curRef = ref; node = null;
      if (!target || !cache) return;
      node = opts.nodeFor ? opts.nodeFor(kind, target.ref) : null;
      if (node) attach(node);
    }

    function update(dt) {
      retarget(opts.getTarget ? opts.getTarget() : null);
      if (!shells.length) return;
      t += dt || 0;
      var p = SA.render.targetOutline.pulse(t);
      mat.color.setRGB(COLOR[0] + (COLOR_BRIGHT[0] - COLOR[0]) * p, COLOR[1] + (COLOR_BRIGHT[1] - COLOR[1]) * p, COLOR[2] + (COLOR_BRIGHT[2] - COLOR[2]) * p);
      var k = 1 + 0.12 * p;   // the rim breathes a little
      for (var i = 0; i < shells.length; i++) {
        var s = shells[i], b = s.userData.base, c = s.geometry && s.geometry.boundingSphere;
        var sc = 1 + (b - 1) * k;
        s.scale.set(sc, sc, sc);
        if (c) s.position.set(c.center.x * (1 - sc), c.center.y * (1 - sc), c.center.z * (1 - sc));
      }
    }

    return { update: update, active: function () { return shells.length > 0; }, material: mat };
  };
})(typeof window !== 'undefined' ? window : globalThis);
