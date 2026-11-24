/* SA.render.createMissionTrail(THREE, { scene, thing? }): draws Mission 8's empty strawberry basket at the station, the tiny paw prints (las huellas)
 * and strawberry crumbs, and the raised log you walk under (AS-0347). It follows SA.missionTrail (pure: where everything lies). Procedural,
 * flat-material primitives only. The basket and the log stand for the whole mission; the prints and crumbs show ONLY while the 'trail' step is
 * active, and the next few prints glow and pulse so the child sees which way to go. Nothing is solid: walking through changes nothing.
 *   update(dt)   once per frame; returns the group it manages
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.createMissionTrail = function (THREE, opts) {
    var thing = opts.thing || SA.missionTrail;
    var group = new THREE.Group();
    group.name = 'missionTrail';
    opts.scene.add(group);
    var M = function (c, e) { return new THREE.MeshLambertMaterial({ color: c, emissive: e || 0x000000 }); };
    var padG = new THREE.CylinderGeometry(0.13, 0.15, 0.03, 6), toeG = new THREE.CylinderGeometry(0.045, 0.05, 0.03, 5), crumbG = new THREE.BoxGeometry(0.1, 0.07, 0.1);
    var dull = M(0x6b4a2e), glow = M(0xffd24a, 0x6b4f00), crumbMat = M(0xe8553d, 0x3a0d06), seedMat = M(0xffe27a);
    var key = null, prints = [], tracks = new THREE.Group(), t = 0, lastGlow = '';
    group.add(tracks);

    function ground(x, z) { return SA.map && SA.map.groundHeight ? SA.map.groundHeight(x, z) : 0; }

    function print(p) {
      var g = new THREE.Group(), parts = [];
      var pad = new THREE.Mesh(padG, dull); pad.scale.set(1, 1, 1.25); g.add(pad); parts.push(pad);
      [-0.11, 0, 0.11].forEach(function (dx, i) {
        var toe = new THREE.Mesh(toeG, dull);
        toe.position.set(dx, 0, 0.2 - (i === 1 ? -0.04 : 0));
        g.add(toe); parts.push(toe);
      });
      g.position.set(p.x, ground(p.x, p.z) + 0.04, p.z);
      g.rotation.y = p.rot;
      g.userData.parts = parts;
      return g;
    }

    function crumb(c) {
      var g = new THREE.Group();
      for (var i = 0; i < c.n; i++) {
        var m = new THREE.Mesh(crumbG, i ? seedMat : crumbMat);
        m.position.set((i - 0.5) * 0.14, 0.05, (i % 2) * 0.1);
        m.rotation.y = i * 1.3;
        g.add(m);
      }
      g.position.set(c.x, ground(c.x, c.z), c.z);
      return g;
    }

    function emptyBasket(b) {
      var g = new THREE.Group(), wood = M(0xa8743a), dark = M(0x7d5528);
      var body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 0.45, 8, 1, true), wood); body.position.y = 0.25; g.add(body);
      var floor = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 8), dark); floor.position.y = 0.05; g.add(floor);
      var handle = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 4, 8, Math.PI), dark); handle.position.y = 0.45; handle.rotation.z = 0; g.add(handle);
      var leaf = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.1), M(0x4f9a3f)); leaf.position.set(0.1, 0.08, 0.05); leaf.rotation.y = 0.6; g.add(leaf);   // all that is left
      g.position.set(b.x, ground(b.x, b.z), b.z);
      g.name = 'emptyBasket';
      return g;
    }

    function archLog(l) {
      var g = new THREE.Group(), bark = M(0x5a3b21), stump = M(0x6b4a2e);
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, l.len, 7), bark);
      trunk.rotation.z = Math.PI / 2; trunk.position.y = l.h; g.add(trunk);
      [-1, 1].forEach(function (s) {
        var post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, l.h, 6), stump);
        post.position.set(s * (l.len / 2 - 0.5), l.h / 2, 0); g.add(post);
      });
      g.position.set(l.x, ground(l.x, l.z), l.z);
      g.rotation.y = l.rotY + Math.PI / 2;        // the trunk lies across the way, so you walk under it
      g.name = 'trailLog';
      return g;
    }

    function rebuild(cur) {
      while (group.children.length) group.remove(group.children[0]);
      prints = []; tracks = new THREE.Group(); lastGlow = '';
      if (!cur) return;
      cur.points.forEach(function (p) { var g = print(p); prints.push(g); tracks.add(g); });
      cur.crumbs.forEach(function (c) { tracks.add(crumb(c)); });
      group.add(tracks, emptyBasket(cur.from), archLog(cur.log));
    }

    function setMat(g, m) { g.userData.parts.forEach(function (o) { o.material = m; }); }

    function update(dt) {
      var cur = thing.current(), k = cur ? cur.key : null;
      if (k !== key) { key = k; rebuild(cur); }
      t += dt || 0;
      var v = cur && thing.view ? thing.view() : null;
      tracks.visible = !!(v && v.active);
      if (v && v.active) {
        var sig = v.ahead.join(',');
        if (sig !== lastGlow) {
          prints.forEach(function (g) { setMat(g, dull); });
          v.ahead.forEach(function (i) { if (prints[i]) setMat(prints[i], glow); });
          lastGlow = sig;
        }
        v.ahead.forEach(function (i, n) { if (prints[i]) { var s = 1 + 0.25 * Math.sin(t * 5 - n * 0.9); prints[i].scale.set(s, 1, s); } });
      }
      return group;
    }

    return { group: group, update: update };
  };
})(typeof window !== 'undefined' ? window : globalThis);
