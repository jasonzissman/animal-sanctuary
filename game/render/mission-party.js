/* SA.render.createMissionParty(THREE, { scene, getPlayer, canvas?, camera?, getTargets?, thing? }): the party at the monkey's tree (AS-0328).
 * It follows SA.missionParty (pure): while the party goes on it draws balloons tied round the tree (bobbing, with strings) and falling
 * confetti (little flat paper squares that tumble), all primitives with flat colours; nothing is drawn otherwise. update(dt) runs once per
 * frame: it ticks the party (its timer, the tune) and animates. A tap or click on the monkey or a friend with la cámara in hand takes the
 * party photo (SA.missionParty.snap); `getTargets()` gives the animals (SA.render.createMissionFriends().partyNodes).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var COLORS = [0xe84a5f, 0xffc93c, 0x4cc9f0, 0x7bd389, 0xb583e8, 0xff9f6b];
  var CONFETTI = 70, BALLOONS = 8, RING = 3.6, TOP = 9;

  function flat(THREE, c) { return new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 30, side: THREE.DoubleSide }); }

  SA.render.createMissionParty = function (THREE, opts) {
    var thing = opts.thing || SA.missionParty;
    var group = new THREE.Group();
    group.name = 'missionParty';
    group.visible = false;
    opts.scene.add(group);
    var paper = new THREE.PlaneGeometry(0.22, 0.14), balloonGeo = new THREE.SphereGeometry(0.42, 8, 6), stringGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 3);
    var mats = COLORS.map(function (c) { return flat(THREE, c); }), stringMat = new THREE.MeshBasicMaterial({ color: 0xf4f4f4 });
    var confetti = [], balloons = [], key = null, t = 0;

    function seed(i, k) { var s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }

    function build() {
      while (group.children.length) group.remove(group.children[0]);
      confetti = []; balloons = [];
      for (var i = 0; i < CONFETTI; i++) {
        var m = new THREE.Mesh(paper, mats[i % mats.length]);
        confetti.push({ mesh: m, a: seed(i, 1) * Math.PI * 2, r: 0.5 + seed(i, 2) * 5.5, ph: seed(i, 3), spin: 2 + seed(i, 4) * 5, sway: 0.3 + seed(i, 5) * 0.6, fall: 1.1 + seed(i, 6) * 0.9 });
        group.add(m);
      }
      for (var b = 0; b < BALLOONS; b++) {
        var ang = (b / BALLOONS) * Math.PI * 2 + 0.3, h = 3.2 + seed(b, 7) * 1.8;
        var ball = new THREE.Mesh(balloonGeo, mats[(b + 2) % mats.length]);
        ball.scale.set(1, 1.25, 1);
        var str = new THREE.Mesh(stringGeo, stringMat);
        group.add(ball); group.add(str);
        balloons.push({ ball: ball, str: str, ang: ang, h: h, ph: seed(b, 8) * 6 });
      }
    }

    function update(dt, player) {
      try { thing.tick(dt || 0); } catch (e) { /* the party never breaks the loop */ }
      var v = thing.view();
      var k = v ? v.key : null;
      if (k !== key) { key = k; if (v) build(); }
      group.visible = !!v;
      if (!v) return group;
      t += dt || 0;
      var tx = v.tree.x, tz = v.tree.z, ty = v.tree.y;
      confetti.forEach(function (c, i) {
        var life = ((t * c.fall * 0.18 + c.ph) % 1), y = ty + TOP - life * (TOP + 0.2), a = c.a + t * 0.25 + Math.sin(t * c.sway + i) * 0.4;
        c.mesh.position.set(tx + Math.sin(a) * c.r, y, tz + Math.cos(a) * c.r);
        c.mesh.rotation.set(t * c.spin, t * c.spin * 0.7 + i, t * c.spin * 0.4);
      });
      balloons.forEach(function (b, i) {
        var sway = Math.sin(t * 1.6 + b.ph) * 0.18, bob = Math.sin(t * 2.1 + b.ph) * 0.12;
        var x = tx + Math.sin(b.ang) * (RING + sway), z = tz + Math.cos(b.ang) * (RING + sway), y = ty + b.h + bob;
        b.ball.position.set(x, y, z);
        b.str.scale.y = b.h - 0.4;                      // the string reaches from the ground up to the balloon
        b.str.position.set(x, ty + (b.h - 0.4) / 2 + bob / 2, z);
      });
      return group;
    }

    // A tap or click on the monkey or a friend with la cámara in hand takes the party photo (the 'photo' step).
    function tapAt(x, y) {
      var v = thing.view();
      if (!v || v.phase !== 'photo' || !opts.canvas || !opts.camera || !opts.getTargets || (SA.picking && SA.picking.isPaused && SA.picking.isPaused())) return false;
      var r = opts.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)), opts.camera);
      var vols = [];
      opts.getTargets().forEach(function (n) { vols = vols.concat(n.userData.pickVolumes || []); });
      if (!vols.length || !ray.intersectObjects(vols, false).length) return false;
      var res = thing.snap(opts.getPlayer && opts.getPlayer());
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

    return { group: group, update: update, tapAt: tapAt };
  };
})(typeof window !== 'undefined' ? window : globalThis);
