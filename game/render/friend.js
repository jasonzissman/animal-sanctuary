/* SA.render.createFriend(THREE, { scene, camera?, solids?, getPlayer, thing? }) -> { update(dt), group }: draws your animal friend (AS-0175).
 * The animal is built through the normal path (SA.render.animalBuilder, data only) and is NOT part of the herd group, so it is never picked,
 * photographed by accident or counted by a clue. SA.friend (pure) says where it is and what it is doing (view.mode):
 *   follow: small happy hops while it walks   sit: lowers its body and looks at you   chase: a little circle after a butterfly (a tiny
 *   butterfly flutters ahead of it)   sleep: curled up, three floating Zs (SA.sleep.zPose)   celebrate: hops and a happy spin
 *   run / call: bounds ahead toward a hint, then hops on the spot while it calls
 * Only primitives; nothing allocated per frame once built. A new friend (swap) rebuilds the model.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var HOP = 0.1, Z_COLOR = 0xe6f3ff, Z_PX = 0.09;

  SA.render.createFriend = function (THREE, opts) {
    var thing = opts.thing || SA.friend;
    var build = SA.render.animalBuilder(THREE);
    var group = new THREE.Group();
    group.name = 'animalFriend';
    opts.scene.add(group);
    var key = null, node = null, t = 0, zs = [], butterfly = null, top = 1.2;

    function makeZs() {
      if (zs.length || !SA.render.blockText) return;
      for (var i = 0; i < 3; i++) {
        var mat = new THREE.MeshBasicMaterial({ color: Z_COLOR, transparent: true, opacity: 0, fog: false, depthWrite: false });
        var z = SA.render.blockText(THREE, mat, 'Z', Z_PX).group;
        z.visible = false;
        group.add(z);
        zs.push({ g: z, m: mat });
      }
      butterfly = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.16), new THREE.MeshBasicMaterial({ color: 0xffb84d }));
      butterfly.visible = false;
      group.add(butterfly);
    }

    function rebuild(cur) {
      if (node) group.remove(node);
      node = null;
      if (!cur || !SA.data.get('animals', cur.animalId)) return;
      node = build(SA.data.get('animals', cur.animalId), { id: cur.animalId, x: 0, y: 0, z: 0, rotY: 0 });
      group.add(node);
      var box = new THREE.Box3().setFromObject(node);
      top = isFinite(box.max.y) ? Math.max(0.6, box.max.y) : 1.2;
      makeZs();
    }

    function hideFx() {
      zs.forEach(function (z) { z.g.visible = false; });
      if (butterfly) butterfly.visible = false;
    }

    function update(dt) {
      var cur = thing.current(), k = cur ? cur.id : null;
      if (k !== key) { key = k; rebuild(cur); }
      t += Math.min(dt || 0, 0.1);
      var pl = opts.getPlayer ? opts.getPlayer() : null;
      var v = cur && pl ? thing.step(dt || 0, pl, typeof opts.solids === 'function' ? opts.solids() : opts.solids) : null;
      if (!v || !node) { group.visible = false; return group; }
      group.visible = true;
      var y = SA.map ? SA.map.groundHeight(v.x, v.z) : 0, m = v.mode, bob = 0, sy = 1, spin = 0;
      if (m === 'follow') bob = v.moving ? Math.abs(Math.sin(t * 12)) * HOP : 0;
      else if (m === 'sit') sy = 0.82 + Math.sin(t * 2) * 0.01;
      else if (m === 'chase') bob = Math.abs(Math.sin(t * 10)) * HOP * 1.5;
      else if (m === 'sleep') sy = 0.55 + Math.sin(t * 1.6) * 0.02;
      else if (m === 'celebrate') spin = Math.sin(t * 7) * 0.9;
      node.position.set(v.x, y + bob + (v.lift || 0), v.z);
      node.rotation.y = v.heading + spin;
      node.scale.set(m === 'sleep' ? 1.06 : 1, sy, m === 'sleep' ? 1.06 : 1);
      if (v.pop && SA.audio) { try { SA.audio.sfx('sparkle'); } catch (e) { /* sound is best effort */ } }
      hideFx();
      if (m === 'sleep' && zs.length && opts.camera) {
        for (var i = 0; i < zs.length; i++) {
          var p = SA.sleep.zPose(t, i, zs.length), l = zs[i];
          l.g.visible = true;
          l.g.position.set(v.x + 0.25 * i, y + top * sy + 0.35 + p.y, v.z);
          l.g.scale.setScalar(p.scale * (0.7 + 0.3 * i));
          l.g.quaternion.copy(opts.camera.quaternion);
          l.g.rotateY(Math.PI);
          l.m.opacity = p.alpha * 0.9;
        }
      } else if (m === 'chase' && butterfly) {
        butterfly.visible = true;
        butterfly.position.set(v.x + Math.sin(t * 3) * 0.9 + Math.sin(v.heading) * 0.8, y + top * 0.8 + Math.sin(t * 4) * 0.2, v.z + Math.cos(t * 3) * 0.7 + Math.cos(v.heading) * 0.8);
        butterfly.rotation.z = Math.sin(t * 30) * 0.8;
      }
      return group;
    }

    return { group: group, update: update };
  };
})(typeof window !== 'undefined' ? window : globalThis);
