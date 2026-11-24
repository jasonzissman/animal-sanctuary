/* SA.animalPlan: pure assembly plan for animals (no THREE, no DOM; unit-tested in node:vm).
 *
 * plan(animal, partDefs?) -> [ { animalId, part, builder, size, worldSize, pickSize, color,
 *                                position, rotation, index, count, side } ]
 *   - one entry per part INSTANCE (count: 4 gives 4 entries, index 0..3). A parts[] entry's `also` extras add more specs
 *     with the same part key, one per instance of each extra; `index` then keeps counting across the entry (0..n-1, unique)
 *   - builder      primitive name from the part definition (box | sphere | cone | cylinder)
 *   - worldSize    [x,y,z] extents of the part in animal space (the data "scale"; a number means uniform)
 *   - size         local extents to give the unit primitive BEFORE `rotation` (axis-swapped when the
 *                  primitive is turned to point forward/back, so worldSize always holds)
 *   - pickSize     the invisible tap volume, in the same local frame as `size` (so it follows `rotation`):
 *                  PICK_SCALE (1.6x) for small parts, BIG_PICK_SCALE (1.0x) for big masses (cuerpo, cabeza,
 *                  caparazon: world volume > BIG_VOLUME) so they do not swallow their neighbours
 *   - pickVolume   volume of the pick box; choosePick prefers the smallest (most specific) one
 *   - position     [x,y,z] in animal space (+z is forward, +y up; the animal's left is +x)
 *   - rotation     [rx,ry,rz] radians (Euler XYZ)
 *   - extra        true for pieces from an entry's `also` list (neck segments, knees, feet); false for the part itself
 *   - side         'left' | 'right' | null (null when centred)
 *   - pupil        '#rrggbb' | null: the data's pupil colour; the renderer adds a small sphere child in front of the part
 * Instances spread symmetrically using |offset.x| as half-width: 2 -> left/right, 4 -> 2x2 grid
 * (rows at +-1.2 * half-width in z), other counts -> evenly across [-w, +w].
 *
 * choosePick(hits) -> the hit the player meant. `hits` are Raycaster results (nearest first) on pick volumes.
 * Among hits within PICK_DEPTH of the nearest one the SMALLEST pick volume wins (ojos beat cabeza, patas beat
 * cuerpo); ties go to the nearest. Parts far behind the first surface are ignored, so you cannot tap an eye
 * through the back of the head.
 *
 * placements(animals, opts) -> { <animalId>: { x, z, y, rotY } } deterministic spots on dry ground in each
 * animal's biome (uses SA.map). opts.avoid = [[x,z],...] points (e.g. trees) to keep clear of.
 *
 * herdPlacements(animals, opts) -> [ { instanceId: '<animalId>#<n>', animalId, x, z, y, rotY, radius } ] `animal.herd` (1-5)
 * spread-out instances per species, each with its own wander home (see below). Pure planning only: nothing renders them yet.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var PICK_SCALE = 1.6;
  var BIG_PICK_SCALE = 1.0;
  var BIG_VOLUME = 0.2;       // world volume above which a part is a big mass
  var PICK_DEPTH = 0.3;      // how far behind the nearest hit a smaller part can still be picked
  var DEFAULT_SPREAD = 0.3;   // half-width used when a multi-count part has offset.x === 0
  var ROW_FACTOR = 1.2;
  var TILT = { top: 0.2, side: 0.3 };
  var HALF_PI = Math.PI / 2;

  function vec(scale) {
    return Array.isArray(scale) ? [scale[0], scale[1], scale[2]] : [scale, scale, scale];
  }

  /** Offsets [dx, dz] (relative to the part offset) for each instance of a `count`-part. */
  function layout(count, spread, row) {
    var out = [], i;
    if (count === 1) return [[0, 0]];
    if (count === 2) return [[-spread, 0], [spread, 0]];
    if (count === 4) {
      var z = row || spread * ROW_FACTOR;
      return [[-spread, z], [spread, z], [-spread, -z], [spread, -z]];
    }
    for (i = 0; i < count; i++) out.push([-spread + (2 * spread * i) / (count - 1), 0]);
    return out;
  }

  function sign(n) { return n > 1e-9 ? 1 : n < -1e-9 ? -1 : 0; }

  /** Turn the part to point along z for forward/back anchored cones and cylinders. */
  function orientation(def, builder) {
    var long = builder === 'cone' || builder === 'cylinder';
    if (long && def.anchor === 'front') return HALF_PI;
    if (long && def.anchor === 'back') return builder === 'cone' ? -HALF_PI : HALF_PI;
    return 0;
  }

  /** Expand one piece (a parts[] entry, or one of its `also` extras) into one spec per instance. A piece may set
   *  `rot` [rx,ry,rz] (radians; replaces the automatic turn, and `scale` is then used as-is) and `row` (half-spacing in z
   *  of the two rows of a count-4 piece; default 1.2 x the x half-width). An extra inherits part/builder/color from `base`. */
  function pieces(animal, def, entry, base, out) {
    var world = vec(entry.scale);
    var builder = entry.builder || base.builder || def.builder;   // an animal may draw a part with another primitive (zigzag tail, blocky head)
    var rot = entry.rot;
    var rx = rot ? 0 : orientation(def, builder);
    var local = rx ? [world[0], world[2], world[1]] : world.slice();
    var ps = world[0] * world[1] * world[2] > BIG_VOLUME ? BIG_PICK_SCALE : PICK_SCALE;
    var pickSize = [local[0] * ps, local[1] * ps, local[2] * ps];
    var spread = Math.abs(entry.offset[0]) || DEFAULT_SPREAD;
    layout(entry.count, spread, entry.row).forEach(function (spot, i) {
      var x = entry.count === 1 ? entry.offset[0] : spot[0];
      var side = sign(x);
      var rz = !rx && !rot && entry.count > 1 && TILT[def.anchor] ? -side * TILT[def.anchor] : 0;
      out.push({
        animalId: animal.id, part: base.part, builder: builder, color: entry.color || base.color,
        pupil: entry.pupil || (entry === base ? null : base.pupil) || null,
        size: local.slice(), worldSize: world.slice(),
        pickSize: pickSize, pickVolume: pickSize[0] * pickSize[1] * pickSize[2],
        position: [x, entry.offset[1], entry.offset[2] + spot[1]],
        rotation: rot ? [rot[0], rot[1], rot[2]] : [rx, 0, rz], index: i, count: entry.count, extra: entry !== base,
        side: side > 0 ? 'left' : side < 0 ? 'right' : null,
      });
    });
  }

  /** An entry's optional `also` pieces (neck segments, knee bumps, feet...) are extra meshes tagged with the SAME part key,
   *  so tapping one answers as that part. `index` keeps counting up across the entry, so each mesh of a part is unique. */
  function plan(animal, partDefs) {
    var lookup = partDefs
      ? function (key) { return Array.isArray(partDefs) ? partDefs.filter(function (d) { return d.key === key; })[0] : partDefs[key]; }
      : function (key) { return SA.data.get('parts', key); };
    var out = [];
    animal.parts.forEach(function (entry) {
      var def = lookup(entry.part);
      if (!def) throw new Error('animal ' + animal.id + ': no part definition for ' + JSON.stringify(entry.part));
      var from = out.length;
      pieces(animal, def, entry, entry, out);
      (entry.also || []).forEach(function (extra) { pieces(animal, def, extra, entry, out); });
      for (var k = from; k < out.length; k++) out[k].index = k - from;
    });
    return out;
  }

  function choosePick(hits) {
    if (!hits || !hits.length) return null;
    var limit = hits[0].distance + PICK_DEPTH, best = null;
    hits.forEach(function (h) {
      if (h.distance > limit || !h.object || !h.object.userData) return;
      var v = h.object.userData.pickVolume;
      if (v === undefined) return;
      var bv = best && best.object.userData.pickVolume;
      if (!best || v < bv || (v === bv && h.distance < best.distance)) best = h;
    });
    return best || hits[0];
  }

  /** Radius of a circle around the animal's origin that holds all its (enlarged) pick volumes. Rotation-safe: it uses
   *  each box's half-diagonal, so the animal's heading never matters. 0 when the parts are unknown. */
  function pickRadius(animal) {
    var r = 0;
    try {
      plan(animal).forEach(function (s) {
        var half = 0.5 * Math.sqrt(s.pickSize[0] * s.pickSize[0] + s.pickSize[1] * s.pickSize[1] + s.pickSize[2] * s.pickSize[2]);
        r = Math.max(r, Math.hypot(s.position[0], s.position[2]) + half);
      });
    } catch (e) { r = 0; }
    return r;
  }

  var MIN_CENTRE = 4.5;       // preferred centre distance between two animals, on top of the hard body gap

  var QUAD_EDGE = 3, QUAD_Z_EDGE = 4;   // margin kept inside a quadrant (strip borders and the map edge)
  var QUAD_ORDER = [[-1, -1], [1, 1], [1, -1], [-1, 1]];   // [x half, z half]: a biome's 2nd animal lands diagonally from its 1st
  var DEFAULT_RADIUS = 3;     // wander radius of an animal that only covers its own spot

  /** The four quadrants of a biome strip (west/east halves by x, south/north halves by z, split at z = 0), in the order
   *  the animals of a biome take them: [{ id: 'sw'|'ne'|'se'|'nw', x0, x1, z0, z1, cx, cz }]. [] for an unknown biome. */
  function quadrants(biome) {
    var M = SA.map, strip = M.biomeRange(biome), B = M.BOUNDS;
    if (!strip) return [];
    return QUAD_ORDER.map(function (q) {
      var x0 = q[0] < 0 ? strip.lo : strip.centerX, x1 = q[0] < 0 ? strip.centerX : strip.hi;
      var z0 = q[1] < 0 ? B.minZ : 0, z1 = q[1] < 0 ? 0 : B.maxZ;
      return { id: (q[1] < 0 ? 's' : 'n') + (q[0] < 0 ? 'w' : 'e'), x0: x0, x1: x1, z0: z0, z1: z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
    });
  }

  /** Empty quadrants (a biome with fewer animals than quadrants): a ground animal of that biome (perchers hop between
   *  trees instead) takes each as wander area, so its `radius` grows to reach the quadrant's centre. */
  function coverEmptyQuadrants(animals, result) {
    var byBiome = {};
    animals.forEach(function (a) { (byBiome[a.biome] = byBiome[a.biome] || []).push(a); });
    Object.keys(byBiome).forEach(function (biome) {
      var list = byBiome[biome], walkers = list.filter(function (a) { return a.perch !== 'tree'; }), pool = walkers.length ? walkers : list;
      quadrants(biome).slice(list.length).forEach(function (q, k) {
        var r = result[pool[k % pool.length].id];
        r.radius = Math.max(r.radius, Math.ceil(Math.hypot(r.x - q.cx, r.z - q.cz)) + 1);
      });
    });
  }

  /** Spots keep SA.spacing.GAP between body radii AND stay clear of each other's pick volumes (centre distance >=
   *  the sum of the pick radii), so a tap never lands on two animals. The animals of one biome take its quadrants one
   *  by one (AS-0249: the map is 2x, so they spread over the whole strip, not the middle); empty quadrants become a
   *  ground animal's wander area (coverEmptyQuadrants). If a crowded quadrant has no free spot the one with the most
   *  clearance is used. Row: { x, z, y, rotY, quad, radius }. */
  function placements(animals, opts) {
    var M = SA.map, avoid = (opts && opts.avoid) || [], B = M.BOUNDS;
    var rand = M.rng(7);
    var spots = [], result = {}, taken = {};
    animals.forEach(function (a) {
      var best = null, bestRoom = -Infinity, quads = quadrants(a.biome);
      var qi = taken[a.biome] || 0, q = quads.length ? quads[qi % quads.length] : { id: 'c', x0: -14, x1: 14, z0: -18, z1: 18, cx: 0, cz: 4 };
      taken[a.biome] = qi + 1;
      var me = { r: SA.spacing ? SA.spacing.bodyRadius(a) : 0, pick: pickRadius(a) };
      var gap = SA.spacing ? SA.spacing.GAP : 0;
      var zLo = Math.max(q.z0, B.minZ + QUAD_Z_EDGE), zHi = Math.min(q.z1, B.maxZ - QUAD_Z_EDGE);
      for (var t = 0; t < 800; t++) {
        var x = q.x0 + QUAD_EDGE + rand() * (q.x1 - q.x0 - 2 * QUAD_EDGE), z = zLo + rand() * (zHi - zLo);
        if (M.biomeAt(x) !== a.biome || M.groundHeight(x, z) < M.WATER_LEVEL + 0.45) continue;
        if (SA.forestStreams && SA.forestStreams.inWater(x, z, 0.8)) continue;   // never start in a forest stream (AS-0301)
        if (SA.lookouts && SA.lookouts.near(x, z, 0.5)) continue;   // nor under a lookout tower (AS-0160)
        if (SA.fallenLogs && SA.fallenLogs.near(x, z, 1)) continue;   // nor on a fallen log (AS-0302)
        if (SA.surfaces && SA.surfaces.near(x, z, 1)) continue;   // nor on a river bridge (AS-0158)
        if (t < 600) {   // flat enough to stand on (no step over 0.6 within 1 unit); the last tries give in so a steep quadrant still gets an animal
          var h = M.groundHeight(x, z);
          if (Math.abs(M.groundHeight(x + 1, z) - h) > 0.6 || Math.abs(M.groundHeight(x, z + 1) - h) > 0.6) continue;
        }
        if (SA.station && SA.station.inFootprint(x, z, 1.5)) continue;   // keep the research station's footprint clear too
        if (SA.player && SA.player.inSpawnZone(x, z, 1)) continue;       // never start next to the spawn (clear radius + 1)
        var room = Infinity, near = Infinity, i, d;   // room: worst clearance beyond the required distance; near: nearest centre
        for (i = 0; i < spots.length; i++) {
          d = Math.hypot(spots[i][0] - x, spots[i][1] - z);
          room = Math.min(room, d - Math.max(me.r + spots[i][2] + gap, me.pick + spots[i][3]));
          near = Math.min(near, d);
        }
        var clear = true;
        for (i = 0; i < avoid.length && clear; i++) clear = Math.hypot(avoid[i][0] - x, avoid[i][1] - z) >= 2.4;
        if (clear && room >= 0 && near >= MIN_CENTRE) { best = [x, z]; bestRoom = Infinity; break; }
        var score = (clear ? 0 : -1000) + Math.min(room, near - MIN_CENTRE);
        if (score > bestRoom) { best = [x, z]; bestRoom = score; }
      }
      best = best || [q.cx, q.cz];
      spots.push([best[0], best[1], me.r, me.pick]);
      result[a.id] = { x: best[0], z: best[1], y: M.groundHeight(best[0], best[1]), rotY: (rand() - 0.5) * 1.2, quad: q.id, radius: DEFAULT_RADIUS };
    });
    coverEmptyQuadrants(animals, result);
    return result;
  }

  // Herds (AS-0254): each species has `herd` instances (1-5), every one with its own home in a different sub-area of its biome.
  var CELL_ORDER = [[0, 0], [1, 2], [1, 0], [0, 2], [0, 1], [1, 1]];   // [column (west/east), row (south..north)] of the 2 x 3 grid; consecutive cells lie far apart

  /** The 2 x 3 sub-areas of a biome strip, in CELL_ORDER: [{ x0, x1, z0, z1 }]. [] for an unknown biome. */
  function subAreas(biome) {
    var M = SA.map, strip = M.biomeRange(biome), B = M.BOUNDS;
    if (!strip) return [];
    var zLo = B.minZ + QUAD_Z_EDGE, rowH = (B.maxZ - QUAD_Z_EDGE - zLo) / 3;
    return CELL_ORDER.map(function (c) {
      var x0 = c[0] ? strip.centerX : strip.lo, x1 = c[0] ? strip.hi : strip.centerX;
      return { x0: x0 + QUAD_EDGE, x1: x1 - QUAD_EDGE, z0: zLo + c[1] * rowH, z1: zLo + (c[1] + 1) * rowH };
    });
  }

  /** herdPlacements(animals, opts) -> [{ instanceId: '<animalId>#<n>', animalId, x, z, y, rotY, radius }], `animal.herd` (default 1)
   *  instances per animal, in input order. Instance n of the k-th species of a biome takes sub-area (2k + n) of subAreas(), so the
   *  homes spread over the whole strip. Spots are dry, flat, off the station footprint and spawn zone, and keep the body gap, the
   *  pick-volume clearance and MIN_CENTRE from every other instance and from opts.avoid ([[x,z],...]); a crowded cell falls back to
   *  its most roomy spot. Deterministic (SA.map.rng). `radius` is the wander radius around the home. */
  function herdPlacements(animals, opts) {
    var M = SA.map, avoid = (opts && opts.avoid) || [], rand = M.rng(11);
    var spots = [], out = [], species = {}, gap = SA.spacing ? SA.spacing.GAP : 0;
    animals.forEach(function (a) {
      var cells = subAreas(a.biome), k = species[a.biome] = (species[a.biome] === undefined ? 0 : species[a.biome] + 1);
      var me = { r: SA.spacing ? SA.spacing.bodyRadius(a) : 0, pick: pickRadius(a) };
      for (var n = 0; n < (a.herd || 1); n++) {
        var c = cells.length ? cells[(2 * k + n) % cells.length] : { x0: -14, x1: 14, z0: -18, z1: 18 };
        var best = null, bestScore = -Infinity;
        for (var t = 0; t < 600; t++) {
          var x = c.x0 + rand() * (c.x1 - c.x0), z = c.z0 + rand() * (c.z1 - c.z0), h = M.groundHeight(x, z), i, d;
          if (M.biomeAt(x) !== a.biome || h < M.WATER_LEVEL + 0.45) continue;
          if (SA.forestStreams && SA.forestStreams.inWater(x, z, 0.8)) continue;   // never start in a forest stream (AS-0301)
          if (SA.lookouts && SA.lookouts.near(x, z, 0.5)) continue;   // nor under a lookout tower (AS-0160)
          if (SA.fallenLogs && SA.fallenLogs.near(x, z, 1)) continue;   // nor on a fallen log (AS-0302)
          if (SA.surfaces && SA.surfaces.near(x, z, 1)) continue;   // nor on a river bridge (AS-0158)
          if (t < 450 && (Math.abs(M.groundHeight(x + 1, z) - h) > 0.6 || Math.abs(M.groundHeight(x, z + 1) - h) > 0.6)) continue;
          if (SA.station && SA.station.inFootprint(x, z, 1.5)) continue;
          if (SA.player && SA.player.inSpawnZone(x, z, 1)) continue;
          var room = Infinity, near = Infinity, clear = true;
          for (i = 0; i < spots.length; i++) {
            d = Math.hypot(spots[i][0] - x, spots[i][1] - z);
            room = Math.min(room, d - Math.max(me.r + spots[i][2] + gap, me.pick + spots[i][3]));
            near = Math.min(near, d);
          }
          for (i = 0; i < avoid.length && clear; i++) clear = Math.hypot(avoid[i][0] - x, avoid[i][1] - z) >= 2.4;
          if (clear && room >= 0 && near >= MIN_CENTRE) { best = [x, z]; break; }
          var score = (clear ? 0 : -1000) + Math.min(room, near - MIN_CENTRE);
          if (score > bestScore) { best = [x, z]; bestScore = score; }
        }
        best = best || [(c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2];
        spots.push([best[0], best[1], me.r, me.pick]);
        out.push({ instanceId: a.id + '#' + n, animalId: a.id, x: best[0], z: best[1], y: M.groundHeight(best[0], best[1]), rotY: (rand() - 0.5) * 1.2, radius: DEFAULT_RADIUS });
      }
    });
    return out;
  }

  SA.animalPlan = { PICK_SCALE: PICK_SCALE, BIG_PICK_SCALE: BIG_PICK_SCALE, DEFAULT_RADIUS: DEFAULT_RADIUS, plan: plan, choosePick: choosePick, pickRadius: pickRadius, quadrants: quadrants, placements: placements,
    subAreas: subAreas, herdPlacements: herdPlacements };
})(typeof window !== 'undefined' ? window : globalThis);
