/* SA.render.createAvatar(THREE) -> { group, update(dt, player) }: the procedural low-poly kid the player walks around as.
 * Built from boxes, squashed spheres and flat materials only (round head with face and hair, neck, rounded shirt, hands, shoes, backpack). update() puts it at player { x, z, heading, moving, running? } (heading in
 * radians, forward = (sin, cos) on x/z), and while `moving` plays a run bob and an opposite arm/leg swing; it eases
 * back to a standing pose when stopped. player.lift (SA.jump, height above y) raises it for a hop, with a squash-and-stretch
 * (crouch at takeoff and landing, stretch while rising) on the body. The group sits at player.y (terrain height) with feet at its origin.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var CLIMB_RATE = 7;   // climb animation: hand-over-hand cycles per second ~1
  var RUN_GAIT = 2.2;   // stride speed multiplier while player.running
  var SWING = 0.9, STRIDE = 9, BOB = 0.07;   // arm/leg swing (rad), steps per second, body bob height

  SA.render.createAvatar = function (THREE) {
    var group = new THREE.Group();
    group.name = 'avatar';
    var mats = [];   // every material, so a cactus prick (player.hurt) can flash them red (AS-0156)
    var cache = {};   // one flat material per colour
    function mat(c) {
      if (!cache[c]) { cache[c] = new THREE.MeshLambertMaterial({ color: c }); mats.push(cache[c]); }
      return cache[c];
    }
    function place(m, x, y, z, parent) { m.position.set(x, y, z); (parent || body).add(m); return m; }
    function box(w, h, d, c, x, y, z, parent) { return place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)), x, y, z, parent); }
    function ball(rx, ry, rz, c, x, y, z, parent) {   // a rounded blob: a sphere squashed into an ellipsoid
      var m = place(new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat(c)), x, y, z, parent);
      m.scale.set(rx, ry, rz);
      return m;
    }
    function limb(x, y, z) {   // pivots at its top so rotation.x swings it from the hip / shoulder
      var pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      body.add(pivot);
      return pivot;
    }
    var SKIN = 0xf2c9a0, SHIRT = 0xe8553d, SHORTS = 0x3a5fa8, HAIR = 0x5a3a22, SHOE = 0xf5f0e6, SOLE = 0x8a2f2f, PACK = 0x3fa56b;
    var body = new THREE.Group();   // everything that bobs
    group.add(body);
    // Torso: a rounded shirt with a collar and a chest badge; a neck joins it to the head.
    ball(0.27, 0.3, 0.19, SHIRT, 0, 0.82, 0);
    ball(0.16, 0.06, 0.16, 0xffffff, 0, 1.09, 0.02);                  // collar
    box(0.1, 0.1, 0.1, SKIN, 0, 1.13, 0);                             // neck
    box(0.13, 0.13, 0.03, 0xffd447, 0, 0.9, 0.175).rotation.z = Math.PI / 4;   // chest badge
    box(0.46, 0.06, 0.34, SHORTS, 0, 0.58, 0);                        // waistband under the shirt
    // Head: round, with ears, nose, cheeks, eyes with sparkles, eyebrows and a smile.
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), mat(SKIN));
    head.position.set(0, 1.35, 0);
    body.add(head);
    ball(0.045, 0.06, 0.03, SKIN, -0.26, 1.35, 0); ball(0.045, 0.06, 0.03, SKIN, 0.26, 1.35, 0);   // ears
    ball(0.04, 0.035, 0.04, 0xe8a98a, 0, 1.3, 0.255);                 // nose
    ball(0.045, 0.03, 0.02, 0xf29a9a, -0.15, 1.29, 0.21); ball(0.045, 0.03, 0.02, 0xf29a9a, 0.15, 1.29, 0.21);   // cheeks
    var eyeL = ball(0.04, 0.05, 0.025, 0x222222, -0.09, 1.38, 0.235), eyeR = ball(0.04, 0.05, 0.025, 0x222222, 0.09, 1.38, 0.235);
    ball(0.014, 0.014, 0.01, 0xffffff, -0.078, 1.395, 0.255); ball(0.014, 0.014, 0.01, 0xffffff, 0.102, 1.395, 0.255);   // sparkles
    box(0.09, 0.022, 0.03, HAIR, -0.09, 1.45, 0.225).rotation.z = 0.15;   // eyebrows
    box(0.09, 0.022, 0.03, HAIR, 0.09, 1.45, 0.225).rotation.z = -0.15;
    box(0.06, 0.02, 0.03, 0xb4423a, 0, 1.22, 0.245);                  // smile: a low middle and two lifted corners
    box(0.03, 0.02, 0.03, 0xb4423a, -0.05, 1.235, 0.24).rotation.z = -0.5;
    box(0.03, 0.02, 0.03, 0xb4423a, 0.05, 1.235, 0.24).rotation.z = 0.5;
    // Hair: a soft cap over the top and back, a fringe and two tufts (kept clear of the face).
    ball(0.28, 0.24, 0.29, HAIR, 0, 1.43, -0.05);
    ball(0.2, 0.07, 0.1, HAIR, 0, 1.55, 0.12);
    ball(0.07, 0.1, 0.07, HAIR, -0.2, 1.52, -0.02); ball(0.07, 0.1, 0.07, HAIR, 0.2, 1.52, -0.02);
    // Small backpack with a pocket and shoulder straps.
    box(0.32, 0.38, 0.14, PACK, 0, 0.85, -0.22);
    box(0.2, 0.14, 0.05, 0x2f8556, 0, 0.74, -0.31);
    box(0.045, 0.34, 0.03, 0x2f8556, -0.14, 0.88, 0.165); box(0.045, 0.34, 0.03, 0x2f8556, 0.14, 0.88, 0.165);
    // Legs: shorts, bare knee, sock and a round white shoe (0.5 long from the hip pivot, as before).
    function leg(x) {
      var l = limb(x, 0.54, 0);
      box(0.2, 0.22, 0.22, SHORTS, 0, -0.1, 0, l);
      box(0.12, 0.14, 0.13, SKIN, 0, -0.26, 0, l);
      box(0.13, 0.08, 0.14, 0xffffff, 0, -0.37, 0, l);                // sock
      ball(0.095, 0.07, 0.15, SHOE, 0, -0.45, 0.04, l);               // shoe
      ball(0.08, 0.025, 0.12, SOLE, 0, -0.5, 0.045, l);               // sole
      return l;
    }
    var legL = leg(-0.13), legR = leg(0.13);
    // Arms: short sleeve, bare arm and a round hand (the fist is ~0.45 below the shoulder; hand items attach to the pivot, hand-item.js).
    function arm(x) {
      var a = limb(x, 1.04, 0);
      ball(0.09, 0.1, 0.09, SHIRT, 0, -0.04, 0, a);
      box(0.11, 0.2, 0.12, SKIN, 0, -0.22, 0, a);
      ball(0.075, 0.075, 0.075, SKIN, 0, -0.43, 0, a);                // hand
      return a;
    }
    var armL = arm(-0.34), armR = arm(0.34);
    var squash = 0, squashV = 0, prevAir = false, prevLift = 0;   // squash < 0 = squashed flat, > 0 = stretched tall (a spring toward 0)
    var phase = 0, amount = 0, climbPhase = 0, lift = 0;   // amount eases 0..1 so the swing blends in and out

    function update(dt, player) {
      if (!player) return;
      var hop = player.lift || 0, air = hop > 0;   // SA.jump lift above the standing height
      group.position.set(player.x, (player.y || 0) + hop, player.z);
      group.rotation.y = player.heading || 0;
      var hurt = player.hurt || 0;   // 1 -> 0 after a cactus prick: red flash and a quick side-to-side shake
      mats.forEach(function (m) { if (m.emissive && m.emissive.setRGB) m.emissive.setRGB(hurt * 0.75, 0, 0); });
      group.position.x += hurt * Math.sin(hurt * 40) * 0.08;
      dt = Math.max(0, Math.min(0.1, dt || 0));
      amount += ((player.moving ? 1 : 0) - amount) * Math.min(1, dt * 12);
      var gait = player.running ? RUN_GAIT : 1;   // running: quicker steps, bigger swing and bob
      if (player.moving) phase += dt * STRIDE * gait;
      var climbing = player.climb === 'up' || player.climb === 'down';
      if (climbing) climbPhase += dt * CLIMB_RATE;
      lift += ((climbing ? 1 : 0) - lift) * Math.min(1, dt * 10);
      var s = Math.sin(phase) * amount * (gait > 1 ? 1.2 : 1), c = Math.sin(climbPhase) * lift;
      // Climbing: arms reach up and alternate, knees pump, the body leans into the trunk.
      armL.rotation.x = s * SWING * (1 - lift) - (2.6 - c) * lift; armR.rotation.x = -s * SWING * (1 - lift) - (2.6 + c) * lift;
      legL.rotation.x = -s * SWING * (1 - lift) + c * 0.9; legR.rotation.x = s * SWING * (1 - lift) - c * 0.9;
      body.rotation.x = 0.25 * lift + (player.running ? 0.12 * amount : 0);   // leans into a run
      body.position.y = Math.abs(Math.cos(phase)) * BOB * amount;
      // Squash-and-stretch on a hop: a crouch kick at takeoff and at landing, a springy return, and a stretch while rising.
      if (air && !prevAir) squashV -= 7;
      if (!air && prevAir) squashV -= 9;
      var vy = dt > 0 ? (hop - prevLift) / dt : 0;
      var want = air ? Math.max(-0.1, Math.min(0.25, vy * 0.035)) : 0;
      squashV += (-160 * (squash - want) - 16 * squashV) * dt;
      squash = Math.max(-0.4, Math.min(0.3, squash + squashV * dt));
      body.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
      prevAir = air; prevLift = hop;
    }
    return { group: group, update: update, parts: { body: body, head: head, armL: armL, armR: armR, legL: legL, legR: legR, eyes: [eyeL, eyeR], hands: [armL.children[2], armR.children[2]], shoes: [legL.children[3], legR.children[3]] } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
