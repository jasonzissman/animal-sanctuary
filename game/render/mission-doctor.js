/* SA.render.createMissionDoctor(THREE, { scene, canvas?, camera?, getPlayer?, thing? }): draws Mission 5's sick animal and its bucket (AS-0331).
 * It follows SA.missionDoctor (pure: where they are, which phase). The sick animal is built through the normal animal path
 * (SA.render.animalBuilder) and looks poorly: nose-down droopy pose, slow sway and a small red-and-white thermometer bobbing above its
 * head. An invisible, enlarged pick volume on its forehead carries userData { animalId, part: 'frente' }; a tap or click that hits it calls
 * thing.touch(player, part) (its own volume only, never the whole scene). The bucket (a tapered tub with a handle, from primitives) lies at
 * the pool's rim, rides in front of the kid while held (blue water inside once filled) and rests by the animal when given.
 * Nothing here knows a mission id or an animal id.
 *   update(dt, player?)   once per frame; returns the group it manages
 *   tapAt(x, y)           client coordinates -> true when the forehead volume was hit and handled
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var TUB = 0x9aa3ad, RIM = 0x6f7882, WATER = 0x4aa8ff, GLASS = 0xf4f7fa, MERCURY = 0xe0302c;
  var HELD_FRONT = 0.7, HELD_UP = 0.9, PICK_RADIUS = 0.9, DROOP = 0.11;

  function flat(THREE, c) { return new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 0 }); }

  function bucketModel(THREE) {
    var g = new THREE.Group();
    var tub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.42, 10), flat(THREE, TUB));
    tub.position.y = 0.21;
    var rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 5, 12), flat(THREE, RIM));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.42;
    var handle = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 5, 10, Math.PI), flat(THREE, RIM));
    handle.position.y = 0.42;
    var water = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.03, 10), new THREE.MeshBasicMaterial({ color: WATER }));
    water.position.y = 0.36; water.visible = false;
    g.add(tub, rim, handle, water);
    g.userData.water = water;
    g.scale.set(1.5, 1.5, 1.5);   // big and readable for small hands
    return g;
  }

  function thermometerModel(THREE) {
    var g = new THREE.Group();
    var tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.62, 8), flat(THREE, GLASS));
    var col = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 6), new THREE.MeshBasicMaterial({ color: MERCURY }));
    col.position.y = -0.06;
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ color: MERCURY }));
    bulb.position.y = -0.36;
    g.add(tube, col, bulb);
    g.rotation.z = 0.35;
    g.scale.set(1.4, 1.4, 1.4);
    return g;
  }

  // The medicine (AS-0332): a small glass bottle with a red cross, lying on the station bench until it is picked up.
  function medicineModel(THREE) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), flat(THREE, GLASS));
    body.position.y = 0.25;
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8), flat(THREE, MERCURY));
    cap.position.y = 0.56;
    var bar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.04), new THREE.MeshBasicMaterial({ color: MERCURY }));
    bar.position.set(0, 0.25, 0.2);
    var bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.04), new THREE.MeshBasicMaterial({ color: MERCURY }));
    bar2.position.set(0, 0.25, 0.2);
    g.add(body, cap, bar, bar2);
    g.scale.set(1.5, 1.5, 1.5);
    return g;
  }

  SA.render.createMissionDoctor = function (THREE, opts) {
    var thing = opts.thing || SA.missionDoctor;
    if (opts.solids && thing.setSolids) thing.setSolids(opts.solids);
    var build = SA.render.animalBuilder(THREE);
    var group = new THREE.Group();
    group.name = 'missionDoctor';
    opts.scene.add(group);
    var key = null, animal = null, bucket = null, thermo = null, pick = null, headTop = 3, t = 0;
    var medicine = null, umbrella = null, lie = 0;

    function headOf(node) {
      var found = null;
      node.updateMatrixWorld(true);
      node.traverse(function (o) { if (!found && o.userData && o.userData.part === 'cabeza' && !o.userData.pick && o.geometry) found = o; });
      return found;
    }

    function rebuild(cur) {
      while (group.children.length) group.remove(group.children[0]);
      animal = bucket = thermo = pick = medicine = umbrella = null;
      lie = 0;
      if (!cur) return;
      animal = build(SA.data.get('animals', cur.animal.id), cur.animal);
      animal.rotation.order = 'YXZ';       // droop about the animal's own side axis, whatever way it faces
      animal.userData.baseRot = cur.animal.rotY;
      var head = headOf(animal), c = new THREE.Vector3(0, 2, 1);
      if (head) {
        var box = new THREE.Box3().setFromObject(head);
        box.getCenter(c);
        c.y = box.max.y - (box.max.y - box.min.y) * 0.25;      // the forehead: high on the head
        headTop = box.max.y - cur.animal.y;
        animal.worldToLocal(c);
      }
      // The enlarged pick volume on the forehead: a generous invisible sphere (kids have big fingers).
      pick = new THREE.Mesh(new THREE.SphereGeometry(PICK_RADIUS, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.copy(c);
      pick.visible = false;
      pick.userData = { animalId: cur.animal.id, part: cur.spec.part, pick: true, pickVolume: 'sphere' };
      animal.add(pick);
      animal.userData.doctorPick = pick;
      thermo = thermometerModel(THREE);
      bucket = bucketModel(THREE);
      group.add(animal, thermo, bucket);
      var shape = SA.render.propBuilders && SA.render.propMaterials ? SA.render.propBuilders.umbrella : null;   // the umbrella is the sandbox prop (data row 'sombrilla')
      if (cur.stock && cur.stock.medicine) { medicine = medicineModel(THREE); group.add(medicine); }
      if (cur.stock && cur.stock.shade && shape) { umbrella = shape(THREE, SA.render.propMaterials(THREE)); group.add(umbrella); }
    }

    // The medicine and the umbrella: on the station bench, in front of the kid while held, then (the umbrella) standing beside the animal.
    function placeStock(cur, v, p) {
      function carried(o, s) {
        o.position.set(p.x + Math.sin(p.heading || 0) * HELD_FRONT, (p.y || 0) + (p.lift || 0) + HELD_UP + Math.sin(t * 5) * 0.03, p.z + Math.cos(p.heading || 0) * HELD_FRONT);
        o.rotation.set(0, 0, 0); o.scale.set(s, s, s);
      }
      if (medicine) {
        var m = cur.stock.medicine;
        medicine.visible = v.med !== 'given';          // once given it is used up
        if (v.med === 'held' && p) carried(medicine, 1.1);
        else { medicine.position.set(m.x, m.y + Math.abs(Math.sin(t * 2)) * 0.03, m.z); medicine.rotation.set(0, t * 0.8, 0); medicine.scale.set(1.5, 1.5, 1.5); }
      }
      if (umbrella) {
        var u = cur.stock.shade;
        if (v.shade === 'given' && v.umbrella) { umbrella.position.set(v.umbrella.x, v.umbrella.y, v.umbrella.z); umbrella.rotation.set(0, 0, 0); umbrella.scale.set(1.2, 1.2, 1.2); }
        else if (v.shade === 'held' && p) carried(umbrella, 0.3);
        else { umbrella.position.set(u.x, u.y, u.z); umbrella.rotation.set(0, t * 0.8, 0); umbrella.scale.set(0.3, 0.3, 0.3); }
      }
    }

    function update(dt, player) {
      var cur = thing.current();
      var k = cur ? cur.key : null;
      if (k !== key) { key = k; rebuild(cur); }
      if (!cur || !animal) return group;
      t += dt || 0;
      var v = thing.view();
      var sway = Math.sin(t * 0.9);
      animal.rotation.x = v.phase === 'given' ? 0 : DROOP + sway * 0.015;    // nose down: poorly (perks up once it has its water)
      animal.rotation.y = animal.userData.baseRot + sway * 0.05;
      lie += ((v.rested ? 1 : 0) - lie) * Math.min(1, (dt || 0) * 2.5);   // AS-0332: under the umbrella it folds its legs and lies down to rest
      animal.position.y = cur.animal.y - (v.phase === 'given' ? 0 : 0.06) - lie * 0.5;
      animal.scale.y = 1 - lie * 0.3 + (lie > 0.9 ? Math.sin(t * 1.6) * 0.015 : 0);
      thermo.visible = v.sick && v.phase !== 'given';
      thermo.position.set(cur.animal.x, cur.animal.y + headTop + 0.8 + Math.sin(t * 2.2) * 0.1, cur.animal.z);
      thermo.rotation.y = t * 0.8;
      var p = player || (opts.getPlayer && opts.getPlayer());
      bucket.userData.water.visible = v.phase === 'full' || v.phase === 'given';
      if ((v.phase === 'held' || v.phase === 'full') && p) {
        bucket.position.set(p.x + Math.sin(p.heading || 0) * HELD_FRONT, (p.y || 0) + (p.lift || 0) + HELD_UP + Math.sin(t * 5) * 0.03, p.z + Math.cos(p.heading || 0) * HELD_FRONT);
        bucket.rotation.set(0, 0, 0);
      } else if (v.phase === 'given') {
        bucket.position.set(cur.animal.x + 1.4, cur.animal.y, cur.animal.z + 0.6);
      } else {
        bucket.position.set(cur.bucket.x, cur.bucket.y + 0.05 + Math.abs(Math.sin(t * 2)) * 0.04, cur.bucket.z);
        bucket.rotation.set(0, t * 0.8, 0);
      }
      placeStock(cur, v, p);
      return group;
    }

    // A tap or click on the forehead volume touches it: raycast ONLY this volume (AS-0331).
    function tapAt(x, y) {
      if (!pick || !opts.canvas || !opts.camera || (SA.picking && SA.picking.isPaused && SA.picking.isPaused())) return false;
      var r = opts.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      animal.updateMatrixWorld(true);
      var ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)), opts.camera);
      var hit = ray.intersectObjects([pick], false)[0];
      if (!hit) return false;
      thing.touch(opts.getPlayer && opts.getPlayer(), hit.object.userData.part);
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

    return { group: group, update: update, tapAt: tapAt, animalNode: function () { return animal; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
