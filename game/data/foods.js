/* Foods: registers kind "foods" (SA.data) plus a vocab entry "food:<id>" for each. Pure data; no THREE, no DOM.
 * Load after game/data/vocab.js and game/data/animals.js.
 *
 * Food shape (JSON-serialisable):
 *   id, icon    emoji shown on the tray button
 *   label       { es: 'fresa', plural: 'fresas', gender: 'f' }   singular/plural noun and its grammatical gender
 *   diets       animal diets (traits.diet) that eat it; every diet needs at least one food
 * The spoken/shown vocab text is the singular with its article ("la fresa"); prompts use the plural ("tres fresas").
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;

  function validateFood(f) {
    if (typeof f.icon !== 'string' || !f.icon) fail('icon', 'must be an emoji string');
    var l = f.label;
    if (!l || typeof l.es !== 'string' || !l.es || typeof l.plural !== 'string' || !l.plural) fail('label', 'needs es and plural');
    if (l.gender !== 'm' && l.gender !== 'f') fail('label.gender', 'must be "m" or "f"');
    if (!Array.isArray(f.diets) || !f.diets.length) fail('diets', 'must be a non-empty array');
    f.diets.forEach(function (d, i) {
      if (SA.animals.DIETS.indexOf(d) < 0) fail('diets[' + i + ']', 'unknown diet ' + JSON.stringify(d));
    });
  }

  function food(id, icon, es, plural, gender, diets) {
    return { id: id, icon: icon, label: { es: es, plural: plural, gender: gender }, diets: diets };
  }

  var foods = [
    food('fresa', '🍓', 'fresa', 'fresas', 'f', ['herbívoro', 'omnívoro']),
    food('zanahoria', '🥕', 'zanahoria', 'zanahorias', 'f', ['herbívoro', 'omnívoro']),
    food('manzana', '🍎', 'manzana', 'manzanas', 'f', ['herbívoro', 'omnívoro']),
    food('platano', '🍌', 'plátano', 'plátanos', 'm', ['herbívoro', 'omnívoro']),
    food('lechuga', '🥬', 'lechuga', 'lechugas', 'f', ['herbívoro']),
    food('gusano', '🐛', 'gusano', 'gusanos', 'm', ['insectívoro', 'omnívoro']),
    food('grillo', '🦗', 'grillo', 'grillos', 'm', ['insectívoro']),
    food('pez', '🐟', 'pez', 'peces', 'm', ['carnívoro', 'omnívoro']),
    food('carne', '🍖', 'carne', 'carnes', 'f', ['carnívoro'])
  ];

  SA.data.defineKind('foods', validateFood);
  SA.data.register('foods', foods);
  SA.data.register('vocab', foods.map(function (f) {
    return { id: 'food:' + f.id, key: 'food:' + f.id, es: (f.label.gender === 'f' ? 'la ' : 'el ') + f.label.es, clip: null };
  }));
  // Bare nouns for counted asks ("dos fresas y una zanahoria"): 'foodpl:<id>' plural, 'foodsg:<id>' singular (count 1).
  SA.data.register('vocab', foods.map(function (f) {
    return { id: 'foodpl:' + f.id, key: 'foodpl:' + f.id, es: f.label.plural, clip: null };
  }));
  SA.data.register('vocab', foods.map(function (f) {
    return { id: 'foodsg:' + f.id, key: 'foodsg:' + f.id, es: f.label.es, clip: null };
  }));
})(typeof window !== 'undefined' ? window : globalThis);
