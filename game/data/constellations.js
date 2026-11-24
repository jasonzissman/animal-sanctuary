/* Constellation data (AS-0372, slice 2 of AS-0191: Mission 12, Noche de estrellas): registers kind "constellations" (SA.data). Pure data; no THREE, no DOM.
 * Three ORIGINAL star pictures shaped like sanctuary animals, found through the roof telescope (game/mission-sky.js; the maths is game/constellations.js,
 * the drawing is game/render/sky-view.js). Engine code never special-cases an id: a new constellation is a new row.
 *
 * Row (JSON-serialisable):
 *   id      lowercase id ('tortuga')
 *   say     vocab key spoken when it is found ('animal:tortuga' -> "la tortuga": the vocab entry carries the right article)
 *   icon    emoji shown in the progress row and as the little glow badge
 *   center  { yaw, pitch } where it hangs in the dome (radians; yaw in [-PI, PI], pitch 0.15..1.35: above the horizon)
 *   stars   >= 3 of { x, y }: offsets from the centre in radians (x right, y up; |x|, |y| <= 0.6), the picture's points
 *   lines   >= 2 of [i, j]: index pairs into `stars` joined by a line when found (no repeats; every star is on a line)
 *   reach   optional number 0.1..1: how near (radians) the view's centre must come to `center` to find it (default 0.4: generous)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;

  function validate(r) {
    if (!/^[a-z][a-z0-9-]*$/.test(r.id)) fail('id', 'must be a lowercase id string');
    if (typeof r.say !== 'string' || !/^[a-z]+:[a-z0-9]+$/.test(r.say)) fail('say', 'must be a vocab key like "animal:tortuga"');
    if (typeof r.icon !== 'string' || !r.icon) fail('icon', 'must be an emoji string');
    var c = r.center;
    if (!c || typeof c !== 'object' || typeof c.yaw !== 'number' || typeof c.pitch !== 'number' || !isFinite(c.yaw) || !isFinite(c.pitch)) fail('center', 'must be { yaw, pitch } numbers');
    if (Math.abs(c.yaw) > Math.PI) fail('center.yaw', 'must be between -PI and PI');
    if (c.pitch < 0.15 || c.pitch > 1.35) fail('center.pitch', 'must be between 0.15 and 1.35 (above the horizon, below straight up)');
    if (!Array.isArray(r.stars) || r.stars.length < 3) fail('stars', 'needs at least 3 stars { x, y }');
    r.stars.forEach(function (s, i) {
      if (!s || typeof s.x !== 'number' || typeof s.y !== 'number' || !isFinite(s.x) || !isFinite(s.y) || Math.abs(s.x) > 0.6 || Math.abs(s.y) > 0.6) fail('stars[' + i + ']', 'must be { x, y } numbers within 0.6 of the centre');
    });
    if (!Array.isArray(r.lines) || r.lines.length < 2) fail('lines', 'needs at least 2 line pairs [i, j]');
    var used = {}, seen = {};
    r.lines.forEach(function (l, i) {
      var ok = Array.isArray(l) && l.length === 2 && l.every(function (n) { return Number.isInteger(n) && n >= 0 && n < r.stars.length; });
      if (!ok) fail('lines[' + i + ']', 'must be [i, j]: two star indexes between 0 and ' + (r.stars.length - 1));
      if (l[0] === l[1]) fail('lines[' + i + ']', 'joins a star to itself');
      var k = Math.min(l[0], l[1]) + '-' + Math.max(l[0], l[1]);
      if (seen[k]) fail('lines[' + i + ']', 'repeats the line ' + k);
      seen[k] = true; used[l[0]] = used[l[1]] = true;
    });
    r.stars.forEach(function (s, i) { if (!used[i]) fail('stars[' + i + ']', 'is on no line'); });
    if (r.reach !== undefined && (typeof r.reach !== 'number' || !(r.reach >= 0.1 && r.reach <= 1))) fail('reach', 'must be a number between 0.1 and 1 (radians)');
  }

  SA.data.defineKind('constellations', validate);
  SA.data.register('constellations', [
    // La tortuga: a domed shell (six stars), the head to the right and the tail to the left.
    { id: 'tortuga', say: 'animal:tortuga', icon: '🐢', center: { yaw: -2.0, pitch: 0.55 },
      stars: [{ x: -0.2, y: 0.02 }, { x: -0.1, y: 0.13 }, { x: 0.08, y: 0.14 }, { x: 0.2, y: 0.03 }, { x: 0.15, y: -0.07 }, { x: -0.15, y: -0.07 }, { x: 0.35, y: 0.08 }, { x: -0.33, y: -0.03 }],
      lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [3, 6], [0, 7]] },
    // El conejo: two long ears, a triangle head, a round body and a little tail.
    { id: 'conejo', say: 'animal:conejo', icon: '🐰', center: { yaw: 2.3, pitch: 0.7 },
      stars: [{ x: -0.1, y: 0.36 }, { x: 0.1, y: 0.36 }, { x: -0.06, y: 0.16 }, { x: 0.06, y: 0.16 }, { x: 0, y: 0.04 }, { x: -0.08, y: -0.1 }, { x: 0.14, y: -0.1 }, { x: 0.28, y: -0.12 }],
      lines: [[0, 2], [1, 3], [2, 3], [2, 4], [3, 4], [4, 5], [4, 6], [5, 6], [6, 7]] },
    // El águila: wings wide open, a head up top and a tail below.
    { id: 'aguila', say: 'animal:aguila', icon: '🦅', center: { yaw: -0.6, pitch: 0.9 },
      stars: [{ x: -0.38, y: 0.1 }, { x: -0.2, y: 0.08 }, { x: 0, y: 0.14 }, { x: 0.2, y: 0.08 }, { x: 0.38, y: 0.1 }, { x: 0, y: 0 }, { x: 0, y: -0.2 }, { x: -0.16, y: -0.08 }, { x: 0.16, y: -0.08 }],
      lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [1, 7], [3, 8], [7, 5], [8, 5]] }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
