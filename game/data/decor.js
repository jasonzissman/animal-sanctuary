/* Decor: registers kind "decor" (SA.data), the scenery that game/render/decor.js scatters (not placed props, not pickups).
 * Pure data + validator; no THREE, no DOM. Whether something stops the walking player lives here, not in engine code.
 *
 * Decor shape (JSON-serialisable):
 *   id      lowercase ASCII key; the builder in game/render/decor.js tags its mesh with userData.decor = id
 *   solid   true = blocks the player (trees, rocks, cacti, peaks); false = soft, the player walks straight through
 *   radius  how far from the centre it keeps the player out (world units, > 0 and <= 6); required only when solid
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;

  function validateDecor(d) {
    if (!/^[a-z]+$/.test(d.id)) fail('id', 'must be lowercase ASCII letters');
    if (typeof d.solid !== 'boolean') fail('solid', 'must be true or false');
    if (d.solid && (typeof d.radius !== 'number' || !isFinite(d.radius) || d.radius <= 0 || d.radius > 6)) {
      fail('radius', 'a solid decor item needs a radius in (0, 6]');
    }
    if (!d.solid && d.radius !== undefined) fail('radius', 'a soft (non-solid) decor item has no radius');
  }

  SA.data.defineKind('decor', validateDecor);
  SA.data.register('decor', [
    { id: 'pino', solid: true, radius: 1 },
    { id: 'jungle', solid: true, radius: 1 },
    { id: 'roca', solid: true, radius: 1 },
    { id: 'flor', solid: false },
    { id: 'cactus', solid: true, radius: 0.8 },
    { id: 'pinonieve', solid: true, radius: 1 },
    { id: 'rocaarena', solid: true, radius: 1 },
    { id: 'pico', solid: true, radius: 2.5 }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
