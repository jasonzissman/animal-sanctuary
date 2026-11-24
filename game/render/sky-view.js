/* SA.render.createSkyView(THREE, { renderer, canvas, camera, station, getPlayer, mission? }) -> { active(), render(), capture(), tapAt(x, y) }
 * The telescope view of Mission 12 (AS-0371): a second little scene (a dark dome, a ring of tree-top silhouettes on the horizon, ~220 stars and the moon)
 * drawn on the same canvas while SA.missionSky says the view is open. The aim (yaw, pitch) is SA.missionSky's; the controls (drag, arrows / WASD, the exit and
 * camera buttons) are DOM, game/ui/sky-view-ui.js. This file only draws and picks:
 *   tapAt(x, y)  a tap/click on the roof telescope's pick volume (node = station.userData.telescope) calls SA.missionSky.open(player); true when it was on it
 *   render()     draws the sky instead of the world (scene.js calls it in place of renderer.render when active())
 *   capture()    a small JPEG data URL of the current sky frame (the album picture of the sky photo), or null
 * Procedural primitives and flat / basic materials only; no textures. Nothing here runs unless the mission's view is open.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.createSkyView = function (THREE, o) {
    var M = o.mission || SA.missionSky, R = 60;
    var scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    cam.rotation.order = 'YXZ';
    scene.background = new THREE.Color(0x070b1f);

    function dir(yaw, pitch, r) { return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch) * r, Math.sin(pitch) * r, -Math.cos(yaw) * Math.cos(pitch) * r); }

    // The dome: a big inside-out sphere, darker toward the top, so the stars sit on a deep blue.
    var dome = new THREE.Mesh(new THREE.SphereGeometry(R + 20, 16, 10), new THREE.MeshBasicMaterial({ color: 0x0c1438, side: THREE.BackSide }));
    scene.add(dome);

    // Stars: small and big points (two layers so a few are bigger and brighter).
    function layer(list, size, color) {
      var pos = new Float32Array(list.length * 3);
      list.forEach(function (s, i) { var p = dir(s.yaw, s.pitch, R); pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: color, size: size, sizeAttenuation: false }));
      scene.add(pts);
      return pts;
    }
    var all = M.stars(260);
    layer(all.filter(function (s) { return s.size < 1.5; }), 2.5, 0xdfe8ff);
    var bigStars = layer(all.filter(function (s) { return s.size >= 1.5; }), 5, 0xfff2b8);

    // Constellations (AS-0372): brighter stars for each picture (rows from SA.constellations); once found, its lines draw and a soft animal-coloured halo glows
    // behind it. The row data is the only source (no id is special-cased).
    var C = SA.constellations, found = [];
    (C ? C.list() : []).forEach(function (row) {
      var pts = C.points(row), pos = new Float32Array(pts.length * 3), g = new THREE.Group();
      pts.forEach(function (p, i) { var v = dir(p.yaw, p.pitch, R - 1); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff7d6, size: 7, sizeAttenuation: false }));
      var lp = [];
      C.segments(row).forEach(function (s) { s.forEach(function (p) { var v = dir(p.yaw, p.pitch, R - 1); lp.push(v.x, v.y, v.z); }); });
      var lgeo = new THREE.BufferGeometry();
      lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
      var lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: 0xffe08a }));
      lines.visible = false;
      var halo = new THREE.Mesh(new THREE.SphereGeometry(9, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.16 }));
      halo.position.copy(dir(row.center.yaw, row.center.pitch, R - 4));
      halo.scale.set(1.15, 0.8, 0.3);
      halo.visible = false;
      g.add(stars); g.add(lines); g.add(halo);
      scene.add(g);
      found.push({ id: row.id, lines: lines, halo: halo, stars: stars });
    });
    function showFound() {
      var v = M.view(), lit = {};
      ((v && v.constellations) || []).forEach(function (c) { lit[c.id] = c.lit; });
      found.forEach(function (f) { f.lines.visible = !!lit[f.id]; f.halo.visible = !!lit[f.id]; });
    }

    // The moon: a pale disc with a soft halo, exactly where SA.missionSky.MOON says.
    var moon = new THREE.Group();
    moon.add(new THREE.Mesh(new THREE.SphereGeometry(3.2, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff6d0 })));
    moon.add(new THREE.Mesh(new THREE.SphereGeometry(5.2, 14, 10), new THREE.MeshBasicMaterial({ color: 0xcfd8ff, transparent: true, opacity: 0.18 })));
    var crater = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe3d7a4 }));
    crater.position.set(0.9, 0.6, 2.9);
    moon.add(crater);
    moon.position.copy(dir(M.MOON.yaw, M.MOON.pitch, R - 4));
    moon.lookAt(new THREE.Vector3(0, 0, 0));
    scene.add(moon);

    // The horizon: a ring of dark low-poly hills and tree tops, so there is a "down" to aim above.
    var dark = new THREE.MeshBasicMaterial({ color: 0x04060f });
    for (var i = 0; i < 28; i++) {
      var a = i / 28 * Math.PI * 2, h = 3 + (i * 7 % 5) * 1.6;
      var cone = new THREE.Mesh(new THREE.ConeGeometry(3.2 + (i % 3), h, 5), dark);
      cone.position.set(Math.sin(a) * (R - 8), -3 + h / 2, -Math.cos(a) * (R - 8));
      scene.add(cone);
    }
    var ground = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 2, 16), dark);
    ground.position.y = -4;
    scene.add(ground);

    function active() { var v = M.view(); return !!(v && v.open); }

    function place() {
      var v = M.view();
      if (!v) return;
      cam.rotation.set(v.pitch, -v.yaw, 0);
      var c = o.renderer.domElement, w = c.clientWidth || c.width || 800, h = c.clientHeight || c.height || 600;
      if (cam.aspect !== w / h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    }

    function render() {
      place();
      var tw = Math.sin(Date.now() / 400) * 0.8;
      bigStars.material.size = 5 + tw;                                    // the bright ones twinkle a little
      showFound();
      found.forEach(function (f) { f.stars.material.size = 7 + tw; f.halo.material.opacity = 0.16 + Math.sin(Date.now() / 600) * 0.04; });
      o.renderer.render(scene, cam);
    }

    var doc = root.document, cv = null;
    function capture() {
      try {
        if (!doc) return null;
        render();
        var src = o.renderer.domElement, cw = src.width, ch = src.height;
        if (!cw || !ch) return null;
        if (!cv) { cv = doc.createElement('canvas'); cv.width = 240; cv.height = 180; }
        var c2 = cv.getContext('2d');
        if (!c2) return null;
        var sw = Math.min(cw, ch * 4 / 3), sh = sw * 3 / 4;
        c2.drawImage(src, (cw - sw) / 2, (ch - sh) / 2, sw, sh, 0, 0, cv.width, cv.height);
        return cv.toDataURL('image/jpeg', 0.6);
      } catch (e) { return null; }
    }

    // A tap on the telescope (the same tap tracker as the other tap targets: a drag is not a tap).
    var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tracker = SA.picking.createTapTracker();
    function hitsScope(x, y) {
      var node = o.station && o.station.userData ? o.station.userData.telescope : null, r = o.canvas.getBoundingClientRect();
      if (!node || !r.width || !r.height) return false;
      ndc.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
      ray.setFromCamera(ndc, o.camera);
      var hit = ray.intersectObject(node, true)[0];
      return !!(hit && hit.object && hit.object.userData && hit.object.userData.telescopePick);
    }
    function tapAt(x, y) {
      if (active() || (SA.picking.isPaused && SA.picking.isPaused()) || !hitsScope(x, y)) return false;
      M.open(o.getPlayer ? o.getPlayer() : null);
      return true;
    }
    o.canvas.addEventListener('pointerdown', function (e) { tracker.down(e.pointerId, e.clientX, e.clientY); });
    o.canvas.addEventListener('pointermove', function (e) { tracker.move(e.pointerId, e.clientX, e.clientY); });
    o.canvas.addEventListener('pointercancel', function () { tracker.cancel(); });
    o.canvas.addEventListener('pointerup', function (e) { var t = tracker.up(e.pointerId, e.clientX, e.clientY); if (t) tapAt(t.x, t.y); });

    return { active: active, render: render, capture: capture, tapAt: tapAt, scene: scene, camera: cam };
  };
})(typeof window !== 'undefined' ? window : globalThis);
