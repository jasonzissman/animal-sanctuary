/* Props: registers kind "props" (SA.data) plus a vocab entry "prop:<id>" for each. Pure data; no THREE, no DOM.
 * Load after game/data/vocab.js and game/data/biomes.js.
 *
 * Prop shape (JSON-serialisable):
 *   id        lowercase ASCII key
 *   icon      emoji shown on the tray button
 *   name      { es: 'el árbol' (article + accents), en: 'tree' }
 *   cost      stars needed to place it (refunded in full when removed)
 *   builder   key of the procedural low-poly builder in game/render/props.js (data, not code)
 *   biomes    biome ids (see game/data/biomes.js) where it may be placed
 *   where     'land' (dry ground only) or 'shore' (on or beside water, e.g. a bridge)
 *   radius    keep-clear distance (world units) from the prop centre that wandering animals respect (SA.propAvoid)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;

  var WHERE = ['land', 'shore'];

  function validateProp(p) {
    if (!/^[a-z]+$/.test(p.id)) fail('id', 'must be lowercase ASCII letters');
    if (typeof p.icon !== 'string' || !p.icon) fail('icon', 'must be an emoji string');
    if (!p.name || typeof p.name.es !== 'string' || !/^(el|la|los|las) \S/.test(p.name.es)) fail('name.es', 'must start with an article (el/la/los/las)');
    if (typeof p.name.en !== 'string' || !p.name.en.trim()) fail('name.en', 'must be a non-empty string');
    if (typeof p.cost !== 'number' || p.cost < 1 || p.cost !== Math.floor(p.cost)) fail('cost', 'must be a whole number of stars >= 1');
    if (typeof p.builder !== 'string' || !p.builder) fail('builder', 'must be a builder key string');
    if (!Array.isArray(p.biomes) || !p.biomes.length) fail('biomes', 'must be a non-empty array of biome ids');
    p.biomes.forEach(function (b, i) {
      if (!SA.data.get('biomes', b)) fail('biomes[' + i + ']', 'unknown biome ' + JSON.stringify(b));
    });
    if (typeof p.radius !== 'number' || !isFinite(p.radius) || p.radius <= 0 || p.radius > 6) fail('radius', 'must be a number in (0, 6]');
    if (WHERE.indexOf(p.where) < 0) fail('where', 'must be one of ' + WHERE.join(', '));
  }

  function prop(id, icon, es, en, cost, builder, biomes, where, radius) {
    return { id: id, icon: icon, name: { es: es, en: en }, cost: cost, builder: builder, biomes: biomes, where: where, radius: radius };
  }

  var both = ['bosque', 'selva'];
  var props = [
    prop('flores', '🌼', 'las flores', 'flowers', 1, 'flowers', both, 'land', 1.2),
    prop('roca', '🪨', 'la roca', 'rock', 1, 'rock', ['bosque', 'selva', 'desierto', 'montana'], 'land', 1.5),
    prop('arbol', '🌳', 'el árbol', 'tree', 2, 'tree', both, 'land', 1.5),
    prop('charca', '💧', 'la charca', 'pond', 3, 'pond', both, 'land', 2.4),
    prop('puente', '🌉', 'el puente', 'bridge', 3, 'bridge', ['bosque'], 'shore', 2.2)
  ];

  SA.data.defineKind('props', validateProp);
  SA.data.register('props', props);
  SA.data.register('vocab', props.map(function (p) {
    return { id: 'prop:' + p.id, key: 'prop:' + p.id, es: p.name.es, clip: null };
  }));
})(typeof window !== 'undefined' ? window : globalThis);
