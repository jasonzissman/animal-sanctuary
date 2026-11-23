/* SA.render.buildStation(THREE) -> THREE.Group: the research station from SA.station.layout(), flat-shaded primitives only
 * (no textures, no model files): plinth, walls around an open doorway, window, roof, satellite dish, antenna, an "Estación"
 * sign spelled in block letters with an atom icon, a bench and crates. Pure layout and collision live in game/station.js.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var COLORS = { wall: 0xf1e6d0, trim: 0x8a6a4a, roof: 0xc4553f, glass: 0x9fd8ea, plinth: 0x9a9a92, door: 0x5b3e2b, dish: 0xe8edf0,
    metal: 0x6e7880, sign: 0x2f6f8f, letter: 0xffffff, icon: 0xffd24a, wood: 0xb98a55, crate: 0xc99a5b, floor: 0xd9c9a8 };

  function mats(THREE) {
    var m = {};
    Object.keys(COLORS).forEach(function (k) { m[k] = new THREE.MeshPhongMaterial({ color: COLORS[k], flatShading: true, specular: 0x000000 }); });
    return m;
  }

  function slab(THREE, mat, x0, x1, y0, y1, z0, z1) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return mesh;
  }

  /** The word on the sign, facing -z (toward the player at the door). Returns the group and its width. */
  function signText(THREE, m, text, px) { return SA.render.blockText(THREE, m.letter, text, px); }   // glyphs: render/block-text.js

  /** Atom icon: a gold nucleus with two crossing rings. */
  function atom(THREE, m) {
    var g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), m.icon));
    var ringA = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 5, 14), m.icon);
    var ringB = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 5, 14), m.icon);
    ringA.rotation.x = 1.0; ringB.rotation.x = -1.0;
    g.add(ringA, ringB);
    return g;
  }

  SA.render.buildStation = function (THREE) {
    var L = SA.station.layout(), m = mats(THREE), g = new THREE.Group(), y0 = L.floorY, t = L.wallT / 2;
    g.userData.station = true;
    g.userData.climbId = 'station';   // the Space-target outline finds the building by its climb target's id
    var x0 = L.cx - L.halfW, x1 = L.cx + L.halfW, z0 = L.cz - L.halfD, z1 = L.cz + L.halfD, yTop = y0 + L.wallH;

    // Plinth: a low slab that hides the slope under the floor, plus a floor so the doorway looks into a room.
    g.add(slab(THREE, m.plinth, x0 - 0.6, x1 + 0.6, y0 - 1.2, y0 + 0.05, z0 - 0.9, z1 + 0.6));
    g.add(slab(THREE, m.floor, x0, x1, y0, y0 + 0.08, z0, z1));

    // Walls: the solid pieces come from the layout (the doorway is the gap in the front wall).
    L.walls.forEach(function (b) { g.add(slab(THREE, m.wall, b.x0, b.x1, b.y0, b.y1, b.z0, b.z1)); });
    // Lintel over the door and a frame so the opening reads clearly.
    var d = L.door, dx0 = d.x - d.width / 2, dx1 = d.x + d.width / 2, fz = d.z;
    g.add(slab(THREE, m.wall, dx0, dx1, y0 + d.height, yTop, fz - t, fz + t));
    // The frame is plain decoration: the doorway is no Use target and has no tap volume (AS-0211); walking through just enters.
    g.add(slab(THREE, m.trim, dx0 - 0.12, dx0, y0, y0 + d.height + 0.1, fz - t - 0.04, fz + t + 0.04));
    g.add(slab(THREE, m.trim, dx1, dx1 + 0.12, y0, y0 + d.height + 0.1, fz - t - 0.04, fz + t + 0.04));
    g.add(slab(THREE, m.trim, dx0 - 0.12, dx1 + 0.12, y0 + d.height, y0 + d.height + 0.12, fz - t - 0.04, fz + t + 0.04));

    // Window: a glass pane set into the front wall, with a frame.
    var w = L.window;
    g.add(slab(THREE, m.trim, w.x - w.width / 2 - 0.1, w.x + w.width / 2 + 0.1, w.y - 0.1, w.y + w.height + 0.1, fz - t - 0.06, fz + t + 0.06));
    g.add(slab(THREE, m.glass, w.x - w.width / 2, w.x + w.width / 2, w.y, w.y + w.height, fz - t - 0.1, fz + t + 0.1));

    // Roof: a flat slab with an overhang, and a lower parapet-like cap.
    var o = L.roof.overhang;
    g.add(slab(THREE, m.roof, x0 - o, x1 + o, yTop, yTop + L.roof.thickness, z0 - o, z1 + o));

    // Satellite dish: a tilted shallow cone on a post, pointing up and toward the front.
    var di = L.dish;
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.6, 6), m.metal);
    post.position.set(di.x, yTop + L.roof.thickness + 0.3, di.z);
    var bowl = new THREE.Mesh(new THREE.ConeGeometry(di.radius, 0.35, 10, 1, true), m.dish);
    bowl.material = m.dish.clone(); bowl.material.side = THREE.DoubleSide;
    bowl.position.set(di.x, yTop + L.roof.thickness + 0.8, di.z);
    bowl.rotation.x = Math.PI + 0.6;   // opening up and tilted toward -z
    g.add(post, bowl);

    // Antenna: a thin mast with a gold tip.
    var an = L.antenna;
    var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, an.height, 5), m.metal);
    mast.position.set(an.x, yTop + L.roof.thickness + an.height / 2, an.z);
    var tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), m.icon);
    tip.position.set(an.x, yTop + L.roof.thickness + an.height, an.z);
    g.add(mast, tip);

    // Sign over the door: a board with the atom icon and "Estación" in block letters (readable from the front, -z).
    var s = L.sign, px = 0.08, word = signText(THREE, m, s.text, px), bw = word.width + 1.0;
    g.add(slab(THREE, m.sign, s.x - bw / 2, s.x + bw / 2, s.y - 0.3, s.y + 0.3, s.z - 0.04, s.z + 0.08));
    word.group.position.set(s.x - 0.3, s.y, s.z - 0.08);
    var icon = atom(THREE, m);
    icon.scale.setScalar(0.8);
    icon.position.set(s.x + bw / 2 - 0.4, s.y, s.z - 0.12);
    g.add(word.group, icon);

    // The "Lista de misiones" board on the inside of the back wall, facing the doorway (AS-0210).
    if (SA.render.createStationBoard && L.board) {
      var board = SA.render.createStationBoard(THREE);
      g.add(board.group);
      g.userData.board = board;
    }
    // The "Insignias" board on the front wall, left of the doorway, facing into the room (AS-0239).
    if (SA.render.createStationBoard && L.badgesBoard) {
      var badges = SA.render.createStationBoard(THREE, { key: 'badgesBoard', badges: true, id: 'station-badges', titles: { es: ['Insignias'], en: ['Badges'] } });
      g.add(badges.group);
      g.userData.badgesBoard = badges;
    }

    // The photo board on the west wall: one card per proof photo (AS-0207).
    if (SA.render.createPhotoBoard && L.photoBoard && SA.photoBoard) {
      var photos = SA.render.createPhotoBoard(THREE);
      g.add(photos.group);
      g.userData.photoBoard = photos;
    }

    // Bench: a plank seat on two legs, against the front wall.
    var b = L.bench, bx0 = b.x - b.w / 2, bx1 = b.x + b.w / 2, bz0 = b.z - b.d / 2, bz1 = b.z + b.d / 2, by = L.floorY;
    g.add(slab(THREE, m.wood, bx0, bx1, by + 0.42, by + 0.5, bz0, bz1));
    g.add(slab(THREE, m.trim, bx0 + 0.1, bx0 + 0.25, by, by + 0.42, bz0 + 0.05, bz1 - 0.05));
    g.add(slab(THREE, m.trim, bx1 - 0.25, bx1 - 0.1, by, by + 0.42, bz0 + 0.05, bz1 - 0.05));

    // Crates beside the door (one is stacked on top of the others).
    L.crates.forEach(function (c, i) {
      var base = c.stacked ? by + 0.8 : by;
      var crate = slab(THREE, i % 2 ? m.wood : m.crate, c.x - c.size / 2, c.x + c.size / 2, base, base + c.size, c.z - c.size / 2, c.z + c.size / 2);
      g.add(crate);
    });
    return g;
  };
})(typeof window !== 'undefined' ? window : globalThis);
