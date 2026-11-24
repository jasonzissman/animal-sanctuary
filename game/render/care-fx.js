/* SA.render.createCareFx(THREE, { animals }): the 3D side of a care task (procedural mud spots + sparkles).
 * The camera is never moved: care happens from the chase camera behind the player.
 *   fx.show(task)        brown mud spots on every instance of task.part
 *   fx.scrub(spotsLeft)  keeps only the first `spotsLeft` spots; each removed spot bursts into splash sparkles
 *   fx.hide()            removes any leftover spots
 *   fx.free(animalId, cue)  a cue task finished: clears the animal's cue (ambient.setCue null); cue 'tangled' also starts the
 *                        happy flyLoop. fx.fly(animalId) is free(animalId, 'tangled').
 *                        task.cue picks the look: 'tangled' = flat green leaf bits on ONE wing and the bird hops, not flies;
 *                        'limp' = a small thorn on ONE paw and the animal limps (never chosen by animal id)
 *                        'tremble' = no bits: the animal shakes (ambient) until free() clears the cue
 *                        'sunk' = a flat brown mud puddle under the animal (it follows the animal's depth, ambient rig.sunkBy) with
 *                        3 mud lumps; each tug splashes one off; free() shrinks the puddle away while the animal rises
 *   opts.ambient         optional SA.render.createAmbient: the animal being cared for stands still until hide()
 *   fx.update(dt)        call every frame (animates the sparkle particles)
 * Spots are small flattened spheres added to the animal group (part meshes are non-uniformly scaled, so they are
 * not children of the part), placed on the part's surface from its position and scale.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var MUD = 0x6b4423, MUD_DARK = 0x4d3019, SPARK = [0xffffff, 0xfff2a8, 0x9fdcff];
  var LIFE = 0.8;

  SA.render.createCareFx = function (THREE, opts) {
    var animals = opts.animals, ambient = opts.ambient || null, held = null;
    var geo = new THREE.SphereGeometry(1, 7, 5);
    var mats = [new THREE.MeshLambertMaterial({ color: MUD }), new THREE.MeshLambertMaterial({ color: MUD_DARK })];
    var scrapeMats = [new THREE.MeshLambertMaterial({ color: 0xd9534f }), new THREE.MeshLambertMaterial({ color: 0xb03a36 })];
    var tangleMats = [new THREE.MeshLambertMaterial({ color: 0xb08a4a }), new THREE.MeshLambertMaterial({ color: 0x8a6a34 })];
    var leafMats = [new THREE.MeshLambertMaterial({ color: 0x4caf50 }), new THREE.MeshLambertMaterial({ color: 0x7a5a2e })];   // leaf, twig
    var thornGeo = new THREE.ConeGeometry(0.4, 1.4, 5);
    var thornMats = [new THREE.MeshLambertMaterial({ color: 0x6d4c2a }), new THREE.MeshLambertMaterial({ color: 0x3f5a2a })];   // brown thorn, green base
    var bandageMat =new THREE.MeshLambertMaterial({ color: 0xf6e3c4 }), crossMat = new THREE.MeshLambertMaterial({ color: 0xe8706b });
    var group = null, spots = [], bits = [], lastSpot = null, puddle = null;
    var seed = 1;
    function rand() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

    function clear() {
      spots.forEach(function (s) { if (s.parent) s.parent.remove(s); });
      spots = [];
      lastSpot = null;
      removePuddle();
    }

    function removePuddle() { if (puddle && puddle.parent) puddle.parent.remove(puddle); puddle = null; }

    // Cue 'sunk': a flat brown disc on the ground around the body, plus mud lumps on it (the spots a tug splashes away).
    function addPuddle(g, count) {
      var R = 0.6;
      g.children.forEach(function (m) {
        if (m.userData.pick || !m.userData.part) return;
        R = Math.max(R, Math.sqrt(m.position.x * m.position.x + m.position.z * m.position.z) + Math.max(m.scale.x, m.scale.z) * 0.5);
      });
      var T = 0.03 / (g.scale.y || 1);
      puddle = new THREE.Group();
      var disc = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16), mats[0]);
      disc.scale.set(R * 1.15, T, R * 1.15);
      puddle.add(disc);
      puddle.userData = { sunkPuddle: true, leaving: false };
      for (var i = 0; i < count; i++) {
        var lump = new THREE.Mesh(geo, mats[1]), a = (i / count) * Math.PI * 2 + 0.5;
        lump.scale.set(R * 0.14, R * 0.08, R * 0.14);
        lump.position.set(Math.cos(a) * R * 0.85, T, Math.sin(a) * R * 0.85);
        lump.userData = { mud: true, index: i };
        puddle.add(lump);
        spots.push(lump);
      }
      g.add(puddle);
      placePuddle();
    }

    // Keeps the puddle on the ground while the animal sits lower (group-local y = depth / the group's height scale).
    function placePuddle() {
      if (!puddle || !group) return;
      var rig = ambient && ambient.rigs && ambient.rigs[group.name];
      puddle.position.y = ((rig && rig.sunkBy) || 0) / (group.scale.y || 1) + 0.01;
    }

    function partMeshes(g, part) {
      return g.children.filter(function (m) { return !m.userData.pick && m.userData.part === part; });
    }

    function show(task) {
      clear();
      group = SA.render.instances.get(animals, task.animalId);   // AS-0255: the tapped / nearest instance of the species; ambient is keyed by group.name
      if (!group) return false;
      var meshes = partMeshes(group, task.part);
      if (task.part && !meshes.length) return false;      // a feed task has no part: only the zoom below
      // The look follows task.cue ('tangled' leaf bits, 'limp' thorn bits), never the animal: both sit on ONE part mesh.
      var cue = task.cue || (task.tangled ? 'tangled' : null);
      var palette = task.kind === 'curar' ? scrapeMats : task.kind === 'cepillar' ? tangleMats
        : cue === 'tangled' ? leafMats : cue === 'limp' ? thornMats : mats;   // sore / tangled / leaf / thorn / muddy
      var count = task.kind === 'acariciar' ? 0 : task.spots;      // petting la barriga has nothing to wash off
      if (cue && ambient && ambient.setCue) ambient.setCue(group.name, cue);   // the bird hops / the animal limps
      else if (cue === 'tangled' && ambient && ambient.setTangled) ambient.setTangled(group.name, true);
      if (cue === 'sunk') { addPuddle(group, count); count = 0; }      // no spots on the paws: the mud is under the animal
      for (var i = 0; task.part && i < count; i++) {
        var m = cue ? meshes[0] : meshes[i % meshes.length];      // a stuck leaf / thorn is on ONE wing / paw
        var spot = new THREE.Mesh(cue === 'limp' ? thornGeo : geo, palette[i % 2]);
        // a point on the ellipsoid around the part, biased upward so the mud shows from the tilted camera
        var a = rand() * Math.PI * 2, el = rand() * 1.1 - 0.1, h = Math.sqrt(Math.max(0, 1 - el * el));
        spot.position.set(m.position.x + Math.cos(a) * h * m.scale.x * 0.5,
          m.position.y + el * m.scale.y * 0.5, m.position.z + Math.sin(a) * h * m.scale.z * 0.5);
        var r = Math.min(0.14, Math.max(0.05, Math.min(m.scale.x, m.scale.y, m.scale.z) * 0.4)) * (0.8 + rand() * 0.4);
        if (cue === 'tangled') { r *= 1.3; spot.scale.set(r * 1.8, r * 0.3, r * 1.1); spot.rotation.set(0, a, 0.4 * (i - 1)); }   // flat leaf bits
        else if (cue === 'limp') {                  // a small thorn: a thin cone sticking out sideways near the foot of the paw
          spot.position.set(m.position.x + Math.cos(a) * m.scale.x * 0.5, m.position.y - m.scale.y * 0.25 + i * 0.05, m.position.z + Math.sin(a) * m.scale.z * 0.5);
          spot.scale.setScalar(Math.max(0.08, Math.min(0.16, r * 1.6)));
          spot.rotation.set(0, 0, Math.cos(a) >= 0 ? -1.2 : 1.2);
        } else spot.scale.set(r, r * 0.6, r);
        spot.userData = { mud: true, index: i };
        group.add(spot);
        spots.push(spot);
      }
      if (ambient) { if (held) ambient.release(held); held = group.name; ambient.hold(held); }
      return true;
    }

    function burst(at) {
      for (var i = 0; i < 6; i++) {
        var b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: SPARK[i % SPARK.length], transparent: true }));
        b.scale.setScalar(0.07);
        b.position.copy(at);
        group.localToWorld(b.position);
        b.userData = { vx: (rand() - 0.5) * 3, vy: 2 + rand() * 2, vz: (rand() - 0.5) * 3, t: 0 };
        group.parent.add(b);
        bits.push(b);
      }
    }

    function scrub(spotsLeft) {
      while (spots.length > Math.max(0, spotsLeft)) {
        var s = spots.pop();
        lastSpot = s.position.clone();
        if (group && group.parent) burst(s.parent === puddle ? s.position.clone().add(puddle.position) : s.position);
        if (s.parent) s.parent.remove(s);
      }
    }

    // Heal: a small beige bandage with a pink cross where the scrape was; it stays until hide().
    function bandage() {
      if (!group || !lastSpot) return;
      var b = new THREE.Mesh(new THREE.BoxGeometry(1, 0.45, 0.8), bandageMat);
      var c = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.9), crossMat);
      b.add(c);
      b.position.copy(lastSpot);
      b.scale.setScalar(0.22);
      b.rotation.y = 0.6;
      b.userData = { mud: true, bandage: true };
      group.add(b);
      spots.push(b);
    }

    function uncue(animalId) {
      if (ambient.setCue) ambient.setCue(animalId, null);
      else if (ambient.setTangled) ambient.setTangled(animalId, false);
    }

    // The task's cue is solved ('limp': the animal walks normally at once; 'tangled': it also flies a happy loop).
    function free(animalId, cue) {
      if (puddle) { puddle.userData.leaving = true; if (!ambient) removePuddle(); }     // the puddle shrinks away as the animal rises
      if (!ambient) return;
      var key = held || animalId;   // the instance the task is on (group.name), not just its species
      uncue(key);
      if (cue === 'tangled' && ambient.flyLoop) ambient.flyLoop(key);
    }

    // Tangled wing done: the bird flaps, spins and flies a happy loop (ambient.flyLoop); it is free to fly again.
    function fly(animalId) { free(animalId, 'tangled'); }

    function hide() {
      clear();
      if (ambient && held) { uncue(held); ambient.release(held); held = null; }
    }

    function update(dt) {
      if (puddle) {
        placePuddle();
        if (puddle.userData.leaving) {
          var k = Math.max(0, 1 - 3 * dt);
          puddle.scale.x *= k; puddle.scale.z *= k;
          if (puddle.scale.x < 0.05) removePuddle();
        }
      }
      bits = bits.filter(function (b) {
        var d = b.userData;
        d.t += dt;
        if (d.t >= LIFE) { if (b.parent) b.parent.remove(b); b.material.dispose(); return false; }
        d.vy -= 6 * dt;
        b.position.x += d.vx * dt; b.position.y += d.vy * dt; b.position.z += d.vz * dt;
        b.material.opacity = 1 - d.t / LIFE;
        return true;
      });
    }

    return { show: show, scrub: scrub, bandage: bandage, fly: fly, free: free, hide: hide, update: update, spotCount: function () { return spots.length; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
