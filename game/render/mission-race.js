/* SA.render.createMissionRace(THREE, { scene, thing?, canvas?, camera?, getPlayer? }): draws Mission 10's race course (AS-0354): a start line with the rabbit
 * beside it, a path of small flags and the big tree with a pulsing glow ring at the end. It follows SA.missionRace (pure: where everything is). All art is
 * procedural low-poly (poles, pennant cones, a trunk and stacked cones). A flag you ran past pops a little and turns gold. The big tree is scenery: you can
 * walk round it or past it (shortcuts are allowed), only the goal circle matters.
 * On the 'talk' step a tap on the rabbit calls thing.talk(player); on the 'photo' step a tap on the big tree calls thing.snap(player) (la cámara is put in hand
 * on a first tap, like the other photo missions). Only the course's own meshes are raycast, never the whole scene. Nothing is drawn unless the mission runs.
 *   update(dt)   once per frame; returns the group it manages
 *   tapAt(x, y)  client coordinates -> true when the rabbit / tree was hit and the tap counted
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var POLE = 0xf4efe6, FLAGS = [0xff5d5d, 0x4da3ff], PASSED = 0xffd23f, TRUNK = 0x7a5230, LEAF = [0x2f8f4e, 0x3aa35c, 0x49b868], GLOW = 0xffe08a, LINE = 0xffffff;

  function lam(THREE, c) { return new THREE.MeshLambertMaterial({ color: c }); }

  // One small flag (group-local, origin on the ground): a pole and a pennant cone that waves. Returns { group, pennant }.
  function buildFlag(THREE, color) {
    var g = new THREE.Group();
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 5), lam(THREE, POLE));
    pole.position.y = 0.75;
    var pennant = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 3), lam(THREE, color));
    pennant.rotation.z = -Math.PI / 2;
    pennant.position.set(0.35, 1.2, 0);
    g.add(pole); g.add(pennant);
    return { group: g, pennant: pennant };
  }

  // The start line: a white strip across the way and two taller flag poles either side.
  function buildStart(THREE, r) {
    var g = new THREE.Group();
    var strip = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 0.06, 0.5), lam(THREE, LINE));
    strip.position.y = 0.05;
    g.add(strip);
    [-1, 1].forEach(function (s) {
      var f = buildFlag(THREE, FLAGS[s > 0 ? 0 : 1]);
      f.group.position.x = s * r;
      f.group.scale.set(1.3, 1.3, 1.3);
      g.add(f.group);
    });
    return g;
  }

  // The big tree (about 9 m tall): a thick trunk, three stacked leaf cones, and the glow ring round its foot (returned for pulsing).
  function buildBigTree(THREE, r) {
    var g = new THREE.Group(), tree = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.85, 3.4, 7), lam(THREE, TRUNK));
    trunk.position.y = 1.7;
    tree.add(trunk);
    [[3.4, 3.8, 4.4], [2.7, 3.2, 6.4], [1.9, 2.6, 8.2]].forEach(function (c, i) {
      var cone = new THREE.Mesh(new THREE.ConeGeometry(c[0], c[1], 8), lam(THREE, LEAF[i]));
      cone.position.y = c[2];
      tree.add(cone);
    });
    g.add(tree);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1, 4, 24), new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.16;
    g.add(ring);
    return { group: g, tree: tree, ring: ring };
  }

  SA.render.createMissionRace = function (THREE, opts) {
    var thing = opts.thing || SA.missionRace;
    var build = SA.render.animalBuilder(THREE);
    var group = new THREE.Group();
    group.name = 'missionRace';
    opts.scene.add(group);
    var key = null, flags = [], ring = null, bigTree = null, rabbit = null, t = 0, shown = {}, popAt = {};

    function rebuild(cur) {
      while (group.children.length) group.remove(group.children[0]);
      flags = []; ring = null; bigTree = null; rabbit = null; shown = {}; popAt = {};
      if (!cur) return;
      var st = buildStart(THREE, cur.start.r);
      st.position.set(cur.start.x, cur.start.y, cur.start.z);
      st.rotation.y = cur.start.face;
      group.add(st);
      cur.flags.forEach(function (f, i) {
        var fl = buildFlag(THREE, FLAGS[i % 2]);
        fl.group.position.set(f.x, f.y, f.z);
        fl.group.rotation.y = f.rotY - Math.PI / 2;       // the pennant streams toward the tree
        group.add(fl.group);
        flags.push({ g: fl.group, pennant: fl.pennant, color: FLAGS[i % 2], phase: i * 1.3 });
      });
      var bt = buildBigTree(THREE, cur.goal.r);
      bt.group.position.set(cur.goal.x, cur.goal.y, cur.goal.z);
      group.add(bt.group);
      bigTree = bt.tree; ring = bt.ring;
      var spec = SA.data.get('animals', cur.rabbit.animal);
      if (spec) {
        rabbit = build(spec, { id: spec.id, x: cur.rabbit.x, z: cur.rabbit.z, y: cur.rabbit.y, rotY: cur.rabbit.rotY });
        rabbit.scale.set(cur.rabbit.scale, cur.rabbit.scale, cur.rabbit.scale);
        rabbit.userData.baseY = cur.rabbit.y;
        group.add(rabbit);
      }
    }

    var ease = function (u) { var c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };

    function update(dt) {
      var cur = thing.current();
      var k = cur ? cur.key : null;
      if (k !== key) { key = k; rebuild(cur); }
      t += dt || 0;
      var v = cur && thing.view ? thing.view() : null;
      if (ring) {
        var s = 1 + Math.sin(t * 2.4) * (v && v.photo ? 0.12 : 0.06);
        ring.scale.set(s, s, 1);
        ring.material.opacity = 0.6 + Math.sin(t * 2.4) * 0.25;
      }
      var passed = (v && v.passed) || [];
      flags.forEach(function (f, i) {
        var on = passed.indexOf(i) >= 0;
        if (on && !shown[i]) { shown[i] = true; popAt[i] = t; f.pennant.material.color.setHex(PASSED); }
        f.pennant.rotation.x = Math.sin(t * 5 + f.phase) * 0.25;       // waving in the breeze
        var u = on ? Math.min(1, (t - popAt[i]) / 0.5) : 1, sc = on ? 1 + 0.35 * Math.sin(Math.PI * ease(u)) : 1;
        f.g.scale.set(sc, sc, sc);
      });
      if (rabbit) rabbit.position.y = rabbit.userData.baseY + (v && v.talk ? Math.abs(Math.sin(t * 5)) * 0.18 : 0);     // it hops while it waits to be talked to
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
      if (!opts.canvas || !opts.camera || (SA.picking && SA.picking.isPaused && SA.picking.isPaused())) return false;
      var v = thing.view ? thing.view() : null;
      if (!v || !(v.talk || v.photo)) return false;
      var node = v.talk ? rabbit : bigTree;
      if (!node) return false;
      var rc = rayAt(x, y);
      if (!rc) return false;
      group.updateMatrixWorld(true);
      if (!rc.intersectObject(node, true).length) return false;
      var player = opts.getPlayer && opts.getPlayer();
      if (v.talk) { var tr = thing.talk(player); return !!tr && (tr.status === 'step' || tr.status === 'complete'); }
      var res = thing.snap(player);
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
