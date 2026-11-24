/* SA.render.buildTelescope(THREE, { x, y, z }) -> THREE.Group: the little telescope on the station roof (AS-0371, Mission 12). Flat-shaded primitives only:
 * a three-legged tripod, a brass-banded tube tilted up toward the sky and an eyepiece. The group carries an invisible, generous pick volume
 * (userData.telescopePick = true) so a tap near it counts; render/sky-view.js raycasts only that. `y` is the roof surface.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.buildTelescope = function (THREE, at) {
    var g = new THREE.Group(), tilt = 0.95;     // the tube's angle up from the horizon
    function flat(c) { return new THREE.MeshPhongMaterial({ color: c, flatShading: true, specular: 0x000000 }); }
    var metal = flat(0x4f5a66), tube = flat(0xe8edf0), brass = flat(0xd8a93a), lens = flat(0x9fd8ea), dark = flat(0x2a2f36);
    g.name = 'telescope';
    g.position.set(at.x, at.y, at.z);

    for (var i = 0; i < 3; i++) {                // tripod legs splayed outward and meeting under the mount
      var a = i * Math.PI * 2 / 3 + 0.5, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 1.0, 5), metal);
      leg.position.set(Math.sin(a) * 0.22, 0.46, Math.cos(a) * 0.22);
      leg.rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
      g.add(leg);
    }
    var mount = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 6), dark);
    mount.position.y = 0.95;
    g.add(mount);

    var arm = new THREE.Group();                 // the tube pivots at the mount and points up and toward -z (the front of the station)
    arm.position.y = 1.0;
    arm.rotation.x = tilt;                       // +x turns -z up: the tube's front end rises by `tilt` above the horizon
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.1, 8), tube);
    body.rotation.x = Math.PI / 2; body.position.z = -0.1;
    var front = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 8), brass);
    front.rotation.x = Math.PI / 2; front.position.z = -0.68;
    var glass = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 8), lens);
    glass.rotation.x = Math.PI / 2; glass.position.z = -0.77;
    var band = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 8), brass);
    band.rotation.x = Math.PI / 2; band.position.z = 0.12;
    var eye = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.22, 6), dark);
    eye.rotation.x = Math.PI / 2; eye.position.z = 0.55;
    arm.add(body, front, glass, band, eye);
    g.add(arm);

    var pick = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.7, 1.6), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.y = 0.85;
    pick.userData.telescopePick = true;
    g.add(pick);
    g.userData.pick = pick;
    return g;
  };
})(typeof window !== 'undefined' ? window : globalThis);
