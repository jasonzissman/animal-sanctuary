/* SA.render.createStationBoard(THREE) -> { group, update(), setEnglish(on), english }: the "Lista de misiones" board on the inside of the
 * station's back wall (AS-0210), from SA.station.layout().board. A framed slab with a big block-letter title (two lines), hand-drawn-looking
 * scribble lines and a few doodles. Pure geometry and flat materials, no textures. It is the Use target that opens the missions (AS-0211): game/station-board.js,
 * with an invisible tap volume (userData.stationBoardPick) in the group.
 * The title is Spanish by default and "Mission list" while the English scaffold is on: update() (called every frame by the scene) reads
 * SA.save settings.english and rebuilds only the title group when it changes. Needs SA.render.blockText (render/block-text.js).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var COLORS = { frame: 0x8a6a4a, panel: 0xf3e6c4, ink: 0x2f4f6f, scribble: 0x6b5848, gold: 0xffd24a, red: 0xc4553f, green: 0x4f9a5a, blue: 0x4a90b8 };
  var TITLES = { es: ['Lista de', 'misiones'], en: ['Mission', 'list'] };

  function mats(THREE) {
    var m = {};
    Object.keys(COLORS).forEach(function (k) { m[k] = new THREE.MeshPhongMaterial({ color: COLORS[k], flatShading: true, specular: 0x000000 }); });
    return m;
  }

  function bar(THREE, mat, w, h, x, y, z, rot) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), mat);
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.z = rot;
    return mesh;
  }

  /** The title: two lines of block letters near the top of the panel. Local coordinates (the board's centre is the origin, front is -z). */
  function buildTitle(THREE, m, B, english, titles) {
    var g = new THREE.Group(), lines = (titles || TITLES)[english ? 'en' : 'es'], px = 0.075, z = -B.depth / 2 - px * 0.3;
    lines.forEach(function (line, i) {
      var word = SA.render.blockText(THREE, m.ink, line, px);
      word.group.position.set(0, B.height / 2 - 0.4 - i * 0.5, z);
      g.add(word.group);
    });
    return g;
  }

  /** Wobbly marker lines, a star, a tick, a ring and a paw: a quick drawing under the title. */
  function buildDoodles(THREE, m, B) {
    var g = new THREE.Group(), z = -B.depth / 2 - 0.02, top = -B.height / 2 + 0.75;
    // Three scribble lines, each a few short tilted strokes that slightly drift (looks hand-drawn).
    [[-1.3, 1.5, 0.03], [-1.3, 1.1, -0.04], [-1.3, 0.75, 0.02]].forEach(function (ln, row) {
      var x = ln[0], y = top - 0.12 - row * 0.2, n = row === 2 ? 3 : 4;
      for (var i = 0; i < n; i++) {
        var len = 0.3 + ((i * 7 + row * 3) % 5) * 0.06, tilt = ln[2] * ((i % 2) ? 1 : -1.5);
        g.add(bar(THREE, m.scribble, len, 0.035, x + len / 2, y + (i % 3) * 0.012 - 0.01, z, tilt));
        x += len + 0.1;
      }
    });
    // Star (two crossed squares), top right of the doodle area.
    var sx = 1.3, sy = top - 0.15;
    g.add(bar(THREE, m.gold, 0.2, 0.2, sx, sy, z - 0.004, 0), bar(THREE, m.gold, 0.2, 0.2, sx, sy, z - 0.004, Math.PI / 4));
    // Tick mark: a short and a long stroke.
    g.add(bar(THREE, m.green, 0.12, 0.04, 1.0, top - 0.5, z, -0.8), bar(THREE, m.green, 0.3, 0.04, 1.12, top - 0.46, z, 0.8));
    // Ring (a circle doodle) and a paw (one pad, three toes).
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 4, 12), m.blue);
    ring.position.set(1.4, top - 0.5, z);
    g.add(ring);
    var pad = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), m.red);
    pad.position.set(0.55, top - 0.58, z); pad.scale.z = 0.2;
    g.add(pad);
    [-0.07, 0, 0.07].forEach(function (dx, i) {
      var toe = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), m.red);
      toe.position.set(0.55 + dx, top - 0.47 + (i === 1 ? 0.03 : 0), z); toe.scale.z = 0.2;
      g.add(toe);
    });
    return g;
  }

  /** Badge doodles for the Insignias board: three round medals (bronze, silver, gold) with a star above, in two rows. */
  function buildBadgeDoodles(THREE, m, B) {
    var g = new THREE.Group(), z = -B.depth / 2 - 0.02, y = -0.15;
    [[-0.45, 0xc98a4b], [0, 0xbfc5cc], [0.45, 0xffd24a]].forEach(function (c) {
      var medal = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 10), new THREE.MeshPhongMaterial({ color: c[1], flatShading: true, specular: 0x000000 }));
      medal.rotation.x = Math.PI / 2; medal.position.set(c[0], y, z);
      var ribbon = bar(THREE, m.red, 0.1, 0.22, c[0], y - 0.26, z, 0);
      g.add(ribbon, medal);
    });
    g.add(bar(THREE, m.gold, 0.16, 0.16, 0, -0.62, z - 0.004, 0), bar(THREE, m.gold, 0.16, 0.16, 0, -0.62, z - 0.004, Math.PI / 4));    return g;
  }

  /** createStationBoard(THREE, opts?): opts.key = the layout key ('board' default, 'badgesBoard' for Insignias), opts.titles = { es: [..], en: [..] },
   *  opts.badges = true draws the medal doodles. A board facing +z (layout facing.z > 0) is turned half a circle so its front reads from the room. */
  SA.render.createStationBoard = function (THREE, opts) {
    opts = opts || {};
    var B = SA.station.layout()[opts.key || 'board'], m = mats(THREE), group = new THREE.Group();
    var titles = opts.titles || TITLES;
    group.position.set(B.x, B.y, B.z);
    if (B.facing && B.facing.z > 0) group.rotation.y = Math.PI;
    group.userData.stationBoard = true;
    if (opts.id) group.userData.boardId = opts.id;
    // Frame (back) and panel (front): the panel sits a hair proud of the frame's face inside it.
    var f = 0.1;
    group.add(new THREE.Mesh(new THREE.BoxGeometry(B.width, B.height, B.depth), m.frame));
    var panel = new THREE.Mesh(new THREE.BoxGeometry(B.width - 2 * f, B.height - 2 * f, 0.02), m.panel);
    panel.position.set(0, 0, -B.depth / 2 - 0.005);
    group.add(panel);
    group.add(opts.badges ? buildBadgeDoodles(THREE, m, B) : buildDoodles(THREE, m, B));
    // A generous invisible pick volume in front of the board (AS-0211): a tap or click near it opens the missions
    // (render/station-board-tap.js). Never drawn and never outlined (the outline skips invisible meshes), but still raycast.
    var pick = new THREE.Mesh(new THREE.BoxGeometry(B.width + 0.8, B.height + 0.8, 0.8), m.frame);
    pick.position.set(0, 0, -0.4);
    pick.visible = false;
    pick.userData = { stationBoardPick: true, pick: true };
    group.add(pick);
    var api = { group: group, english: false, title: null, setEnglish: null, update: null };
    function setEnglish(on) {
      on = !!on;
      if (api.title && api.english === on) return;
      if (api.title) {
        group.remove(api.title);
        api.title.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      }
      api.english = on;
      api.title = buildTitle(THREE, m, B, on, titles);
      group.add(api.title);
    }
    function update() {
      var on = false;
      try { on = !!(SA.save && SA.save.get().settings.english); } catch (e) { on = false; }
      setEnglish(on);
    }
    api.setEnglish = setEnglish; api.update = update;
    setEnglish(false);
    update();
    return api;
  };
})(typeof window !== 'undefined' ? window : globalThis);
