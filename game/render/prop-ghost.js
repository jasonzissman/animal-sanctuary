/* SA.render.createPropGhost(THREE): the translucent "where will it land" preview for habitat placement (thin, no logic).
 *   ghost.group              THREE.Group to add to the scene (hidden until show)
 *   ghost.show(propId, pv)   pv is SA.habitat.preview(...): { x, z, valid }. Shows the prop's ghost plus a ground tile on the
 *                            snapped spot, green when valid and red when not. A null pv or unknown prop hides it.
 *                            A small gold star floats above it when SA.ghostState.of(pv) is 'unaffordable' (not enough stars).
 *   ghost.starVisible()      true while that star cue is showing
 *   ghost.hide()           hides it (placement mode ended, prop placed or deselected)
 *   ghost.visible()          true while shown
 * Validity and snapping live in SA.habitat.preview (pure, node:vm tested). Needs SA.render.propBuilders/propMaterials.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.createPropGhost = function (THREE) {
    var group = new THREE.Group();
    group.name = 'propGhost';
    group.visible = false;
    function ghostMat(c) { return new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5, depthWrite: false }); }
    var good = ghostMat('#3ddc57'), bad = ghostMat('#ff4a4a');
    var tile = new THREE.Mesh(new THREE.BoxGeometry(SA.habitat.GRID, 0.08, SA.habitat.GRID), good);
    group.add(tile);
    var realMats = null, cache = {}, current = null;

    // Small gold star floating over the ghost when the child lacks the stars (SA.ghostState 'unaffordable').
    // Built only if the THREE pieces exist; otherwise the ghost simply stays red.
    var star = null;
    try {
      if (THREE.Shape && THREE.ExtrudeGeometry) {
        var shape = new THREE.Shape();
        for (var i = 0; i < 10; i++) {
          var r = i % 2 ? 0.28 : 0.7, a = Math.PI / 2 + i * Math.PI / 5;
          if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        shape.closePath();
        var geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
        star = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffd23f' }));
        star.rotation.x = -Math.PI / 2;     // lies flat so the top-down camera sees it
        star.name = 'starCue';
        star.visible = false;
        group.add(star);
      }
    } catch (e) { star = null; }

    function build(propId) {
      if (cache[propId]) return cache[propId];
      var def = SA.data.get('props', propId);
      var build = def && SA.render.propBuilders && SA.render.propBuilders[def.builder];
      if (!build) return null;
      realMats = realMats || SA.render.propMaterials(THREE);
      var obj = build(THREE, realMats), meshes = [];
      obj.traverse(function (o) { if (o.isMesh) meshes.push(o); });
      cache[propId] = { obj: obj, meshes: meshes, shore: def.where === 'shore' };
      return cache[propId];
    }

    function hide() { group.visible = false; }

    function show(propId, pv) {
      var entry = pv && build(propId);
      if (!entry) { hide(); return; }
      if (current !== entry) {
        if (current) group.remove(current.obj);
        group.add(entry.obj);
        current = entry;
      }
      var mat = pv.valid ? good : bad;
      entry.meshes.forEach(function (m) { m.material = mat; });
      tile.material = mat;
      var y = SA.map.groundHeight(pv.x, pv.z);
      if (entry.shore) y = Math.max(y, SA.map.WATER_LEVEL);
      entry.obj.position.set(pv.x, y, pv.z);
      tile.position.set(pv.x, y + 0.06, pv.z);
      if (star) {
        var lacking = SA.ghostState ? SA.ghostState.of(pv) === 'unaffordable' : false;
        star.visible = lacking;
        if (lacking) star.position.set(pv.x, y + 3, pv.z);
      }
      group.visible = true;
    }

    return { group: group, show: show, hide: hide, visible: function () { return group.visible; },
      starVisible: function () { return !!star && star.visible && group.visible; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
