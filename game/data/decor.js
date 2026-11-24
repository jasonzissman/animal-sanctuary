/* Decor: registers kind "decor" (SA.data), the scenery that game/render/decor.js scatters (not placed props, not pickups).
 * Pure data + validator; no THREE, no DOM. Whether something stops the walking player lives here, not in engine code.
 *
 * Decor shape (JSON-serialisable):
 *   id      lowercase ASCII key; the builder in game/render/decor.js tags its mesh with userData.decor = id
 *   solid   true = blocks the player (trees, rocks, cacti, peaks); false = soft, the player walks straight through
 *   radius  how far from the centre it keeps the player out (world units, > 0 and <= 6); required only when solid
 *   height  optional, solid only (AS-0176): top of the item at scale 1 (world units, 0 < h <= 3); the placed scale multiplies it.
 *           A low item (rocks) only blocks a player whose jump lift is below it; no height = always blocks (trees, cacti, peaks)
 *   prick   optional, solid only (AS-0156): true = touching it bounces the player back with an 'ouch' (SA.prick; the cactus)
 *   kind    optional, solid only (AS-0296): marks a climbable tree; the key into SA.perch.KINDS (canopy height) and game/render/trees.js
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
    if (d.height !== undefined && (!d.solid || typeof d.height !== 'number' || !isFinite(d.height) || d.height <= 0 || d.height > 3)) {
      fail('height', 'only a solid item may have a height, a number in (0, 3]');
    }
    if (d.prick !== undefined && (d.prick !== true || !d.solid)) fail('prick', 'only a solid item may be prickly (true)');
    if (d.kind !== undefined && (!d.solid || !/^[a-z]+$/.test(d.kind))) fail('kind', 'only a solid item may be a tree, kind = a lowercase SA.perch.KINDS key');
  }

  SA.data.defineKind('decor', validateDecor);
  SA.data.register('decor', [
    // Trees (AS-0296) carry `kind` = their SA.perch.KINDS entry (canopy height) and the builder in game/render/trees.js.
    { id: 'pino', solid: true, radius: 1, kind: 'pine' },
    { id: 'roble', solid: true, radius: 1, kind: 'oak' },
    { id: 'abedul', solid: true, radius: 0.8, kind: 'birch' },
    { id: 'jungle', solid: true, radius: 1, kind: 'jungle' },
    { id: 'palmera', solid: true, radius: 0.8, kind: 'palm' },
    { id: 'ceiba', solid: true, radius: 1.1, kind: 'kapok' },
    { id: 'acacia', solid: true, radius: 0.9, kind: 'acacia' },
    { id: 'yuca', solid: true, radius: 0.8, kind: 'yucca' },
    { id: 'pinonieve', solid: true, radius: 1, kind: 'snowpine' },
    { id: 'abeto', solid: true, radius: 0.9, kind: 'fir' },
    { id: 'roca', solid: true, radius: 1, height: 0.8 },
    { id: 'flor', solid: false },
    { id: 'cactus', solid: true, radius: 0.8, prick: true },
    { id: 'rocaarena', solid: true, radius: 1, height: 0.75 },
    { id: 'pico', solid: true, radius: 2.5 }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
