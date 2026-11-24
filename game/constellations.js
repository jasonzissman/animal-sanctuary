/* SA.constellations: the pure maths of the night-sky constellations (AS-0372; rows are game/data/constellations.js). No THREE, no DOM; unit-tested in node:vm.
 *
 *   SA.constellations.list(rows?)                      the registered rows (or the given ones)
 *   SA.constellations.point(c, i)                      -> { yaw, pitch } the i-th star's place in the dome (offsets are in radians on the sky's tangent plane)
 *   SA.constellations.points(c) / segments(c)          every star / every line as [{yaw,pitch},{yaw,pitch}]
 *   SA.constellations.angle(yaw1, pitch1, yaw2, pitch2) the angle in radians between two directions in the dome (yaw wraps)
 *   SA.constellations.reachOf(c)                       how near the view's centre must be (row.reach or DEFAULT_REACH: generous, ~23 degrees)
 *   SA.constellations.nearest(yaw, pitch, found?, rows?) -> the closest row within reach whose id is not in `found` (an array or { id: true }), or null
 * Aiming is forgiving: there are no fail states, aiming away simply finds nothing.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var DEFAULT_REACH = 0.4;

  function list(rows) { return rows || (SA.data ? SA.data.all('constellations') : []); }
  function point(c, i) {
    var s = c.stars[i], pitch = c.center.pitch + s.y, k = Math.max(0.2, Math.cos(pitch));
    var yaw = c.center.yaw + s.x / k;
    return { yaw: yaw > Math.PI ? yaw - 2 * Math.PI : (yaw < -Math.PI ? yaw + 2 * Math.PI : yaw), pitch: pitch };
  }
  function points(c) { return c.stars.map(function (s, i) { return point(c, i); }); }
  function segments(c) { var p = points(c); return c.lines.map(function (l) { return [p[l[0]], p[l[1]]]; }); }
  function angle(y1, p1, y2, p2) {
    var d = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(y1 - y2);
    return Math.acos(Math.max(-1, Math.min(1, d)));
  }
  function reachOf(c) { return typeof c.reach === 'number' ? c.reach : DEFAULT_REACH; }
  function has(found, id) { return Array.isArray(found) ? found.indexOf(id) >= 0 : !!(found && found[id]); }
  function nearest(yaw, pitch, found, rows) {
    var best = null, bd = Infinity;
    list(rows).forEach(function (c) {
      if (has(found, c.id)) return;
      var d = angle(yaw, pitch, c.center.yaw, c.center.pitch);
      if (d <= reachOf(c) && d < bd) { best = c; bd = d; }
    });
    return best;
  }

  SA.constellations = { list: list, point: point, points: points, segments: segments, angle: angle, reachOf: reachOf, nearest: nearest, DEFAULT_REACH: DEFAULT_REACH };
})(typeof window !== 'undefined' ? window : globalThis);
