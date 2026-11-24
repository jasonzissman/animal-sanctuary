/* SA.render.createMissionPantry(THREE, { scene, thing?, canvas?, camera?, getPlayer?, solids? }): draws Mission 8's hidden hollow tree and the mouse family
 * inside it (AS-0346). It follows SA.missionPantry (pure: where the tree stands and where each mouse sits). The tree is built from the prop's data
 * `builder` key (SA.render.propBuilders, game/render/hollow-tree.js) and the family through the normal animal path (SA.render.animalBuilder) from the
 * animal ids in the data; the babies hop a little on the spot so the hollow looks alive. Nothing here knows a mission id or an animal id.
 * On the 'photo' step a tap on any mouse calls thing.snap(player) (la cámara is put in hand on a first tap, like the eagle photo); only the family's
 * own meshes are raycast, never the whole scene.
 *   update(dt)   once per frame; returns the group it manages
 *   tapAt(x, y)  client coordinates -> true when a mouse was hit and the photo counted
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.createMissionPantry = function (THREE, opts) {
    var thing = opts.thing || SA.missionPantry;
    if (opts.solids && thing.setSolids) thing.setSolids(opts.solids);
    var build = SA.render.animalBuilder(THREE);
    var group = new THREE.Group();
    group.name = 'missionPantry';
    opts.scene.add(group);
    var key = null, mice = [], t = 0;

    function rebuild(cur) {
      while (group.children.length) group.remove(group.children[0]);
      mice = [];
      if (!cur) return;
      var def = SA.data.get('props', cur.spec.tree), make = def && SA.render.propBuilders[def.builder];
      if (make) {
        var tree = make(THREE, SA.render.propMaterials(THREE));
        tree.position.set(cur.tree.x, cur.tree.y, cur.tree.z);
        tree.rotation.y = cur.tree.face;
        group.add(tree);
      }
      cur.family.forEach(function (f, i) {
        var spec = SA.data.get('animals', f.animal);
        if (!spec) return;
        var m = build(spec, { id: spec.id, x: f.x, z: f.z, y: f.y, rotY: f.rotY });
        m.scale.set(f.scale, f.scale, f.scale);
        group.add(m);
        mice.push({ m: m, y: f.y, baby: f.role === 'baby', phase: i * 1.7 });
      });
    }

    function update(dt) {
      var cur = thing.current();
      var k = cur ? cur.key : null;
      if (k !== key) { key = k; rebuild(cur); }
      t += dt || 0;
      mice.forEach(function (e) { e.m.position.y = e.y + (e.baby ? Math.abs(Math.sin(t * 3 + e.phase)) * 0.08 : 0); });   // the babies hop on the spot
      return group;
    }

    function tapAt(x, y) {
      if (!mice.length || !opts.canvas || !opts.camera || !thing.snap || (SA.picking && SA.picking.isPaused && SA.picking.isPaused())) return false;
      var v = thing.view ? thing.view() : null;
      if (!v || !v.photo) return false;                        // only the family photo is a tap here
      var r = opts.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)), opts.camera);
      var nodes = mice.map(function (e) { e.m.updateMatrixWorld(true); return e.m; });
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
