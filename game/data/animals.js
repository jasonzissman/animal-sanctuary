/* Animals: registers kind "animals" (SA.data) and exposes SA.animals (allowed trait values).
 * Pure data + validator; no THREE. Needs kinds "parts" and "biomes" registered first (cross-checked).
 *
 * Animal shape (JSON-serialisable):
 *   id, name { es: 'conejo', en: 'rabbit', gender: 'm'|'f' }   (article is derived from gender)
 *   icon      required short emoji string shown in the prompt bar and celebrations (e.g. '🐰')
 *   biome     id of a registered biome
 *   traits    { size, color, movement, alsoMoves?, diet, legs }   values from SA.animals.SIZES / COLORS / ...
 *             alsoMoves: extra movements that also count for "the one that swims" clues (turtle: ['nada'])
 *             color is the masculine/base Spanish colour word; the clue engine inflects it for gender.
 *   parts     [{ part: <registered part key>, color: '#rrggbb', scale: n | [x,y,z], count: int, offset: [x,y,z] }]
 *             count > 1 spreads instances symmetrically: offset.x is the HALF-WIDTH of the spread (not a position),
 *             e.g. count 2 -> x = -offset.x and +offset.x; count 4 -> a 2x2 grid; offset y/z are shared.
 *   perch     optional; "tree" = lives in tree canopies (SA.perch: sits on branches and hops between trees, out of
 *             reach from the ground). Omit for ground animals.
 *   story     optional boolean: true = a story animal (la cerda, el cerdito). It is NOT in the normal world population, clue
 *             rounds, random mission picks or the album; a mission places it (render code builds it on demand).
 *   herd      optional integer 1-5 (default 1): how many of this species live in the world, each with its own home spot
 *             (SA.animalPlan.herdPlacements). Regular species declare 3-5; story animals and easter eggs stay at 1.
 *   voice     optional vocab key of the sound it makes ('phrase:oinc'); a vocab entry may set `pitch` (1 = normal, higher = squeakier)
 *   baby      optional { of: <animal id>, scale, headScale, eyeScale }: marks a baby variant of another animal. Its parts list is
 *             built with SA.animals.babyParts (overall `scale`, the head group `headScale` x bigger, the eyes `eyeScale` x);
 *             the engine just reads parts, so nothing special-cases an id.
 *   easterEgg boolean (false for real animals)
 *   unlock    easter eggs only: the condition that reveals it (plain data, evaluated by game/unlocks.js)
 * A parts[] entry may also set `pupil` ('#rrggbb'): a dark pupil sphere drawn in front of each instance, so eyes read as
 * eyes (it must contrast with the part colour). It is a child of the part mesh, so it is never separately pickable.
 * A parts[] entry may also set `builder` (a SA.parts.BUILDERS name) to draw its part with another primitive.
 * A parts[] entry may also set `rot` [rx,ry,rz] radians (explicit tilt; replaces the automatic turn, and `scale` is then the
 * mesh's own x/y/z size) and `row` (z half-spacing of the two rows of a count-4 part, so legs sit at the body's corners).
 * `also: [{ scale, count, offset, rot?, row?, builder?, color? }]` adds extra meshes tagged with the SAME part key (a neck
 * segment of the head, a knee bump on the legs); taps on them answer as that part. builder/color default to the entry's.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;
  var SIZES = ['pequeño', 'mediano', 'grande'];
  var COLORS = ['blanco', 'gris', 'marrón', 'negro', 'verde', 'amarillo', 'naranja', 'rojo', 'azul', 'rosa'];
  var MOVEMENTS = ['salta', 'nada', 'vuela', 'trepa', 'camina lento', 'corre', 'repta'];
  var DIETS = ['herbívoro', 'carnívoro', 'omnívoro', 'insectívoro'];
  var PERCHES = ['tree'];
  var HEX = /^#[0-9a-fA-F]{6}$/;
  var MIN_PUPIL_CONTRAST = 0.4;   // minimum luminance difference (0..1) between a pupil and its part colour

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

  function luma(hex) {
    var n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
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
    validatePiece(entry, f);
    if (entry.also !== undefined) {
      if (!Array.isArray(entry.also)) fail(f + '.also', 'must be an array of extra pieces');
      entry.also.forEach(function (x, j) {
        var xf = f + '.also[' + j + ']';
        if (!x || typeof x !== 'object') fail(xf, 'must be an object');
        if (x.color !== undefined && !HEX.test(x.color)) fail(xf + '.color', 'must be a "#rrggbb" colour (got ' + JSON.stringify(x.color) + ')');
        validatePiece(x, xf);
      });
    }
  }

  /** Shape shared by a part entry and its `also` extras: scale, builder, count, offset, and the optional rot / row. */
  function validatePiece(entry, f) {
    if (Array.isArray(entry.scale)) vec3(entry.scale, f + '.scale', true);
    else if (!isNum(entry.scale) || entry.scale <= 0) fail(f + '.scale', 'must be a positive number or [x,y,z]');
    if (entry.pupil !== undefined) {
      if (!HEX.test(entry.pupil)) fail(f + '.pupil', 'must be a "#rrggbb" colour (got ' + JSON.stringify(entry.pupil) + ')');
      if (Math.abs(luma(entry.pupil) - luma(entry.color)) < MIN_PUPIL_CONTRAST) {
        fail(f + '.pupil', 'does not contrast with the part colour ' + entry.color + ' (the pupil would be invisible)');
      }
    }
    if (entry.builder !== undefined && SA.parts.BUILDERS.indexOf(entry.builder) < 0) {
      fail(f + '.builder', 'must be one of ' + SA.parts.BUILDERS.join(', '));
    }
    if (!Number.isInteger(entry.count) || entry.count < 1 || entry.count > 8) fail(f + '.count', 'must be an integer from 1 to 8');
    vec3(entry.offset, f + '.offset', false);
    if (entry.rot !== undefined) vec3(entry.rot, f + '.rot', false);
    if (entry.row !== undefined && (!isNum(entry.row) || entry.row <= 0)) fail(f + '.row', 'must be a positive number');
  }

  function validateAnimal(a) {
    if (!/^[a-z]+$/.test(a.id)) fail('id', 'must be lowercase ASCII letters');
    if (!a.name || typeof a.name !== 'object') fail('name', 'must be an object { es, en, gender }');
    if (typeof a.name.es !== 'string' || !a.name.es.trim()) fail('name.es', 'must be a non-empty string');
    if (typeof a.name.en !== 'string' || !a.name.en.trim()) fail('name.en', 'must be a non-empty string');
    oneOf(a.name.gender, ['m', 'f'], 'name.gender');
    if (typeof a.icon !== 'string' || !a.icon.trim() || a.icon.length > 8) {
      fail('icon', 'must be a short non-empty emoji string (got ' + JSON.stringify(a.icon) + ')');
    }
    if (typeof a.biome !== 'string' || !SA.data.get('biomes', a.biome)) {
      fail('biome', 'unknown biome ' + JSON.stringify(a.biome) + ' (not registered in kind "biomes")');
    }
    var t = a.traits;
    if (!t || typeof t !== 'object') fail('traits', 'must be an object');
    oneOf(t.size, SIZES, 'traits.size');
    oneOf(t.color, COLORS, 'traits.color');
    oneOf(t.movement, MOVEMENTS, 'traits.movement');
    if (t.alsoMoves !== undefined) {      // other ways it moves too: a turtle walks slowly AND swims (clues accept any)
      if (!Array.isArray(t.alsoMoves)) fail('traits.alsoMoves', 'must be an array of movements');
      t.alsoMoves.forEach(function (m, i) { oneOf(m, MOVEMENTS, 'traits.alsoMoves[' + i + ']'); });
    }
    oneOf(t.diet, DIETS, 'traits.diet');
    if (!Number.isInteger(t.legs) || t.legs < 0 || t.legs > 8) fail('traits.legs', 'must be an integer from 0 to 8');
    if (!Array.isArray(a.parts) || !a.parts.length) fail('parts', 'must be a non-empty array');
    var seen = {};
    a.parts.forEach(function (p, i) { validatePart(p, i, seen); });
    if (a.perch !== undefined) oneOf(a.perch, PERCHES, 'perch');
    if (typeof a.easterEgg !== 'boolean') fail('easterEgg', 'must be true or false');
    if (a.story !== undefined && typeof a.story !== 'boolean') fail('story', 'must be true or false');
    if (a.herd !== undefined && (!Number.isInteger(a.herd) || a.herd < 1 || a.herd > 5)) fail('herd', 'must be an integer from 1 to 5 (got ' + JSON.stringify(a.herd) + ')');
    if (a.voice !== undefined && (typeof a.voice !== 'string' || !/^[a-z]+:\S+$/.test(a.voice))) fail('voice', 'must be a vocab key like "phrase:oinc"');
    if (a.baby !== undefined) {
      var b = a.baby;
      if (!b || typeof b !== 'object' || typeof b.of !== 'string' || !/^[a-z]+$/.test(b.of)) fail('baby.of', 'must be the id of the adult animal');
      ['scale', 'headScale', 'eyeScale'].forEach(function (k) {
        if (!isNum(b[k]) || b[k] <= 0) fail('baby.' + k, 'must be a positive number');
      });
      if (b.scale >= 1) fail('baby.scale', 'must be below 1 (a baby is smaller than its adult)');
    }
    // Easter eggs stay hidden until their data-defined condition is met. game/unlocks.js validates it in depth.
    if (a.easterEgg && (!a.unlock || typeof a.unlock !== 'object' || typeof a.unlock.type !== 'string')) {
      fail('unlock', 'an easterEgg needs an unlock condition { type, ... }');
    }
    if (!a.easterEgg && a.unlock !== undefined) fail('unlock', 'only easter eggs have an unlock condition');
  }

  // How far a ground animal of each size keeps the walking player out (world units; SA.blocking). Small ones (conejo,
  // rana, ratón) are 0: the player walks through them. Medium and big ones push the player aside.
  var BLOCK_RADIUS = { 'pequeño': 0, 'mediano': 1, 'grande': 1.3 };

  SA.animals = { SIZES: SIZES, COLORS: COLORS, MOVEMENTS: MOVEMENTS, DIETS: DIETS, PERCHES: PERCHES, BLOCK_RADIUS: BLOCK_RADIUS };
  SA.data.defineKind('animals', validateAnimal);

  function p(part, color, scale, count, offset) {
    return { part: part, color: color, scale: scale, count: count, offset: offset };
  }

  /** Eyes: a pale eye with a dark pupil (data only; the generic assembler draws the pupil). */
  function eyes(scale, offset, color) {
    var e = p('ojos', color || '#f4f4f4', scale, 2, offset);
    e.pupil = '#111111';
    return e;
  }

  /** The camel's head with its S-curved neck: small elongated head tilted slightly down, then three cylinder segments (leaning
   *  50, 15 and 55 degrees forward) joined by balls. Neck pieces are `also` extras, so tapping the neck answers as la cabeza. */
  function cabezaCuello() {
    var C = '#d2a86a', D = Math.PI / 180;
    function seg(w, len, deg, y, z) { return { scale: [w, len, w], count: 1, offset: [0, y, z], rot: [deg * D, 0, 0], builder: 'cylinder' }; }
    function ball(d, y, z) { return { scale: d, count: 1, offset: [0, y, z], builder: 'sphere' }; }
    return { part: 'cabeza', color: C, scale: [0.4, 0.38, 0.66], count: 1, offset: [0, 3.7, 2.2], rot: [0.25, 0, 0],
      also: [seg(0.38, 0.8, 50, 2.357, 1.106), ball(0.4, 2.614, 1.413), seg(0.3, 0.8, 15, 3.0, 1.517),
        ball(0.32, 3.387, 1.62), seg(0.26, 0.5, 55, 3.53, 1.825)] };
  }

  /** Scale every piece of a parts[] list (and its `also` extras) by one factor k: sizes, offsets and the leg `row` spacing, so
   *  proportions, pick volumes (derived from the sizes), reach and framing all stay in step. Returns a new list. */
  function shrink(parts, k) {
    function s3(v) { return Array.isArray(v) ? v.map(function (n) { return n * k; }) : v * k; }
    function one(e) {
      var o = {};
      Object.keys(e).forEach(function (key) { o[key] = e[key]; });
      o.scale = s3(e.scale);
      o.offset = e.offset.map(function (n) { return n * k; });
      if (e.row !== undefined) o.row = e.row * k;
      if (e.also) o.also = e.also.map(one);
      return o;
    }
    return parts.map(one);
  }

  var HEAD_GROUP = ['cabeza', 'ojos', 'hocico', 'orejas'];

  /** A baby's parts from its adult's: the head group (head, eyes, snout, ears) grows `headScale` x around the head's centre,
   *  the eyes by `eyeScale` instead, then everything shrinks by `scale` (see shrink). Result: a relatively bigger head and
   *  eyes on a small body. A pure data transform that works for any animal with a 'cabeza'. */
  function babyParts(parts, o) {
    var head = parts.filter(function (e) { return e.part === 'cabeza'; })[0];
    var c = head ? head.offset : [0, 0, 0];
    function grow(e, k) {
      var out = {};
      Object.keys(e).forEach(function (key) { out[key] = e[key]; });
      out.scale = Array.isArray(e.scale) ? e.scale.map(function (n) { return n * k; }) : e.scale * k;
      out.offset = e.offset.map(function (n, i) { return c[i] + (n - c[i]) * o.headScale; });
      return out;
    }
    return shrink(parts.map(function (e) {
      return HEAD_GROUP.indexOf(e.part) < 0 ? e : grow(e, e.part === 'ojos' ? o.eyeScale : o.headScale);
    }), o.scale);
  }
  SA.animals.babyParts = babyParts;

  var CAMEL_SCALE = 0.75;   // AS-0215: the camel was giraffe-tall; this is its overall size factor (the design below is at 1.0)

  var PINK = '#f4a6b8', DEEP_PINK = '#e98aa0', HALF_PI = Math.PI / 2;

  /** The pig at adult size: pink barrel body, round head with a flat disc snout, floppy ears, four short legs and a curly
   *  tail (a tilted stalk plus two curl balls, all tagged 'cola'). The piglet (el cerdito) is babyParts of this list. */
  function pigParts() {
    return [
      p('cuerpo', PINK, [0.95, 0.8, 1.3], 1, [0, 0.7, 0]), p('cabeza', PINK, 0.6, 1, [0, 0.95, 0.7]),
      { part: 'hocico', color: DEEP_PINK, builder: 'cylinder', scale: [0.34, 0.16, 0.34], count: 1, offset: [0, 0.9, 1.02], rot: [HALF_PI, 0, 0] },
      p('orejas', DEEP_PINK, [0.22, 0.3, 0.22], 2, [0.2, 1.3, 0.62]), eyes(0.1, [0.17, 1.06, 0.9]),
      { part: 'patas', color: DEEP_PINK, builder: 'cylinder', scale: [0.16, 0.55, 0.16], count: 4, offset: [0.25, 0.275, 0], row: 0.35 },
      { part: 'cola', color: DEEP_PINK, builder: 'cylinder', scale: [0.07, 0.3, 0.07], count: 1, offset: [0, 0.95, -0.72], rot: [-0.9, 0, 0],
        also: [{ scale: 0.13, count: 1, offset: [0, 1.12, -0.88], builder: 'sphere' }, { scale: 0.11, count: 1, offset: [0, 1.0, -0.98], builder: 'sphere' }] }
    ];
  }

  var PIGLET = { of: 'cerda', scale: 0.55, headScale: 1.45, eyeScale: 1.7 };   // AS-0232: ~55% size, bigger head, much bigger eyes

  SA.data.register('animals', [
    { id: 'conejo', name: { es: 'conejo', en: 'rabbit', gender: 'm' }, icon: '🐰', biome: 'bosque', herd: 5,
      traits: { size: 'pequeño', color: 'gris', movement: 'salta', diet: 'herbívoro', legs: 4 },
      parts: [
        p('cuerpo', '#a9a9b0', 1, 1, [0, 0.5, 0]), p('cabeza', '#a9a9b0', 0.7, 1, [0, 1.0, 0.5]),
        p('orejas', '#c9c9d0', [0.25, 1.4, 0.25], 2, [0.14, 1.75, 0.45]), p('cola', '#ffffff', 0.3, 1, [0, 0.5, -0.55]),
        p('patas', '#8e8e96', 0.35, 4, [0.28, 0.18, 0]), eyes(0.16, [0.17, 1.08, 0.77]),
        p('hocico', '#f4b6c2', 0.14, 1, [0, 0.96, 0.84]),
        p('pelo', '#d4d4da', [0.5, 0.16, 0.6], 1, [0, 0.94, -0.1]), p('barriga', '#e8e8ee', [0.5, 0.3, 0.5], 1, [0, 0.3, 0.3])
      ], easterEgg: false },
    { id: 'pato', name: { es: 'pato', en: 'duck', gender: 'm' }, icon: '🦆', biome: 'bosque', herd: 4,
      traits: { size: 'mediano', color: 'amarillo', movement: 'nada', diet: 'omnívoro', legs: 2 },
      parts: [
        p('cuerpo', '#f2d33c', 1, 1, [0, 0.75, 0]), p('cabeza', '#f2d33c', 0.55, 1, [0, 1.3, 0.4]),
        p('pico', '#f08a24', [0.3, 0.2, 0.4], 1, [0, 1.25, 0.8]), p('alas', '#e0bd22', [0.1, 0.5, 0.7], 2, [0.5, 0.75, 0]),
        p('patas', '#f08a24', [0.12, 0.4, 0.12], 2, [0.2, 0.2, 0.05]), p('cola', '#e0bd22', 0.25, 1, [0, 0.85, -0.55]),
        eyes(0.13, [0.14, 1.37, 0.61])
      ], easterEgg: false },
    { id: 'tortuga', name: { es: 'tortuga', en: 'turtle', gender: 'f' }, icon: '🐢', biome: 'bosque', herd: 3,
      traits: { size: 'mediano', color: 'verde', movement: 'camina lento', alsoMoves: ['nada'], diet: 'herbívoro', legs: 4 },
      parts: [
        p('cuerpo', '#7ab86b', [1.1, 0.4, 1.3], 1, [0, 0.4, 0]), p('caparazon', '#3f7d3a', 1.2, 1, [0, 0.7, 0]),
        p('cabeza', '#7ab86b', 0.4, 1, [0, 0.6, 0.75]), p('patas', '#7ab86b', 0.3, 4, [0.35, 0.17, 0]),
        p('cola', '#7ab86b', [0.1, 0.1, 0.3], 1, [0, 0.4, -0.8]), eyes(0.1, [0.11, 0.68, 0.88])
      ], easterEgg: false },
    { id: 'mono', name: { es: 'mono', en: 'monkey', gender: 'm' }, icon: '🐵', biome: 'selva', herd: 4, perch: 'tree',
      traits: { size: 'mediano', color: 'marrón', movement: 'trepa', diet: 'omnívoro', legs: 4 },
      parts: [
        p('cuerpo', '#8a5a34', 1, 1, [0, 0.8, 0]), p('cabeza', '#8a5a34', 0.65, 1, [0, 1.45, 0.3]),
        { part: 'orejas', builder: 'sphere', color: '#e8b894', scale: [0.14, 0.28, 0.28], count: 2, offset: [0.3, 1.5, 0.3] }, p('hocico', '#e8b894', 0.25, 1, [0, 1.42, 0.6]),
        p('cola', '#6d4423', [0.12, 0.12, 1.8], 1, [0, 0.8, -0.9]), p('patas', '#6d4423', [0.2, 0.7, 0.2], 4, [0.3, 0.35, 0]),
        eyes(0.14, [0.15, 1.53, 0.56]),
        p('pelo', '#a06a40', [0.6, 0.16, 0.7], 1, [0, 1.28, -0.05]), p('barriga', '#e8b894', [0.6, 0.35, 0.5], 1, [0, 0.45, 0.4])
      ], easterEgg: false },
    { id: 'tucan', name: { es: 'tucán', en: 'toucan', gender: 'm' }, icon: '🦜', biome: 'selva', herd: 3, perch: 'tree',
      traits: { size: 'mediano', color: 'negro', movement: 'vuela', diet: 'herbívoro', legs: 2 },
      parts: [
        p('cuerpo', '#1e1e24', 0.9, 1, [0, 0.8, 0]), p('cabeza', '#1e1e24', 0.5, 1, [0, 1.4, 0.3]),
        p('pico', '#f5a623', [0.35, 0.3, 1.1], 1, [0, 1.35, 0.9]), p('alas', '#2b2b34', [0.1, 0.7, 0.75], 2, [0.55, 0.9, 0]),
        p('cola', '#2b2b34', [0.3, 0.1, 0.75], 1, [0, 0.7, -0.8]), p('patas', '#4aa3c7', [0.1, 0.5, 0.1], 2, [0.15, 0.25, 0]),
        eyes(0.17, [0.15, 1.48, 0.47])
      ], easterEgg: false },
    { id: 'rana', name: { es: 'rana', en: 'frog', gender: 'f' }, icon: '🐸', biome: 'selva', herd: 5,
      traits: { size: 'pequeño', color: 'verde', movement: 'salta', diet: 'insectívoro', legs: 4 },
      parts: [
        p('cuerpo', '#4cc04a', [0.9, 0.6, 1], 1, [0, 0.4, 0]), p('cabeza', '#4cc04a', 0.5, 1, [0, 0.7, 0.5]),
        eyes(0.22, [0.18, 1.0, 0.55], '#f4f4a0'), p('patas', '#2f9a35', [0.15, 0.5, 0.3], 4, [0.3, 0.25, 0])
      ], easterEgg: false },
    { id: 'camello', name: { es: 'camello', en: 'camel', gender: 'm' }, icon: '🐫', biome: 'desierto', herd: 3,
      traits: { size: 'grande', color: 'marrón', movement: 'corre', diet: 'herbívoro', legs: 4 },
      parts: shrink([
        // Long horizontal oval body on tall thin legs; one hump sitting ON the back; an S-curved neck (3 segments + joint
        // balls, all part "cabeza") rises forward from the chest to a small, long-snouted head held high.
        p('cuerpo', '#d2a86a', [1.1, 1.0, 2.1], 1, [0, 1.95, 0]), p('joroba', '#c0925a', [0.8, 0.75, 0.9], 1, [0, 2.55, -0.1]),
        cabezaCuello(),
        p('hocico', '#b8895a', [0.28, 0.26, 0.4], 1, [0, 3.55, 2.5]),
        p('orejas', '#b8895a', [0.13, 0.13, 0.13], 2, [0.15, 3.9, 2.0]),
        { part: 'cola', color: '#b89058', scale: [0.09, 0.9, 0.09], count: 1, offset: [0, 1.77, -1.11], rot: [0.3, 0, 0],
          also: [{ scale: [0.2, 0.28, 0.2], count: 1, offset: [0, 1.34, -1.25], color: '#7a5530', builder: 'sphere' }] },
        { part: 'patas', color: '#b8864a', scale: [0.17, 1.85, 0.17], count: 4, offset: [0.32, 0.925, 0], row: 0.7, builder: 'cylinder',
          also: [
            { scale: [0.24, 0.24, 0.3], count: 4, offset: [0.32, 0.8, 0.06], row: 0.7, color: '#a8794a', builder: 'sphere' },   // knees
            { scale: [0.3, 0.1, 0.44], count: 4, offset: [0.32, 0.05, 0.07], row: 0.7, color: '#8f6a3c', builder: 'box' }       // wide flat feet
          ] },
        eyes(0.1, [0.17, 3.76, 2.28]),
        p('pelo', '#d6ab6a', [0.4, 0.14, 0.5], 1, [0, 2.9, -0.1]),
        p('barriga', '#d2a86a', [0.7, 0.3, 1.0], 1, [0, 1.65, 0.1])   // same colour as the body and tucked inside it: not a visible pale blob
      ], CAMEL_SCALE), easterEgg: false },
    { id: 'serpiente', name: { es: 'serpiente', en: 'snake', gender: 'f' }, icon: '🐍', biome: 'desierto', herd: 3,
      traits: { size: 'mediano', color: 'naranja', movement: 'repta', diet: 'carnívoro', legs: 0 },
      parts: [
        p('cuerpo', '#e08a3c', [0.45, 0.45, 2.4], 1, [0, 0.3, 0]), p('cabeza', '#e08a3c', 0.55, 1, [0, 0.4, 1.4]),
        eyes(0.1, [0.15, 0.52, 1.58]), p('cola', '#c06a24', [0.2, 0.2, 0.7], 1, [0, 0.2, -1.5])
      ], easterEgg: false },
    { id: 'cabra', name: { es: 'cabra', en: 'goat', gender: 'f' }, icon: '🐐', biome: 'montana', herd: 4,
      traits: { size: 'mediano', color: 'blanco', movement: 'trepa', diet: 'herbívoro', legs: 4 },
      parts: [
        p('cuerpo', '#f2efe6', [0.9, 0.8, 1.3], 1, [0, 0.9, 0]), p('cabeza', '#f2efe6', 0.55, 1, [0, 1.25, 0.62]),
        p('cuernos', '#8a7a62', [0.1, 0.4, 0.1], 2, [0.16, 1.65, 0.58]), p('orejas', '#d8d2c4', [0.3, 0.14, 0.1], 2, [0.3, 1.3, 0.62]),
        p('hocico', '#d8d2c4', 0.2, 1, [0, 1.21, 0.88]), p('cola', '#d8d2c4', [0.15, 0.15, 0.45], 1, [0, 1.15, -0.65]),
        p('patas', '#c8c2b4', [0.14, 0.75, 0.14], 4, [0.28, 0.375, 0]), eyes(0.09, [0.16, 1.31, 0.82]),
        p('pelo', '#ffffff', [0.55, 0.2, 0.8], 1, [0, 1.3, -0.1]), p('barriga', '#e6e0d0', [0.55, 0.3, 0.6], 1, [0, 0.55, 0.3])
      ], easterEgg: false },
    { id: 'aguila', name: { es: 'águila', en: 'eagle', gender: 'f' }, icon: '🦅', biome: 'montana', herd: 3,
      traits: { size: 'grande', color: 'marrón', movement: 'vuela', diet: 'carnívoro', legs: 2 },
      parts: [
        p('cuerpo', '#6b4a2b', 0.95, 1, [0, 0.9, 0]), p('cabeza', '#f4f1ea', 0.5, 1, [0, 1.42, 0.32]),
        p('pico', '#f2b01e', [0.22, 0.2, 0.5], 1, [0, 1.37, 0.75]), p('alas', '#4e331b', [0.1, 0.9, 1.7], 2, [0.45, 1.0, 0]),
        p('cola', '#f4f1ea', [0.4, 0.1, 0.7], 1, [0, 0.8, -0.75]), p('patas', '#f2b01e', [0.1, 0.55, 0.1], 2, [0.2, 0.275, 0]),
        eyes(0.1, [0.14, 1.5, 0.49])
      ], easterEgg: false },
    // Story animals (AS-0232): mission 1 places them; they are not in the normal world population (story: true).
    { id: 'cerda', name: { es: 'cerda', en: 'sow', gender: 'f' }, icon: '🐖', biome: 'bosque', story: true, voice: 'phrase:oinc',
      traits: { size: 'mediano', color: 'rosa', movement: 'camina lento', diet: 'omnívoro', legs: 4 },
      parts: pigParts(), easterEgg: false },
    { id: 'cerdito', name: { es: 'cerdito', en: 'piglet', gender: 'm' }, icon: '🐷', biome: 'bosque', story: true, voice: 'phrase:oincbebe',
      baby: PIGLET, traits: { size: 'pequeño', color: 'rosa', movement: 'corre', diet: 'omnívoro', legs: 4 },
      parts: babyParts(pigParts(), PIGLET), easterEgg: false },
    // Easter egg #1 (original design): a blocky yellow mouse. Hidden until the player has 10 stars AND has tapped the
    // same tree of the forest 5 times. The condition is plain data (see game/unlocks.js).
    { id: 'raton', name: { es: 'ratón chispa', en: 'spark mouse', gender: 'm' }, icon: '🐭', biome: 'bosque',
      traits: { size: 'pequeño', color: 'amarillo', movement: 'corre', diet: 'omnívoro', legs: 4 },
      parts: [
        { part: 'cuerpo', builder: 'box', color: '#f6d63a', scale: [0.7, 0.6, 0.8], count: 1, offset: [0, 0.55, 0] },
        { part: 'cabeza', builder: 'box', color: '#f6d63a', scale: 0.55, count: 1, offset: [0, 1.05, 0.4] },
        { part: 'orejas', builder: 'box', color: '#f6d63a', scale: [0.16, 0.8, 0.12], count: 2, offset: [0.2, 1.62, 0.35] },
        { part: 'mejillas', color: '#ff7f98', scale: 0.15, count: 2, offset: [0.22, 0.98, 0.66] },
        eyes(0.1, [0.12, 1.15, 0.67]), p('hocico', '#5a3a2a', 0.09, 1, [0, 1.05, 0.7]),
        p('patas', '#e0b81c', [0.15, 0.35, 0.15], 4, [0.22, 0.175, 0]),
        { part: 'cola', builder: 'zigzag', color: '#e0b81c', scale: [0.5, 1.2, 0.12], count: 1, offset: [0, 0.95, -0.4] }
      ], easterEgg: true,
      unlock: { type: 'all', of: [
        { type: 'stars', min: 10 },
        { type: 'sameTap', target: 'tree', biome: 'bosque', count: 5 }
      ] } }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
