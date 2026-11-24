/* SA.render.createMissionHatch(THREE, { scene, getPlayer, canvas?, camera? }): draws mission 2's hatch (AS-0315, slice 3 of AS-0181)
 * from SA.missionHatch (pure: the timer, the spots). Primitives and the normal animal builder only:
 *   - a trail of tiny duck tracks and feathers from the nest to the lost egg (until the egg is picked up);
 *   - mamá pato standing by the nest, looking around, from the start of the mission;
 *   - the egg cracking (zigzag cracks, a harder and harder wobble), then two shell halves: the lid pops off and the duckling
 *     (el patito) grows out of the nest with a hop, then idles beside mamá.
 *   - a tap or click on mamá or the duckling takes the family photo (SA.missionHatch.snap) when la cámara is in hand.
 * Nothing here names an animal id: the species come from the mission row. update(dt) once per frame; returns the group.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var FOOT = 0xb8812f, FEATHER = 0xfff1a8, CRACK = 0x6b4b22, SHELL = 0xfff4dc, POP_SECONDS = 0.8, EGG_LIFT = 0.28;

  SA.render.createMissionHatch = function (THREE, opts) {
    var hatch = opts.hatch || SA.missionHatch;
    var build = SA.render.animalBuilder(THREE);
    var group = new THREE.Group();
    group.name = 'missionHatch';
    opts.scene.add(group);
    var key = null, trailGroup = null, mama = null, baby = null, crackEgg = null, lid = null, cup = null, t = 0, popT = 0, seen = null;

    function flat(c) { return new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 0 }); }
    function gh(x, z) { return SA.map && SA.map.groundHeight ? SA.map.groundHeight(x, z) : 0; }

    function makeTrail(cur) {
      var g = new THREE.Group();
      hatch.trail(cur.to, cur.item).forEach(function (m) {
        var mesh;
        if (m.kind === 'feather') {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.3), flat(FEATHER));
          mesh.rotation.y = m.rot + 0.5;
        } else {
          mesh = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 3), flat(FOOT));
          mesh.rotation.set(Math.PI / 2, 0, 0);          // a flat webbed triangle pointing along the walk
          var holder = new THREE.Group();
          holder.add(mesh);
          holder.rotation.y = m.rot;
          mesh = holder;
        }
        mesh.position.set(m.x, gh(m.x, m.z) + 0.04, m.z);
        g.add(mesh);
      });
      return g;
    }

    function makeCrackEgg() {
      var g = SA.render.createMissionCarry.makeEgg(THREE);
      [[0.0, 0.1, 0.23, 0.5], [0.1, 0.0, 0.22, -0.6], [-0.1, 0.18, 0.2, 1.0]].forEach(function (c) {
        var line = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.025, 0.02), flat(CRACK));
        line.position.set(c[0], c[1], c[2]);
        line.rotation.z = c[3];
        g.add(line);
      });
      return g;
    }

    function makeHalves() {
      var top = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), flat(SHELL));
      var bottom = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), flat(SHELL));
      top.scale.set(0.8, 1.1, 0.8);
      bottom.scale.set(0.8, 1.1, 0.8);
      return { lid: top, cup: bottom };
    }

    function clear() {
      while (group.children.length) group.remove(group.children[0]);
      trailGroup = mama = baby = crackEgg = lid = cup = null;
      popT = 0;
      seen = null;
    }

    function rebuild(v, cur) {
      clear();
      if (!v) return;
      trailGroup = makeTrail(cur);
      mama = build(SA.data.get('animals', v.spec.mama), { id: v.spec.mama, x: v.mama.x, z: v.mama.z, y: v.mama.y, rotY: v.mama.rotY });
      baby = build(SA.data.get('animals', v.spec.baby), { id: v.spec.baby, x: v.baby.x, z: v.baby.z, y: v.baby.y, rotY: v.baby.rotY });
      baby.visible = false;
      crackEgg = makeCrackEgg();
      crackEgg.visible = false;
      var h = makeHalves();
      lid = h.lid; cup = h.cup;
      lid.visible = cup.visible = false;
      group.add(trailGroup, mama, baby, crackEgg, lid, cup);
    }

    function update(dt) {
      var carry = SA.missionCarry && SA.missionCarry.current();
      hatch.update(dt || 0);
      var v = hatch.view();
      var k = v ? v.key : null;
      if (k !== key) { key = k; rebuild(v, carry); }
      if (!v || !mama) return group;
      t += dt || 0;
      var nest = v.nest, p = opts.getPlayer && opts.getPlayer();
      trailGroup.visible = carry && carry.phase === 'ground';
      mama.rotation.y = v.mama.rotY + Math.sin(t * 0.9) * 0.7;                                         // looking around by the nest
      mama.position.y = v.mama.y + (v.phase === 'waiting' || v.phase === 'cracking' ? Math.abs(Math.sin(t * 5)) * 0.06 : 0);   // a nervous bounce

      var cracking = v.phase === 'cracking';
      crackEgg.visible = cracking;
      if (cracking) {
        var shake = Math.sin(t * 28) * (0.12 + 0.3 * v.crack);
        crackEgg.position.set(nest.x, nest.y + EGG_LIFT, nest.z);
        crackEgg.rotation.set(0, 0, shake);
        crackEgg.scale.setScalar(1 + 0.08 * v.crack);
        seen = 'cracking';
      }
      var out = v.phase === 'hatched' || v.phase === 'done';
      if (out && seen === 'cracking') { popT = POP_SECONDS; seen = 'out'; }                         // the hatch moment: play the pop once
      else if (out && !seen) seen = 'out-static';
      lid.visible = cup.visible = out;
      baby.visible = out;
      if (out) {
        var k2 = popT > 0 ? 1 - popT / POP_SECONDS : 1;                                              // 0 -> 1 over the pop
        popT = Math.max(0, popT - (dt || 0));
        cup.position.set(nest.x, nest.y + EGG_LIFT - 0.1, nest.z);
        lid.position.set(nest.x + 0.55 * Math.min(1, k2 * 2), nest.y + EGG_LIFT + 0.05 + Math.sin(Math.PI * Math.min(1, k2 * 1.6)) * 0.7 * (k2 < 0.65 ? 1 : 0), nest.z);
        lid.rotation.set(0, 0, -1.4 * k2);
        var grow = seen === 'out-static' ? 1 : Math.max(0.1, k2);
        baby.scale.setScalar(grow);
        var hopY = k2 < 1 ? Math.sin(Math.PI * k2) * 0.5 : Math.abs(Math.sin(t * 4)) * 0.08;         // a hop out, then little bounces
        baby.position.set(k2 < 1 ? nest.x + (v.baby.x - nest.x) * k2 : v.baby.x, v.baby.y + hopY, k2 < 1 ? nest.z + (v.baby.z - nest.z) * k2 : v.baby.z);
        baby.rotation.y = v.baby.rotY + Math.sin(t * 2.2) * 0.25;
      }
      return group;
    }

    // A tap or click on mamá or the duckling takes the family photo when la cámara is in hand (the 'photo' step; SA.missionHatch.snap).
    function tapAt(x, y) {
      var v = hatch.view();
      if (!v || v.phase !== 'hatched' || !baby || !opts.canvas || !opts.camera || (SA.picking && SA.picking.isPaused && SA.picking.isPaused())) return false;
      var r = opts.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)), opts.camera);
      var vols = (baby.userData.pickVolumes || []).concat(mama.userData.pickVolumes || []);
      if (!ray.intersectObjects(vols, false).length) return false;
      var res = hatch.snap(opts.getPlayer && opts.getPlayer());
      if (res.status === 'nocamera' && SA.inventory && SA.inventory.equip(SA.photo ? SA.photo.CAMERA : 'camara')) {
        try { SA.audio.say('item:camara'); } catch (e) { /* sound is best effort */ }       // la cámara is now in hand: tap again
      }
      return res.status === 'complete' || res.status === 'step';
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

    return { group: group, update: update, tapAt: tapAt, babyNode: function () { return baby; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
