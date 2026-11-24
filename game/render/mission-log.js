/* SA.render.createMissionLog(THREE, { scene, getPlayer, solids? }): draws mission 3's river rescue (AS-0319, slice 2 of AS-0182) from
 * SA.missionLog (pure: where things are, the push, the lock). Primitives and the normal animal builder only:
 *   - a flat-topped grey rock standing in the river with the stranded animal (the species comes from the mission row) on it;
 *     while the log is not across it shivers, shows a little blue tear and whimpers softly (quieter the further you are), then it
 *     perks up and hops when the bridge locks;
 *   - the fallen log (bark trunk, pale cut ends, two branch stubs) that follows the pushed position, rocking a little while pushed.
 * AS-0320: with a `bank` the puppy is then carried in front of the player's chest, set down on a towel on the bank, and drawn WET
 * (a dark blue tint and falling drops) until the sponge dries it (a tap on it while the 'dry' step runs: SA.missionLog.rub).
 * Nothing here names an animal or a mission. update(dt) once per frame (it also steps SA.missionLog); returns the group.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var BARK = 0x7a5530, BARK_DARK = 0x5e4024, CUT = 0xd9b98a, ROCK = 0x8d9199, ROCK_DARK = 0x6f747c, TEAR = 0x4aa8ff;
  var CRY_EVERY = 4.5, HEAR = 22, PUSH_SOUND_EVERY = 0.4, HELD_FRONT = 0.75, HELD_UP = 0.5, WET = 0x1d2f55, DROP = 0x4aa8ff, TOWEL = 0xf2c94c, TOWEL_STRIPE = 0x4d96ff;

  SA.render.createMissionLog = function (THREE, opts) {
    var log = opts.log || SA.missionLog;
    if (opts.solids && log.setSolids) log.setSolids(opts.solids);
    var build = SA.render.animalBuilder(THREE);
    var group = new THREE.Group();
    group.name = 'missionLog';
    opts.scene.add(group);
    var key = null, rock = null, trunk = null, pup = null, tear = null, towel = null, drips = null, tints = [], t = 0, cry = 0, pushGap = 0, hop = 0, wasLocked = false;

    function flat(c) { return new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 0 }); }
    function gh(x, z) { return SA.map && SA.map.groundHeight ? SA.map.groundHeight(x, z) : 0; }

    function makeRock(cur) {
      var g = new THREE.Group(), top = cur.rock.y, depth = top + 1.0;
      var slab = new THREE.Mesh(new THREE.CylinderGeometry(cur.rock.r * 0.8, cur.rock.r * 1.05, depth, 7), flat(ROCK));
      slab.position.y = top - depth / 2;
      g.add(slab);
      [[-0.9, 0.7, 0.35], [0.8, -0.8, 0.28]].forEach(function (b) {      // two small stones sitting around the rock
        var s = new THREE.Mesh(new THREE.DodecahedronGeometry(b[2], 0), flat(ROCK_DARK));
        s.position.set(b[0] * cur.rock.r, -0.05, b[1] * cur.rock.r);
        g.add(s);
      });
      g.position.set(cur.rock.x, 0, cur.rock.z);
      return g;
    }

    function makeTrunk(cur) {
      var g = new THREE.Group(), len = cur.log.half * 2, r = cur.log.r;
      var body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, len, 8), flat(BARK));
      body.rotation.z = Math.PI / 2;
      g.add(body);
      [-1, 1].forEach(function (s) {
        var cut = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.05, 8), flat(CUT));
        cut.rotation.z = Math.PI / 2;
        cut.position.x = s * (len / 2 + 0.005);
        g.add(cut);
      });
      [[-1.2, 0.5], [0.9, -0.5]].forEach(function (b) {
        var stub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.45, 5), flat(BARK_DARK));
        stub.position.set(b[0], r * 0.7, b[1] * r);
        stub.rotation.x = b[1] > 0 ? 0.9 : -0.9;
        g.add(stub);
      });
      return g;
    }

    function makeTear() {
      var m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: TEAR }));
      m.scale.set(0.8, 1.3, 0.8);
      var tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 8), new THREE.MeshBasicMaterial({ color: TEAR }));
      tip.position.y = 0.2;
      var g = new THREE.Group();
      g.add(m, tip);
      return g;
    }

    function makeTowel(cur) {
      var g = new THREE.Group();
      var cloth = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 1.2), flat(TOWEL));
      g.add(cloth);
      [-0.45, 0.45].forEach(function (z) {
        var s = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.055, 0.18), flat(TOWEL_STRIPE));
        s.position.z = z;
        g.add(s);
      });
      g.position.set(cur.bank.x, gh(cur.bank.x, cur.bank.z) + 0.04, cur.bank.z);
      return g;
    }

    function makeDrips() {
      var g = new THREE.Group();
      for (var i = 0; i < 4; i++) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: DROP })));
      return g;
    }

    // The puppy owns its materials (the builder may share them) so a wet tint never leaks onto other animals.
    function collectTints(node) {
      var out = [];
      node.traverse(function (o) {
        if (!o.material || !o.material.color || o.material.type === 'MeshBasicMaterial') return;   // eyes etc. stay as they are
        o.material = o.material.clone();
        out.push({ mat: o.material, base: o.material.color.clone() });
      });
      return out;
    }

    function setWet(frac) {
      var wet = new THREE.Color(WET);
      tints.forEach(function (x) { x.mat.color.copy(x.base).lerp(wet, 0.55 * frac); });
    }

    function rebuild(cur) {
      while (group.children.length) group.remove(group.children[0]);
      rock = trunk = pup = tear = towel = drips = null; tints = []; hop = 0; wasLocked = false; wetLook.last = -1;
      if (!cur) return;
      rock = makeRock(cur);
      trunk = makeTrunk(cur);
      pup = build(SA.data.get('animals', cur.pup.id), cur.pup);
      pup.position.set(cur.pup.x, cur.pup.y, cur.pup.z);
      pup.rotation.y = cur.pup.rotY;
      pup.userData.baseRot = cur.pup.rotY;
      tear = makeTear();
      group.add(rock, trunk, pup, tear);
      if (cur.bank) {
        towel = makeTowel(cur);
        drips = makeDrips();
        tints = collectTints(pup);
        group.add(towel, drips);
      }
    }

    // Wet look: the dark tint fades with each sponge tap; drops fall from the fur until it is seco.
    function wetLook(cur, at, dt) {
      var ps = cur.pupState || { wet: true, rubs: 0, need: 1 }, frac = ps.wet ? 1 - 0.7 * (ps.rubs / Math.max(1, ps.need)) : 0;
      if (drips) {
        drips.visible = ps.wet;
        drips.children.forEach(function (d, i) {
          var f = (t * 1.3 + i * 0.25) % 1;
          d.position.set(at.x + Math.cos(i * 1.7) * 0.35, at.y + 0.9 - f * 0.9, at.z + Math.sin(i * 1.7) * 0.25);
          d.scale.setScalar(1 - f * 0.5);
        });
      }
      if (tints.length && frac !== wetLook.last) { wetLook.last = frac; setWet(frac); }
    }
    wetLook.last = -1;

    function update(dt) {
      dt = dt || 0;
      var p = opts.getPlayer && opts.getPlayer();
      try { log.update(p, dt); } catch (e) { /* the story never breaks the loop */ }
      var cur = log.sync({ solids: opts.solids });
      var k = cur ? cur.key : null;
      if (k !== key) { key = k; rebuild(cur); }
      if (!cur || !trunk) return group;
      t += dt;
      var locked = cur.phase === 'locked', x = log.logX();
      var ground = gh(x, cur.log.z);
      trunk.position.set(x, Math.max(cur.log.y - cur.log.r, ground + cur.log.r * 0.6), cur.log.z);
      trunk.rotation.z = cur.pushing ? Math.sin(t * 14) * 0.012 : 0;
      if (cur.pushing) {
        pushGap -= dt;
        if (pushGap <= 0) { pushGap = PUSH_SOUND_EVERY; if (SA.audio) { try { SA.audio.sfx('rustle', 0.35); } catch (e) { /* sound is best effort */ } } }
      }
      if (locked && !wasLocked) { wasLocked = true; hop = 0.9; if (SA.audio) { try { SA.audio.sfx('sparkle'); } catch (e) { /* sound is best effort */ } } }
      var phase = cur.pupState ? cur.pupState.phase : 'rock';
      tear.visible = !locked && phase === 'rock';
      if (phase === 'held' && p) {
        pup.position.set(p.x + Math.sin(p.heading || 0) * HELD_FRONT, (p.y || 0) + (p.lift || 0) + HELD_UP + Math.sin(t * 5) * 0.03, p.z + Math.cos(p.heading || 0) * HELD_FRONT);
        pup.rotation.set(0, (p.heading || 0) + Math.sin(t * 9) * 0.05, 0);
        wetLook(cur, pup.position, dt);
      } else if (phase === 'bank') {
        pup.position.set(cur.bank.x, gh(cur.bank.x, cur.bank.z) + 0.05, cur.bank.z);
        pup.rotation.set(0, Math.PI / 2 + (cur.pupState.wet ? Math.sin(t * 9) * 0.06 : Math.sin(t * 2) * 0.25), 0);   // shivers while wet, looks around once dry
        wetLook(cur, pup.position, dt);
      } else if (!locked) {
        wetLook(cur, cur.pup, dt);
        pup.position.y = cur.pup.y;
        pup.rotation.y = pup.userData.baseRot + Math.sin(t * 9) * 0.06;            // a small shiver
        tear.position.set(cur.pup.x, cur.pup.y + 1.3 + Math.abs(Math.sin(t * 2.4)) * 0.1, cur.pup.z);
        cry -= dt;
        if (cry <= 0) {
          cry = CRY_EVERY;
          var d = p ? Math.hypot(p.x - cur.pup.x, p.z - cur.pup.z) : HEAR;
          if (d < HEAR && SA.audio) { try { SA.audio.sfx('whimper', Math.max(0.15, 0.6 * (1 - d / HEAR))); } catch (e) { /* sound is best effort */ } }
        }
      } else {
        wetLook(cur, cur.pup, dt);
        var lift = hop > 0 ? Math.abs(Math.sin(Math.PI * (1 - hop / 0.9) * 2)) * 0.5 : 0;
        hop = Math.max(0, hop - dt);
        pup.position.y = cur.pup.y + lift;
        pup.rotation.y = pup.userData.baseRot + Math.sin(t * 2) * 0.25;            // looks around, happy
      }
      return group;
    }

    // A tap or click on the wet puppy on the bank rubs it with the sponge (SA.missionLog.rub). Without the sponge in hand it is equipped.
    function tapAt(x, y) {
      var cur = log.sync && log.sync();
      if (!cur || !pup || !cur.pupState || cur.pupState.phase !== 'bank' || !opts.canvas || !opts.camera || (SA.picking && SA.picking.isPaused && SA.picking.isPaused())) return false;
      var r = opts.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)), opts.camera);
      if (!ray.intersectObjects(pup.userData.pickVolumes || [], false).length) return false;
      var res = log.rub(opts.getPlayer && opts.getPlayer());
      if (res.status === 'noitem' && SA.inventory && SA.inventory.equip(res.item)) {
        try { SA.audio.say('item:' + res.item); } catch (e) { /* sound is best effort */ }      // la esponja is now in hand: tap again
      }
      return res.status === 'rub' || res.status === 'done';
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
