/* SA.render.createCareFx(THREE, { animals, rig? }): the 3D side of a care task (procedural mud spots + sparkles).
 *   fx.show(task)        brown mud spots on every instance of task.part and the camera eases in on the animal
 *   fx.scrub(spotsLeft)  keeps only the first `spotsLeft` spots; each removed spot bursts into splash sparkles
 *   fx.hide()            removes any leftover spots and releases the camera
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
  var ZOOM_DIST = 18, LIFE = 0.8;

  SA.render.createCareFx = function (THREE, opts) {
    var animals = opts.animals, rig = opts.rig || null, ambient = opts.ambient || null, held = null;
    var geo = new THREE.SphereGeometry(1, 7, 5);
    var mats = [new THREE.MeshLambertMaterial({ color: MUD }), new THREE.MeshLambertMaterial({ color: MUD_DARK })];
    var group = null, spots = [], bits = [];
    var seed = 1;
    function rand() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

    function clear() {
      spots.forEach(function (s) { if (s.parent) s.parent.remove(s); });
      spots = [];
    }

    function partMeshes(g, part) {
      return g.children.filter(function (m) { return !m.userData.pick && m.userData.part === part; });
    }

    function show(task) {
      clear();
      group = animals.getObjectByName(task.animalId);
      if (!group) return false;
      var meshes = partMeshes(group, task.part);
      if (!meshes.length) return false;
      for (var i = 0; i < task.spots; i++) {
        var m = meshes[i % meshes.length];
        var spot = new THREE.Mesh(geo, mats[i % 2]);
        // a point on the ellipsoid around the part, biased upward so the mud shows from the tilted camera
        var a = rand() * Math.PI * 2, el = rand() * 1.1 - 0.1, h = Math.sqrt(Math.max(0, 1 - el * el));
        spot.position.set(m.position.x + Math.cos(a) * h * m.scale.x * 0.5,
          m.position.y + el * m.scale.y * 0.5, m.position.z + Math.sin(a) * h * m.scale.z * 0.5);
        var r = Math.min(0.14, Math.max(0.05, Math.min(m.scale.x, m.scale.y, m.scale.z) * 0.4)) * (0.8 + rand() * 0.4);
        spot.scale.set(r, r * 0.6, r);
        spot.userData = { mud: true, index: i };
        group.add(spot);
        spots.push(spot);
      }
      if (ambient) { if (held) ambient.release(held); held = task.animalId; ambient.hold(held); }
      if (rig && rig.focusOn) rig.focusOn(group.position.x, group.position.z, ZOOM_DIST);
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
        if (group && group.parent) burst(s.position);
        if (s.parent) s.parent.remove(s);
      }
    }

    function hide() {
      clear();
      if (ambient && held) { ambient.release(held); held = null; }
      if (rig && rig.release) rig.release();
    }

    function update(dt) {
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

    return { show: show, scrub: scrub, hide: hide, update: update, spotCount: function () { return spots.length; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
