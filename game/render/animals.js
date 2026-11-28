/* SA.render.buildAnimals(THREE, opts): one THREE.Group per animal, assembled purely from data via
 * SA.animalPlan (no animal-specific code). Returns a Group named 'animals' whose children are the animal groups
 * (userData { animalId, instanceId }; name = instanceId such as 'conejo#2': a species has `herd` instances, AS-0255), each holding
 * visible part meshes and invisible pick volumes. SA.render.instances finds a group by species or instance.
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

  // AS-0405: a white specular dot on the pupil and a half-sphere eyelid over the top of the eye (unit-sphere space of the eye part).
  var LID_SIZE = 1.08;           // lid sphere diameter vs the eye: a thin shell just outside the eye
  var LID_CAP = 0.4 * Math.PI;   // polar angle the lid covers from the top: a drooping lid over the upper part of the eye
  var GLINT_SIZE = 0.15;
  var GLINT_POS = [0.1, 0.12, 0.55];   // on the pupil's front surface, up and toward the animal's left

  // AS-0404: rounded limb profiles, revolved around y in unit space (height 1, widest radius 0.5), so scale gives any limb size.
  var TAPER = 0.62;           // bottom radius of a tapered limb, as a fraction of its top radius
  var CAP_H = { tapered: 0.14, capsule: 0.22 };   // height of each rounded end, as a fraction of the limb length
  var CAP_STEPS = 3;
  var QUARTER = Math.PI / 2;

  /** Lathe profile [[radius, y], ...] (bottom to top) of a tapered limb or capsule neck segment. Pure; unit-tested. */
  function limbProfile(shape) {
    var rb = shape === 'tapered' ? 0.5 * TAPER : 0.5, rt = 0.5, c = CAP_H[shape], pts = [], i, a;
    for (i = 0; i <= CAP_STEPS; i++) { a = (i / CAP_STEPS) * QUARTER; pts.push([rb * Math.sin(a), -0.5 + c * (1 - Math.cos(a))]); }
    for (i = CAP_STEPS; i >= 0; i--) { a = (i / CAP_STEPS) * QUARTER; pts.push([rt * Math.sin(a), 0.5 - c * (1 - Math.cos(a))]); }
    return pts;
  }

  function limbGeometry(THREE, shape) {
    return new THREE.LatheGeometry(limbProfile(shape).map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 10);
  }

  function unitGeometry(THREE, builder, shape) {
    if (builder === 'cylinder' && (shape === 'tapered' || shape === 'capsule')) return limbGeometry(THREE, shape);
    if (builder === 'paw' || builder === 'claw') return new THREE.SphereGeometry(0.5, 10, 7);   // AS-0406: rounded paw / claw pad, flattened by the part scale
    if (builder === 'hoof') return new THREE.CylinderGeometry(0.5, 0.5, 1, 8);                   // a dark flat disc
    if (builder === 'box') return new THREE.BoxGeometry(1, 1, 1);
    if (builder === 'sphere') return new THREE.SphereGeometry(0.5, 12, 9);
    if (builder === 'cone') return new THREE.ConeGeometry(0.5, 1, 8);
    if (builder === 'cylinder') return new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    if (builder === 'eyelid') return new THREE.SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, LID_CAP);
    if (builder === 'zigzag') return SA.render.zigzagGeometry(THREE);
    throw new Error('unknown builder ' + builder);
  }

  // AS-0406: three small cone claws poking forward from a claw foot's pad. Children of the pad (so they ride with the leg),
  // decor only (never pick targets); sizes are given in world units and divided by the pad's scale, so the squashed pad
  // does not squash them. A cone's length axis is turned to +z, so after the turn its x/z map to the pad's x/y.
  var CLAW_COLOR = '#d8cfbc', CLAW_SPREAD = 0.28, CLAW_LEN = 0.35, CLAW_WIDTH = 0.14;   // spread in pad-width units; length/width in pad widths
  function addClaws(THREE, pad, spec, geos, mats) {
    var sx = spec.size[0], sy = spec.size[1], sz = spec.size[2], len = CLAW_LEN * sx, d = Math.min(CLAW_WIDTH * sx, sy * 1.6);
    var mat = mats.claw || (mats.claw = new THREE.MeshPhongMaterial({ color: CLAW_COLOR, flatShading: false, specular: 0x000000 }));
    var geo = geos.clawCone || (geos.clawCone = unitGeometry(THREE, 'cone'));
    [-1, 0, 1].forEach(function (k) {
      var c = new THREE.Mesh(geo, mat);
      c.scale.set(d / sx, len / sz, d / sy);
      c.rotation.set(Math.PI / 2, 0, 0);
      c.position.set(k * CLAW_SPREAD, 0, 0.4 + len / sz / 2);
      c.userData = { animalId: spec.animalId, decor: true, claw: true };
      pad.add(c);
    });
  }

  function tag(mesh, spec) {
    mesh.userData = { animalId: spec.animalId, instanceId: spec.instanceId, part: spec.part, index: spec.index };
    if (spec.side) mesh.userData.side = spec.side;
    if (spec.extra) mesh.userData.extra = true;   // a neck segment / knee / foot: rides with its parent part when limbs animate
  }

  // One animal group from data at a spot { x, y, z, rotY }; shares geometry/material caches across calls (AS-0233: story animals
  // placed by a mission use the very same path, SA.render.animalBuilder(THREE)(animal, spot)).
  SA.render.animalBuilder = function (THREE) {
    var geos = {}, mats = {};
    var pickGeo = new THREE.BoxGeometry(1, 1, 1);
    var pickMat = new THREE.MeshBasicMaterial({ visible: false });
    return function build(animal, s) {
      var g = new THREE.Group();
      var instanceId = (s && s.instanceId) || animal.id;   // 'conejo#2' for a herd instance; a story animal keeps its animal id
      g.name = instanceId;
      g.userData = { animalId: animal.id, instanceId: instanceId, pickVolumes: [] };
      if (s && s.radius) g.userData.wanderRadius = s.radius;   // AS-0249: how far it roams from home (reaches empty quadrants)
      var plan = SA.animalPlan.plan(animal);
      plan.forEach(function (spec) {
        var gkey = spec.shape ? spec.builder + ':' + spec.shape : spec.builder;   // geometry is cached and shared by every animal
        var geo = geos[gkey] || (geos[gkey] = unitGeometry(THREE, spec.builder, spec.shape));
        var mkey = spec.gradient ? spec.color + ':g' : spec.color;   // AS-0407: body/head/neck get the back-to-belly vertex-colour gradient
        var shaded = !!(spec.gradient && SA.render.animalShade);   // (tests that load only part of the game skip the shade module)
        if (shaded) {
          var ggeo = gkey + ':g';
          geo = geos[ggeo] || (geos[ggeo] = SA.render.animalShade.gradientGeometry(THREE, geo));
        }
        var mat = mats[mkey] || (mats[mkey] = new THREE.MeshPhongMaterial({ color: spec.color, flatShading: false, specular: 0x000000, vertexColors: shaded }));
        var mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(spec.size[0], spec.size[1], spec.size[2]);
        mesh.position.set(spec.position[0], spec.position[1], spec.position[2]);
        mesh.rotation.set(spec.rotation[0], spec.rotation[1], spec.rotation[2]);
        spec.instanceId = instanceId;
        tag(mesh, spec);
        if (spec.pupil) {
          // A child of the part mesh (unit-sphere space, so it follows the part's scale and reactions); never a pick target.
          var pmat = mats[spec.pupil] || (mats[spec.pupil] = new THREE.MeshPhongMaterial({ color: spec.pupil, flatShading: false, specular: 0x000000 }));
          var pupil = new THREE.Mesh(geos.pupil || (geos.pupil = unitGeometry(THREE, 'sphere')), pmat);
          pupil.scale.set(PUPIL_SIZE, PUPIL_SIZE, PUPIL_SIZE);
          pupil.position.set(0, 0, PUPIL_FORWARD);
          pupil.userData = { animalId: spec.animalId, pupil: true, decor: true };
          mesh.add(pupil);
          // Highlight and eyelid: also non-pick children (flagged decor), sharing cached geometry and materials.
          var glint = new THREE.Mesh(geos.glint || (geos.glint = unitGeometry(THREE, 'sphere')),
            mats.glint || (mats.glint = new THREE.MeshBasicMaterial({ color: 0xffffff })));
          glint.scale.set(GLINT_SIZE, GLINT_SIZE, GLINT_SIZE);
          glint.position.set(GLINT_POS[0], GLINT_POS[1], GLINT_POS[2]);
          glint.userData = { animalId: spec.animalId, decor: true, glint: true };
          mesh.add(glint);
        }
        if (spec.eyelid) {
          var lkey = 'lid' + spec.eyelid;
          var lid = new THREE.Mesh(geos.eyelid || (geos.eyelid = unitGeometry(THREE, 'eyelid')),
            mats[lkey] || (mats[lkey] = new THREE.MeshPhongMaterial({ color: spec.eyelid, flatShading: false, specular: 0x000000 })));
          lid.scale.set(LID_SIZE, LID_SIZE, LID_SIZE);
          lid.userData = { animalId: spec.animalId, decor: true, eyelid: true };
          mesh.add(lid);
        }
        if (spec.foot === 'claw') addClaws(THREE, mesh, spec, geos, mats);
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
      // AS-0407: spots / bands on the body, one instanced mesh per animal (decor: not in pickVolumes, no `part`).
      var marks = animal.markings && SA.render.animalShade && SA.animalMarkings &&
        SA.render.animalShade.markingsMesh(THREE, SA.animalMarkings.plan(animal, plan), { geos: geos, mats: mats }, g.userData);
      if (marks) g.add(marks);
      g.position.set(s.x, s.y, s.z);
      g.rotation.y = s.rotY;
      // Easter eggs stay hidden (and cannot be picked) until SA.unlockFlow reveals them.
      g.visible = !animal.easterEgg || !!(SA.unlocks && SA.unlocks.isUnlocked(animal.id));
      return g;
    };
  };

  SA.render.limbProfile = limbProfile;
  SA.render.unitGeometry = unitGeometry;

  SA.render.buildAnimals = function (THREE, opts) {
    var build = SA.render.animalBuilder(THREE);
    var group = new THREE.Group();
    group.name = 'animals';
    var animals = SA.data.all('animals').filter(function (a) { return !a.story; });   // story animals (pigs) are placed by their mission
    var spots = SA.animalPlan.placements(animals, opts);
    // AS-0255: one group per herd instance (animal.herd of them), all through the same builder so geometry and materials are shared.
    var byId = {};
    animals.forEach(function (a) { byId[a.id] = a; });
    SA.animalPlan.herdPlacements(animals, opts).forEach(function (spot) { group.add(build(byId[spot.animalId], spot)); });
    return group;
  };
})(typeof window !== 'undefined' ? window : globalThis);
