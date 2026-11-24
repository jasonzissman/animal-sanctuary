/* SA.render.createProps(THREE, { canvas, camera }): the habitat sandbox's 3D props (the only sandbox code touching THREE).
 *   props.group                 THREE.Group holding one child per placed prop (userData.placedId)
 *   props.add(record)           builds the prop for { id, prop, x, z } from its data `builder` key and drops it on the ground
 *   props.remove(placedId)      removes it (geometry disposed)
 *   props.count()               how many props are placed
 *   props.refreshGhost()        shows the ghost at the last known mouse position (tray selection); no-op when unknown/touch
 *   props.bind(handlers)       sandbox taps: handlers { active(), selected(), onGround({x,z}), onPropTap(placedId) }.
 *                               A tap (not a drag, so camera orbit still works) on a placed prop with nothing selected
 *                               removes it; any other tap sends the terrain point under the finger to onGround.
 * Props are low-poly flat-shaded primitives, parameterised by data (SA.data 'props'): builders are keyed by `builder`.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  function mats(THREE) {
    function m(c) { return new THREE.MeshLambertMaterial({ color: c }); }
    return { trunk: m('#7a5230'), leaf: m('#2c9a46'), rock: m('#9a9a96'), stem: m('#3f9a4a'), water: m('#4aa3c7'),
      sand: m('#d8c58a'), wood: m('#a8743c'), bloom: [m('#ff7aa8'), m('#ffd23f'), m('#ffffff')] };
  }

  function mesh(THREE, geo, mat, x, y, z) {
    var o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    return o;
  }

  var BUILDERS = {
    tree: function (THREE, m) {
      var g = new THREE.Group();
      g.add(mesh(THREE, new THREE.CylinderGeometry(0.25, 0.4, 2.6, 6), m.trunk, 0, 1.3, 0));
      var top = mesh(THREE, new THREE.IcosahedronGeometry(1.5, 0), m.leaf, 0, 3.3, 0);
      top.scale.y = 0.8;
      g.add(top);
      return g;
    },
    rock: function (THREE, m) {
      var r = mesh(THREE, new THREE.DodecahedronGeometry(0.8, 0), m.rock, 0, 0.3, 0);
      r.scale.set(1.2, 0.7, 1);
      return r;
    },
    flowers: function (THREE, m) {
      var g = new THREE.Group();
      [[-0.5, -0.3], [0.45, -0.2], [0, 0.5], [0.6, 0.55], [-0.55, 0.45]].forEach(function (p, i) {
        g.add(mesh(THREE, new THREE.CylinderGeometry(0.04, 0.04, 0.5, 4), m.stem, p[0], 0.25, p[1]));
        g.add(mesh(THREE, new THREE.OctahedronGeometry(0.22, 0), m.bloom[i % m.bloom.length], p[0], 0.58, p[1]));
      });
      return g;
    },
    pond: function (THREE, m) {
      var g = new THREE.Group();
      g.add(mesh(THREE, new THREE.CylinderGeometry(1.7, 1.8, 0.12, 8), m.sand, 0, 0.05, 0));
      g.add(mesh(THREE, new THREE.CylinderGeometry(1.35, 1.35, 0.14, 8), m.water, 0, 0.09, 0));
      return g;
    },
    bridge: function (THREE, m) {
      var g = new THREE.Group();
      // Deck top 0.27 and half-size 1.925 x 1.3 match SA.surfaces.propDeck (the avatar walks on it, the rails block).
      for (var i = -3; i <= 3; i++) g.add(mesh(THREE, new THREE.BoxGeometry(0.5, 0.14, 2.6), m.wood, i * 0.55, 0.2, 0));
      [-1.2, 1.2].forEach(function (z) {
        g.add(mesh(THREE, new THREE.BoxGeometry(3.6, 0.12, 0.12), m.wood, 0, 0.75, z));
        [-1.7, 0, 1.7].forEach(function (x) { g.add(mesh(THREE, new THREE.BoxGeometry(0.12, 0.6, 0.12), m.wood, x, 0.5, z)); });
      });
      return g;
    }
  };

  function dispose(obj) {
    obj.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
  }

  SA.render.propBuilders = BUILDERS;
  SA.render.propMaterials = mats;

  SA.render.createProps = function (THREE, opts) {
    var group = new THREE.Group();
    group.name = 'placedProps';
    var m = mats(THREE);
    var byId = {};
    var raycaster = new THREE.Raycaster();
    var ndc = new THREE.Vector2();
    var tracker = SA.picking.createTapTracker();
    var handlers = null;

    function add(rec) {
      var def = SA.data.get('props', rec.prop);
      var build = def && BUILDERS[def.builder];
      if (!build || byId[rec.id]) return null;
      var obj = build(THREE, m);
      var y = SA.map.groundHeight(rec.x, rec.z);
      obj.position.set(rec.x, def.where === 'shore' ? Math.max(y, SA.map.WATER_LEVEL) : y, rec.z);
      obj.rotation.y = def.builder === 'tree' || def.builder === 'rock' ? ((rec.x * 7 + rec.z * 13) % 6.28) : 0;
      obj.userData.placedId = rec.id;
      byId[rec.id] = obj;
      group.add(obj);
      return obj;
    }

    function remove(id) {
      var obj = byId[id];
      if (!obj) return false;
      group.remove(obj);
      dispose(obj);
      delete byId[id];
      return true;
    }

    function setRay(x, y) {
      var r = opts.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      ndc.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
      raycaster.setFromCamera(ndc, opts.camera);
      return true;
    }

    function placedIdAt() {
      var hits = raycaster.intersectObjects(group.children, true);
      for (var i = 0; i < hits.length; i++) {
        var o = hits[i].object;
        while (o && !o.userData.placedId) o = o.parent;
        if (o) return o.userData.placedId;
      }
      return null;
    }

    function tap(x, y) {
      if (!handlers || !handlers.active() || !setRay(x, y)) return;
      if (!handlers.selected()) {
        var id = placedIdAt();
        if (id) { handlers.onPropTap(id); return; }
      }
      var pt = SA.habitat.rayToGround(raycaster.ray.origin, raycaster.ray.direction);
      if (pt) handlers.onGround(pt);
    }

    // Placement preview: a green/red ghost of the selected prop on the snapped spot under the pointer (hover with a
    // mouse; pointer-down or drag on touch). Validity/snapping come from the pure SA.habitat.preview.
    var ghost = SA.render.createPropGhost ? SA.render.createPropGhost(THREE) : null;
    function hideGhost() { if (ghost) ghost.hide(); }
    function showGhost(x, y) {
      if (!ghost) return;
      var id = handlers && handlers.active() && handlers.selected();
      if (!id || !setRay(x, y)) { ghost.hide(); return; }
      var pv = SA.habitat.preview(id, SA.habitat.rayToGround(raycaster.ray.origin, raycaster.ray.direction));
      ghost.show(id, pv);
    }

    // Last mouse position over the canvas (kept after the pointer leaves for the tray; forgotten on touch), so picking a
    // prop from the tray can show its ghost straight away. SA.ghostRefresh.decide (pure) says whether to.
    var lastPt = null;
    function remember(e) { lastPt = !e.pointerType || e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null; }
    function refreshGhost() {
      if (!SA.ghostRefresh) return;
      var d = SA.ghostRefresh.decide({ active: !!(handlers && handlers.active()), selected: handlers && handlers.selected(), last: lastPt });
      if (d.show) showGhost(d.x, d.y);
    }

    var canvas = opts.canvas;
    canvas.addEventListener('pointerdown', function (e) { remember(e); tracker.down(e.pointerId, e.clientX, e.clientY); showGhost(e.clientX, e.clientY); });
    canvas.addEventListener('pointermove', function (e) { remember(e); tracker.move(e.pointerId, e.clientX, e.clientY); showGhost(e.clientX, e.clientY); });
    canvas.addEventListener('pointerup', function (e) {
      var t = tracker.up(e.pointerId, e.clientX, e.clientY);
      if (t) tap(t.x, t.y);
      if (e.pointerType && e.pointerType !== 'mouse') hideGhost();   // touch: the ghost only lives while the finger is down
    });
    canvas.addEventListener('pointercancel', function () { tracker.cancel(); hideGhost(); });
    canvas.addEventListener('pointerleave', hideGhost);

    return {
      group: group, add: add, remove: remove, count: function () { return group.children.length; },
      bind: function (h) { handlers = h; }, tap: tap,
      ghostGroup: ghost ? ghost.group : null, hideGhost: hideGhost, refreshGhost: refreshGhost, ghostVisible: function () { return !!ghost && ghost.visible(); }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
