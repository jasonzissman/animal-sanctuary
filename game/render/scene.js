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

    var hemi = new THREE.HemisphereLight(0xffffff, 0x6a8f5a, 0.75);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xfff2d6, 0.85);
    sun.position.set(-30, 50, 20);
    scene.add(sun);

    // Big dark-green apron so the area outside the map never shows the sky colour.
    var apron = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: 0x4d8a4a }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -3.2;
    scene.add(apron);

    var world = SA.render.buildWorld(THREE);
    scene.add(world);
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
    var streamStones = SA.forestStreams ? SA.forestStreams.stoneSolids() : [];   // low solids [x, z, r, h] (AS-0301), static
    var logSolids = SA.fallenLogs ? SA.fallenLogs.solids() : [];   // low solids [x, z, r, h] along each fallen log (AS-0302), static
    var desertSolids = SA.desertPlan ? SA.desertPlan.solids() : [];   // the rock arch's pillars, the oasis pool and palm trunks (AS-0308), static; the gap under the arch stays open
    var boulderSolids = SA.mountainPlan ? SA.mountainPlan.solids() : [];   // the montaña's boulder field (AS-0309), static; low flat stones can be jumped
    var towerSolids =SA.lookouts ? SA.lookouts.solids() : [];   // the lookout towers' legs and sides on the ground (AS-0160), static
    var lookoutsView = null;   // the towers' merged mesh, built with the other static scenery below
    function obstacles() {
      var pl = rig && rig.getPlayer ? rig.getPlayer() : null, rope = pl && SA.surfaces && SA.surfaces.ropeSolidsAt ? SA.surfaces.ropeSolidsAt(pl.x, pl.z, pl.y) : null;
      if (rope) return rope;   // up on the rope bridge (AS-0159) only its rails block: not the peak's ring or a boulder far below
      return stationWalls.concat(streamStones, logSolids, desertSolids, boulderSolids, towerSolids, SA.surfaces ? SA.surfaces.solids() : [], SA.missionLog ? SA.missionLog.solids() : [], SA.blocking.obstacles({
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
    // A Use target on the ground in reach (an animal part, a pickup or NPC at about the player's height): the camera must not tilt away from it (AS-0216).
    function groundTarget() {
      var t = spaceUse && spaceUse.target();
      if (!t) return false;
      if (t.kind === 'part') return true;
      return t.kind === 'pickup' && !!t.ref && (typeof t.ref.y !== 'number' || t.ref.y - (rig.getPlayer().y || 0) < SA.camera.FRAME_DEFAULTS.minAbove);
    }
    var rig = SA.render.createCameraRig(THREE, renderer.domElement, camera, { chase: { obstacles: obstacles, pricklies: pricklies, trees: function () { return climbables; }, above: perchedAnimals, ground: groundTarget }, canOrbit: function (e) {
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
    var climbables = trees.concat(SA.peaks ? SA.peaks.targets() : [], SA.station && SA.station.climbTarget ? [SA.station.climbTarget()] : [], SA.lookouts ? SA.lookouts.targets() : []);   // + the lookout-tower ladders (AS-0160)
    // Collectable finds (SA.pickups): fruit up in the canopies, rocks/flowers/leaves on the ground, fish on the banks.
    var pickups = SA.render.createPickups && SA.pickups ? SA.render.createPickups(THREE, { getPlayer: rig.getPlayer, trees: trees, avoid: avoid, seed: 80, container: container }) : null;
    if (pickups) scene.add(pickups.group);
    // Use targets of the station area: the missions board inside (AS-0211) and the scientist (AS-0204), stable lists. The doorway is none.
    var boardTargets = SA.station && SA.station.boardTargets ? SA.station.boardTargets() : [];
    var npcTargets = scientist && SA.npc.useTargets ? SA.npc.useTargets() : [];
    // The one Space key: acts on the single chosen target (aim part > tree/pickup in reach), see game/space-use.js.
    var spaceUse = SA.spaceUse ? SA.spaceUse.create({ getPlayer: rig.getPlayer, trees: function () { return climbables; }, picking: picking, rig: rig,
      pickups: pickups ? pickups.world : null, collect: pickups ? pickups.collectSpot : function () { return null; },
      // The missions board in the station (AS-0211) is a Use target: E / Enter opens the missions via the station hook (and closes it again).
      // The porch scientist (AS-0204) is an 'npc' Use target: E / Enter talks to her.
      boards: function () { return boardTargets; },
      // The waiting lost baby of a story mission (AS-0234) is one more npc target: E / Enter uses it to find it.
      npcs: function () {
        var baby = SA.missionBaby && SA.missionBaby.useTarget();
        return baby ? npcTargets.concat([baby]) : npcTargets;
      },
      openBoard: function (board) {
        if (board && board.source === 'bed') { if (SA.sleepView) SA.sleepView.use(); return true; }   // the bed sleeps until morning (AS-0170): no card
        if (!SA.station || !SA.station.toggle) return false;
        SA.station.toggle(board && board.source ? board.source : 'board');   // the Insignias board opens with source 'badges' (AS-0239)
        return true;
      },
      talk: function (npc) {
        if (npc && npc.id === 'baby') return !SA.picking.isPaused() && !!SA.missionBaby && SA.missionBaby.use();
        return !SA.picking.isPaused() && SA.npc.talk('use');
      }, root: root }) : null;
    // Tapping or clicking the board does the same (an invisible pick volume in its group); a tap on the
    // scientist's pick volume talks to her, and wins where the two volumes overlap.
    var scientistTap = scientist && SA.render.createScientistTap && SA.npc ? SA.render.createScientistTap(THREE, { canvas: renderer.domElement,
      camera: camera, node: scientist.group, getPlayer: rig.getPlayer, hitsAnimal: function (x, y) { return !!picking.pickAt(x, y); } }) : null;
    if (station && station.userData.board && SA.render.createStationBoardTap && SA.station && SA.station.canTapBoard) {
      SA.render.createStationBoardTap(THREE, { canvas: renderer.domElement, camera: camera, node: station.userData.board.group,
        getPlayer: rig.getPlayer, hitsAnimal: function (x, y) { return !!picking.pickAt(x, y) || !!(scientistTap && scientistTap.hits(x, y)); } });
    }
    // A tap on the bed sleeps until morning (AS-0170).
    if (station && station.userData.night && SA.render.createStationBoardTap && SA.station && SA.station.bedTarget) {
      SA.render.createStationBoardTap(THREE, { canvas: renderer.domElement, camera: camera, node: station.userData.night.group,
        getPlayer: rig.getPlayer, target: SA.station.bedTarget(), act: function () { if (SA.sleepView) SA.sleepView.use(); },
        hitsAnimal: function (x, y) { return !!picking.pickAt(x, y) || !!(scientistTap && scientistTap.hits(x, y)); } });
    }
    // The roof telescope (Mission 12, AS-0371): a tap opens the night-sky view, drawn in place of the world while it is open.
    var skyView = null;
    try {
      if (station && station.userData.telescope && SA.render.createSkyView && SA.missionSky) {
        skyView = SA.render.createSkyView(THREE, { renderer: renderer, canvas: renderer.domElement, camera: camera, station: station, getPlayer: rig.getPlayer });
      }
    } catch (e) { skyView = null; if (root.SAT && root.SAT.error) root.SAT.error('skyView.start', e); }
    // The same tap for the Insignias board (AS-0239): opens the card with source 'badges'.
    if (station && station.userData.badgesBoard && SA.render.createStationBoardTap && SA.station && SA.station.badgesTarget) {
      SA.render.createStationBoardTap(THREE, { canvas: renderer.domElement, camera: camera, node: station.userData.badgesBoard.group,
        getPlayer: rig.getPlayer, target: SA.station.badgesTarget(), source: 'badges',
        hitsAnimal: function (x, y) { return !!picking.pickAt(x, y) || !!(scientistTap && scientistTap.hits(x, y)); } });
    }
    // The one outline: whatever spaceUse chose (part, tree or pickup) glows, nothing else (AS-0101).
    var outline = spaceUse && SA.render.createTargetOutline ? SA.render.createTargetOutline(THREE, { getTarget: spaceUse.target, nodeFor: function (kind, ref) {
      if (kind === 'part') return ref && (ref.node || ref.mesh) || null;   // a whole-animal target outlines the whole animal (AS-0128)
      if (kind === 'tree') {
        var i = trees.indexOf(ref);
        if (i >= 0) return treeNodes[i];
        var found = null;   // any data target (peak, building): the node carrying its id as userData.climbId
        if (ref && ref.id) decor.children.concat(station ? [station] : []).forEach(function (o) { if (o.userData && o.userData.climbId === ref.id) found = o; });
        if (!found && ref && ref.kind === 'ladder' && lookoutsView) found = lookoutsView.nodeFor(ref.id);   // a lookout tower glows whole
        return found;
      }
      if (kind === 'npc' && ref && ref.id === 'baby') return missionAnimals ? missionAnimals.babyNode() : null;   // the lost baby (AS-0234)
      if (kind === 'npc') return scientist ? scientist.group : null;   // her pick volume is invisible, so only the model glows
      if (kind === 'board' && ref && ref.id === 'station-bed') return station && station.userData && station.userData.night ? station.userData.night.group : null;
      if (kind === 'board' && ref && ref.id === 'station-badges') return station && station.userData && station.userData.badgesBoard ? station.userData.badgesBoard.group : null;
      if (kind === 'board') return station && station.userData && station.userData.board ? station.userData.board.group : null;
      return kind === 'pickup' && pickups ? pickups.nodeFor(ref) : null;
    } }) : null;
    // The filling ring round a trunk while the player pushes into it (AS-0157, SA.climb.autoStep).
    var autoRing = SA.render.createAutoClimbRing ? SA.render.createAutoClimbRing(THREE, { scene: scene, getAutoClimb: rig.autoClimb }) : null;
    // Wanderers also keep out of the spawn circle, so the player never starts beside (or has to wait for) an animal.
    var spawnZone = SA.player && SA.player.spawnZone ? [SA.player.spawnZone()] : [];
    var ambient = SA.render.createAmbient({ animals: animals, avoid: avoid.concat(spawnZone), trees: trees });
    // Tree animals give a tell from the ground (AS-0117): a shadow below them, now and then rustling leaves and a soft call.
    // Built after the ambient system, which marks the tree dwellers (userData.perched).
    // The animals a story mission places (mission 1: the lost piglet and mamá, AS-0233): same animal builder, own group, solids = the walk list.
    var missionAnimals = SA.render.createMissionSpawn && SA.missionSpawn ? SA.render.createMissionSpawn(THREE, { scene: scene, solids: obstacles, getPlayer: rig.getPlayer,
      baby: SA.missionBaby, canvas: renderer.domElement, camera: camera }) : null;
    // The carried thing and its nest (mission 2, the lost egg, AS-0313): primitives only, placed by SA.missionCarry from the mission row.
    var missionCarry = SA.render.createMissionCarry && SA.missionCarry ? SA.render.createMissionCarry(THREE, { scene: scene, solids: function () { return obstacles; }, getPlayer: rig.getPlayer }) : null;
    // The egg hatches in the nest, mamá pato and the duckling, the tracks to the egg and the family photo tap (AS-0315).
    var missionHatch = SA.render.createMissionHatch && SA.missionHatch ? SA.render.createMissionHatch(THREE, { scene: scene, getPlayer: rig.getPlayer, canvas: renderer.domElement, camera: camera }) : null;
    // The river rock with the stranded puppy and the log you push across to it (mission 3, AS-0319).
    var missionLog = SA.render.createMissionLog && SA.missionLog ? SA.render.createMissionLog(THREE, { scene: scene, solids: function () { return obstacles(); }, getPlayer: rig.getPlayer, canvas: renderer.domElement, camera: camera }) : null;
    // The monkey's birthday bananas in the selva (mission 4, AS-0326): they exist only while that mission runs.
    var missionBananas = SA.render.createMissionBananas && SA.missionBananas ? SA.render.createMissionBananas(THREE, { scene: scene, solids: function () { return obstacles(); } }) : null;
    var missionGather = SA.render.createMissionGather && SA.missionGather ? SA.render.createMissionGather(THREE, { scene: scene, solids: function () { return obstacles(); } }) : null;   // AS-0351
    // The party friends and the monkey's tree (mission 4, AS-0327): invited friends follow the player (SA.missionFriends -> SA.follow.stepGroup).
    var missionFriends = SA.render.createMissionFriends && SA.missionFriends ? SA.render.createMissionFriends(THREE, { scene: scene, solids: function () { return obstacles(); }, getPlayer: rig.getPlayer }) : null;
    // The party at the monkey's tree (mission 4, AS-0328): balloons, confetti and the party photo tap; the friends renderer does the dancing.
    var missionParty = SA.render.createMissionParty && SA.missionParty && missionFriends ? SA.render.createMissionParty(THREE, { scene: scene, getPlayer: rig.getPlayer, canvas: renderer.domElement,
      camera: camera, getTargets: missionFriends.partyNodes }) : null;
    // The sick camel by the oasis, its thermometer and the bucket (mission 5, AS-0331): they exist only while that mission runs.
    var missionDoctor = SA.render.createMissionDoctor && SA.missionDoctor ? SA.render.createMissionDoctor(THREE, { scene: scene, solids: function () { return obstacles(); }, getPlayer: rig.getPlayer, canvas: renderer.domElement, camera: camera }) : null;
    // The feather by the mountain trail and the eagle's nest on the far peak (mission 6, AS-0336): they exist only while that mission runs.
    var missionNest = SA.render.createMissionNest && SA.missionNest ? SA.render.createMissionNest(THREE, { scene: scene, solids: function () { return obstacles(); }, getPlayer: rig.getPlayer, canvas: renderer.domElement, camera: camera }) : null;
    // The hidden hollow tree with the mouse family and the strawberry pantry (mission 8, AS-0346): they exist only while that mission runs.
    var missionPantry = SA.render.createMissionPantry && SA.missionPantry ? SA.render.createMissionPantry(THREE, { scene: scene, solids: function () { return obstacles(); }, getPlayer: rig.getPlayer, canvas: renderer.domElement, camera: camera }) : null;
    // The empty basket, paw prints, crumbs and the log to walk under (mission 8, AS-0347): the prints show only on the 'Sigue las huellas' step.
    var missionTrail = SA.render.createMissionTrail && SA.missionTrail ? SA.render.createMissionTrail(THREE, { scene: scene }) : null;
    // The build spot and the new rabbit family beside it (mission 9, AS-0350): they exist only while that mission runs.
    var missionHome = SA.render.createMissionHome && SA.missionHome ? SA.render.createMissionHome(THREE, { scene: scene, solids: function () { return obstacles(); }, getPlayer: rig.getPlayer, canvas: renderer.domElement, camera: camera }) : null;
    // The race course: start line with the rabbit, a path of flags and the big tree (mission 10, AS-0354): it exists only while that mission runs.
    var missionRace = SA.render.createMissionRace && SA.missionRace ? SA.render.createMissionRace(THREE, { scene: scene, getPlayer: rig.getPlayer, canvas: renderer.domElement, camera: camera }) : null;
    // The mailbox on the lookout tower for the lost-message mission (mission 11, AS-0364): it exists only while that mission runs.
    var missionLetter = SA.render.createMissionLetter && SA.missionLetter ? SA.render.createMissionLetter(THREE, { scene: scene, getPlayer: rig.getPlayer, canvas: renderer.domElement, camera: camera }) : null;
    var treetop = SA.render.createTreetopTell &&SA.treetopTell ? SA.render.createTreetopTell(THREE, { animals: animals, trees: trees, treeNodes: treeNodes, getPlayer: rig.getPlayer, scene: scene }) : null;
    // Placed props (this session and restored from the save) join the decor in the wander avoid list. The save is
    // already updated when the sandbox calls add/remove, so the list is rebuilt from SA.habitat.list().
    function refreshAvoid() {
      if (SA.propAvoid && SA.habitat) {
        var records = SA.habitat.list();
        solidPropPoints = SA.blocking.solidProps(records);
        if (SA.surfaces) SA.surfaces.setPlaced(records);   // the placed puentes are walkable decks (AS-0158)
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
    var taskRing = SA.render.createTaskRing ? SA.render.createTaskRing(THREE, { scene: scene, animals: animals }) : null;   // glow round the current small-task animal (AS-0226)
    var needIcons = SA.render.createNeedIcons ? SA.render.createNeedIcons(THREE, { scene: scene, animals: animals }) : null;   // floating emoji over animals that need help (AS-0245)
    var nameLabels = SA.render.createNameLabels ? SA.render.createNameLabels(THREE, { scene: scene, animals: animals }) : null;   // 'Luna la rápida' over a named animal you are near (AS-0169)
    var careFx = SA.render.createCareFx(THREE, { animals: animals, ambient: ambient });
    // The sun casts soft shadows (AS-0292) from animals, the avatar, trees, rocks and peaks onto the ground, in a window that follows the player.
    var sunShadow = SA.render.createSunShadow ? SA.render.createSunShadow(THREE, { renderer: renderer, scene: scene, sun: sun, getPlayer: rig.getPlayer,
      world: world, casters: [decor, avatar.group], dynamic: [animals] }) : null;

    // The day/night cycle (AS-0170): sky, fog, sun, moon, stars, fireflies and the station's lamps follow SA.daynight (ticked by main.js).
    var daynightView = null;
    if (SA.render.createDaynight && SA.daynight) {
      try { daynightView = SA.render.createDaynight(THREE, { scene: scene, renderer: renderer, hemi: hemi, sun: sun, getPlayer: rig.getPlayer, station: station }); }
      catch (e) { if (root.SAT && root.SAT.error) root.SAT.error('daynight.create', e); }
    }

    // Instanced grass tufts and tiny plants (AS-0294): soft, so in no obstacle list; the instance pool is recycled around the player.
    var groundCover = SA.render.createGroundCover && SA.groundCoverPlan ? SA.render.createGroundCover(THREE, { scene: scene, getPlayer: rig.getPlayer }) : null;

    // Foam along the water edges plus instanced pebbles and reeds on the banks (AS-0298): soft, static, in no obstacle list.
    if (SA.render.createWaterBanks && SA.waterBanks) {
      try { SA.render.createWaterBanks(THREE, { scene: scene, world: world }); } catch (e) { if (root.SAT && root.SAT.error) root.SAT.error('waterBanks.create', e); }
    }

    // The small forest streams (AS-0301): one moving water ribbon plus instanced stepping stones; the stones are low solids you can stand on.
    if (SA.render.createForestStreams && SA.forestStreams) {
      try { SA.render.createForestStreams(THREE, { scene: scene, world: world }); } catch (e) { if (root.SAT && root.SAT.error) root.SAT.error('forestStreams.create', e); }
    }

    // The fallen logs (AS-0302): one merged bark mesh; their footprint is in the obstacles above (hop over, stand on top).
    if (SA.render.createBridges && SA.surfaces) {   // the two river bridges (AS-0158)
      try { SA.render.createBridges(THREE, { scene: scene }); } catch (e) { if (root.SAT && root.SAT.error) root.SAT.error('bridges.create', e); }
    }
    if (SA.render.createLookouts && SA.lookouts) {   // the lookout towers with ladders (AS-0160)
      try { lookoutsView = SA.render.createLookouts(THREE, { scene: scene }); } catch (e) { if (root.SAT && root.SAT.error) root.SAT.error('lookouts.create', e); }
    }
    if (SA.render.createDesertLandmarks && SA.desertPlan) {   // the desierto's rock arch and oasis (AS-0308)
      try { SA.render.createDesertLandmarks(THREE, { scene: scene }); } catch (e) { if (root.SAT && root.SAT.error) root.SAT.error('desertLandmarks.create', e); }
    }
    var ropeBridge = null;   // the swaying rope bridge between two peaks (AS-0159); update(dt, player) sways it and creaks under your feet
    if (SA.render.createRopeBridge && SA.ropeBridge) {
      try { ropeBridge = SA.render.createRopeBridge(THREE, { scene: scene }); } catch (e) { if (root.SAT && root.SAT.error) root.SAT.error('ropeBridge.create', e); }
    }
    if (SA.render.createMountainBoulders && SA.mountainPlan && SA.render.rocks) {   // the montaña's boulder field, instanced (AS-0309)
      try { SA.render.createMountainBoulders(THREE, { scene: scene }); } catch (e) { if (root.SAT && root.SAT.error) root.SAT.error('mountainBoulders.create', e); }
    }
    var waterfall = null;   // the montaña's waterfall (AS-0310): a scrolling sheet and instanced spray; update(dt) allocates nothing
    if (SA.render.createWaterfall && SA.mountainPlan) {
      try { waterfall = SA.render.createWaterfall(THREE, { scene: scene }); } catch (e) { if (root.SAT && root.SAT.error) root.SAT.error('waterfall.create', e); }
    }
    if (SA.render.createFallenLogs && SA.fallenLogs) {
      try { SA.render.createFallenLogs(THREE, { scene: scene }); } catch (e) { if (root.SAT && root.SAT.error) root.SAT.error('fallenLogs.create', e); }
    }

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
      scene: scene, camera: camera, renderer: renderer, rig: rig, picking: picking, props: props, fx: fx, careFx: careFx, biomeGlow: biomeGlow, ambient: ambient, resize: resize, taskRing: taskRing, getTask: null, needIcons: needIcons, getNeeds: null,
      animals: animals, treeTap: treeTap, onTreeTap: null, skyView: skyView,
      avatar: avatar, pickups: pickups, spaceUse: spaceUse,
      render: function (dt) { if (station && station.userData.board) station.userData.board.update(); if (station && station.userData.badgesBoard) station.userData.badgesBoard.update(); if (station && station.userData.photoBoard) station.userData.photoBoard.update(); rig.update(dt); avatar.update(dt, rig.getPlayer()); if (scientist) scientist.update(dt, rig.getPlayer()); if (handItem) handItem.update(); if (pickups) pickups.update(dt); picking.update(dt); if (spaceUse) spaceUse.update(); if (outline) outline.update(dt); if (autoRing) autoRing.update(dt); if (reachCue) reachCue.update(dt); if (clickFx) clickFx.update(dt); treeTap.update(dt); ambient.update(dt); if (missionAnimals) { try { missionAnimals.update(dt); } catch (e) { missionAnimals = null; if (root.SAT && root.SAT.error) root.SAT.error('missionSpawn.update', e); } } if (missionCarry) { try { missionCarry.update(dt, rig.getPlayer()); } catch (e) { missionCarry = null; if (root.SAT && root.SAT.error) root.SAT.error('missionCarry.update', e); } } if (missionHatch) { try { missionHatch.update(dt); } catch (e) { missionHatch = null; if (root.SAT && root.SAT.error) root.SAT.error('missionHatch.update', e); } } if (missionLog) { try { missionLog.update(dt); } catch (e) { missionLog = null; if (root.SAT && root.SAT.error) root.SAT.error('missionLog.update', e); } } if (missionBananas) { try { missionBananas.update(dt); } catch (e) { missionBananas = null; if (root.SAT && root.SAT.error) root.SAT.error('missionBananas.update', e); } } if (missionGather) { try { missionGather.update(dt); } catch (e) { missionGather = null; if (root.SAT && root.SAT.error) root.SAT.error('missionGather.update', e); } } if (missionFriends) { try { missionFriends.update(dt); } catch (e) { missionFriends = null; if (root.SAT && root.SAT.error) root.SAT.error('missionFriends.update', e); } } if (missionParty) { try { missionParty.update(dt); } catch (e) { missionParty = null; if (root.SAT && root.SAT.error) root.SAT.error('missionParty.update', e); } } if (missionDoctor) { try { missionDoctor.update(dt, rig.getPlayer()); } catch (e) { missionDoctor = null; if (root.SAT && root.SAT.error) root.SAT.error('missionDoctor.update', e); } } if (missionNest) { try { missionNest.update(dt); } catch (e) { missionNest = null; if (root.SAT && root.SAT.error) root.SAT.error('missionNest.update', e); } } if (missionPantry) { try { missionPantry.update(dt); } catch (e) { missionPantry = null; if (root.SAT && root.SAT.error) root.SAT.error('missionPantry.update', e); } } if (missionHome) { try { missionHome.update(dt); } catch (e) { missionHome = null; if (root.SAT && root.SAT.error) root.SAT.error('missionHome.update', e); } } if (missionRace) { try { missionRace.update(dt); } catch (e) { missionRace = null; if (root.SAT && root.SAT.error) root.SAT.error('missionRace.update', e); } } if (missionLetter) { try { missionLetter.update(dt); } catch (e) { missionLetter = null; if (root.SAT && root.SAT.error) root.SAT.error('missionLetter.update', e); } } if (missionTrail) { try { missionTrail.update(dt); } catch (e) { missionTrail = null; if (root.SAT && root.SAT.error) root.SAT.error('missionTrail.update', e); } } if (treetop) treetop.update(dt); fx.update(dt); careFx.update(dt); if (biomeGlow) biomeGlow.update(dt); if (daynightView) { try { daynightView.update(dt); } catch (e) { daynightView = null; if (root.SAT && root.SAT.error) root.SAT.error('daynight.update', e); } } if (sunShadow) sunShadow.update(); if (decor.userData.update) { try { decor.userData.update(dt); } catch (e) { decor.userData.update = null; if (root.SAT && root.SAT.error) root.SAT.error('decor.update', e); } } if (world.userData.update) world.userData.update(dt); if (ropeBridge) { try { ropeBridge.update(dt, rig.getPlayer()); } catch (e) { ropeBridge = null; if (root.SAT && root.SAT.error) root.SAT.error('ropeBridge.update', e); } } if (waterfall) { try { waterfall.update(dt); } catch (e) { waterfall = null; if (root.SAT && root.SAT.error) root.SAT.error('waterfall.update', e); } } if (groundCover) { try { groundCover.update(dt); } catch (e) { groundCover = null; if (root.SAT && root.SAT.error) root.SAT.error('groundCover.update', e); } } if (taskRing) { try { taskRing.update(dt, stageApi.getTask ? stageApi.getTask() : null); } catch (e) { taskRing = null; if (root.SAT && root.SAT.error) root.SAT.error('taskRing.update', e); } } if (needIcons) { try { needIcons.update(dt, stageApi.getNeeds ? stageApi.getNeeds() : null); } catch (e) { needIcons = null; if (root.SAT && root.SAT.error) root.SAT.error('needIcons.update', e); } } if (nameLabels) { try { nameLabels.update(dt, rig.getPlayer()); } catch (e) { nameLabels = null; if (root.SAT && root.SAT.error) root.SAT.error('nameLabels.update', e); } } if (skyView && skyView.active()) { try { skyView.render(); } catch (e) { skyView = null; if (root.SAT && root.SAT.error) root.SAT.error('skyView.render', e); renderer.render(scene, camera); } } else renderer.render(scene, camera); },
    };
    return stageApi;
  };
})(typeof window !== 'undefined' ? window : globalThis);
