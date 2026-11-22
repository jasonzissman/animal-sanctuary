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
    var avoid = decor.children.map(function (o) { return [o.position.x, o.position.z]; });
    scene.add(SA.render.buildAnimals(THREE, { avoid: avoid }));

    var camera = new THREE.PerspectiveCamera(SA.camera.DEFAULTS.fovDeg, 1, 0.5, 400);
    var rig = SA.render.createCameraRig(THREE, renderer.domElement, camera);

    function resize() {
      var w = container.clientWidth || root.innerWidth || 800;
      var h = container.clientHeight || root.innerHeight || 600;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    root.addEventListener('resize', resize);

    return {
      scene: scene, camera: camera, renderer: renderer, rig: rig, resize: resize,
      render: function (dt) { rig.update(dt); renderer.render(scene, camera); },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
