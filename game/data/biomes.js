/* Biomes: registers kind "biomes" (SA.data). Pure data + validator; no THREE.
 *
 * Biome shape (JSON-serialisable):
 *   id          lowercase ASCII key (bosque, selva) referenced by animals[].biome
 *   name        { es: 'La selva' (article + accents), en: 'Jungle' }
 *   ground      '#rrggbb' main ground colour    accent  '#rrggbb' secondary colour (foliage, water...)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;
  var HEX = /^#[0-9a-fA-F]{6}$/;

  function validateBiome(b) {
    if (!/^[a-z]+$/.test(b.id)) fail('id', 'must be lowercase ASCII letters');
    if (!b.name || typeof b.name !== 'object') fail('name', 'must be an object { es, en }');
    if (typeof b.name.es !== 'string' || !b.name.es.trim()) fail('name.es', 'must be a non-empty string');
    if (typeof b.name.en !== 'string' || !b.name.en.trim()) fail('name.en', 'must be a non-empty string');
    if (!HEX.test(b.ground)) fail('ground', 'must be a "#rrggbb" colour (got ' + JSON.stringify(b.ground) + ')');
    if (!HEX.test(b.accent)) fail('accent', 'must be a "#rrggbb" colour (got ' + JSON.stringify(b.accent) + ')');
  }

  SA.data.defineKind('biomes', validateBiome);

  SA.data.register('biomes', [
    { id: 'bosque', name: { es: 'El bosque y el río', en: 'Forest and river' }, ground: '#7cb86a', accent: '#4aa3c7' },
    { id: 'selva', name: { es: 'La selva', en: 'Jungle' }, ground: '#3f8f4f', accent: '#e8b84a' }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
