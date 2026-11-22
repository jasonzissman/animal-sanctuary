/* SA.render.createTaskRing(THREE, { scene, animals, colors? }) -> { update(dt, task), active(), group }
 * The 3D side of "small tasks appear only near their animal" (AS-0217, slice 3): the animal that SA.nearbyTask names glows inside a
 * see-through cylinder with soft rings rising up it (about every 1.5 s, thinning out near the top). Only game/render/* touches THREE.
 *
 *   ring.update(dt, task)   once per frame. task = { animalId, kind?, done? } | null (SA.prompt ctl.taskShown(), via stage.getTask)
 *     - a task that is not done: the cylinder shows around that animal's group and follows it (position only, never rotation);
 *       another animal's task moves it there
 *     - task null, the animal hidden or gone: it vanishes quietly (no sparkle, nothing is lost: it comes back with the task)
 *     - task.done: it vanishes with a small sparkle burst at the animal, once (the burst keeps playing after the ring is gone)
 *   Colour follows the task kind (colors, default clue gold / encounter sky blue).
 *
 * Cheap and safe: one shared material for the cylinder and every ring, all meshes made once and reused, nothing allocated per frame
 * (the cylinder size is measured when a task starts showing, not each frame). It lives in `scene`, not in the animals group, and is
 * never in animal.userData.pickVolumes, so it has no pick volume and cannot block picking; mesh.raycast is also a no-op. It adds no
 * lights, uses an unlit, low-opacity, depth-write-free material (it never washes out the scene) and adds no HUD.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var RINGS = 3, PERIOD = 1.5, OPACITY = 0.16, RING_THICK = 0.07;
  var SPARKS = 10, SPARK_LIFE = 0.7, SPARK_SIZE = 0.09;
  var DEFAULT_COLORS = { clue: 0xffd23f, encounter: 0x5cd6ff };
  var MIN_R = 0.35, MIN_H = 0.6;

  // Radius and height of an animal from its part meshes (group-local; pupils and pick volumes are ignored).
  function measure(group) {
    var r = 0, h = 0;
    (group.children || []).forEach(function (m) {
      if (!m || !m.position || !m.scale || (m.userData && m.userData.pick)) return;
      var wide = Math.max(m.scale.x, m.scale.z) / 2;
      r = Math.max(r, Math.hypot(m.position.x, m.position.z) + wide);
      h = Math.max(h, m.position.y + m.scale.y / 2);
    });
    return { r: Math.max(MIN_R, Math.min(r, 3)) , h: Math.max(MIN_H, Math.min(h, 5)) };
  }

  SA.render.createTaskRing = function (THREE, opts) {
    var colors = Object.assign({}, DEFAULT_COLORS, opts.colors || {});
    var mat = new THREE.MeshBasicMaterial({ color: colors.clue, transparent: true, opacity: OPACITY, side: THREE.DoubleSide,
      depthWrite: false, fog: false });
    var sparkMat = new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.9, depthWrite: false, fog: false });

    function inert(m) { m.raycast = function () {}; return m; }
    var group = new THREE.Group();
    group.name = 'taskRing';
    group.visible = false;
    var cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    var body = inert(new THREE.Mesh(cylGeo, mat));
    group.add(body);
    var bands = [];
    for (var i = 0; i < RINGS; i++) { var b = inert(new THREE.Mesh(cylGeo, mat)); bands.push(b); group.add(b); }
    group.renderOrder = 2;
    opts.scene.add(group);

    var sparks = new THREE.Group();
    sparks.name = 'taskRingSparkle';
    sparks.visible = false;
    var sparkGeo = new THREE.OctahedronGeometry(1, 0);
    var bits = [];
    for (var s = 0; s < SPARKS; s++) {
      var bit = inert(new THREE.Mesh(sparkGeo, sparkMat));
      bit.visible = false;
      bits.push(bit);
      sparks.add(bit);
    }
    opts.scene.add(sparks);

    var target = null;       // the animal group being followed
    var id = null, size = { r: 1, h: 1 };
    var t = 0, sparkT = -1, sparkR = 1, sparkH = 1;
    var doneId = null;       // the animal whose task finished: nothing shows for it until its task changes

    function layout(g) {
      group.position.set(g.position.x, g.position.y, g.position.z);
    }

    function show(g, task) {
      target = g; id = task.animalId; t = 0;
      size = measure(g);
      var c = colors[task.kind] !== undefined ? colors[task.kind] : colors.clue;
      mat.color.set(c);
      body.scale.set(size.r * 1.05, size.h, size.r * 1.05);
      body.position.y = size.h / 2;
      group.visible = true;
      layout(g);
    }

    function hide() { target = null; id = null; group.visible = false; }

    function sparkle() {
      sparkR = size.r; sparkH = size.h;
      sparks.position.set(group.position.x, group.position.y, group.position.z);
      sparkT = 0;
      sparks.visible = true;
      for (var i = 0; i < SPARKS; i++) bits[i].visible = true;
    }

    function animateRings() {
      for (var i = 0; i < RINGS; i++) {
        var ph = (t / PERIOD + i / RINGS) % 1;
        var fade = ph < 0.1 ? ph / 0.1 : ph > 0.65 ? Math.max(0, (1 - ph) / 0.35) : 1;   // thin in at the bottom, out near the top
        var b = bands[i];
        b.visible = fade > 0.02;
        b.scale.set(size.r * 1.08, RING_THICK * fade * Math.max(1, size.h / 2), size.r * 1.08);
        b.position.y = ph * size.h;
      }
    }

    function animateSparks(dt) {
      sparkT += dt;
      var k = sparkT / SPARK_LIFE;
      if (k >= 1) {
        sparkT = -1; sparks.visible = false;
        for (var i = 0; i < SPARKS; i++) bits[i].visible = false;
        return;
      }
      for (var j = 0; j < SPARKS; j++) {
        var a = (j / SPARKS) * Math.PI * 2, out = sparkR * (1 + k * 0.8);
        var bit = bits[j];
        bit.position.set(Math.cos(a) * out, sparkH * (0.2 + 0.7 * ((j % 3) / 2)) + k * 0.6, Math.sin(a) * out);
        var sc = SPARK_SIZE * (1 - k) * (1 + (j % 2) * 0.5);
        bit.scale.set(sc, sc, sc);
        bit.rotation.y = a + sparkT * 6;
      }
    }

    function update(dt, task) {
      dt = dt > 0 ? dt : 0;
      if (sparkT >= 0) animateSparks(dt);
      if (!task || typeof task.animalId !== 'string') { doneId = null; if (id) hide(); return; }
      if (task.done) {
        if (id === task.animalId && doneId !== id) { doneId = id; layout(target); sparkle(); }
        if (id === task.animalId || doneId === task.animalId) hide();
        return;
      }
      doneId = null;
      if (id !== task.animalId) {
        var g = opts.animals && opts.animals.getObjectByName ? opts.animals.getObjectByName(task.animalId) : null;
        if (!g || g.visible === false) { if (id) hide(); return; }
        show(g, task);
      } else if (target.visible === false) { hide(); return; }
      layout(target);
      t += dt;
      animateRings();
    }

    return { update: update, active: function () { return id; }, group: group, sparkle: sparks, material: mat };
  };
})(typeof window !== 'undefined' ? window : globalThis);
