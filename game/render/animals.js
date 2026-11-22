/* SA.render.buildAnimals(THREE, opts): one THREE.Group per animal, assembled purely from data via
 * SA.animalPlan (no animal-specific code). Returns a Group named 'animals' whose children are the animal groups
 * (userData { animalId }), each holding visible part meshes and invisible pick volumes.
 *
 * Every part mesh AND its pick volume carry userData { animalId, part, side?, index }; pick volumes also have
 * pick: true, pickVolume (box volume) and are ~1.6x the part, or 1.0x for big masses (visible=false, but THREE's
 * Raycaster still hits them). animalGroup.userData.pickVolumes lists them, so picking raycasts only those (never
 * the whole scene); pass the hits to SA.animalPlan.choosePick(hits) so small parts beat the head/body around them.
 * opts.avoid = [[x,z],...] keeps animals clear of decor.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var PUPIL_SIZE = 0.6;       // pupil diameter, as a fraction of the part's unit sphere
  var PUPIL_FORWARD = 0.3;    // pupil centre in front of the part centre, so it pokes out of the front surface

  function unitGeometry(THREE, builder) {
    if (builder === 'box') return new THREE.BoxGeometry(1, 1, 1);
    if (builder === 'sphere') return new THREE.SphereGeometry(0.5, 10, 8);
    if (builder === 'cone') return new THREE.ConeGeometry(0.5, 1, 8);
    if (builder === 'cylinder') return new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    if (builder === 'zigzag') return SA.render.zigzagGeometry(THREE);
    throw new Error('unknown builder ' + builder);
  }

  function tag(mesh, spec) {
    mesh.userData = { animalId: spec.animalId, part: spec.part, index: spec.index };
    if (spec.side) mesh.userData.side = spec.side;
  }

  SA.render.buildAnimals = function (THREE, opts) {
    var geos = {}, mats = {};
    var pickGeo = new THREE.BoxGeometry(1, 1, 1);
    var pickMat = new THREE.MeshBasicMaterial({ visible: false });
    var group = new THREE.Group();
    group.name = 'animals';
    var animals = SA.data.all('animals');
    var spots = SA.animalPlan.placements(animals, opts);

    animals.forEach(function (animal) {
      var g = new THREE.Group();
      g.name = animal.id;
      g.userData = { animalId: animal.id, pickVolumes: [] };
      SA.animalPlan.plan(animal).forEach(function (spec) {
        var geo = geos[spec.builder] || (geos[spec.builder] = unitGeometry(THREE, spec.builder));
        var mat = mats[spec.color] || (mats[spec.color] = new THREE.MeshLambertMaterial({ color: spec.color, flatShading: true }));
        var mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(spec.size[0], spec.size[1], spec.size[2]);
        mesh.position.set(spec.position[0], spec.position[1], spec.position[2]);
        mesh.rotation.set(spec.rotation[0], spec.rotation[1], spec.rotation[2]);
        tag(mesh, spec);
        if (spec.pupil) {
          // A child of the part mesh (unit-sphere space, so it follows the part's scale and reactions); never a pick target.
          var pmat = mats[spec.pupil] || (mats[spec.pupil] = new THREE.MeshLambertMaterial({ color: spec.pupil, flatShading: true }));
          var pupil = new THREE.Mesh(geos.pupil || (geos.pupil = unitGeometry(THREE, 'sphere')), pmat);
          pupil.scale.set(PUPIL_SIZE, PUPIL_SIZE, PUPIL_SIZE);
          pupil.position.set(0, 0, PUPIL_FORWARD);
          pupil.userData = { animalId: spec.animalId, pupil: true };
          mesh.add(pupil);
        }
        var pick = new THREE.Mesh(pickGeo, pickMat);
        pick.scale.set(spec.pickSize[0], spec.pickSize[1], spec.pickSize[2]);
        pick.position.copy(mesh.position);
        pick.rotation.set(spec.rotation[0], spec.rotation[1], spec.rotation[2]);
        pick.visible = false;
        tag(pick, spec);
        pick.userData.pick = true;
        pick.userData.pickVolume = spec.pickVolume;
        g.add(mesh, pick);
        g.userData.pickVolumes.push(pick);
      });
      var s = spots[animal.id];
      g.position.set(s.x, s.y, s.z);
      g.rotation.y = s.rotY;
      // Easter eggs stay hidden (and cannot be picked) until SA.unlockFlow reveals them.
      g.visible = !animal.easterEgg || !!(SA.unlocks && SA.unlocks.isUnlocked(animal.id));
      group.add(g);
    });
    return group;
  };
})(typeof window !== 'undefined' ? window : globalThis);
