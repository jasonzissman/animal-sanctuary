/* Foods: registers kind "foods" (SA.data) plus a vocab entry "food:<id>" for each. Pure data; no THREE, no DOM.
 * Load after game/data/vocab.js and game/data/animals.js.
 *
 * Food shape (JSON-serialisable):
 *   id, icon    emoji shown on the tray button
 *   label       { es: 'fresa', plural: 'fresas', gender: 'f' }   singular/plural noun and its grammatical gender
 *   diets       animal diets (traits.diet) that eat it; a diet with no food (carnívoro, insectívoro) gets no feed task
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
    // Only la fresa is active (AS-0155): one simple food. The foods kind stays so more can be added later; carnivores and
    // insectivores have no food here, so they never get a feed task.
    food('fresa', '🍓', 'fresa', 'fresas', 'f', ['herbívoro', 'omnívoro'])
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
