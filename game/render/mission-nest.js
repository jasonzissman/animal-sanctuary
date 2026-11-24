/* SA.render.createMissionNest(THREE, { scene, thing?, canvas?, camera?, getPlayer? }): draws Mission 6's feather and the eagle's nest (AS-0336). It follows SA.missionNest
 * (pure: where the feather lies, where the nest, the chick and mamá sit). The feather is a big, glowing-white quill (a flattened cone vane on a thin shaft)
 * that bobs and turns beside the mountain trail until it is picked up. The nest is a ring of brown twigs (boxes round a cylinder bowl)
 * on top of the nest peak, with the chick and mamá sitting in it: both are built through the normal animal path (SA.render.animalBuilder)
 * from the animal ids in the data, the chick small. Nothing here knows a mission id or an animal id.
 * AS-0337: an invisible, enlarged pick volume on the chick (userData { animalId, part: 'cuerpo', pick: true }) takes a tap or click and calls
 * thing.give(player) (its own volume only, never the whole scene). When the feather is given, the chick flaps its alas and flies a small loop beside
 * mamá along SA.flight.sample (pure path / timing math), then lands in the nest again; mamá turns to watch. A tap at the wrong moment wobbles it.
 * AS-0338: on the 'photo' step a tap on the chick or mamá calls thing.snap(player) (the summit photo; la cámara is put in hand on a first tap).
 *   update(dt)   once per frame; returns the group it manages
 *   tapAt(x, y)  client coordinates -> true when the chick's volume was hit and handled
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var VANE = 0xf4f1ea, SHAFT = 0xc9b48a, TWIG = 0x7a5530, TWIG2 = 0x5f4125, LIFT = 0.9;
  var CHICK_SCALE = 0.3, MAMA_SCALE = 0.42, PICK_RADIUS = 3.2;      // PICK_RADIUS in the chick's own (small) units: ~1 world unit, generous for small fingers

  function flat(THREE, c) { return new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 0 }); }

  function featherModel(THREE) {
    var g = new THREE.Group();
    var vane = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), new THREE.MeshBasicMaterial({ color: VANE }));
    vane.scale.set(1, 1, 0.22);
    vane.position.y = 0.45;
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.0, 5), flat(THREE, SHAFT));
    shaft.position.y = 0.45;
    var glow = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.22, depthWrite: false }));
    glow.position.y = 0.45;
    g.add(vane, shaft, glow);
    g.rotation.z = 0.5;
    g.scale.set(1.6, 1.6, 1.6);   // big and readable for small hands
    return g;
  }

  function nestModel(THREE) {
    var g = new THREE.Group();
    var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.45, 0.22, 10), flat(THREE, TWIG2));
    bowl.position.y = 0.11;
    g.add(bowl);
    for (var i = 0; i < 14; i++) {      // twigs laid around the rim
      var a = (i / 14) * Math.PI * 2, tw = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.07), flat(THREE, i % 2 ? TWIG : TWIG2));
      tw.position.set(Math.cos(a) * 0.62, 0.2 + (i % 3) * 0.04, Math.sin(a) * 0.62);
      tw.rotation.y = -a + Math.PI / 2 + (i % 2 ? 0.3 : -0.3);
      g.add(tw);
    }
    return g;
  }

  SA.render.createMissionNest = function (THREE, opts) {
    var thing = opts.thing || SA.missionNest;
    if (opts.solids && thing.setSolids) thing.setSolids(opts.solids);
    var build = SA.render.animalBuilder(THREE);
    var group = new THREE.Group();
    group.name = 'missionNest';
    opts.scene.add(group);
    var key = null, feather = null, chick = null, mama = null, pick = null, wings = [], home = null, t = 0, flyT = 0;

    function rebuild(cur) {
      while (group.children.length) group.remove(group.children[0]);
      feather = chick = mama = pick = home = null;
      wings = [];
      if (!cur) return;
      feather = featherModel(THREE);
      var sp = thing.spots ? thing.spots() : null;
      if (!sp) return;
      var bowl = nestModel(THREE);
      bowl.position.set(sp.bowl.x, sp.bowl.y, sp.bowl.z);
      group.add(feather, bowl);
      home = sp;
      [['mama', cur.spec.mama, MAMA_SCALE], ['chick', cur.spec.chick, CHICK_SCALE]].forEach(function (c) {
        var spec = SA.data.get('animals', c[1]);
        if (!spec) return;
        var at = sp[c[0]], m = build(spec, { id: spec.id, x: at.x, z: at.z, y: at.y, rotY: sp.face });
        m.scale.set(c[2], c[2], c[2]);
        group.add(m);
        if (c[0] === 'mama') { mama = m; return; }
        chick = m;
        m.rotation.order = 'YXZ';
        m.children.forEach(function (w) { if (w.userData && w.userData.part === 'alas' && !w.userData.pick) wings.push({ m: w, rz: w.rotation.z }); });
        // The enlarged, invisible pick volume over the chick's body (kids have big fingers).
        pick = new THREE.Mesh(new THREE.SphereGeometry(PICK_RADIUS, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
        pick.position.set(0, 1.2, 0);
        pick.visible = false;
        pick.userData = { animalId: spec.id, part: 'cuerpo', pick: true, pickVolume: 'sphere' };
        m.add(pick);
      });
    }

    // The chick: at rest in the nest (a quick wobble when tapped at the wrong moment), or on its first flight along SA.flight.sample.
    function moveChick(v, dt) {
      if (!chick || !home) return;
      var h = home.chick, flying = v && v.flight != null && SA.flight;
      if (flying) {
        flyT += dt || 0;
        var s = SA.flight.sample({ home: h, mama: home.mama }, v.flight);
        chick.position.set(s.x, s.y, s.z);
        chick.rotation.y = s.heading;
        chick.rotation.x = s.phase === 'fly' ? -0.25 : 0;      // nose a little down while it glides round the loop
        chick.rotation.z = 0;
        wings.forEach(function (e) { e.m.rotation.z = e.rz + (SA.gait ? SA.gait.flap(flyT, s.flap, e.m.userData.side, 0) : 0); });
        if (mama) mama.rotation.y = Math.atan2(s.x - home.mama.x, s.z - home.mama.z);     // mamá turns to watch
        return;
      }
      flyT = 0;
      chick.position.set(h.x, h.y, h.z);
      chick.rotation.y = home.face;
      chick.rotation.x = 0;
      chick.rotation.z = v && v.nudge != null ? Math.sin(v.nudge * 32) * 0.28 * (1 - v.nudge / 0.7) : 0;   // gentle wobble, never a scold
      wings.forEach(function (e) { e.m.rotation.z = e.rz; });
      if (mama) mama.rotation.y = home.face;
    }

    function update(dt) {
      var cur = thing.current();
      var k = cur ? cur.key : null;
      if (k !== key) { key = k; rebuild(cur); }
      t += dt || 0;
      var f = cur && cur.feather;
      if (feather && f) {
        feather.visible = !f.taken;
        feather.position.set(f.x, f.y + LIFT + Math.sin(t * 2.2) * 0.12, f.z);
        feather.rotation.y = t * 1.4;
      }
      if (cur) moveChick(thing.view ? thing.view() : null, dt);
      return group;
    }

    // A tap or click on the chick's volume gives it la pluma: raycast ONLY this volume.
    function tapAt(x, y) {
      if (!pick || !chick || !opts.canvas || !opts.camera || !thing.give || (SA.picking && SA.picking.isPaused && SA.picking.isPaused())) return false;
      var r = opts.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      chick.updateMatrixWorld(true);
      var ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)), opts.camera);
      var v = thing.view ? thing.view() : null;
      if (v && v.photo && thing.snap) {                  // AS-0338: the summit photo, any part of the chick or mamá counts (only these two, never the whole scene)
        if (mama) mama.updateMatrixWorld(true);
        if (!ray.intersectObjects([chick, mama].filter(Boolean), true).length) return false;
        var res = thing.snap(opts.getPlayer && opts.getPlayer());
        if (res.status === 'nocamera' && SA.inventory && SA.inventory.equip(SA.photo ? SA.photo.CAMERA : 'camara')) {
          try { SA.audio.say('item:camara'); } catch (e) { /* sound is best effort */ }       // la cámara is now in hand: tap again
        }
        return res.status === 'complete' || res.status === 'step';
      }
      if (!ray.intersectObjects([pick], false)[0]) return false;
      thing.give(opts.getPlayer && opts.getPlayer());
      return true;
    }
    if (opts.canvas && opts.canvas.addEventListener && SA.picking && SA.picking.createTapTracker) {
      var tracker = SA.picking.createTapTracker();
      opts.canvas.addEventListener('pointerdown', function (e) { tracker.down(e.pointerId, e.clientX, e.clientY); });
      opts.canvas.addEventListener('pointermove', function (e) { tracker.move(e.pointerId, e.clientX, e.clientY); });
      opts.canvas.addEventListener('pointercancel', function () { tracker.cancel(); });
      opts.canvas.addEventListener('pointerup', function (e) {
        var tp = tracker.up(e.pointerId, e.clientX, e.clientY);
        if (tp) { try { tapAt(tp.x, tp.y); } catch (err) { /* a tap never breaks the loop */ } }
      });
    }

    return { group: group, update: update, tapAt: tapAt, chickNode: function () { return chick; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
