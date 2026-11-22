/* SA.render.createHandItem(THREE, { hand, getEquipped }) -> { group, update(), current() }
 * Shows the equipped item as a small low-poly model in the avatar's hand. `hand` is the avatar's arm pivot (avatar.parts.armR),
 * so the model walks, swings and climbs with the kid. The model is built from the item's spec in game/data/hand-models.js
 * (boxes, cylinders, spheres and cones with flat materials). update() (call it every frame) compares getEquipped() (default
 * SA.inventory.equipped) with what is in hand: a change swaps the model, null removes it. Cheap when nothing changed.
 * The group lives under the avatar, never under the animals, so it is never part of any pick volume.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var HOLD = { x: 0, y: -0.45, z: 0.06, tilt: -1.1 };   // the fist (arm pivot is the shoulder; the arm is 0.45 long); tilted forward so it reads from behind

  function geometry(THREE, p) {
    var s = p.size;
    if (p.shape === 'box') return new THREE.BoxGeometry(s[0], s[1], s[2]);
    if (p.shape === 'cylinder') return new THREE.CylinderGeometry(s[0], s[1], s[2], 8);
    if (p.shape === 'sphere') return new THREE.SphereGeometry(s[0], 8, 6);
    return new THREE.ConeGeometry(s[0], s[1], 8);
  }

  function build(THREE, spec) {
    var g = new THREE.Group();
    spec.parts.forEach(function (p) {
      var m = new THREE.Mesh(geometry(THREE, p), new THREE.MeshLambertMaterial({ color: p.color }));
      m.position.set(p.pos[0], p.pos[1], p.pos[2]);
      if (p.rot) m.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
      if (p.scale) m.scale.set(p.scale[0], p.scale[1], p.scale[2]);
      g.add(m);
    });
    return g;
  }

  function dispose(g) {
    g.children.forEach(function (m) {
      if (m.geometry && m.geometry.dispose) m.geometry.dispose();
      if (m.material && m.material.dispose) m.material.dispose();
    });
  }

  SA.render.createHandItem = function (THREE, opts) {
    opts = opts || {};
    var getEquipped = opts.getEquipped || function () { return SA.inventory ? SA.inventory.equipped() : null; };
    var holder = new THREE.Group();   // sits in the fist; the model hangs off it
    holder.name = 'hand-item';
    holder.position.set(HOLD.x, HOLD.y, HOLD.z);
    holder.rotation.x = HOLD.tilt;
    if (opts.hand) opts.hand.add(holder);
    var shownId = null, model = null;

    function update() {
      var id = getEquipped() || null;
      if (id === shownId) return;
      shownId = id;
      if (model) { holder.remove(model); dispose(model); model = null; }
      var spec = id ? SA.data.get('handmodels', id) : null;
      if (!spec) return;
      model = build(THREE, spec);
      model.userData = { handItem: id };
      holder.add(model);
    }

    update();
    return { group: holder, update: update, current: function () { return model ? shownId : null; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
