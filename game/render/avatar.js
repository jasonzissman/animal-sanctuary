/* SA.render.createAvatar(THREE) -> { group, update(dt, player) }: the procedural low-poly kid the player walks around as.
 * Built from boxes, a sphere and flat materials only. update() puts it at player { x, z, heading, moving, running? } (heading in
 * radians, forward = (sin, cos) on x/z), and while `moving` plays a run bob and an opposite arm/leg swing; it eases
 * back to a standing pose when stopped. The group sits at player.y (terrain height) with feet at its origin.
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
    function mat(c) { return new THREE.MeshLambertMaterial({ color: c }); }
    function box(w, h, d, c, x, y, z, parent) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(x, y, z);
      (parent || body).add(m);
      return m;
    }
    function limb(w, h, d, c, x, y, z) {   // pivots at its top so rotation.x swings it from the hip / shoulder
      var pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      body.add(pivot);
      box(w, h, d, c, 0, -h / 2, 0, pivot);
      return pivot;
    }
    var body = new THREE.Group();   // everything that bobs
    group.add(body);
    box(0.5, 0.55, 0.3, 0xe8553d, 0, 0.8, 0);                         // red shirt
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat(0xf2c9a0));
    head.position.set(0, 1.35, 0);
    body.add(head);
    box(0.5, 0.18, 0.5, 0x5a3a22, 0, 1.52, -0.02);                    // hair cap
    var eyeL = box(0.06, 0.06, 0.04, 0x222222, -0.09, 1.38, 0.24), eyeR = box(0.06, 0.06, 0.04, 0x222222, 0.09, 1.38, 0.24);
    var legL = limb(0.18, 0.5, 0.2, 0x3a5fa8, -0.13, 0.52, 0), legR = limb(0.18, 0.5, 0.2, 0x3a5fa8, 0.13, 0.52, 0);
    var armL = limb(0.14, 0.45, 0.16, 0xf2c9a0, -0.33, 1.04, 0), armR = limb(0.14, 0.45, 0.16, 0xf2c9a0, 0.33, 1.04, 0);
    var phase = 0, amount = 0, climbPhase = 0, lift = 0;   // amount eases 0..1 so the swing blends in and out

    function update(dt, player) {
      if (!player) return;
      group.position.set(player.x, player.y || 0, player.z);
      group.rotation.y = player.heading || 0;
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
      body.rotation.x = 0.25 * lift;
      body.position.y = Math.abs(Math.cos(phase)) * BOB * amount;
    }
    return { group: group, update: update, parts: { head: head, armL: armL, armR: armR, legL: legL, legR: legR, eyes: [eyeL, eyeR] } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
