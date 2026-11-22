/* SA.station: pure layout of the research station beside the spawn (no THREE, no DOM; node:vm tested). Needs SA.map.
 * The kid starts just outside its door, looking out; the building is where the scientist and the briefing live (next slices).
 *
 *   SA.station.layout()            -> the one layout object (computed once, deterministic):
 *       { cx, cz, floorY, halfW, halfD, wallH, wallT, facing: { x: 0, z: -1 },   building centre, floor height, half sizes
 *         door:   { x, z, width, height }      centre of the doorway in the front wall (z = cz - halfD)
 *         window: { x, z, width, height, y }   in the front wall, beside the door
 *         roof:   { y, overhang, thickness }, dish: { x, y, z, radius }   satellite dish on the roof, antenna: { x, y, z, height }
 *         sign:   { text: 'Estación', icon: 'atom', x, y, z }              over the door
 *         board:  { x, y, z, width, height, depth, facing }  the "Lista de misiones" board on the back wall's inner face, facing the door (AS-0210)
 *         bench:  { x, z, w, d },  crates: [{ x, z, size }],  walls: [box], scientist: { x, z } (her post), spawn: { x, z, heading } }
 *     a box is { x0, x1, z0, z1, y0, y1 } in world units. Door and window are gaps/openings; the walls leave the doorway open.
 *   SA.station.collisionBoxes()    -> [box] the solid parts at ground level: the wall pieces (doorway left open) and the crates
 *   SA.station.obstacles()         -> [[x, z, r], ...] those boxes as circle chains for SA.player.step / SA.camera.clearPath
 *   SA.station.spawn()             -> { x, z, heading } outside the door, straight in front of the scientist's post, facing her and the station (heading 0 = looking toward +z)
 *   SA.station.inFootprint(x, z, pad?) true within pad of the building, bench and crates (decor and animals keep out)
 *   SA.station.avoidPoints()       -> [[x, z], ...] sparse points across the footprint for placement code that spaces by distance
 *   SA.station.climbTarget()       -> the station as a generic SA.climb target (AS-0194), plain data:
 *       { kind: 'building', id: 'station', x, z, footprint: { w, d } (the walls' outer box), topY (roof surface),
 *         top: { shape: 'rect', size: { w, d }, solids: [[x, z, r]] } (the flat roof incl. its overhang; the dish and antenna are solid on it),
 *         noClimb: [box] (AS-0165: the doorway strip and the room inside; the station can't be climbed from there) }
 * SA.player.spawn() reads SA.station.spawn() when this module is loaded, so there is one source for where the game starts.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var HALF_W = 3.2, HALF_D = 2.6, WALL_H = 2.9, WALL_T = 0.5, DOOR_W = 2.2, DOOR_H = 2.1;
  var BOARD_D = 0.12;    // how far the missions board stands out from the back wall's inner face
  var SPAWN_GAP = 2.6;  // spawn this far in front of the front wall's outer face
  var SCI_X = 1.7, SCI_GAP = 0.9;   // the scientist's post: this far right of the door's centre line, this far in front of the front wall's outer face
  var cached = null;

  function box(x0, x1, z0, z1, y0, y1) { return { x0: x0, x1: x1, z0: z0, z1: z1, y0: y0, y1: y1 }; }

  /** Height spread and wetness of the ground over a rectangle (x0..x1, z0..z1). */
  function probe(x0, x1, z0, z1) {
    var M = SA.map, lo = Infinity, hi = -Infinity, wet = false;
    for (var x = x0; x <= x1 + 1e-9; x += 0.75) {
      for (var z = z0; z <= z1 + 1e-9; z += 0.75) {
        var h = M.groundHeight(x, z);
        if (h < M.WATER_LEVEL + 0.5) wet = true;
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
    }
    return { lo: lo, hi: hi, spread: hi - lo, wet: wet };
  }

  /** Flattest dry patch next to the bosque/selva border (x = 0), clear of the river, in the middle band of the map. */
  function pickSite() {
    var best = null;
    for (var cx = -7.5; cx <= -4.5; cx += 0.5) {
      for (var cz = 4; cz <= 18; cz += 0.5) {
        var p = probe(cx - HALF_W - 1.5, cx + HALF_W + 2.5, cz - HALF_D - SPAWN_GAP - 1, cz + HALF_D + 1);
        if (p.wet) continue;
        if (!best || p.spread < best.spread - 1e-9) best = { cx: cx, cz: cz, spread: p.spread, floorY: p.hi };
      }
    }
    return best || { cx: -6, cz: 12, spread: 0, floorY: SA.map.groundHeight(-6, 12) };
  }

  function build() {
    var s = pickSite(), cx = s.cx, cz = s.cz, y0 = s.floorY, fz = cz - HALF_D;   // fz: front wall centre line
    var wx0 = cx - HALF_W, wx1 = cx + HALF_W, wz0 = cz - HALF_D, wz1 = cz + HALF_D, t = WALL_T / 2, yTop = y0 + WALL_H;
    var dx0 = cx - DOOR_W / 2, dx1 = cx + DOOR_W / 2;
    var walls = [
      box(wx0, dx0, fz - t, fz + t, y0, yTop),                       // front, left of the door
      box(dx1, wx1, fz - t, fz + t, y0, yTop),                       // front, right of the door
      box(wx0, wx1, wz1 - t, wz1 + t, y0, yTop),                     // back
      box(wx0 - t, wx0 + t, wz0 + t, wz1 - t, y0, yTop),             // west side
      box(wx1 - t, wx1 + t, wz0 + t, wz1 - t, y0, yTop),             // east side
    ];
    var crates = [{ x: wx1 + 1.0, z: wz0 + 0.2, size: 0.9 }, { x: wx1 + 1.0, z: wz0 + 1.3, size: 0.8 }, { x: wx1 + 1.0, z: wz0 + 0.7, size: 0.7, stacked: true }];
    return {
      cx: cx, cz: cz, floorY: y0, halfW: HALF_W, halfD: HALF_D, wallH: WALL_H, wallT: WALL_T, facing: { x: 0, z: -1 }, spread: s.spread,
      door: { x: cx, z: fz, width: DOOR_W, height: DOOR_H },
      window: { x: cx + 2.15, z: fz, width: 1.1, height: 0.9, y: y0 + 1.0 },
      roof: { y: yTop, overhang: 0.5, thickness: 0.3 },
      dish: { x: cx - 1.5, y: yTop + 0.3, z: cz + 0.6, radius: 0.8 },
      antenna: { x: cx + 1.9, y: yTop + 0.3, z: cz + 1.2, height: 2.2 },
      sign: { text: 'Estación', icon: 'atom', x: cx, y: y0 + DOOR_H + 0.5, z: fz - t - 0.05 },
      bench: { x: cx - 2.1, z: fz - t - 0.55, w: 1.7, d: 0.55 },
      // "Lista de misiones" board (AS-0210): on the inside face of the back wall, centred on the doorway's line so it is the first thing
      // seen on the way in. (x, y, z) is the slab's centre; it stands `depth` out from the wall, facing the door.
      board: { x: cx, y: y0 + 1.6, z: wz1 - t - BOARD_D / 2, width: 3.2, height: 1.8, depth: BOARD_D, facing: { x: 0, z: -1 } },
      crates: crates, walls: walls,
      // The scientist's post (SA.npc reads it). The kid spawns straight in front of her, looking at her (heading 0 = +z, toward
      // the building), so she fills the view with the doorway just left of her (AS-0212).
      scientist: { x: cx + SCI_X, z: fz - t - SCI_GAP },
      spawn: { x: cx + SCI_X, z: fz - t - SPAWN_GAP, heading: 0 },
    };
  }

  function layout() { return cached || (cached = build()); }

  function collisionBoxes() {
    var L = layout(), out = L.walls.slice();
    L.crates.forEach(function (c) { if (!c.stacked) out.push(box(c.x - c.size / 2, c.x + c.size / 2, c.z - c.size / 2, c.z + c.size / 2, L.floorY, L.floorY + c.size)); });
    var b = L.board;   // stands out from the wall, so it is solid too (a thin strip against the back wall)
    out.push(box(b.x - b.width / 2, b.x + b.width / 2, b.z - b.depth / 2, b.z + b.depth / 2, b.y - b.height / 2, b.y + b.height / 2));
    return out;
  }

  /** A box as a chain of overlapping circles along its long side (each circle covers the box's short side). */
  function circles(b) {
    var w = b.x1 - b.x0, d = b.z1 - b.z0, along = w >= d, short = Math.min(w, d), r = short / 2, out = [];
    var lo = along ? b.x0 : b.z0, hi = along ? b.x1 : b.z1, len = hi - lo;
    var n = Math.max(1, Math.ceil((len - short) / (r * 1.6)) + 1);
    for (var i = 0; i < n; i++) {
      var u = n === 1 ? (lo + hi) / 2 : lo + r + (len - short) * i / (n - 1);
      out.push(along ? [u, (b.z0 + b.z1) / 2, r] : [(b.x0 + b.x1) / 2, u, r]);
    }
    return out;
  }

  function obstacles() {
    var out = [];
    collisionBoxes().forEach(function (b) { circles(b).forEach(function (c) { out.push(c); }); });
    return out;
  }

  function climbTarget() {
    var L = layout(), o = L.roof.overhang, t = L.wallT / 2, d = L.door, m = 0.3, fz = d.z;
    // Nobody climbs from the doorway (it is the station-menu Use target, AS-0146) or from inside the room.
    var noClimb = [{ x0: d.x - d.width / 2 - m, x1: d.x + d.width / 2 + m, z0: fz - 3, z1: fz + t },
      { x0: L.cx - L.halfW, x1: L.cx + L.halfW, z0: fz, z1: L.cz + L.halfD }];
    // The dish and the antenna stay solid on the roof (circles on the flat top).
    var solids = [[L.dish.x, L.dish.z, L.dish.radius * 0.8], [L.antenna.x, L.antenna.z, 0.35]];
    return { kind: 'building', id: 'station', x: L.cx, z: L.cz, footprint: { w: 2 * L.halfW + L.wallT, d: 2 * L.halfD + L.wallT },
      topY: L.roof.y + L.roof.thickness, top: { shape: 'rect', size: { w: 2 * (L.halfW + o), d: 2 * (L.halfD + o) }, solids: solids }, noClimb: noClimb };
  }

  function spawn() { var s = layout().spawn; return { x: s.x, z: s.z, heading: s.heading }; }

  function inFootprint(x, z, pad) {
    var L = layout(), p = (pad || 0) + 0.5;
    var inside = x > L.cx - L.halfW - p - 0.5 && x < L.cx + L.halfW + p + 0.5 && z > L.cz - L.halfD - p && z < L.cz + L.halfD + p;
    var b = L.bench, bench = Math.abs(x - b.x) < b.w / 2 + p && Math.abs(z - b.z) < b.d / 2 + p;
    var crate = L.crates.some(function (c) { return Math.abs(x - c.x) < c.size / 2 + p && Math.abs(z - c.z) < c.size / 2 + p; });
    return inside || bench || crate;
  }

  function avoidPoints() {
    var L = layout(), out = [];
    for (var x = L.cx - L.halfW; x <= L.cx + L.halfW + 1.2; x += 2) for (var z = L.cz - L.halfD; z <= L.cz + L.halfD; z += 2) out.push([x, z]);
    return out;
  }

  SA.station = { layout: layout, collisionBoxes: collisionBoxes, obstacles: obstacles, spawn: spawn, inFootprint: inFootprint, avoidPoints: avoidPoints, climbTarget: climbTarget,
    DOOR_W: DOOR_W, SPAWN_GAP: SPAWN_GAP };
})(typeof window !== 'undefined' ? window : globalThis);
