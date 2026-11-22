/* SA.render.createStage(THREE, container): renderer + scene + lights + sky + world + camera rig.
 * Returns { render(dt), resize(), scene, camera, renderer, rig }.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SKY = 0xbfe6f5;
  var DECOR_R = 1, ANIMAL_R = 1.3;   // obstacle radii (world units) the walking avatar slides around

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
    var avoid = decor.children.map(function (o) { return [o.position.x, o.position.z]; });
    var animals = SA.render.buildAnimals(THREE, { avoid: avoid });
    scene.add(animals);

    var camera = new THREE.PerspectiveCamera(SA.camera.DEFAULTS.fovDeg, 1, 0.5, 400);
    var picking, stageApi = {};
    // While a care task is rubbing a part, a drag that starts on that part rubs it instead of orbiting.
    // Third person: the player walks as a kid avatar; animals, decor and placed props push the avatar aside.
    var obstacleProps = [];
    function obstacles() {
      var list = avoid.map(function (a) { return [a[0], a[1], DECOR_R]; }).concat(obstacleProps);
      animals.children.forEach(function (g) { if (!(g.userData && g.userData.perched)) list.push([g.position.x, g.position.z, ANIMAL_R]); });
      return list;
    }
    var rig = SA.render.createCameraRig(THREE, renderer.domElement, camera, null, { chase: { obstacles: obstacles, trees: function () { return trees; } }, canOrbit: function (e) {
      return !(SA.picking.hasRubTarget() && picking && SA.picking.isRubTarget(picking.pickAt(e.clientX, e.clientY)));
    } });
    var avatar = SA.render.createAvatar(THREE);
    scene.add(avatar.group);
    // The equipped item (SA.inventory) shows as a small model in the avatar's right hand; it swaps as the equipped item changes.
    var handItem = SA.render.createHandItem ? SA.render.createHandItem(THREE, { hand: avatar.parts.armR }) : null;
    // Taps on an animal out of the walking player's reach show "¡Acércate!" above the avatar (SA.reach) instead of picking.
    var reachCue = SA.render.createReachCue ? SA.render.createReachCue(THREE, { camera: camera, container: container, getPlayer: rig.getPlayer }) : null;
    picking = SA.render.createPicking(THREE, { canvas: renderer.domElement, camera: camera, animals: animals, container: container,
      getPlayer: rig.getPlayer, reachCue: reachCue });

    var treeTap = SA.render.createTreeTap(THREE, { canvas: renderer.domElement, camera: camera, decor: decor,
      hitsAnimal: function (x, y) { return !!picking.pickAt(x, y); },
      onTap: function (t) { if (stageApi.onTreeTap) stageApi.onTreeTap(t); } });

    var props = SA.render.createProps(THREE, { canvas: renderer.domElement, camera: camera });
    scene.add(props.group);
    if (props.ghostGroup) scene.add(props.ghostGroup);

    var trees = decor.children.filter(function (o) { return o.userData && o.userData.tree; }).map(function (o) {
      return { x: o.position.x, z: o.position.z, y: o.position.y, scale: o.scale.y, kind: o.userData.kind };
    });
    var ambient = SA.render.createAmbient({ animals: animals, avoid: avoid, trees: trees });
    // Placed props (this session and restored from the save) join the decor in the wander avoid list. The save is
    // already updated when the sandbox calls add/remove, so the list is rebuilt from SA.habitat.list().
    function refreshAvoid() {
      if (SA.propAvoid && SA.habitat) {
        obstacleProps = SA.propAvoid.points(SA.habitat.list());
        ambient.setAvoid(avoid.concat(obstacleProps));
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
      avatar: avatar,
      render: function (dt) { rig.update(dt); avatar.update(dt, rig.getPlayer()); if (handItem) handItem.update(); picking.update(dt); if (reachCue) reachCue.update(dt); treeTap.update(dt); ambient.update(dt); fx.update(dt); careFx.update(dt); if (biomeGlow) biomeGlow.update(dt); renderer.render(scene, camera); },
    };
    return stageApi;
  };
})(typeof window !== 'undefined' ? window : globalThis);
