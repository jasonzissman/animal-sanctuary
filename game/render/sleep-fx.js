/* SA.render.createSleepFx(THREE, { scene, camera, ambient, getPlayer }) -> { update(dt), group }: the look and sound of sleeping animals (AS-0171).
 * Above each animal that is asleep (ambient.rigs[k].sleepAmt > 0) near the player, three soft block-letter "Z"s (SA.render.blockText, no textures)
 * rise, grow and fade in turn, turned to face the camera; a quiet snore plays now and then for the nearest sleeper (SA.sleep.snoreStep).
 * Only the SLOTS nearest sleepers (within RANGE) get letters, from a pool built on first use, so a whole sleeping forest costs nothing extra.
 * No per-frame allocation after the pool is built. The pure timing/pose maths is SA.sleep.zPose / snoreStep (unit-tested).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SLOTS = 8, LETTERS = 3, RANGE = 16, PX = 0.09, COLOR = 0xe6f3ff;

  SA.render.createSleepFx = function (THREE, opts) {
    var group = new THREE.Group();
    group.name = 'sleepFx';
    opts.scene.add(group);
    var pool = [], snore = null, ranked = [];

    function build() {
      for (var s = 0; s < SLOTS; s++) {
        var slot = { letters: [], key: null };
        for (var i = 0; i < LETTERS; i++) {
          var mat = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0, fog: false, depthWrite: false });
          var z = SA.render.blockText(THREE, mat, 'Z', PX).group;
          z.visible = false;
          group.add(z);
          slot.letters.push({ g: z, m: mat });
        }
        pool.push(slot);
      }
    }

    function hide(slot) { slot.key = null; slot.letters.forEach(function (l) { l.g.visible = false; }); }

    var t = 0;
    function update(dt) {
      var rigs = opts.ambient && opts.ambient.rigs;
      if (!rigs) return;
      t += Math.min(dt, 0.1);
      var pl = opts.getPlayer ? opts.getPlayer() : null, px = pl ? pl.x : 0, pz = pl ? pl.z : 0;
      ranked.length = 0;
      Object.keys(rigs).forEach(function (k) {
        var r = rigs[k];
        if (!r.sleeping || r.sleepAmt < 0.5) return;
        var d = Math.hypot(r.g.position.x - px, r.g.position.z - pz);
        if (d <= RANGE) ranked.push({ k: k, r: r, d: d });
      });
      ranked.sort(function (a, b) { return a.d - b.d; });
      var n = Math.min(ranked.length, SLOTS);
      if (n && !pool.length) build();
      for (var s = 0; s < pool.length; s++) {
        var slot = pool[s];
        if (s >= n) { if (slot.key) hide(slot); continue; }
        var e = ranked[s];
        slot.key = e.k;
        var base = e.r.g.position, up = (e.r.animal.sleepPose === 'hang' ? e.r.top * 1.6 : e.r.top) * e.r.sy + 0.35;
        for (var i = 0; i < LETTERS; i++) {
          var l = slot.letters[i], pose = SA.sleep.zPose(t, i, LETTERS), k = 0.7 + 0.3 * i;
          l.g.visible = true;
          l.g.position.set(base.x + 0.25 * i, base.y + up + pose.y, base.z);
          l.g.scale.setScalar(pose.scale * k);
          l.g.quaternion.copy(opts.camera.quaternion);
          l.g.rotateY(Math.PI);   // block text reads from -z: turn it to face the camera
          l.m.opacity = pose.alpha * 0.9;
        }
      }
      // A soft snore from the nearest sleeper close by.
      var nearest = ranked.length ? ranked[0].d : Infinity;
      var step = SA.sleep.snoreStep(snore, nearest, dt);
      snore = step.state;
      if (step.play && SA.audio && SA.audio.sfx) { try { SA.audio.sfx('snore', step.volume); } catch (err) { /* sound is best effort */ } }
    }

    return { update: update, group: group };
  };
})(typeof window !== 'undefined' ? window : globalThis);
