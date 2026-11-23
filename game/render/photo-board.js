/* SA.render.createPhotoBoard(THREE) -> { group, update(), cardCount() }: the photo board on the inside of the station's west wall (AS-0207),
 * from SA.station.layout().photoBoard. A framed slab with a "Fotos" title and one small framed card per proof in SA.proofs: a cream
 * photo with a little low-poly animal (body, head, ears in the animal's own colour; a gold star for a finished mission) and its Spanish
 * name (or "Misión N") in block letters. Pure primitives and flat materials, no textures.
 * Which cards go where is decided by the pure SA.photoBoard (game/photo-board.js). update() is called every frame by the scene: it
 * compares SA.photoBoard.signature() with the last one and rebuilds only the cards when it changed, so the board loads from the save on boot
 * and a new proof appears without a reload. Needs SA.render.blockText (render/block-text.js).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var COLORS = { frame: 0x8a6a4a, panel: 0xf3e6c4, ink: 0x2f4f6f, photo: 0xfff8e6, eye: 0x2f2f3a, cardFrame: 0x6b5848, gold: 0xffd24a };

  SA.render.createPhotoBoard = function (THREE) {
    var B = SA.station.layout().photoBoard, group = new THREE.Group(), cards = null, lastSig = null, shown = 0, mats = {};
    function mat(color) {
      var k = String(color);
      if (!mats[k]) mats[k] = new THREE.MeshPhongMaterial({ color: color, flatShading: true, specular: 0x000000 });
      return mats[k];
    }
    function hex(s) { return parseInt(String(s).slice(1), 16); }
    function box(w, h, d, m, x, y, z) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      return mesh;
    }
    function ball(r, m, x, y, z, sx, sy, sz) {
      var mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), m);
      mesh.position.set(x, y, z); mesh.scale.set(sx || 1, sy || 1, sz || 1);
      return mesh;
    }

    group.position.set(B.x, B.y, B.z);
    group.rotation.y = -Math.PI / 2;               // local front (-z) turns to face +x, into the room; the long side then runs along world z
    group.userData.photoBoard = true;
    group.add(box(B.width, B.height, B.depth, mat(COLORS.frame), 0, 0, 0));
    var f = 0.1, fz = -B.depth / 2;
    group.add(box(B.width - 2 * f, B.height - 2 * f, 0.02, mat(COLORS.panel), 0, 0, fz - 0.005));
    var title = SA.render.blockText(THREE, mat(COLORS.ink), 'Fotos', 0.075);
    title.group.position.set(0, B.height / 2 - 0.3, fz - 0.03);
    group.add(title.group);

    /** One card, in card-local units (centre origin, front -z): frame, cream photo, the picture, the label. */
    function buildCard(c) {
      var s = c.slot, g = new THREE.Group(), z = fz - 0.03;
      g.position.set(-s.x, s.y, 0);                // reader's right is local -x
      g.add(box(s.w, s.h, 0.04, mat(COLORS.cardFrame), 0, 0, z));
      var pw = s.w - 0.08, ph = s.h - 0.08;
      g.add(box(pw, ph, 0.02, mat(COLORS.photo), 0, 0, z - 0.025));
      var pz = z - 0.05, body = mat(hex(c.color)), py = s.h * 0.1;
      if (c.kind === 'mission') {
        var star = box(0.2, 0.2, 0.03, mat(COLORS.gold), 0, py, pz);
        var star2 = box(0.2, 0.2, 0.03, mat(COLORS.gold), 0, py, pz); star2.rotation.z = Math.PI / 4;
        g.add(star, star2);
      } else {
        g.add(ball(0.15, body, -0.05, py - 0.04, pz, 1.2, 0.85, 0.5));                       // body
        g.add(ball(0.095, body, 0.13, py + 0.06, pz - 0.02, 1, 1, 0.6));                      // head
        g.add(ball(0.035, body, 0.1, py + 0.16, pz - 0.02, 0.7, 1.4, 0.5), ball(0.035, body, 0.17, py + 0.16, pz - 0.02, 0.7, 1.4, 0.5));   // ears
        g.add(ball(0.018, mat(COLORS.eye), 0.16, py + 0.08, pz - 0.07, 1, 1, 0.5));
      }
      if (c.label) {
        var blocks = SA.render.blockTextBlocks ? SA.render.blockTextBlocks(c.label) : c.label.length * 4, px = Math.min(0.03, (pw * 0.92) / Math.max(1, blocks));
        var word = SA.render.blockText(THREE, mat(COLORS.ink), c.label, px);
        word.group.position.set(0, -s.h / 2 + 0.13, pz);
        g.add(word.group);
      }
      return g;
    }

    function clear() {
      if (!cards) return;
      group.remove(cards);
      cards.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      cards = null;
    }
    function rebuild() {
      clear();
      cards = new THREE.Group();
      var list = SA.photoBoard.cards();
      list.forEach(function (c) { cards.add(buildCard(c)); });
      shown = list.length;
      group.add(cards);
    }
    function update() {
      var sig;
      try { sig = SA.photoBoard.signature(); } catch (e) { return; }
      if (sig === lastSig) return;
      lastSig = sig;
      rebuild();
    }
    update();
    return { group: group, update: update, cardCount: function () { return shown; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
