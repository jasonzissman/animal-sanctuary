/* SA.render.createMissionCarry(THREE, { scene, getPlayer, solids? }): draws a mission's carried thing and its drop-off (AS-0313, slice 1
 * of AS-0181): a straw nest (a ring of twigs on a flat mat) and a cream, spotted egg, all from primitives. It follows SA.missionCarry
 * (pure: where they are and the phase): the egg lies near the nest rocking gently, rides in front of the kid's chest while held
 * (it wobbles with SA.carry when the kid jumps), and rests in the nest once placed. Nothing here knows a mission id.
 *   update(dt, player?)   once per frame; returns the group it manages
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var STRAW = 0xc9a15a, TWIG = 0x8a6a3a, SHELL = 0xfff4dc, SPOT = 0xc98f5a;
  var EGG_LIFT = 0.28, HELD_FRONT = 0.7, HELD_UP = 1.1;

  function flat(THREE, c) { return new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 0 }); }

  // The cream, spotted egg (shared with the hatch renderer, AS-0315).
  function eggModel(THREE) {
    var g = new THREE.Group();
    var shell = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), flat(THREE, SHELL));
    shell.scale.set(0.8, 1.1, 0.8);
    g.add(shell);
    [[0.18, 0.08, 0.14], [-0.2, -0.05, 0.1], [0.05, 0.2, -0.2]].forEach(function (p) {
      var s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), flat(THREE, SPOT));
      s.position.set(p[0], p[1], p[2]);
      g.add(s);
    });
    return g;
  }

  SA.render.createMissionCarry = function (THREE, opts) {
    var thing = opts.thing || SA.missionCarry;
    if (opts.solids && thing.setSolids) thing.setSolids(opts.solids);
    var group = new THREE.Group();
    group.name = 'missionCarry';
    opts.scene.add(group);
    var nest = null, egg = null, key = null, t = 0;

    function mat(c) { return new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 0 }); }

    function makeNest() {
      var g = new THREE.Group();
      var mattress = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.7, 0.12, 10), mat(STRAW));
      mattress.position.y = 0.06;
      g.add(mattress);
      for (var i = 0; i < 10; i++) {                      // a ring of twigs around the rim
        var a = (i / 10) * Math.PI * 2;
        var twig = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), mat(i % 2 ? TWIG : STRAW));
        twig.position.set(Math.cos(a) * 0.78, 0.18, Math.sin(a) * 0.78);
        twig.rotation.y = -a + Math.PI / 2 + (i % 3 - 1) * 0.25;
        g.add(twig);
      }
      return g;
    }

    function makeEgg() { return SA.render.createMissionCarry.makeEgg(THREE); }

    function rebuild(cur) {
      while (group.children.length) group.remove(group.children[0]);
      nest = egg = null;
      if (!cur) return;
      nest = makeNest();
      nest.position.set(cur.to.x, cur.to.y, cur.to.z);
      egg = makeEgg();
      group.add(nest, egg);
    }

    function update(dt, player) {
      var cur = thing.current();
      var k = cur ? cur.key : null;
      if (k !== key) { key = k; rebuild(cur); }
      if (!cur || !egg) return group;
      t += dt || 0;
      var p = player || (opts.getPlayer && opts.getPlayer());
      if (cur.phase === 'held' && p) {
        var w = SA.carry && SA.carry.wobble ? SA.carry.wobble() : { angle: 0, tilt: 0 };
        egg.position.set(p.x + Math.sin(p.heading || 0) * HELD_FRONT, (p.y || 0) + (p.lift || 0) + HELD_UP + Math.sin(t * 5) * 0.03,
          p.z + Math.cos(p.heading || 0) * HELD_FRONT);
        egg.rotation.set(w.tilt, 0, w.angle);
      } else if (cur.phase === 'placed') {
        var hv = SA.missionHatch && SA.missionHatch.view();        // AS-0315: it rocks while it waits; SA.render.createMissionHatch draws the cracking and the hatchling
        egg.visible = !hv || hv.phase === 'none' || hv.phase === 'waiting';
        egg.position.set(cur.to.x, cur.to.y + EGG_LIFT, cur.to.z);
        egg.rotation.set(0, 0, hv && hv.phase === 'waiting' ? Math.sin(t * 6) * 0.1 : 0);
      } else {
        egg.position.set(cur.item.x, cur.item.y + EGG_LIFT + Math.abs(Math.sin(t * 2)) * 0.05, cur.item.z);
        egg.rotation.set(0, 0, Math.sin(t * 3) * 0.12);        // rocks a little: "pick me up"
      }
      return group;
    }

    return { group: group, update: update };
  };
  SA.render.createMissionCarry.makeEgg = eggModel;
})(typeof window !== 'undefined' ? window : globalThis);
