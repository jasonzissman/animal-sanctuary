/* SA.render.createAmbient({ animals, avoid? }): ambient life for the animal groups from buildAnimals. No THREE calls
 * (it only moves groups/meshes), so it is testable with plain objects.
 *   ambient.update(dt)         call every frame BEFORE round-fx/care-fx (they override pose while a reaction plays)
 *   ambient.hold(id, seconds?) stop one animal wandering (while inspected / cared for); no seconds = until release
 *   ambient.release(id)        let it wander again (ignored while the animal is pinned)
 *   ambient.pin(id)            the rescue mission found it: it stays put (holds until unpin; care/tap releases do not free it)
 *   ambient.unpin(id)          the mission is done or replaced: it wanders again
 *   ambient.setCue(id, cue)     the care task's visible cue: 'tangled' (a flyer hops with drooping wings), 'limp' (uneven walk), 'tremble' (scared: a small fast jitter until calmed), 'sunk' (stuck in mud: sits lower and sinks a little more over time; rig.sunkBy is the depth), null
 *   ambient.setTangled(id, on)  alias of setCue(id, 'tangled' | null)
 *   ambient.flyLoop(id)         freed: one spinning circle in the air with wide wing beats, then normal again
 *   ambient.setAvoid(points)   replace the [[x, z, r?],...] points wanderers keep clear of (decor + placed props)
 * opts.trees = [{ x, z, y?, scale?, kind? }] are the canopies tree-dwellers (animal data perch: "tree") perch in.
 * Wandering comes from SA.wander (driven by traits.movement). Idle animation: breathing (group scale), ear and tail
 * wiggle, blinking (eye scale). Animals keep breathing and blinking while held, only their travel stops.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var PART_HOLD = 5;   // seconds an animal stays put after a tap
  var HOP_RATE = 7, HOP_HEIGHT = 0.18, DROOP = 0.6;            // tangled wing: hop speed (rad/s), height, wing droop (rad)
  var SUNK_BASE = 0.1, SUNK_RATE = 0.01, SUNK_MORE = 0.08, RISE_RATE = 0.5;   // cue 'sunk': start depth, extra depth per second, its cap, rise speed (world units)
  var TREMBLE_RATE = 47, TREMBLE_AMP = 0.035, TREMBLE_ROLL = 0.04;   // cue 'tremble': jitter speed (rad/s), sideways shake (world units) and roll (rad)
  var LOOP_SECONDS = 1.9, LOOP_RADIUS = 1.1, LOOP_LIFT = 1.3;   // freed bird's happy loop (shorter than care-flow NEXT_MS)

  SA.render.createAmbient = function (opts) {
    var group = opts.animals, rigs = {}, hoppers = {}, t = 0;
    var data = {};
    SA.data.all('animals').forEach(function (a) { data[a.id] = a; });

    function base(m) {
      var pos = m.position || { y: 0, z: 0 };
      return { m: m, rx: m.rotation.x, ry: m.rotation.y, rz: m.rotation.z, sy: m.scale.y, py: pos.y, pz: pos.z };
    }

    // Extra pieces of a swinging part (knees, feet: `also` rows in the data) have no swing of their own: each one follows the
    // nearest main piece (its leg), turning about that leg's top, so a foot stays at the bottom of its leg.
    function attachExtras(limbs) {
      var leaders = limbs.filter(function (e) { return !e.m.userData.extra; });
      limbs.forEach(function (e) {
        e.leader = e;
        if (!e.m.userData.extra || !leaders.length) return;
        var best = Infinity, px = (e.m.position && e.m.position.x) || 0;
        leaders.forEach(function (l) {
          var d = Math.abs(((l.m.position && l.m.position.x) || 0) - px) + Math.abs(l.pz - e.pz);
          if (d < best) { best = d; e.leader = l; }
        });
      });
      return limbs;
    }

    // Live [x, z, bodyRadius] of every other GROUND animal (wander position, so a flyLoop's circle does not count), so a
    // wanderer keeps SA.spacing.GAP from them on every step. Treetop animals live in the canopy and are left out.
    function othersOf(id) {
      return function () {
        var pts = [];
        Object.keys(rigs).forEach(function (k) {
          var o = rigs[k];
          if (k !== id && !o.perched) pts.push([o.wx, o.wz, o.r]);
        });
        return pts;
      };
    }

    // Tree dwellers (animal data perch: "tree") sit on canopy branches and hop between the trees of their biome
    // (SA.perch) instead of wandering on the ground. Adapts the hopper to the SA.wander shape update() expects.
    function perchWalker(a, g, i) {
      var h = SA.perch.create({
        biome: a.biome, trees: opts.trees, seed: 100 + i, home: { x: g.position.x, z: g.position.z },
        bodyRadius: SA.spacing ? SA.spacing.bodyRadius(a) : 0,
        others: function () {   // the other perchers' claimed spots (sitting + flying to), so no two share or land too close
          var pts = [];
          Object.keys(hoppers).forEach(function (k) { if (k !== a.id) pts = pts.concat(hoppers[k].claims()); });
          return pts;
        },
      });
      hoppers[a.id] = h;
      return {
        update: function (dt) { var p = h.update(dt); return { x: p.x, z: p.z, y: p.y, heading: p.heading, moving: p.hopping, perched: true }; },
        hold: h.hold, release: h.release, setAvoid: function () {},
      };
    }

    group.children.forEach(function (g, i) {
      var a = data[g.userData.animalId];
      if (!a) return;
      var parts = function (name) { return g.children.filter(function (m) { return !m.userData.pick && m.userData.part === name; }).map(base); };
      rigs[a.id] = {
        g: g, phase: i * 1.7, ears: parts('orejas'), tail: parts('cola'), eyes: parts('ojos'), cheeks: parts('mejillas'),
        gait: SA.gait.kind(a.traits.movement), amp: 0, wings: parts('alas'), legs: attachExtras(parts('patas')),
        sx: g.scale.x, sy: g.scale.y, sz: g.scale.z,
        wx: g.position.x, wz: g.position.z, r: SA.spacing ? SA.spacing.bodyRadius(a) : 0, perched: a.perch === 'tree' && !!SA.perch,
        w: a.perch === 'tree' && SA.perch ? perchWalker(a, g, i) : SA.wander.create({
          movement: a.traits.movement, biome: a.biome, home: { x: g.position.x, z: g.position.z },
          seed: 100 + i, radius: g.userData.wanderRadius, avoid: opts.avoid, others: othersOf(a.id), bodyRadius: SA.spacing ? SA.spacing.bodyRadius(a) : 0,
        }),
      };
      if (a.perch === 'tree' && SA.perch) g.userData.perched = true;   // up in a canopy: never blocks the walking player
    });

    // Flyers flap their alas (a gentle flutter while hovering, wide while travelling); walkers swing their patas from
    // the top while travelling and ease back to rest when stopped. Pick volumes are separate meshes and never move.
    function animateLimbs(r, moving, dt) {
      var G = SA.gait;
      r.amp = G.ease(r.amp, moving, Math.min(dt, 0.1));
      if (r.gait === 'flap' && r.cue === 'tangled' && !r.loop) {
        // a leaf is stuck: the wings droop and do not flap (the bird hops, see update)
        r.wings.forEach(function (e) { e.m.rotation.z = e.rz - (e.m.userData.side === 'right' ? -1 : 1) * DROOP; });
      } else if (r.gait === 'flap') {
        r.wings.forEach(function (e) { e.m.rotation.z = e.rz + G.flap(t, r.amp, e.m.userData.side, r.phase); });
      } else if (r.gait === 'swing') {
        // cue 'limp': the first paw (the one care-fx puts the thorn on) hardly swings, the others carry on
        var sore = r.cue === 'limp' && r.legs.length ? r.legs[0].leader : null;
        r.legs.forEach(function (e) {
          var l = e.leader, a = G.swing(t, r.amp, l.m.userData.side, l.m.userData.index, r.phase) * (l === sore ? G.LIMP_SORE : 1);
          e.m.rotation.x = e.rx + a;
          if (!e.m.position) return;
          if (l === e) { var s = G.pivot(e.sy, a); e.m.position.y = e.py + s.y; e.m.position.z = e.pz + s.z; }
          else { var q = G.rotateAbout(l.py + l.sy / 2, l.pz, e.py, e.pz, a); e.m.position.y = q.y; e.m.position.z = q.z; }
        });
      }
    }

    function update(dt) {
      t += Math.min(dt, 0.1);
      Object.keys(rigs).forEach(function (id) {
        var r = rigs[id], g = r.g, p = r.w.update(dt), idle = SA.wander.idle(t, r.phase);
        var spin = 0, loopLift = 0, moving = p.moving;
        r.wx = p.x; r.wz = p.z;
        g.position.x = p.x;
        g.position.z = p.z;
        // Tangled wing: the bird hops on the ground instead of hovering. Freed: it circles once, spinning, up in the air.
        var lift = r.cue === 'tangled' ? Math.abs(Math.sin(t * HOP_RATE + r.phase)) * HOP_HEIGHT : p.perched || r.cue === 'limp' || r.cue === 'sunk' ? 0 : p.lift;
        // Limp: the body sinks and leans on every other step; it walks on the ground (flyers too) and steps in place when held.
        var limp = r.cue === 'limp' ? SA.gait.limp(t, r.phase) : null;
        // Sunk in mud: sits lower and sinks a little more every second (capped); once freed it rises back smoothly.
        if (r.cue === 'sunk') { r.sink = Math.min(SUNK_MORE, (r.sink || 0) + SUNK_RATE * Math.min(dt, 0.1)); r.sunkBy = SUNK_BASE + r.sink; }
        else if (r.sunkBy) { r.sink = 0; r.sunkBy = Math.max(0, r.sunkBy - RISE_RATE * Math.min(dt, 0.1)); }
        // Scared: a small fast shake (position + roll); it stops the moment the cue clears.
        var shake = r.cue === 'tremble' ? Math.sin(t * TREMBLE_RATE + r.phase) : 0;
        if (shake) { g.position.x += shake * TREMBLE_AMP; g.position.z += Math.cos(t * TREMBLE_RATE * 1.3 + r.phase) * TREMBLE_AMP * 0.6; }
        if (limp) { g.rotation.z = limp.roll; r.limped = true; }
        else if (shake) { g.rotation.z = shake * TREMBLE_ROLL; r.limped = true; }
        else if (r.limped) { g.rotation.z = 0; r.limped = false; }
        if (r.loop) {
          r.loop.t += Math.min(dt, 0.1);
          var u = Math.min(1, r.loop.t / LOOP_SECONDS), a = u * Math.PI * 2;
          g.position.x += LOOP_RADIUS * (Math.cos(a) - 1);
          g.position.z += LOOP_RADIUS * Math.sin(a);
          spin = a; loopLift = LOOP_LIFT * Math.sin(u * Math.PI); moving = true;
          if (u >= 1) r.loop = null;
        }
        g.position.y = (p.perched ? p.y : SA.map.groundHeight(p.x, p.z)) + lift + loopLift - (limp ? limp.dip : 0) - (r.sunkBy || 0);
        g.rotation.y = p.heading + spin;
        g.scale.set(r.sx / Math.sqrt(idle.breath), r.sy * idle.breath, r.sz / Math.sqrt(idle.breath));
        r.ears.forEach(function (e) { e.m.rotation.z = e.rz + idle.wiggle * 0.25 * (e.m.userData.side === 'right' ? -1 : 1); });
        r.tail.forEach(function (e) { e.m.rotation.y = e.ry + idle.wiggle * 0.5; });
        r.eyes.forEach(function (e) { e.m.scale.y = e.sy * (1 - 0.9 * idle.blink); });
        animateLimbs(r, r.cue === 'limp' || (r.cue !== 'sunk' && moving && !(r.cue === 'tangled' && !r.loop)), dt);
        // Rosy cheeks sparkle: a quick shimmering pulse (phase-shifted per cheek).
        r.cheeks.forEach(function (e, k) { e.m.scale.y = e.sy * (1 + 0.3 * Math.abs(Math.sin(t * 5 + r.phase + k * 1.3))); });
      });
    }

    function hold(id, seconds) { if (rigs[id]) rigs[id].w.hold(seconds); }
    // A pinned animal (its rescue mission is running) never wanders: release() (care finishing, tap holds ending) is ignored
    // until unpin(), so it stays exactly where it was found, from the find until the photo.
    function release(id) { if (rigs[id] && !rigs[id].pinned) rigs[id].w.release(); }
    function pin(id) { if (rigs[id]) { rigs[id].pinned = true; rigs[id].w.hold(); } }
    function unpin(id) { if (rigs[id]) { rigs[id].pinned = false; rigs[id].w.release(); } }
    // Visible cue of a care task (action.cue, picked by value, never by animal id): 'tangled' = hops with drooping wings instead
    // of flying; 'limp' = uneven walk (SA.gait.limp, the first paw hardly swings); null = normal again.
    function setCue(id, cue) { if (rigs[id]) rigs[id].cue = cue || null; }
    // The old alias: setTangled(id, false) only clears a tangled cue, never someone else's limp.
    function setTangled(id, on) { if (on) setCue(id, 'tangled'); else if (rigs[id] && rigs[id].cue === 'tangled') setCue(id, null); }
    // Freed: one happy spinning circle in the air with wide wing beats (LOOP_SECONDS), then back to normal.
    function flyLoop(id) { if (rigs[id]) { rigs[id].cue = null; rigs[id].loop = { t: 0 }; } }

    if (SA.picking && SA.picking.onPick) SA.picking.onPick(function (pick) { if (pick && pick.animalId) hold(pick.animalId, PART_HOLD); });

    function setAvoid(points) { Object.keys(rigs).forEach(function (id) { rigs[id].w.setAvoid(points); }); }

    return { update: update, hold: hold, release: release, pin: pin, unpin: unpin, setCue: setCue, setTangled: setTangled, flyLoop: flyLoop, setAvoid: setAvoid, rigs: rigs };
  };
})(typeof window !== 'undefined' ? window : globalThis);
