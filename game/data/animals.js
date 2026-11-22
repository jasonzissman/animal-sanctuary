/* Animals: registers kind "animals" (SA.data) and exposes SA.animals (allowed trait values).
 * Pure data + validator; no THREE. Needs kinds "parts" and "biomes" registered first (cross-checked).
 *
 * Animal shape (JSON-serialisable):
 *   id, name { es: 'conejo', en: 'rabbit', gender: 'm'|'f' }   (article is derived from gender)
 *   biome     id of a registered biome
 *   traits    { size, color, movement, diet, legs }   values from SA.animals.SIZES / COLORS / ...
 *             color is the masculine/base Spanish colour word; the clue engine inflects it for gender.
 *   parts     [{ part: <registered part key>, color: '#rrggbb', scale: n | [x,y,z], count: int, offset: [x,y,z] }]
 *   easterEgg boolean (false for real animals)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;
  var SIZES = ['pequeño', 'mediano', 'grande'];
  var COLORS = ['blanco', 'gris', 'marrón', 'negro', 'verde', 'amarillo', 'naranja', 'rojo', 'azul'];
  var MOVEMENTS = ['salta', 'nada', 'vuela', 'trepa', 'camina lento', 'corre'];
  var DIETS = ['herbívoro', 'carnívoro', 'omnívoro', 'insectívoro'];
  var HEX = /^#[0-9a-fA-F]{6}$/;

  function oneOf(value, list, field) {
    if (list.indexOf(value) < 0) fail(field, 'must be one of ' + list.join(', ') + ' (got ' + JSON.stringify(value) + ')');
  }

  function isNum(n) { return typeof n === 'number' && isFinite(n); }

  function vec3(v, field, positive) {
    if (!Array.isArray(v) || v.length !== 3) fail(field, 'must be an array of 3 numbers');
    v.forEach(function (n) {
      if (!isNum(n) || (positive && n <= 0)) fail(field, 'must be ' + (positive ? 'positive ' : '') + 'numbers');
    });
  }

  function validatePart(entry, i, seen) {
    var f = 'parts[' + i + ']';
    if (!entry || typeof entry !== 'object') fail(f, 'must be an object');
    if (typeof entry.part !== 'string' || !SA.data.get('parts', entry.part)) {
      fail(f + '.part', 'unknown part key ' + JSON.stringify(entry.part) + ' (not registered in kind "parts")');
    }
    if (seen[entry.part]) fail(f + '.part', 'duplicate part ' + JSON.stringify(entry.part));
    seen[entry.part] = true;
    if (!HEX.test(entry.color)) fail(f + '.color', 'must be a "#rrggbb" colour (got ' + JSON.stringify(entry.color) + ')');
    if (Array.isArray(entry.scale)) vec3(entry.scale, f + '.scale', true);
    else if (!isNum(entry.scale) || entry.scale <= 0) fail(f + '.scale', 'must be a positive number or [x,y,z]');
    if (!Number.isInteger(entry.count) || entry.count < 1 || entry.count > 8) fail(f + '.count', 'must be an integer from 1 to 8');
    vec3(entry.offset, f + '.offset', false);
  }

  function validateAnimal(a) {
    if (!/^[a-z]+$/.test(a.id)) fail('id', 'must be lowercase ASCII letters');
    if (!a.name || typeof a.name !== 'object') fail('name', 'must be an object { es, en, gender }');
    if (typeof a.name.es !== 'string' || !a.name.es.trim()) fail('name.es', 'must be a non-empty string');
    if (typeof a.name.en !== 'string' || !a.name.en.trim()) fail('name.en', 'must be a non-empty string');
    oneOf(a.name.gender, ['m', 'f'], 'name.gender');
    if (typeof a.biome !== 'string' || !SA.data.get('biomes', a.biome)) {
      fail('biome', 'unknown biome ' + JSON.stringify(a.biome) + ' (not registered in kind "biomes")');
    }
    var t = a.traits;
    if (!t || typeof t !== 'object') fail('traits', 'must be an object');
    oneOf(t.size, SIZES, 'traits.size');
    oneOf(t.color, COLORS, 'traits.color');
    oneOf(t.movement, MOVEMENTS, 'traits.movement');
    oneOf(t.diet, DIETS, 'traits.diet');
    if (!Number.isInteger(t.legs) || t.legs < 0 || t.legs > 8) fail('traits.legs', 'must be an integer from 0 to 8');
    if (!Array.isArray(a.parts) || !a.parts.length) fail('parts', 'must be a non-empty array');
    var seen = {};
    a.parts.forEach(function (p, i) { validatePart(p, i, seen); });
    if (typeof a.easterEgg !== 'boolean') fail('easterEgg', 'must be true or false');
  }

  SA.animals = { SIZES: SIZES, COLORS: COLORS, MOVEMENTS: MOVEMENTS, DIETS: DIETS };
  SA.data.defineKind('animals', validateAnimal);

  function p(part, color, scale, count, offset) {
    return { part: part, color: color, scale: scale, count: count, offset: offset };
  }

  SA.data.register('animals', [
    { id: 'conejo', name: { es: 'conejo', en: 'rabbit', gender: 'm' }, biome: 'bosque',
      traits: { size: 'pequeño', color: 'gris', movement: 'salta', diet: 'herbívoro', legs: 4 },
      parts: [
        p('cuerpo', '#a9a9b0', 1, 1, [0, 0.5, 0]), p('cabeza', '#a9a9b0', 0.7, 1, [0, 1.0, 0.5]),
        p('orejas', '#c9c9d0', [0.25, 1.4, 0.25], 2, [0.14, 1.75, 0.45]), p('cola', '#ffffff', 0.3, 1, [0, 0.5, -0.55]),
        p('patas', '#8e8e96', 0.35, 4, [0.28, 0.18, 0]), p('ojos', '#222222', 0.16, 2, [0.17, 1.08, 0.77]),
        p('hocico', '#f4b6c2', 0.14, 1, [0, 0.96, 0.84])
      ], easterEgg: false },
    { id: 'pato', name: { es: 'pato', en: 'duck', gender: 'm' }, biome: 'bosque',
      traits: { size: 'mediano', color: 'amarillo', movement: 'nada', diet: 'omnívoro', legs: 2 },
      parts: [
        p('cuerpo', '#f2d33c', 1, 1, [0, 0.5, 0]), p('cabeza', '#f2d33c', 0.55, 1, [0, 1.1, 0.5]),
        p('pico', '#f08a24', [0.3, 0.2, 0.4], 1, [0, 1.05, 0.9]), p('alas', '#e0bd22', [0.1, 0.5, 0.7], 2, [0.6, 0.6, 0]),
        p('patas', '#f08a24', [0.12, 0.3, 0.12], 2, [0.2, 0.15, 0.05]), p('cola', '#e0bd22', 0.25, 1, [0, 0.6, -0.6]),
        p('ojos', '#222222', 0.13, 2, [0.14, 1.17, 0.71])
      ], easterEgg: false },
    { id: 'tortuga', name: { es: 'tortuga', en: 'turtle', gender: 'f' }, biome: 'bosque',
      traits: { size: 'mediano', color: 'verde', movement: 'camina lento', diet: 'herbívoro', legs: 4 },
      parts: [
        p('cuerpo', '#7ab86b', [1.1, 0.4, 1.3], 1, [0, 0.4, 0]), p('caparazon', '#3f7d3a', 1.2, 1, [0, 0.7, 0]),
        p('cabeza', '#7ab86b', 0.4, 1, [0, 0.6, 0.9]), p('patas', '#7ab86b', 0.25, 4, [0.45, 0.15, 0]),
        p('cola', '#7ab86b', [0.1, 0.1, 0.3], 1, [0, 0.4, -0.8]), p('ojos', '#222222', 0.1, 2, [0.11, 0.68, 1.0])
      ], easterEgg: false },
    { id: 'mono', name: { es: 'mono', en: 'monkey', gender: 'm' }, biome: 'selva',
      traits: { size: 'mediano', color: 'marrón', movement: 'trepa', diet: 'omnívoro', legs: 4 },
      parts: [
        p('cuerpo', '#8a5a34', 1, 1, [0, 0.8, 0]), p('cabeza', '#8a5a34', 0.65, 1, [0, 1.6, 0.3]),
        p('orejas', '#e8b894', 0.2, 2, [0.36, 1.7, 0.3]), p('hocico', '#e8b894', 0.25, 1, [0, 1.52, 0.6]),
        p('cola', '#6d4423', [0.12, 0.12, 1.8], 1, [0, 0.8, -0.9]), p('patas', '#6d4423', [0.2, 0.7, 0.2], 4, [0.3, 0.35, 0]),
        p('ojos', '#222222', 0.14, 2, [0.15, 1.68, 0.56])
      ], easterEgg: false },
    { id: 'tucan', name: { es: 'tucán', en: 'toucan', gender: 'm' }, biome: 'selva',
      traits: { size: 'mediano', color: 'negro', movement: 'vuela', diet: 'herbívoro', legs: 2 },
      parts: [
        p('cuerpo', '#1e1e24', 0.9, 1, [0, 0.8, 0]), p('cabeza', '#1e1e24', 0.5, 1, [0, 1.5, 0.3]),
        p('pico', '#f5a623', [0.35, 0.3, 1.1], 1, [0, 1.45, 0.9]), p('alas', '#2b2b34', [0.1, 0.7, 0.9], 2, [0.55, 0.9, 0]),
        p('cola', '#2b2b34', [0.3, 0.1, 0.8], 1, [0, 0.7, -0.8]), p('patas', '#4aa3c7', [0.1, 0.35, 0.1], 2, [0.15, 0.18, 0]),
        p('ojos', '#ffffff', 0.17, 2, [0.15, 1.58, 0.47])
      ], easterEgg: false },
    { id: 'rana', name: { es: 'rana', en: 'frog', gender: 'f' }, biome: 'selva',
      traits: { size: 'pequeño', color: 'verde', movement: 'salta', diet: 'insectívoro', legs: 4 },
      parts: [
        p('cuerpo', '#4cc04a', [0.9, 0.6, 1], 1, [0, 0.4, 0]), p('cabeza', '#4cc04a', 0.5, 1, [0, 0.7, 0.5]),
        p('ojos', '#f4f4a0', 0.22, 2, [0.18, 1.0, 0.55]), p('patas', '#2f9a35', [0.15, 0.5, 0.3], 4, [0.4, 0.22, 0])
      ], easterEgg: false }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
