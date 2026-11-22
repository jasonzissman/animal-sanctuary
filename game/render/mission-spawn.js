/* SA.render.createMissionSpawn(THREE, { scene, solids, getPlayer? }): draws the animals a story mission placed (AS-0233).
 * It follows SA.missionSpawn (pure: where they stand), builds each one through the normal animal path
 * (SA.render.animalBuilder) and removes them when the mission ends. While the baby is still to be found it shows a little blue
 * tear above its head, bobs and whimpers softly (quieter the further you are); mamá idles, turning her head back and forth,
 * worried. Everything is data-driven: the species come from the mission row, never from an animal id here.
 *   update(dt)   once per frame; returns the group it manages (children: the baby and mamá)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var CRY_EVERY = 4.5, HEAR = 22, TEAR_COLOR = 0x4aa8ff;

  SA.render.createMissionSpawn = function (THREE, opts) {
    var spawn = opts.spawn || SA.missionSpawn;
    var build = SA.render.animalBuilder(THREE);
    var group = new THREE.Group();
    group.name = 'missionAnimals';
    opts.scene.add(group);
    var baby = null, mama = null, tear = null, t = 0, cry = 0;

    function makeTear() {
      var m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: TEAR_COLOR }));
      m.scale.set(0.8, 1.3, 0.8);
      var tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 8), new THREE.MeshBasicMaterial({ color: TEAR_COLOR }));
      tip.position.y = 0.2;
      var g = new THREE.Group();
      g.add(m, tip);
      return g;
    }

    function clear() {
      while (group.children.length) group.remove(group.children[0]);
      baby = mama = tear = null;
    }

    function rebuild(cur) {
      clear();
      if (!cur) return;
      baby = build(SA.data.get('animals', cur.baby.id), cur.baby);
      mama = build(SA.data.get('animals', cur.mama.id), cur.mama);
      baby.userData.baseRot = cur.baby.rotY;
      mama.userData.baseRot = cur.mama.rotY;
      tear = makeTear();
      group.add(baby, mama, tear);
    }

    function update(dt) {
      var cur = spawn.sync({ solids: opts.solids });
      var key = cur ? cur.key : null;
      if (key !== (group.userData && group.userData.key)) { group.userData = { key: key }; rebuild(cur); }
      if (!cur) return group;
      t += dt || 0;
      var waiting = spawn.waiting(SA.missions && SA.missions.active() ? SA.missions.active().stepData : null);
      tear.visible = waiting;
      if (waiting) {
        baby.rotation.y = baby.userData.baseRot + Math.sin(t * 9) * 0.06;            // a small shiver
        tear.position.set(cur.baby.x, cur.baby.y + 1.5 + Math.abs(Math.sin(t * 2.4)) * 0.12, cur.baby.z);
        cry -= dt || 0;
        if (cry <= 0) {
          cry = CRY_EVERY;
          var p = opts.getPlayer && opts.getPlayer();
          var d = p ? Math.hypot(p.x - cur.baby.x, p.z - cur.baby.z) : HEAR;
          if (d < HEAR && SA.audio) SA.audio.sfx('whimper', Math.max(0.15, 0.6 * (1 - d / HEAR)));
        }
      } else baby.rotation.y = baby.userData.baseRot;
      mama.rotation.y = mama.userData.baseRot + Math.sin(t * 0.9) * 0.9;              // looking around, worried
      return group;
    }

    return { group: group, update: update };
  };
})(typeof window !== 'undefined' ? window : globalThis);
