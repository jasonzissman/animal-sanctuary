/* SA.habitat: pure habitat-sandbox logic (no THREE, no DOM; unit-tested in node:vm).
 * Needs SA.map, SA.data (kind "props"), SA.save.
 *
 *   SA.habitat.snap(v)                       grid-snaps a world coordinate (GRID units)
 *   SA.habitat.check(propId, x, z)           -> { ok, reason?, x, z } for the snapped spot. reason is one of
 *                                            unknown | bounds | terrain | biome | occupied | full | stars
 *   SA.habitat.place(propId, x, z)           validates, spends the stars and saves a record in save.placedProps:
 *                                            { status: 'placed', prop: { id, prop, x, z }, stars } | { status: 'rejected', reason }
 *   SA.habitat.remove(placedId)              refunds the stars: { status: 'removed', refund, stars, prop } | { status: 'missing' }
 *   SA.habitat.list()                        valid placed records from the save (corrupt entries are skipped)
 *   SA.habitat.rayToGround(origin, dir)      -> { x, z } where a camera ray meets the terrain, or null
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var GRID = 2;          // world units between grid cells
  var MAX_PROPS = 60;    // keeps the scene light on classroom hardware

  function snap(v) { return Math.round(v / GRID) * GRID + 0; }   // "+ 0" turns -0 into 0

  function isRecord(r) {
    return !!r && typeof r.id === 'string' && typeof r.prop === 'string' && typeof r.x === 'number' && typeof r.z === 'number' &&
      isFinite(r.x) && isFinite(r.z) && !!SA.data.get('props', r.prop);
  }

  function list() { return (SA.save.get().placedProps || []).filter(isRecord); }

  function onLand(x, z) { return SA.map.groundHeight(x, z) >= SA.map.WATER_LEVEL + 0.3; }

  function check(propId, x, z) {
    var def = SA.data.get('props', propId);
    var sx = snap(x), sz = snap(z), B = SA.map.BOUNDS;
    var out = function (reason) { return { ok: !reason, reason: reason, x: sx, z: sz }; };
    if (!def) return out('unknown');
    if (typeof x !== 'number' || typeof z !== 'number' || !isFinite(x) || !isFinite(z)) return out('bounds');
    if (sx < B.minX + GRID || sx > B.maxX - GRID || sz < B.minZ + GRID || sz > B.maxZ - GRID) return out('bounds');
    if (def.biomes.indexOf(SA.map.biomeAt(sx)) < 0) return out('biome');
    var ok = def.where === 'shore' ? (SA.map.isWater(sx, sz) || SA.map.nearWater(sx, sz, 2)) : onLand(sx, sz);
    if (!ok) return out('terrain');
    var placed = list();
    if (placed.some(function (r) { return r.x === sx && r.z === sz; })) return out('occupied');
    if (placed.length >= MAX_PROPS) return out('full');
    if (SA.save.get().stars < def.cost) return out('stars');
    return out(null);
  }

  function nextId(placed) {
    var n = 0;
    placed.forEach(function (r) {
      var m = /^p(\d+)$/.exec(r.id);
      if (m) n = Math.max(n, parseInt(m[1], 10));
    });
    return 'p' + (n + 1);
  }

  function place(propId, x, z) {
    var c = check(propId, x, z);
    if (!c.ok) return { status: 'rejected', reason: c.reason };
    var def = SA.data.get('props', propId);
    var placed = list();
    var rec = { id: nextId(placed), prop: propId, x: c.x, z: c.z };
    var stars = SA.save.get().stars - def.cost;
    SA.save.update({ stars: stars, placedProps: placed.concat([rec]) });
    return { status: 'placed', prop: rec, stars: stars };
  }

  function remove(placedId) {
    var placed = list();
    var rec = placed.filter(function (r) { return r.id === placedId; })[0];
    if (!rec) return { status: 'missing' };
    var refund = SA.data.get('props', rec.prop).cost;
    var stars = SA.save.get().stars + refund;
    SA.save.update({ stars: stars, placedProps: placed.filter(function (r) { return r !== rec; }) });
    return { status: 'removed', refund: refund, stars: stars, prop: rec };
  }

  // The terrain is a gentle heightfield, so march the ray onto the y=0 plane then refine against groundHeight.
  function rayToGround(origin, dir) {
    if (!origin || !dir || dir.y >= -1e-6) return null;
    var t = -origin.y / dir.y, x = 0, z = 0;
    for (var i = 0; i < 4; i++) {
      x = origin.x + dir.x * t; z = origin.z + dir.z * t;
      t = (SA.map.groundHeight(x, z) - origin.y) / dir.y;
    }
    x = origin.x + dir.x * t; z = origin.z + dir.z * t;
    return isFinite(x) && isFinite(z) ? { x: x, z: z } : null;
  }

  SA.habitat = { GRID: GRID, MAX_PROPS: MAX_PROPS, snap: snap, check: check, place: place, remove: remove, list: list, rayToGround: rayToGround };
})(typeof window !== 'undefined' ? window : globalThis);
