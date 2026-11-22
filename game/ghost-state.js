/* SA.ghostState: pure "what does the placement ghost say?" decision (no THREE, no DOM; node:vm tested).
 *   SA.ghostState.of(pv)   pv is SA.habitat.preview(...): { x, z, valid, reason? } (or null)
 *   -> 'valid'         the spot works and the prop is affordable (green ghost)
 *      'unaffordable'  the spot is fine but the child lacks stars (red ghost plus a small star cue)
 *      'blocked'       "not here": bounds, terrain, biome, occupied, full (red ghost, no star)
 *   A null/odd pv counts as 'blocked'. Placement and purchasing rules stay in SA.habitat.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function of(pv) {
    if (pv && pv.valid) return 'valid';
    if (pv && pv.reason === 'stars') return 'unaffordable';
    return 'blocked';
  }

  SA.ghostState = { of: of };
})(typeof window !== 'undefined' ? window : globalThis);
