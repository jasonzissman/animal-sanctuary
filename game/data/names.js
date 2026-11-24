/* Pet names (AS-0169): registers kinds "names" and "nameAdjectives" (SA.data). Pure data; no THREE, no DOM. Needs game/data-registry.js.
 *
 * names           { id: 'luna', es: 'Luna', g: 'f' | 'm' | 'x' }   a spoken first name; g is only a hint for which names are offered first
 *                 to a female / male animal ('x' fits both). The name itself never changes with the animal.
 * nameAdjectives  { id: 'rapido', icon: '💨', m: 'rápido', f: 'rápida', traits?: { movement?: [..], size?: [..] } }
 *                 m / f are the masculine / feminine forms (invariant adjectives such as valiente and grande use the same word in both).
 *                 traits (optional) lists the animal traits (SA.animals values) this adjective fits; those adjectives are offered first.
 * SA.names (game/names.js) composes 'Luna la rápida' / 'Coco el rápido' from them.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;
  var WORD = /^[a-z][a-z0-9]*$/;

  SA.data.defineKind('names', function (n) {
    if (!WORD.test(n.id)) fail('id', 'must be a lowercase word');
    if (typeof n.es !== 'string' || !n.es) fail('es', 'must be a non-empty string');
    if (['f', 'm', 'x'].indexOf(n.g) < 0) fail('g', 'must be "f", "m" or "x"');
  });

  SA.data.defineKind('nameAdjectives', function (a) {
    if (!WORD.test(a.id)) fail('id', 'must be a lowercase word');
    if (typeof a.icon !== 'string' || !a.icon) fail('icon', 'must be an emoji string');
    if (typeof a.m !== 'string' || !a.m || typeof a.f !== 'string' || !a.f) fail('m/f', 'need a masculine and a feminine form');
    if (a.traits !== undefined) {
      if (!a.traits || typeof a.traits !== 'object' || Array.isArray(a.traits)) fail('traits', 'must be an object of trait -> [values]');
      Object.keys(a.traits).forEach(function (k) {
        if (!Array.isArray(a.traits[k]) || !a.traits[k].length) fail('traits.' + k, 'must be a non-empty array');
      });
    }
  });

  function name(id, es, g) { return { id: id, es: es, g: g }; }
  SA.data.register('names', [
    name('luna', 'Luna', 'f'), name('sol', 'Sol', 'x'), name('coco', 'Coco', 'x'), name('nube', 'Nube', 'f'),
    name('canela', 'Canela', 'f'), name('chispa', 'Chispa', 'f'), name('pipo', 'Pipo', 'm'), name('lola', 'Lola', 'f'),
    name('tito', 'Tito', 'm'), name('mango', 'Mango', 'm'), name('estrella', 'Estrella', 'f'), name('bombon', 'Bombón', 'x'),
    name('rayo', 'Rayo', 'm'), name('pelusa', 'Pelusa', 'f'), name('toby', 'Toby', 'm'), name('mimi', 'Mimi', 'f')
  ]);

  // Invariant adjectives (valiente, grande) keep one form for both genders.
  SA.data.register('nameAdjectives', [
    { id: 'rapido', icon: '💨', m: 'rápido', f: 'rápida', traits: { movement: ['corre', 'salta', 'vuela'] } },
    { id: 'lento', icon: '🐌', m: 'lento', f: 'lenta', traits: { movement: ['camina lento', 'repta'] } },
    { id: 'pequeno', icon: '🐭', m: 'pequeño', f: 'pequeña', traits: { size: ['pequeño'] } },
    { id: 'grande', icon: '🐘', m: 'grande', f: 'grande', traits: { size: ['grande'] } },
    { id: 'valiente', icon: '🦁', m: 'valiente', f: 'valiente' },
    { id: 'dormilon', icon: '😴', m: 'dormilón', f: 'dormilona' },
    { id: 'curioso', icon: '🔍', m: 'curioso', f: 'curiosa' },
    { id: 'jugueton', icon: '🎈', m: 'juguetón', f: 'juguetona' }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
