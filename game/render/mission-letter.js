/* SA.render.createMissionLetter(THREE, { scene, thing?, canvas?, camera?, getPlayer? }): draws Mission 11's mailbox on the lookout tower's platform (AS-0364):
 * a little blue post box on a post with a flag, and a pulsing glow ring round it on the handover and photo steps. It follows SA.missionLetter (pure: where it is).
 * The legs' waypoints are never drawn (the kid only listens). Procedural low-poly primitives only; only the mailbox's own meshes are raycast.
 * On the 'photo' step a tap on the mailbox calls thing.snap(player) (la cámara is put in hand on a first tap, like the other photo missions).
 * Nothing is drawn unless the mission runs.
 *   update(dt)   once per frame; returns the group it manages
 *   tapAt(x, y)  client coordinates -> true when the mailbox was hit and the photo counted
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var BODY = 0x3b82d6, POST = 0x7a5230, FLAG = 0xff5d5d, SLOT = 0x1d3f6e, GLOW = 0xffe08a;

  function lam(THREE, c) { return new THREE.MeshLambertMaterial({ color: c }); }

  function buildBox(THREE) {
    var g = new THREE.Group(), body = new THREE.Group();
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.7, 6), lam(THREE, POST));
    post.position.y = 0.35;
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), lam(THREE, BODY));
    box.position.y = 0.95;
    var roof = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 8, 1, false, 0, Math.PI), lam(THREE, BODY));
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.y = 1.2;
    var slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.02), lam(THREE, SLOT));
    slot.position.set(0, 1.0, 0.26);
    var flag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.03), lam(THREE, FLAG));
    flag.position.set(0.52, 1.3, 0);
    [post, box, roof, slot, flag].forEach(function (m) { body.add(m); });
    g.add(body);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 4, 20), new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    g.add(ring);
    return { group: g, body: body, ring: ring };
  }

  SA.render.createMissionLetter = function (THREE, opts) {
    var thing = opts.thing || SA.missionLetter;
    var group = new THREE.Group();
    group.name = 'missionLetter';
    opts.scene.add(group);
    var key = null, mailbox = null, ring = null, t = 0;

    function rebuild(v) {
      while (group.children.length) group.remove(group.children[0]);
      mailbox = null; ring = null;
      if (!v) return;
      var b = buildBox(THREE);
      b.group.position.set(v.box.x, v.box.y, v.box.z);
      group.add(b.group);
      mailbox = b.body; ring = b.ring;
    }

    function update(dt) {
      t += Math.max(0, dt || 0);
      var cur = thing.current ? thing.current() : null, v = cur && thing.view ? thing.view() : null;
      var k = v && cur ? cur.key : null;
      if (k !== key) { key = k; rebuild(v); }
      if (ring) {
        var on = !!(v && (v.give || v.photo));
        ring.visible = on;
        if (on) { var s = 1 + 0.1 * Math.sin(t * 4); ring.scale.set(s, s, s); }
      }
      return group;
    }

    function rayAt(x, y) {
      var r = opts.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      var rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)), opts.camera);
      return rc;
    }

    function tapAt(x, y) {
      if (!opts.canvas || !opts.camera || !mailbox || (SA.picking && SA.picking.isPaused && SA.picking.isPaused())) return false;
      var v = thing.view ? thing.view() : null;
      if (!v || !v.photo) return false;
      var rc = rayAt(x, y);
      if (!rc) return false;
      group.updateMatrixWorld(true);
      if (!rc.intersectObject(mailbox, true).length) return false;
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
