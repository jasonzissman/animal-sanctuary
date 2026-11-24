/* SA.render.createMissionHome(THREE, { scene, thing?, canvas?, camera?, getPlayer?, solids? }): draws Mission 9's build spot and the rabbit family
 * waiting beside it (AS-0350). AS-0352: on a 'place' step a tap on the spot (an invisible pick volume of render/home-build.js) calls thing.put(player);
 * each placed layer (view().layers) pops into view (a drop and a bounce), a wrong item wobbles the home, and once view().built the family walks in. It follows SA.missionHome (pure: where the spot is and where each rabbit sits). The spot is a procedural low-poly
 * ground marker: a round patch of bare earth, four corner stakes with little pennants, and a glow ring that pulses on top so it reads from far away.
 * The family goes through the normal animal path (SA.render.animalBuilder) from the animal ids in the data; the kits hop a little on the spot.
 * Nothing is drawn unless the mission runs. Nothing here knows a mission id or an animal id.
 * On the 'photo' step a tap on any rabbit calls thing.snap(player) (la cámara is put in hand on a first tap, like the other photo missions); only the
 * family's own meshes are raycast, never the whole scene.
 *   update(dt)   once per frame; returns the group it manages
 *   tapAt(x, y)  client coordinates -> true when a rabbit was hit and the photo counted
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var EARTH = 0x8a6a45, STAKE = 0x6b4a2b, FLAG = 0xff8a3d, GLOW = 0xffe08a;

  // The marker at the spot's centre (group-local, origin on the ground): earth patch, four stakes with pennants, and the glow ring (returned for pulsing).
  function buildMarker(THREE, r) {
    var g = new THREE.Group(), lam = function (c) { return new THREE.MeshLambertMaterial({ color: c }); };
    var patch = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.85, 0.1, 8), lam(EARTH));
    patch.position.y = 0.06;
    g.add(patch);
    for (var i = 0; i < 4; i++) {
      var a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a) * r * 0.78, z = Math.sin(a) * r * 0.78;
      var stake = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), lam(STAKE));
      stake.position.set(x, 0.45, z);
      var flag = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 3), lam(FLAG));
      flag.position.set(x, 0.95, z);
      flag.rotation.z = Math.PI / 2;
      g.add(stake); g.add(flag);
    }
    var ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 4, 20), new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.16;
    g.add(ring);
    return { group: g, ring: ring };
  }

  SA.render.createMissionHome = function (THREE, opts) {
    var thing = opts.thing || SA.missionHome;
    if (opts.solids && thing.setSolids) thing.setSolids(opts.solids);
    var build = SA.render.animalBuilder(THREE);
    var group = new THREE.Group();
    group.name = 'missionHome';
    opts.scene.add(group);
    var key = null, rabbits = [], ring = null, t = 0, house = null, shown = {}, popAt = {}, wobbles = 0, wobbleT = 9, wasBuilt = false, builtT = 0;

    function rebuild(cur) {
      while (group.children.length) group.remove(group.children[0]);
      rabbits = []; ring = null; house = null; shown = {}; popAt = {}; wobbles = 0; wobbleT = 9; wasBuilt = false; builtT = 0;
      if (!cur) return;
      var mk = buildMarker(THREE, cur.spot.r);
      mk.group.position.set(cur.spot.x, cur.spot.y, cur.spot.z);
      group.add(mk.group);
      ring = mk.ring;
      if (SA.render.buildHome) {          // the home that grows one layer per 'place' step (AS-0352), turned so its doorway faces the way you come from
        house = SA.render.buildHome(THREE, cur.spot.r);
        house.group.position.set(cur.spot.x, cur.spot.y, cur.spot.z);
        house.group.rotation.y = cur.spot.face;
        group.add(house.group);
      }
      cur.family.forEach(function (f, i) {
        var spec = SA.data.get('animals', f.animal);
        if (!spec) return;
        var m = build(spec, { id: spec.id, x: f.x, z: f.z, y: f.y, rotY: f.rotY });
        m.scale.set(f.scale, f.scale, f.scale);
        group.add(m);
        rabbits.push({ m: m, x: f.x, y: f.y, z: f.z, cx: f.x, cy: f.y, cz: f.z, rotY: f.rotY, inside: f.inside, baby: f.role === 'baby', phase: i * 1.7 });
      });
    }

    var ease = function (u) { var c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };   // easeOutBack: a little overshoot

    // The layers on the home pop in one at a time (a drop and a bounce); a wrong item wobbles the whole home; once it is built the family walks in.
    function animateHome(v, dt) {
      if (!house) return;
      var layers = (v && v.layers) || [];
      Object.keys(house.layers).forEach(function (k) {
        var on = layers.indexOf(k) >= 0, node = house.layers[k];
        if (on && !shown[k]) { shown[k] = true; popAt[k] = t; node.visible = true; }
        if (!on && shown[k]) { shown[k] = false; node.visible = false; }
        if (on) {
          var u = Math.min(1, (t - popAt[k]) / 0.55), e = ease(u);
          node.scale.set(0.6 + 0.4 * e, 0.6 + 0.4 * e, 0.6 + 0.4 * e);
          node.position.y = (1 - Math.min(1, u * 1.4)) * 1.1;
        }
      });
      if (v && v.wobbles !== wobbles) { wobbles = v.wobbles; wobbleT = 0; }
      wobbleT += dt || 0;
      var w = wobbleT < 0.6 ? Math.sin(wobbleT * 34) * 0.07 * (1 - wobbleT / 0.6) : 0;
      house.group.rotation.z = w;
      house.group.rotation.x = w * 0.6;
      var built = !!(v && v.built);
      if (built && !wasBuilt) builtT = 0;
      wasBuilt = built;
      if (built) builtT += dt || 0;
    }

    // Walk each rabbit toward its place inside the home (about 1.6 per second, the kits hopping on the way), then settle facing out the doorway.
    function moveIn(dt) {
      rabbits.forEach(function (e) {
        var home = wasBuilt && builtT > 0.6 && e.inside;       // let the last layer pop in first
        var tx = home ? e.inside.x : e.x, tz = home ? e.inside.z : e.z, dx = tx - e.cx, dz = tz - e.cz, d = Math.hypot(dx, dz);
        var step = Math.min(d, 1.6 * (dt || 0));
        if (d > 0.02) { e.cx += dx / d * step; e.cz += dz / d * step; e.walk = true; e.rotY = Math.atan2(dx, dz); }
        else if (home) { e.walk = false; e.rotY = e.inside.rotY; }
        if (home) e.cy = e.inside.y;
        e.m.position.x = e.cx; e.m.position.z = e.cz; e.m.rotation.y = e.rotY;
      });
    }

    function update(dt) {
      var cur = thing.current();
      var k = cur ? cur.key : null;
      if (k !== key) { key = k; rebuild(cur); }
      t += dt || 0;
      var v = cur && thing.view ? thing.view() : null;
      if (ring) {
        var s = 1 + Math.sin(t * 2.4) * (v && v.place ? 0.12 : 0.06);
        ring.scale.set(s, s, 1);
        ring.material.opacity = 0.6 + Math.sin(t * 2.4) * 0.25;
      }
      animateHome(v, dt);
      moveIn(dt);
      rabbits.forEach(function (e) {
        e.m.position.y = e.cy +(e.baby || e.walk ? Math.abs(Math.sin(t * (e.walk ? 7 : 3) + e.phase)) * (e.walk ? 0.12 : 0.08) : 0);
      });
      return group;
    }

    function rayAt(x, y) {
      var r = opts.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      var rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)), opts.camera);
      return rc;
    }

    // A tap on the build spot (or the home) on a 'place' step puts the item in hand on it (thing.put).
    function tapHome(x, y) {
      if (!house) return false;
      var rc = rayAt(x, y);
      if (!rc) return false;
      house.group.updateMatrixWorld(true);
      if (!rc.intersectObject(house.pick, false).length) return false;
      var res = thing.put(opts.getPlayer && opts.getPlayer());
      return !!(res && res.ok);
    }

    function tapAt(x, y) {
      if (!rabbits.length || !opts.canvas || !opts.camera || (SA.picking && SA.picking.isPaused && SA.picking.isPaused())) return false;
      var v = thing.view ? thing.view() : null;
      if (v && v.place && thing.put) return tapHome(x, y);
      if (!thing.snap || !v || !v.photo) return false;
      var r = opts.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)), opts.camera);
      var nodes = rabbits.map(function (e) { e.m.updateMatrixWorld(true); return e.m; });
      if (!ray.intersectObjects(nodes, true).length) return false;
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
