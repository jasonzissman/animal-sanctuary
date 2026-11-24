/* SA.render.createMissionFriends(THREE, { scene, solids?, getPlayer, thing? }): draws the party mission's friends and the monkey's tree (AS-0327).
 * It follows SA.missionFriends (pure: where they stand, which are invited). Each friend is built through the normal animal path
 * (SA.render.animalBuilder); an uninvited friend waits and sways a little, an invited one trails the player with small happy hops and a
 * puff where it popped. The monkey's tree is a trunk with a leafy crown (primitives only) with the monkey sitting at its foot. Everything
 * is data: species come from the mission row. update(dt) runs once per frame and returns the group (cleared when the mission ends).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var TRUNK = 0x7a5230, LEAF = 0x3f9b4a, LEAF2 = 0x55b85a, HOP = 0.12;

  function flat(THREE, c) { return new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 0 }); }

  function treeModel(THREE) {
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 5, 7), flat(THREE, TRUNK));
    trunk.position.y = 2.5;
    g.add(trunk);
    [[0, 6.2, 0, 2.6, LEAF], [1.4, 5.4, 0.4, 1.8, LEAF2], [-1.3, 5.6, -0.5, 1.9, LEAF2]].forEach(function (b) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(b[3], 8, 6), flat(THREE, b[4]));
      m.position.set(b[0], b[1], b[2]);
      g.add(m);
    });
    return g;
  }

  SA.render.createMissionFriends = function (THREE, opts) {
    var thing = opts.thing || SA.missionFriends;
    if (opts.solids && thing.setSolids) thing.setSolids(opts.solids);
    var build = SA.render.animalBuilder(THREE);
    var group = new THREE.Group();
    group.name = 'missionFriends';
    opts.scene.add(group);
    var key = null, nodes = {}, t = 0;

    function rebuild(cur) {
      while (group.children.length) group.remove(group.children[0]);
      nodes = {};
      if (!cur) return;
      var tree = treeModel(THREE);
      tree.position.set(cur.tree.x, cur.tree.y, cur.tree.z);
      group.add(tree);
      if (cur.tree.monkey && SA.data.get('animals', cur.tree.monkey)) {
        var m = build(SA.data.get('animals', cur.tree.monkey), { id: cur.tree.monkey, x: cur.tree.x + 1.6, y: cur.tree.y, z: cur.tree.z + 0.4, rotY: Math.PI * 0.8 });
        group.add(m);
      }
      cur.friends.forEach(function (fr) {
        var n = build(SA.data.get('animals', fr.id), fr);
        nodes[fr.id] = n;
        group.add(n);
      });
    }

    function update(dt) {
      var cur = thing.current();
      var k = cur ? cur.key : null;
      if (k !== key) { key = k; rebuild(cur); }
      t += dt || 0;
      if (!cur) return group;
      var views = thing.step(dt || 0, opts.getPlayer && opts.getPlayer(), opts.solids) || [];
      views.forEach(function (v, i) {
        var n = nodes[v.id];
        if (!n) return;
        var y = SA.map ? SA.map.groundHeight(v.x, v.z) : 0;
        var bob = v.following ? (v.moving ? Math.abs(Math.sin(t * 12 + i)) * HOP : 0) + (v.lift || 0) : 0;
        n.position.set(v.x, y + bob, v.z);
        n.rotation.y = v.following ? v.heading : v.heading + Math.sin(t * 1.3 + i * 2) * 0.35;   // a waiting friend looks around for you
        if (v.pop && SA.audio) { try { SA.audio.sfx('sparkle'); } catch (e) { /* sound is best effort */ } }
      });
      return group;
    }

    return { group: group, update: update };
  };
})(typeof window !== 'undefined' ? window : globalThis);
