/* SA.render.buildStationNight(THREE, { layout, glass, wood, trim }) -> { group, bedPick, setDark(d) }: the night parts of the research station (AS-0170).
 * `group` holds the bed (frame, mattress, pillow, blanket; plus an invisible pick volume flagged userData.stationBoardPick so a tap on the bed
 * sleeps, see render/station-board-tap.js) and the porch lamp (bracket, bulb and one PointLight). setDark(d), d in 0..1 (SA.daynight dark()),
 * makes the window glass and the lamp bulb glow warm and lights the porch: the PointLight is always in the scene (intensity 0 by day), so the
 * shaders never change. Flat colours only. Called once by render/station.js; setDark only writes a few numbers, no allocation.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var WARM = 0xffc060, LAMP_LIGHT = 1.3, WINDOW_GLOW = 0.95, BULB_GLOW = 1.0;

  SA.render.buildStationNight = function (THREE, o) {
    var L = o.layout, group = new THREE.Group(), bd = L.bed, y0 = L.floorY;
    function mat(c) { return new THREE.MeshPhongMaterial({ color: c, flatShading: true, specular: 0x000000 }); }
    function box(m, w, h, d, x, y, z) { var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); group.add(b); return b; }

    // Bed: a wooden frame, a blue mattress, a white pillow at the back (the head is toward +z) and a blanket over the rest.
    var frame = o.wood || mat(0xb98a55);
    box(frame, bd.w, 0.22, bd.d, bd.x, y0 + 0.11, bd.z);
    box(mat(0x6fa8dc), bd.w - 0.1, 0.18, bd.d - 0.1, bd.x, y0 + 0.31, bd.z);
    box(mat(0xffffff), bd.w - 0.3, 0.12, 0.45, bd.x, y0 + 0.46, bd.z + bd.d / 2 - 0.4);
    box(mat(0xe8736b), bd.w - 0.1, 0.1, bd.d * 0.55, bd.x, y0 + 0.44, bd.z - bd.d * 0.18);
    box(frame, bd.w, 0.5, 0.1, bd.x, y0 + 0.4, bd.z + bd.d / 2 + 0.03);   // headboard
    // A generous invisible pick volume over the bed (a tap or click sleeps, like the boards).
    var pick = new THREE.Mesh(new THREE.BoxGeometry(bd.w + 0.6, 1.0, bd.d + 0.6), mat(0xffffff));
    pick.position.set(bd.x, y0 + 0.5, bd.z);
    pick.visible = false;
    pick.userData = { stationBoardPick: true, pick: true };
    group.add(pick);

    // Porch lamp: a small bracket on the wall and a bulb that glows warm at night, with one point light for the porch.
    var lp = L.lamp, bulbMat = new THREE.MeshPhongMaterial({ color: 0xfff1c9, flatShading: true, specular: 0x000000, emissive: WARM, emissiveIntensity: 0 });
    box(o.trim || mat(0x8a6a4a), 0.12, 0.12, 0.3, lp.x, lp.y + 0.15, lp.z + 0.12);
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bulbMat);
    bulb.position.set(lp.x, lp.y, lp.z);
    group.add(bulb);
    var light = new THREE.PointLight(WARM, 0, 9);
    light.position.set(lp.x, lp.y - 0.1, lp.z - 0.5);
    group.add(light);

    var glass = o.glass;
    if (glass && glass.emissive && glass.emissive.setHex) glass.emissive.setHex(WARM);

    return {
      group: group, bedPick: pick,
      setDark: function (d) {
        d = d < 0 ? 0 : d > 1 ? 1 : d;
        if (glass) glass.emissiveIntensity = d * WINDOW_GLOW;
        bulbMat.emissiveIntensity = d * BULB_GLOW;
        light.intensity = d * LAMP_LIGHT;
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
