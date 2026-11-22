/* SA.render.createAmbient({ animals, avoid? }): ambient life for the animal groups from buildAnimals. No THREE calls
 * (it only moves groups/meshes), so it is testable with plain objects.
 *   ambient.update(dt)         call every frame BEFORE round-fx/care-fx (they override pose while a reaction plays)
 *   ambient.hold(id, seconds?) stop one animal wandering (while inspected / cared for); no seconds = until release
 *   ambient.release(id)        let it wander again
 * Wandering comes from SA.wander (driven by traits.movement). Idle animation: breathing (group scale), ear and tail
 * wiggle, blinking (eye scale). Animals keep breathing and blinking while held, only their travel stops.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var PART_HOLD = 5;   // seconds an animal stays put after a tap

  SA.render.createAmbient = function (opts) {
    var group = opts.animals, rigs = {}, t = 0;
    var data = {};
    SA.data.all('animals').forEach(function (a) { data[a.id] = a; });

    function base(m) {
      var pos = m.position || { y: 0, z: 0 };
      return { m: m, rx: m.rotation.x, ry: m.rotation.y, rz: m.rotation.z, sy: m.scale.y, py: pos.y, pz: pos.z };
    }

    // Current [x, z] of every other animal, so a wanderer can pick targets that keep its distance.
    function othersOf(id) {
      return function () {
        var pts = [];
        Object.keys(rigs).forEach(function (k) { if (k !== id) pts.push([rigs[k].g.position.x, rigs[k].g.position.z]); });
        return pts;
      };
    }

    group.children.forEach(function (g, i) {
      var a = data[g.userData.animalId];
      if (!a) return;
      var parts = function (name) { return g.children.filter(function (m) { return !m.userData.pick && m.userData.part === name; }).map(base); };
      rigs[a.id] = {
        g: g, phase: i * 1.7, ears: parts('orejas'), tail: parts('cola'), eyes: parts('ojos'), cheeks: parts('mejillas'),
        gait: SA.gait.kind(a.traits.movement), amp: 0, wings: parts('alas'), legs: parts('patas'),
        sx: g.scale.x, sy: g.scale.y, sz: g.scale.z,
        w: SA.wander.create({
          movement: a.traits.movement, biome: a.biome, home: { x: g.position.x, z: g.position.z },
          seed: 100 + i, avoid: opts.avoid, others: othersOf(a.id),
        }),
      };
    });

    // Flyers flap their alas (a gentle flutter while hovering, wide while travelling); walkers swing their patas from
    // the top while travelling and ease back to rest when stopped. Pick volumes are separate meshes and never move.
    function animateLimbs(r, moving, dt) {
      var G = SA.gait;
      r.amp = G.ease(r.amp, moving, Math.min(dt, 0.1));
      if (r.gait === 'flap') {
        r.wings.forEach(function (e) { e.m.rotation.z = e.rz + G.flap(t, r.amp, e.m.userData.side, r.phase); });
      } else if (r.gait === 'swing') {
        r.legs.forEach(function (e) {
          var a = G.swing(t, r.amp, e.m.userData.side, e.m.userData.index, r.phase), s = G.pivot(e.m.scale.y, a);
          e.m.rotation.x = e.rx + a;
          if (e.m.position) { e.m.position.y = e.py + s.y; e.m.position.z = e.pz + s.z; }
        });
      }
    }

    function update(dt) {
      t += Math.min(dt, 0.1);
      Object.keys(rigs).forEach(function (id) {
        var r = rigs[id], g = r.g, p = r.w.update(dt), idle = SA.wander.idle(t, r.phase);
        g.position.x = p.x;
        g.position.z = p.z;
        g.position.y = SA.map.groundHeight(p.x, p.z) + p.lift;
        g.rotation.y = p.heading;
        g.scale.set(r.sx / Math.sqrt(idle.breath), r.sy * idle.breath, r.sz / Math.sqrt(idle.breath));
        r.ears.forEach(function (e) { e.m.rotation.z = e.rz + idle.wiggle * 0.25 * (e.m.userData.side === 'right' ? -1 : 1); });
        r.tail.forEach(function (e) { e.m.rotation.y = e.ry + idle.wiggle * 0.5; });
        r.eyes.forEach(function (e) { e.m.scale.y = e.sy * (1 - 0.9 * idle.blink); });
        animateLimbs(r, p.moving, dt);
        // Rosy cheeks sparkle: a quick shimmering pulse (phase-shifted per cheek).
        r.cheeks.forEach(function (e, k) { e.m.scale.y = e.sy * (1 + 0.3 * Math.abs(Math.sin(t * 5 + r.phase + k * 1.3))); });
      });
    }

    function hold(id, seconds) { if (rigs[id]) rigs[id].w.hold(seconds); }
    function release(id) { if (rigs[id]) rigs[id].w.release(); }

    if (SA.picking && SA.picking.onPick) SA.picking.onPick(function (pick) { if (pick && pick.animalId) hold(pick.animalId, PART_HOLD); });

    return { update: update, hold: hold, release: release, rigs: rigs };
  };
})(typeof window !== 'undefined' ? window : globalThis);
