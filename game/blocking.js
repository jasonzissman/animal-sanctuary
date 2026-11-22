/* SA.blocking: pure rules for what stops the walking player (no THREE, no DOM; node:vm tested). Soft things (flowers,
 * small animals) never block; trees, rocks, ponds, bridges and big animals do. Every rule reads data:
 *   decor   game/data/decor.js        { id, solid, radius? }
 *   props   game/data/props.js        { solid, radius }  (solid:false = walk through, still avoided by wanderers)
 *   animals SA.animals.BLOCK_RADIUS   by trait size (pequeño 0 = never blocks)
 *
 *   SA.blocking.decorRadius(id)         -> blocking radius (0 = soft); unknown/missing id -> DEFAULT_RADIUS (safe: blocks)
 *   SA.blocking.animalRadius(animalId)  -> blocking radius from the animal's size trait (0 = walk through)
 *   SA.blocking.solidProps(records)     -> [[x, z, radius], ...] for the solid placed props only (needs SA.propAvoid)
 *   SA.blocking.obstacles({ decor, animals, props }) -> the [[x, z, r], ...] list SA.player.step takes
 *       decor   [{ x, z, decor? }]   animals [{ x, z, animalId?, perched? }]   props  placed-prop records
 *       (or propPoints: the cached result of solidProps, so a per-frame caller need not re-read the save)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var DEFAULT_RADIUS = 1;

  function decorRadius(id) {
    var d = typeof id === 'string' ? SA.data.get('decor', id) : null;
    if (!d) return DEFAULT_RADIUS;
    return d.solid ? d.radius : 0;
  }

  function animalRadius(animalId) {
    var a = typeof animalId === 'string' ? SA.data.get('animals', animalId) : null;
    var r = a && SA.animals.BLOCK_RADIUS[a.traits.size];
    return typeof r === 'number' ? r : SA.animals.BLOCK_RADIUS.grande;
  }

  function solidProps(records) {
    var out = [];
    (records || []).forEach(function (r) {
      var def = r && typeof r.prop === 'string' ? SA.data.get('props', r.prop) : null;
      if (!def || def.solid === false) return;
      SA.propAvoid.points([r]).forEach(function (p) { out.push(p); });
    });
    return out;
  }

  function obstacles(src) {
    var list = [];
    (src.decor || []).forEach(function (d) {
      var r = decorRadius(d.decor);
      if (r > 0) list.push([d.x, d.z, r]);
    });
    (src.propPoints || solidProps(src.props)).forEach(function (p) { list.push(p); });
    (src.animals || []).forEach(function (a) {
      if (a.perched) return;
      var r = animalRadius(a.animalId);
      if (r > 0) list.push([a.x, a.z, r]);
    });
    return list;
  }

  SA.blocking = { DEFAULT_RADIUS: DEFAULT_RADIUS, decorRadius: decorRadius, animalRadius: animalRadius, solidProps: solidProps, obstacles: obstacles };
})(typeof window !== 'undefined' ? window : globalThis);
