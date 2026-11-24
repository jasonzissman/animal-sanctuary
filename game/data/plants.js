/* Plants: registers kind "plant" (SA.data), the soft ground plants that game/ground-cover-plan.js scatters and game/render/ground-cover.js
 * draws as InstancedMeshes (AS-0295). Pure data + validator; no THREE, no DOM. Engine code never special-cases a biome id: which plants
 * grow where, how many, how big and what colour is all here. Plants are always SOFT (the player walks through them); anything that
 * blocks the player (trees, rocks, the big saguaro) is decor, see game/data/decor.js.
 *
 * Plant shape (JSON-serialisable):
 *   id       lowercase ASCII key
 *   biome    a biome id (game/data/biomes.js / SA.map.STRIPS)
 *   family   what it is: 'bush' | 'fern' | 'bigleaf' | 'vine' | 'shrub' | 'cactus' | 'flower' | 'pine' (tests and tickets read this)
 *   shape    the geometry builder in game/render/plant-shapes.js (SA.render.plantShapes.SHAPES)
 *   count    how many to scatter over the biome strip (10..3000); thinned with distance from the player like the grass
 *   scale    [lo, hi] size multiplier range, 0.2 <= lo <= hi <= 3 (each plant gets its own seeded size)
 *   tints    [dark, mid, light] hex colours; each plant picks a seeded tone across them
 *   sway     wind bend in metres at the top of a unit-height shape, 0..0.4 (0 = stiff, like cacti)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;
  var FAMILIES = ['bush', 'fern', 'bigleaf', 'vine', 'shrub', 'cactus', 'flower', 'pine'];

  function validatePlant(p) {
    if (!/^[a-z]+$/.test(p.id)) fail('id', 'must be lowercase ASCII letters');
    if (typeof p.biome !== 'string' || !/^[a-z]+$/.test(p.biome)) fail('biome', 'must be a lowercase biome id');
    if (FAMILIES.indexOf(p.family) < 0) fail('family', 'must be one of ' + FAMILIES.join(', '));
    if (typeof p.shape !== 'string' || !/^[a-z]+$/.test(p.shape)) fail('shape', 'must be a lowercase builder name');
    if (typeof p.count !== 'number' || p.count % 1 !== 0 || p.count < 10 || p.count > 3000) fail('count', 'must be a whole number in [10, 3000]');
    var s = p.scale;
    if (!Array.isArray(s) || s.length !== 2 || typeof s[0] !== 'number' || typeof s[1] !== 'number' || !(s[0] >= 0.2 && s[0] <= s[1] && s[1] <= 3)) {
      fail('scale', 'must be [lo, hi] with 0.2 <= lo <= hi <= 3');
    }
    if (!Array.isArray(p.tints) || p.tints.length !== 3 || !p.tints.every(function (h) { return /^#[0-9a-f]{6}$/.test(h); })) {
      fail('tints', 'must be three lowercase #rrggbb colours: dark, mid, light');
    }
    if (p.tints[0] === p.tints[2]) fail('tints', 'dark and light must differ so plants vary in colour');
    if (typeof p.sway !== 'number' || !(p.sway >= 0 && p.sway <= 0.4)) fail('sway', 'must be a number in [0, 0.4]');
    if (p.solid !== undefined || p.radius !== undefined) fail('solid', 'plants are always soft; a blocking plant is decor (game/data/decor.js)');
  }

  SA.data.defineKind('plant', validatePlant);
  SA.data.register('plant', [
    // bosque: bushes and ferns
    { id: 'arbusto', biome: 'bosque', family: 'bush', shape: 'bush', count: 260, scale: [0.7, 1.5], tints: ['#2f6a35', '#4a8f44', '#7cb35a'], sway: 0.04 },
    { id: 'helecho', biome: 'bosque', family: 'fern', shape: 'fern', count: 700, scale: [0.7, 1.3], tints: ['#2c6b3a', '#3f8d4a', '#76b660'], sway: 0.12 },
    // selva: big-leaf plants and vines
    { id: 'hojagrande', biome: 'selva', family: 'bigleaf', shape: 'bigleaf', count: 420, scale: [0.8, 1.6], tints: ['#1f6a3a', '#2e9a4a', '#6cc25a'], sway: 0.1 },
    { id: 'liana', biome: 'selva', family: 'vine', shape: 'vine', count: 360, scale: [0.8, 1.5], tints: ['#2a6b2a', '#4a9a3a', '#8ac04a'], sway: 0.1 },
    // desierto: dry shrubs and three cactus shapes
    { id: 'matorral', biome: 'desierto', family: 'shrub', shape: 'dryshrub', count: 320, scale: [0.7, 1.3], tints: ['#8a6a3a', '#b8935a', '#d9bd7e'], sway: 0.08 },
    { id: 'barril', biome: 'desierto', family: 'cactus', shape: 'barrel', count: 120, scale: [0.6, 1.3], tints: ['#3e7d44', '#59a050', '#8cc06a'], sway: 0 },
    { id: 'nopal', biome: 'desierto', family: 'cactus', shape: 'paddle', count: 110, scale: [0.7, 1.4], tints: ['#3a7a4a', '#55a060', '#86c07a'], sway: 0 },
    { id: 'columna', biome: 'desierto', family: 'cactus', shape: 'column', count: 90, scale: [0.6, 1.2], tints: ['#47864a', '#62a557', '#93c471'], sway: 0 },
    // montana: alpine flowers and low pines
    { id: 'floralpina', biome: 'montana', family: 'flower', shape: 'alpineflower', count: 520, scale: [0.7, 1.3], tints: ['#e8d8f4', '#f6e27a', '#ffffff'], sway: 0.1 },
    { id: 'pinobajo', biome: 'montana', family: 'pine', shape: 'lowpine', count: 220, scale: [0.7, 1.4], tints: ['#1f5a44', '#2f7a58', '#5a9a74'], sway: 0.03 },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
