/* SA.animalPlan: pure assembly plan for animals (no THREE, no DOM; unit-tested in node:vm).
 *
 * plan(animal, partDefs?) -> [ { animalId, part, builder, size, worldSize, pickSize, color,
 *                                position, rotation, index, count, side } ]
 *   - one entry per part INSTANCE (count: 4 gives 4 entries, index 0..3)
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
  function layout(count, spread) {
    var out = [], i;
    if (count === 1) return [[0, 0]];
    if (count === 2) return [[-spread, 0], [spread, 0]];
    if (count === 4) {
      var row = spread * ROW_FACTOR;
      return [[-spread, row], [spread, row], [-spread, -row], [spread, -row]];
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

  function plan(animal, partDefs) {
    var lookup = partDefs
      ? function (key) { return Array.isArray(partDefs) ? partDefs.filter(function (d) { return d.key === key; })[0] : partDefs[key]; }
      : function (key) { return SA.data.get('parts', key); };
    var out = [];
    animal.parts.forEach(function (entry) {
      var def = lookup(entry.part);
      if (!def) throw new Error('animal ' + animal.id + ': no part definition for ' + JSON.stringify(entry.part));
      var world = vec(entry.scale);
      var builder = entry.builder || def.builder;   // an animal may draw a part with another primitive (zigzag tail, blocky head)
      var rx = orientation(def, builder);
      var local = rx ? [world[0], world[2], world[1]] : world.slice();
      var ps = world[0] * world[1] * world[2] > BIG_VOLUME ? BIG_PICK_SCALE : PICK_SCALE;
      var pickSize = [local[0] * ps, local[1] * ps, local[2] * ps];
      var spread = Math.abs(entry.offset[0]) || DEFAULT_SPREAD;
      var spots = layout(entry.count, spread);
      spots.forEach(function (spot, i) {
        var x = entry.count === 1 ? entry.offset[0] : spot[0];
        var side = sign(x);
        var rz = !rx && entry.count > 1 && TILT[def.anchor] ? -side * TILT[def.anchor] : 0;
        out.push({
          animalId: animal.id, part: entry.part, builder: builder, color: entry.color, pupil: entry.pupil || null,
          size: local.slice(), worldSize: world.slice(),
          pickSize: pickSize, pickVolume: pickSize[0] * pickSize[1] * pickSize[2],
          position: [x, entry.offset[1], entry.offset[2] + spot[1]],
          rotation: [rx, 0, rz], index: i, count: entry.count,
          side: side > 0 ? 'left' : side < 0 ? 'right' : null,
        });
      });
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

  /** Spots keep SA.spacing.GAP between body radii AND stay clear of each other's pick volumes (centre distance >=
   *  the sum of the pick radii), so a tap never lands on two animals. Herds (several animals per species and biome)
   *  go through the same rule. If a crowded biome has no free spot the one with the most clearance is used. */
  function placements(animals, opts) {
    var M = SA.map, avoid = (opts && opts.avoid) || [];
    var rand = M.rng(7);
    var spots = [], result = {};
    animals.forEach(function (a) {
      var best = null, bestRoom = -Infinity, strip = M.biomeRange(a.biome) || { centerX: 0 };
      var me = { r: SA.spacing ? SA.spacing.bodyRadius(a) : 0, pick: pickRadius(a) };
      var gap = SA.spacing ? SA.spacing.GAP : 0;
      var half = strip.hi === undefined ? 14 : (strip.hi - strip.lo) / 2 - 3;   // the whole strip (the map is 2x since AS-0129), minus a margin
      for (var t = 0; t < 800; t++) {
        var x = strip.centerX + (rand() * 2 - 1) * half, z = -18 + rand() * 36;
        if (M.biomeAt(x) !== a.biome || M.groundHeight(x, z) < M.WATER_LEVEL + 0.45) continue;
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
      best = best || [strip.centerX, 4];
      spots.push([best[0], best[1], me.r, me.pick]);
      result[a.id] = { x: best[0], z: best[1], y: M.groundHeight(best[0], best[1]), rotY: (rand() - 0.5) * 1.2 };
    });
    return result;
  }

  SA.animalPlan = { PICK_SCALE: PICK_SCALE, BIG_PICK_SCALE: BIG_PICK_SCALE, plan: plan, choosePick: choosePick, pickRadius: pickRadius, placements: placements };
})(typeof window !== 'undefined' ? window : globalThis);
