/* SA.render.createStage(THREE, container): renderer + scene + lights + sky + world + camera rig.
 * Returns { render(dt), resize(), scene, camera, renderer, rig }.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SKY = 0xbfe6f5;

  SA.render.createStage = function (THREE, container) {
    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.setClearColor(SKY, 1);
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 70, 150);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8f5a, 0.75));
    var sun = new THREE.DirectionalLight(0xfff2d6, 0.85);
    sun.position.set(-30, 50, 20);
    scene.add(sun);

    // Big dark-green apron so the area outside the map never shows the sky colour.
    var apron = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: 0x4d8a4a }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -3.2;
    scene.add(apron);

    scene.add(SA.render.buildWorld(THREE));
    var decor = SA.render.buildDecor(THREE);
    scene.add(decor);
    // The research station beside the spawn (AS-0145): its walls block the player (obstacles below), its footprint stays clear.
    var station = SA.render.buildStation && SA.station ? SA.render.buildStation(THREE) : null;
    if (station) scene.add(station);
    var stationWalls = SA.station ? SA.station.obstacles() : [];
    // The scientist NPC (AS-0203) stands on the porch beside the door, never moves, and the player walks around her.
    var scientist = SA.render.createScientist && SA.npc ? SA.render.createScientist(THREE) : null;
    if (scientist) { scene.add(scientist.group); stationWalls = stationWalls.concat([SA.npc.obstacle()]); }
    var avoid = decor.children.map(function (o) { return [o.position.x, o.position.z]; });
    if (SA.station) avoid = avoid.concat(SA.station.avoidPoints());
    var animals = SA.render.buildAnimals(THREE, { avoid: avoid });
    scene.add(animals);

    var camera = new THREE.PerspectiveCamera(SA.camera.DEFAULTS.fovDeg, 1, 0.5, 400);
    var picking, stageApi = {};
    // While a care task is rubbing a part, a drag that starts on that part rubs it instead of orbiting.
    // Third person: the player walks as a kid avatar; animals, decor and placed props push the avatar aside.
    var solidPropPoints = [];   // placed props that block the player (flores don't); rebuilt in refreshAvoid
    // Only things that should stop the player count: trees, rocks, ponds, bridges and big animals. Flowers, grass and small
    // animals are soft (SA.blocking reads that from data), so the player walks straight through them.
    function obstacles() {
      return stationWalls.concat(SA.blocking.obstacles({
        decor: decor.children.map(function (o) { return { x: o.position.x, z: o.position.z, decor: o.userData && o.userData.decor, scale: o.scale ? o.scale.x : 1 }; }),
        propPoints: solidPropPoints,
        animals: animals.children.map(function (g) {
          var u = g.userData || {};
          return { x: g.position.x, z: g.position.z, animalId: u.animalId, perched: u.perched };
        }),
      }));
    }
    // The cacti (data prick: true) never move: their circles are read once.
    var prickCircles = null;
    function pricklies() {
      return prickCircles || (prickCircles = SA.blocking.pricklies(decor.children.map(function (o) { return { x: o.position.x, z: o.position.z, decor: o.userData && o.userData.decor }; })));
    }
    // Perched (tree-dwelling) animals' world positions: the chase camera frames them when they are above the player (SA.camera.frameAbove).
    function perchedAnimals() {
      var out = [];
      animals.children.forEach(function (g) { if (g.userData && g.userData.perched) out.push({ x: g.position.x, y: g.position.y, z: g.position.z }); });
      return out;
    }
    var rig = SA.render.createCameraRig(THREE, renderer.domElement, camera, { chase: { obstacles: obstacles, pricklies: pricklies, trees: function () { return climbables; }, above: perchedAnimals }, canOrbit: function (e) {
      return !(SA.picking.hasRubTarget() && picking && SA.picking.isRubTarget(picking.pickAt(e.clientX, e.clientY)));
    } });
    var avatar = SA.render.createAvatar(THREE);
    scene.add(avatar.group);
    // The equipped item (SA.inventory) shows as a small model in the avatar's right hand; it swaps as the equipped item changes.
    var handItem = SA.render.createHandItem ? SA.render.createHandItem(THREE, { hand: avatar.parts.armR }) : null;
    // Taps on an animal out of the walking player's reach show "¡Acércate!" above the avatar (SA.reach) instead of picking.
    var reachCue = SA.render.createReachCue ? SA.render.createReachCue(THREE, { camera: camera, container: container, getPlayer: rig.getPlayer }) : null;
    var clickFx = SA.render.createClickFx ? SA.render.createClickFx({ container: container }) : null;   // ripple where a click found nothing
    picking = SA.render.createPicking(THREE, { canvas: renderer.domElement, camera: camera, animals: animals, container: container,
      getPlayer: rig.getPlayer, reachCue: reachCue, clickFx: clickFx });

    var treeTap = SA.render.createTreeTap(THREE, { canvas: renderer.domElement, camera: camera, decor: decor,
      hitsAnimal: function (x, y) { return !!picking.pickAt(x, y); },
      onTap: function (t) { if (stageApi.onTreeTap) stageApi.onTreeTap(t); } });

    var props = SA.render.createProps(THREE, { canvas: renderer.domElement, camera: camera });
    scene.add(props.group);
    if (props.ghostGroup) scene.add(props.ghostGroup);

    var treeNodes = decor.children.filter(function (o) { return o.userData && o.userData.tree; });
    var trees = treeNodes.map(function (o) {
      return { x: o.position.x, z: o.position.z, y: o.position.y, scale: o.scale.y, kind: o.userData.kind };
    });
    // One combined climb-target list (AS-0193): the trees plus the data-driven peaks (SA.peaks.targets()). The camera rig, the
    // Space/E chooser, the outline and the auto-climb ring all read this same list, so a peak climbs exactly like a tree.
    // The station building (AS-0194) is a third kind of data target in the same list.
    var climbables = trees.concat(SA.peaks ? SA.peaks.targets() : [], SA.station && SA.station.climbTarget ? [SA.station.climbTarget()] : []);
    // Collectable finds (SA.pickups): fruit up in the canopies, rocks/flowers/leaves on the ground, fish on the banks.
    var pickups = SA.render.createPickups && SA.pickups ? SA.render.createPickups(THREE, { getPlayer: rig.getPlayer, trees: trees, avoid: avoid, seed: 80, container: container }) : null;
    if (pickups) scene.add(pickups.group);
    // The one Space key: acts on the single chosen target (aim part > tree/pickup in reach), see game/space-use.js.
    var spaceUse = SA.spaceUse ? SA.spaceUse.create({ getPlayer: rig.getPlayer, trees: function () { return climbables; }, picking: picking, rig: rig,
      pickups: pickups ? pickups.world : null, collect: pickups ? pickups.collectSpot : function () { return null; },
      // The station doorway (AS-0146) is a Use target: E / Enter opens the station menu hook (and closes it again).
      doors: function () { return SA.station && SA.station.doorTargets ? SA.station.doorTargets() : null; },
      openDoor: function () { if (!SA.station || !SA.station.toggle) return false; SA.station.toggle('use'); return true; }, root: root }) : null;
    // Tapping or clicking the doorway does the same (the invisible pick volume sits in the station's door frame).
    if (station && station.userData.doorNode && SA.render.createStationDoorTap && SA.station && SA.station.canTapDoor) {
      SA.render.createStationDoorTap(THREE, { canvas: renderer.domElement, camera: camera, node: station.userData.doorNode,
        getPlayer: rig.getPlayer, hitsAnimal: function (x, y) { return !!picking.pickAt(x, y); } });
    }
    // The one outline: whatever spaceUse chose (part, tree or pickup) glows, nothing else (AS-0101).
    var outline = spaceUse && SA.render.createTargetOutline ? SA.render.createTargetOutline(THREE, { getTarget: spaceUse.target, nodeFor: function (kind, ref) {
      if (kind === 'part') return ref && ref.mesh || null;
      if (kind === 'tree') {
        var i = trees.indexOf(ref);
        if (i >= 0) return treeNodes[i];
        var found = null;   // any data target (peak, building): the node carrying its id as userData.climbId
        if (ref && ref.id) decor.children.concat(station ? [station] : []).forEach(function (o) { if (o.userData && o.userData.climbId === ref.id) found = o; });
        return found;
      }
      if (kind === 'door') return station && station.userData ? station.userData.doorNode || null : null;
      return kind === 'pickup' && pickups ? pickups.nodeFor(ref) : null;
    } }) : null;
    // The filling ring round a trunk while the player pushes into it (AS-0157, SA.climb.autoStep).
    var autoRing = SA.render.createAutoClimbRing ? SA.render.createAutoClimbRing(THREE, { scene: scene, getAutoClimb: rig.autoClimb }) : null;
    // Wanderers also keep out of the spawn circle, so the player never starts beside (or has to wait for) an animal.
    var spawnZone = SA.player && SA.player.spawnZone ? [SA.player.spawnZone()] : [];
    var ambient = SA.render.createAmbient({ animals: animals, avoid: avoid.concat(spawnZone), trees: trees });
    // Tree animals give a tell from the ground (AS-0117): a shadow below them, now and then rustling leaves and a soft call.
    // Built after the ambient system, which marks the tree dwellers (userData.perched).
    var treetop = SA.render.createTreetopTell && SA.treetopTell ? SA.render.createTreetopTell(THREE, { animals: animals, trees: trees, treeNodes: treeNodes, getPlayer: rig.getPlayer, scene: scene }) : null;
    // Placed props (this session and restored from the save) join the decor in the wander avoid list. The save is
    // already updated when the sandbox calls add/remove, so the list is rebuilt from SA.habitat.list().
    function refreshAvoid() {
      if (SA.propAvoid && SA.habitat) {
        var records = SA.habitat.list();
        solidPropPoints = SA.blocking.solidProps(records);
        ambient.setAvoid(avoid.concat(spawnZone, SA.propAvoid.points(records)));   // wanderers still keep clear of every prop
      }
    }
    ['add', 'remove'].forEach(function (k) {
      var orig = props[k];
      props[k] = function () { var r = orig.apply(props, arguments); refreshAvoid(); return r; };
    });
    refreshAvoid();
    var fx = SA.render.createRoundFx({ animals: animals });
    var biomeGlow = SA.render.createBiomeGlow ? SA.render.createBiomeGlow(THREE, { scene: scene }) : null;
    var careFx = SA.render.createCareFx(THREE, { animals: animals, ambient: ambient });

    function resize() {
      var w = container.clientWidth || root.innerWidth || 800;
      var h = container.clientHeight || root.innerHeight || 600;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    root.addEventListener('resize', resize);

    // stageApi.onTreeTap({ id, biome }) is set by main.js (easter-egg unlocks).
    stageApi = {
      scene: scene, camera: camera, renderer: renderer, rig: rig, picking: picking, props: props, fx: fx, careFx: careFx, biomeGlow: biomeGlow, ambient: ambient, resize: resize,
      animals: animals, treeTap: treeTap, onTreeTap: null,
      avatar: avatar, pickups: pickups, spaceUse: spaceUse,
      render: function (dt) { rig.update(dt); avatar.update(dt, rig.getPlayer()); if (scientist) scientist.update(dt, rig.getPlayer()); if (handItem) handItem.update(); if (pickups) pickups.update(dt); picking.update(dt); if (spaceUse) spaceUse.update(); if (outline) outline.update(dt); if (autoRing) autoRing.update(dt); if (reachCue) reachCue.update(dt); if (clickFx) clickFx.update(dt); treeTap.update(dt); ambient.update(dt); if (treetop) treetop.update(dt); fx.update(dt); careFx.update(dt); if (biomeGlow) biomeGlow.update(dt); renderer.render(scene, camera); },
    };
    return stageApi;
  };
})(typeof window !== 'undefined' ? window : globalThis);
