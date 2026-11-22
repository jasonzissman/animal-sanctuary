/* SA.propAvoid: pure helper that turns placed-prop records into wander avoid points (no THREE, no DOM; node:vm tested).
 * Needs SA.data (kind "props", each with a `radius`).
 *
 *   SA.propAvoid.points(records) -> [[x, z, radius], ...]   one point per valid { prop, x, z } record, radius from prop
 *                                                           data; unknown props and non-finite positions are skipped
 * Feed the result (after the decor points) to SA.render.createAmbient(...).setAvoid.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function points(records) {
    var out = [];
    (records || []).forEach(function (r) {
      var def = r && typeof r.prop === 'string' ? SA.data.get('props', r.prop) : null;
      if (!def || typeof r.x !== 'number' || typeof r.z !== 'number' || !isFinite(r.x) || !isFinite(r.z)) return;
      out.push([r.x, r.z, def.radius]);
    });
    return out;
  }

  SA.propAvoid = { points: points };
})(typeof window !== 'undefined' ? window : globalThis);
