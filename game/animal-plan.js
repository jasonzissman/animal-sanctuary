/* SA.animalPlan: pure assembly plan for animals (no THREE, no DOM; unit-tested in node:vm).
 *
 * plan(animal, partDefs?) -> [ { animalId, part, builder, size, worldSize, pickSize, color,
 *                                position, rotation, index, count, side } ]
 *   - one entry per part INSTANCE (count: 4 gives 4 entries, index 0..3)
 *   - builder      primitive name from the part definition (box | sphere | cone | cylinder)
 *   - worldSize    [x,y,z] extents of the part in animal space (the data "scale"; a number means uniform)
 *   - size         local extents to give the unit primitive BEFORE `rotation` (axis-swapped when the
 *                  primitive is turned to point forward/back, so worldSize always holds)
 *   - pickSize     worldSize * PICK_SCALE: the invisible, enlarged tap volume
 *   - position     [x,y,z] in animal space (+z is forward, +y up; the animal's left is +x)
 *   - rotation     [rx,ry,rz] radians (Euler XYZ)
 *   - side         'left' | 'right' | null (null when centred)
 * Instances spread symmetrically using |offset.x| as half-width: 2 -> left/right, 4 -> 2x2 grid
 * (rows at +-1.2 * half-width in z), other counts -> evenly across [-w, +w].
 *
 * placements(animals, opts) -> { <animalId>: { x, z, y, rotY } } deterministic spots on dry ground in each
 * animal's biome (uses SA.map). opts.avoid = [[x,z],...] points (e.g. trees) to keep clear of.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var PICK_SCALE = 1.6;
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
  function orientation(def) {
    var long = def.builder === 'cone' || def.builder === 'cylinder';
    if (long && def.anchor === 'front') return HALF_PI;
    if (long && def.anchor === 'back') return def.builder === 'cone' ? -HALF_PI : HALF_PI;
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
      var rx = orientation(def);
      var local = rx ? [world[0], world[2], world[1]] : world.slice();
      var spread = Math.abs(entry.offset[0]) || DEFAULT_SPREAD;
      var spots = layout(entry.count, spread);
      spots.forEach(function (spot, i) {
        var x = entry.count === 1 ? entry.offset[0] : spot[0];
        var side = sign(x);
        var rz = !rx && entry.count > 1 && TILT[def.anchor] ? -side * TILT[def.anchor] : 0;
        out.push({
          animalId: animal.id, part: entry.part, builder: def.builder, color: entry.color,
          size: local.slice(), worldSize: world.slice(),
          pickSize: [world[0] * PICK_SCALE, world[1] * PICK_SCALE, world[2] * PICK_SCALE],
          position: [x, entry.offset[1], entry.offset[2] + spot[1]],
          rotation: [rx, 0, rz], index: i, count: entry.count,
          side: side > 0 ? 'left' : side < 0 ? 'right' : null,
        });
      });
    });
    return out;
  }

  function placements(animals, opts) {
    var M = SA.map, avoid = (opts && opts.avoid) || [];
    var rand = M.rng(7);
    var spots = [], result = {};
    animals.forEach(function (a) {
      var best = null;
      for (var t = 0; t < 400; t++) {
        var x = (4 + rand() * 18) * (rand() < 0.5 ? -1 : 1), z = -6 + rand() * 20;
        if (M.biomeAt(x) !== a.biome || M.groundHeight(x, z) < M.WATER_LEVEL + 0.45) continue;
        var ok = true, i;
        for (i = 0; i < spots.length && ok; i++) ok = Math.hypot(spots[i][0] - x, spots[i][1] - z) >= 4.5;
        for (i = 0; i < avoid.length && ok; i++) ok = Math.hypot(avoid[i][0] - x, avoid[i][1] - z) >= 2.4;
        if (ok) { best = [x, z]; break; }
        if (!best) best = [x, z];
      }
      best = best || [a.biome === 'bosque' ? -8 : 8, 4];
      spots.push(best);
      result[a.id] = { x: best[0], z: best[1], y: M.groundHeight(best[0], best[1]), rotY: (rand() - 0.5) * 1.2 };
    });
    return result;
  }

  SA.animalPlan = { PICK_SCALE: PICK_SCALE, plan: plan, placements: placements };
})(typeof window !== 'undefined' ? window : globalThis);
