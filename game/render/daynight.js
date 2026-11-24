/* SA.render.createDaynight(THREE, { scene, renderer, hemi, sun, getPlayer, station?, clock? }) -> { update(), rim }: draws SA.daynight (AS-0170).
 * Every frame (update() allocates nothing) it reads the clock and sets:
 *   sky + fog     blue day -> orange-pink dusk/dawn (while the sun is low) -> deep blue night; the fog narrows a little at night
 *   sun           a warm disc on its arc (east -> west) that goes orange as it sets; it also aims the shadow light (SA.render.SUN_SHADOW.offset)
 *   moon + stars  a pale moon on its arc and two twinkling star sets (they trade brightness), all following the player so they sit "at infinity"
 *   fireflies     ~40 soft yellow lights drifting over the bosque, only at night
 *   lights        sun and hemisphere fade with SA.daynight light() (never below MIN_LIGHT); a soft blue `rim` light from behind (it outlines the
 *                 animals) and a bluish ambient keep the night readable; the station's window, bulb and porch light glow via station.userData.night.
 * It touches THREE only through constructors and plain property writes. Static seeded placement, no textures.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SKY = { day: 0xbfe6f5, warm: 0xf4a27a, night: 0x131f4a };
  var SUN_COLOR = { high: 0xfff2d6, low: 0xff9a5a }, DISC = { high: 0xfff3b0, low: 0xff8a4a };
  var HEMI_SKY = { day: 0xffffff, night: 0x8fa0e8 }, HEMI_GROUND = { day: 0x6a8f5a, night: 0x2f4060 };
  var RADIUS = 110, STARS = 90, FIREFLIES = 40;

  function lcg(seed) { var s = seed; return function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

  SA.render.createDaynight = function (THREE, o) {
    var scene = o.scene, renderer = o.renderer, hemi = o.hemi, sun = o.sun, clock = o.clock || SA.daynight.instance();
    var C = THREE.Color, sky = new C(SKY.day), tmp = new C(), dayC = new C(SKY.day), warmC = new C(SKY.warm), nightC = new C(SKY.night);
    var sunLow = new C(SUN_COLOR.low), sunHigh = new C(SUN_COLOR.high), discLow = new C(DISC.low), discHigh = new C(DISC.high);
    var hsDay = new C(HEMI_SKY.day), hsNight = new C(HEMI_SKY.night), hgDay = new C(HEMI_GROUND.day), hgNight = new C(HEMI_GROUND.night);
    var sky3d = new THREE.Group();   // follows the player: sun disc, moon and stars live here
    scene.add(sky3d);
    var t = 0;

    function basic(c, extra) {
      var m = new THREE.MeshBasicMaterial(Object.assign({ color: c, fog: false, depthWrite: false }, extra || {}));
      return m;
    }
    var sunMesh = new THREE.Mesh(new THREE.SphereGeometry(6, 14, 10), basic(DISC.high));
    var moonMat = basic(0xf4f1d8, { transparent: true, opacity: 0 });
    var moonMesh = new THREE.Mesh(new THREE.SphereGeometry(4.5, 14, 10), moonMat);
    sunMesh.renderOrder = moonMesh.renderOrder = -2;
    sky3d.add(sunMesh, moonMesh);

    // Two star sets on the upper dome (seeded): their opacities trade places so the sky twinkles.
    function starSet(seed) {
      var r = lcg(seed), pos = new Float32Array(STARS * 3);
      for (var i = 0; i < STARS; i++) {
        var a = r() * Math.PI * 2, y = 0.12 + r() * 0.88, s = Math.sqrt(1 - y * y);
        pos[i * 3] = Math.cos(a) * s * RADIUS; pos[i * 3 + 1] = y * RADIUS; pos[i * 3 + 2] = Math.sin(a) * s * RADIUS;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false });
      var p = new THREE.Points(g, m);
      p.renderOrder = -3; p.frustumCulled = false;
      sky3d.add(p);
      return m;
    }
    var starsA = starSet(11), starsB = starSet(23);

    // Fireflies over the bosque: fixed home points on dry ground, each bobbing around its own home.
    var flyPos = new Float32Array(FIREFLIES * 3), homes = [], flyMat = null, flyGeo = null;
    (function () {
      var map = SA.map, r = lcg(77), range = map && map.biomeRange ? map.biomeRange('bosque') : null;
      if (!range) return;
      var tries = 0;
      while (homes.length < FIREFLIES && tries++ < 600) {
        var x = range.lo + 2 + r() * (range.hi - range.lo - 4), z = map.BOUNDS.minZ + 2 + r() * (map.BOUNDS.maxZ - map.BOUNDS.minZ - 4);
        if (map.isWater && map.isWater(x, z)) continue;
        homes.push({ x: x, z: z, y: map.groundHeight(x, z) + 0.6 + r() * 1.8, ph: r() * 6.28, sp: 0.6 + r() });
      }
      flyGeo = new THREE.BufferGeometry();
      flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
      flyMat = new THREE.PointsMaterial({ color: 0xe8ff6a, size: 5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
      var pts = new THREE.Points(flyGeo, flyMat);
      pts.frustumCulled = false;
      scene.add(pts);
    })();

    // The soft blue rim light from behind (opposite the camera's usual side), strongest at night: it outlines animals and trees.
    var rim = new THREE.DirectionalLight(0x9db4ff, 0);
    rim.position.set(20, 30, -30);
    scene.add(rim);

    function place(mesh, a) { mesh.position.set(a.x * RADIUS * 0.9, a.y * RADIUS * 0.8 + 4, RADIUS * 0.3); }   // local to sky3d (which sits on the player)
    var origin = { x: 0, y: 0, z: 0 };

    function update(dt) {
      t += dt > 0 && dt < 1 ? dt : 1 / 60;
      var d = clock.dark(), light = clock.light(), sn = clock.sun(), mn = clock.moon(), p = (o.getPlayer && o.getPlayer()) || origin;
      var warm = sn.up ? Math.max(0, 1 - sn.y / 0.4) : 0;
      // Sky and fog: day -> warm while the sun is low -> night.
      sky.copy(dayC).lerp(warmC, warm * 0.9).lerp(nightC, d);
      if (scene.background && scene.background.copy) scene.background.copy(sky);
      if (renderer.setClearColor) renderer.setClearColor(sky, 1);
      if (scene.fog) { scene.fog.color.copy(sky); scene.fog.near = 70 - 15 * d; scene.fog.far = 150 - 30 * d; }
      // Lights: the sun fades out, the hemisphere never goes below MIN_LIGHT's share and turns blue, the rim light comes up.
      hemi.intensity = 0.75 * light + 0.2 * d;
      hemi.color.copy(hsDay).lerp(hsNight, d);
      hemi.groundColor.copy(hgDay).lerp(hgNight, d);
      sun.intensity = 0.85 * (1 - d);
      sun.color.copy(sunHigh).lerp(sunLow, warm);
      rim.intensity = 0.55 * d;
      var S = SA.render.SUN_SHADOW;
      if (S && S.offset) { S.offset.x = 60 * sn.x; S.offset.y = 14 + 40 * sn.y; S.offset.z = 20; }
      else sun.position.set(60 * sn.x, 14 + 40 * sn.y, 20);
      rim.position.set(20 - 25 * mn.x, 30, -30);
      // The sky objects ride along with the player.
      sky3d.position.set(p.x, p.y, p.z);
      sunMesh.visible = sn.up;
      if (sn.up) { place(sunMesh, sn); sunMesh.material.color.copy(discHigh).lerp(discLow, warm); }
      var moonOn = mn.up && d > 0.02;
      moonMesh.visible = moonOn;
      if (moonOn) { place(moonMesh, mn); moonMat.opacity = d; }
      starsA.opacity = d * (0.65 + 0.35 * Math.sin(t * 2.1));
      starsB.opacity = d * (0.65 + 0.35 * Math.sin(t * 2.1 + 2.4));
      // Fireflies: only at night, each drifting a little around its home.
      if (flyMat) {
        flyMat.opacity = d * (0.7 + 0.3 * Math.sin(t * 3));
        if (d > 0.02) {
          for (var i = 0; i < homes.length; i++) {
            var h = homes[i], a = t * h.sp + h.ph;
            flyPos[i * 3] = h.x + Math.sin(a) * 0.8; flyPos[i * 3 + 1] = h.y + Math.sin(a * 1.7) * 0.4; flyPos[i * 3 + 2] = h.z + Math.cos(a * 0.9) * 0.8;
          }
          flyGeo.attributes.position.needsUpdate = true;
        }
        flyMat.visible = d > 0.02;
      }
      var night = o.station && o.station.userData && o.station.userData.night;
      if (night) night.setDark(d);
    }

    return { update: update, rim: rim };
  };
})(typeof window !== 'undefined' ? window : globalThis);
