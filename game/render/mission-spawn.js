/* SA.render.createMissionSpawn(THREE, { scene, solids, getPlayer?, baby? }): draws the animals a story mission placed (AS-0233).
 * It follows SA.missionSpawn (pure: where they stand), builds each one through the normal animal path
 * (SA.render.animalBuilder) and removes them when the mission ends. While the baby is still to be found it shows a little blue
 * tear above its head, bobs and whimpers softly (quieter the further you are); mamá idles, turning her head back and forth,
 * worried. Everything is data-driven: the species come from the mission row, never from an animal id here.
 *               baby = SA.missionBaby (AS-0234): once found, the baby hops, squeaks, follows you and bounces near mamá.
 *               opts.solids may be the walk-list function; SA.missionBaby resolves it.
 *   update(dt)   once per frame; returns the group it manages (children: the baby and mamá)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var CRY_EVERY = 4.5, HEAR = 22, TEAR_COLOR = 0x4aa8ff, HOP_SECONDS = 0.7, HEART_COUNT = 10, HEART_SECONDS = 2.2, NUZZLE_SECONDS = 3;

  SA.render.createMissionSpawn = function (THREE, opts) {
    var spawn = opts.spawn || SA.missionSpawn;
    var build = SA.render.animalBuilder(THREE);
    var group = new THREE.Group();
    group.name = 'missionAnimals';
    opts.scene.add(group);
    var baby = null, mama = null, tear = null, t = 0, cry = 0, hop = 0, lastDt = 0, hearts = [], nuzzle = 0;

    function makeTear() {
      var m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: TEAR_COLOR }));
      m.scale.set(0.8, 1.3, 0.8);
      var tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 8), new THREE.MeshBasicMaterial({ color: TEAR_COLOR }));
      tip.position.y = 0.2;
      var g = new THREE.Group();
      g.add(m, tip);
      return g;
    }

    function clear() {
      while (group.children.length) group.remove(group.children[0]);
      baby = mama = tear = null;
      hearts = [];
      nuzzle = 0;
    }

    function rebuild(cur) {
      clear();
      if (!cur) return;
      baby = build(SA.data.get('animals', cur.baby.id), cur.baby);
      mama = build(SA.data.get('animals', cur.mama.id), cur.mama);
      baby.userData.baseRot = cur.baby.rotY;
      mama.userData.baseRot = cur.mama.rotY;
      tear = makeTear();
      group.add(baby, mama, tear);
    }

    // Once found the baby hops, squeaks, follows the player (SA.missionBaby -> SA.follow) and bounces near mamá (AS-0234).
    // Reunion (AS-0235): a burst of little pink hearts from between the two, then they nuzzle: each leans in and nods toward the other.
    function makeHeart() {
      var mat = new THREE.MeshBasicMaterial({ color: 0xff5c8a });
      var g = new THREE.Group();
      var a = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat), b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat);
      var c = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.26, 8), mat);
      a.position.set(-0.08, 0.06, 0); b.position.set(0.08, 0.06, 0); c.rotation.z = Math.PI; c.position.y = -0.08;
      g.add(a, b, c);
      return g;
    }
    function burstHearts(x, y, z) {
      for (var i = 0; i < HEART_COUNT; i++) {
        var h = makeHeart(), ang = (i / HEART_COUNT) * Math.PI * 2 + Math.random() * 0.4, sp = 0.6 + Math.random() * 0.8;
        h.position.set(x, y, z);
        group.add(h);
        hearts.push({ node: h, vx: Math.cos(ang) * sp, vy: 2.2 + Math.random() * 1.2, vz: Math.sin(ang) * sp, age: -i * 0.06 });
      }
    }
    function updateHearts(dt) {
      for (var i = hearts.length - 1; i >= 0; i--) {
        var h = hearts[i];
        h.age += dt;
        if (h.age < 0) { h.node.visible = false; continue; }
        h.node.visible = true;
        h.node.position.x += h.vx * dt; h.node.position.y += h.vy * dt; h.node.position.z += h.vz * dt;
        h.vy = Math.max(0.4, h.vy - 2.4 * dt);
        h.node.rotation.y += dt * 3;
        var k = Math.max(0.001, 1 - h.age / HEART_SECONDS);
        h.node.scale.set(k, k, k);
        if (h.age >= HEART_SECONDS) { group.remove(h.node); hearts.splice(i, 1); }
      }
    }
    function nuzzleFrame(cur, v) {
      var left = nuzzle / NUZZLE_SECONDS, k = Math.sin(Math.PI * (1 - left)), nod = Math.sin(t * 9) * 0.5 + 0.5;
      var bx = cur.mama.x - v.x, bz = cur.mama.z - v.z, d = Math.hypot(bx, bz) || 1;
      var lean = 0.35 * k;
      baby.position.x += (bx / d) * lean; baby.position.z += (bz / d) * lean;
      baby.rotation.y = Math.atan2(bx, bz);
      baby.rotation.x = -0.35 * k * nod;
      mama.rotation.y = Math.atan2(-bx, -bz);
      mama.rotation.x = 0.3 * k * (1 - nod);
      nuzzle = Math.max(0, nuzzle - lastDt);
      if (nuzzle === 0) { baby.rotation.x = 0; mama.rotation.x = 0; }
    }

    function animateBaby(v, cur) {
      var M = SA.map, lift = v.lift || 0;
      if (v.reunion) {
        nuzzle = NUZZLE_SECONDS;
        burstHearts((v.x + cur.mama.x) / 2, (M ? M.groundHeight(v.x, v.z) : cur.baby.y) + 1.6, (v.z + cur.mama.z) / 2);
        if (SA.audio) { try { SA.audio.sfx('sparkle'); } catch (e) { /* sound is best effort */ } }
      }
      if (v.hop) hop = HOP_SECONDS;
      if (hop > 0) { lift += Math.abs(Math.sin(Math.PI * (1 - hop / HOP_SECONDS) * 2)) * 0.7; hop = Math.max(0, hop - (lastDt || 0)); }
      if (v.excited > 0) lift += Math.abs(Math.sin(t * (7 + 5 * v.excited))) * (0.15 + 0.3 * v.excited);   // warmer = bouncier
      baby.position.set(v.x, (M ? M.groundHeight(v.x, v.z) : cur.baby.y) + lift, v.z);
      baby.rotation.y = v.heading;
      if (v.squeak && SA.audio) {
        var p = opts.getPlayer && opts.getPlayer();
        var d = p ? Math.hypot(p.x - v.x, p.z - v.z) : 0;
        SA.audio.sfx('squeak', Math.max(0.3, 0.8 * (1 - d / HEAR)));
      }
    }

    function update(dt) {
      var cur = spawn.sync({ solids: opts.solids });
      var key = cur ? cur.key : null;
      if (key !== (group.userData && group.userData.key)) { group.userData = { key: key }; rebuild(cur); hop = 0; }
      if (!cur) return group;
      lastDt = dt || 0;
      t += lastDt;
      var v = opts.baby ? opts.baby.update(dt || 0, opts.getPlayer && opts.getPlayer(), opts.solids) : null;
      if (v && v.following) {
        tear.visible = false;
        animateBaby(v, cur);
        if (nuzzle > 0) nuzzleFrame(cur, v);
        else mama.rotation.y = mama.userData.baseRot + Math.sin(t * 0.9) * 0.9;
        updateHearts(lastDt);
        return group;
      }
      var waiting = spawn.waiting(SA.missions && SA.missions.active() ? SA.missions.active().stepData : null);
      tear.visible = waiting;
      if (waiting) {
        baby.rotation.y = baby.userData.baseRot + Math.sin(t * 9) * 0.06;            // a small shiver
        tear.position.set(cur.baby.x, cur.baby.y + 1.5 + Math.abs(Math.sin(t * 2.4)) * 0.12, cur.baby.z);
        cry -= dt || 0;
        if (cry <= 0) {
          cry = CRY_EVERY;
          var p = opts.getPlayer && opts.getPlayer();
          var d = p ? Math.hypot(p.x - cur.baby.x, p.z - cur.baby.z) : HEAR;
          if (d < HEAR && SA.audio) SA.audio.sfx('whimper', Math.max(0.15, 0.6 * (1 - d / HEAR)));
        }
      } else baby.rotation.y = baby.userData.baseRot;
      mama.rotation.y = mama.userData.baseRot + Math.sin(t * 0.9) * 0.9;              // looking around, worried
      return group;
    }

    // A tap or click on the waiting baby uses it (the E / Enter key does the same through SA.spaceUse): its own pick volumes only.
    function tapAt(x, y) {
      if (!baby || !opts.baby || !opts.canvas || !opts.camera || (SA.picking && SA.picking.isPaused && SA.picking.isPaused())) return false;
      var r = opts.canvas.getBoundingClientRect();
      if (!r.width || !r.height || !opts.baby.canTap(opts.getPlayer && opts.getPlayer())) return false;
      var ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)), opts.camera);
      if (!ray.intersectObjects(baby.userData.pickVolumes || [], false).length) return false;
      return opts.baby.use();
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
