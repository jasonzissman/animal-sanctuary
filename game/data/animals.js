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
 *   feet      optional 'paw' | 'hoof' | 'claw' | 'none' (AS-0406): the foot drawn at the end of each `patas` leg by SA.animalPlan
 *             (a rounded paw, a dark flat hoof, a toed claw foot). Omitted or 'none' = no foot (the camel has its own `also` feet).
 *   markings  optional { type: 'spots' | 'bands', color: '#rrggbb', count: 1..24 } (AS-0407): that many flat discs or thin bands on the body,
 *             drawn as one instanced mesh per animal (SA.animalMarkings plans them, SA.render.animalShade draws them). Decor only: never pickable.
 *   story     optional boolean: true = a story animal (la cerda, el cerdito). It is NOT in the normal world population, clue
 *             rounds, random mission picks or the album; a mission places it (render code builds it on demand).
 *   herd      optional integer 1-5 (default 1): how many of this species live in the world, each with its own home spot
 *             (SA.animalPlan.herdPlacements). Regular species declare 3-5; story animals and easter eggs stay at 1.
 *   voice     optional vocab key of the sound it makes ('phrase:oinc'); a vocab entry may set `pitch` (1 = normal, higher = squeakier)
 *   wag       optional { part: <one of its part keys>, angle: radians 0..1.2, hz: swings per second 0.5..8 }: the happy tail-wag.
 *             SA.wag (game/wag.js) turns it into a rotation, so any animal can wag; nothing special-cases an id (AS-0318).
 *   sounds    optional { sad?: <SA.audio sfx name> }: the sfx a mission plays for a mood (the puppy's whine); engine code
 *             reads SA.wag.sound(animal, 'sad') and never an id. test/puppy.test.js checks the names exist in SA.audio.
 *   baby      optional { of: <animal id>, scale, headScale, eyeScale }: marks a baby variant of another animal. Its parts list is
 *             built with SA.animals.babyParts (overall `scale`, the head group `headScale` x bigger, the eyes `eyeScale` x);
 *             the engine just reads parts, so nothing special-cases an id.
 *   active    optional 'day' (default) | 'night' (AS-0171): when it is awake. A day animal dozes at dusk and through the night, a night
 *             animal (búho, murciélago) sleeps by day (SA.sleep, game/sleep.js). Story animals and easter eggs never sleep.
 *   sleepPose optional 'curl' (default: lies down, squashed, eyes closed) | 'hang' (hangs upside down, like a bat)
 *   easterEgg boolean (false for real animals)
 *   unlock    easter eggs only: the condition that reveals it (plain data, evaluated by game/unlocks.js)
 * A parts[] entry may also set `pupil` ('#rrggbb'): a dark pupil sphere drawn in front of each instance, so eyes read as
 * eyes (it must contrast with the part colour). It is a child of the part mesh, so it is never separately pickable.
 * An `ojos` entry may also set `eyelid` ('#rrggbb'): the half-sphere eyelid colour (default: the head's colour, else the body's).
 * Eyes also get a white highlight; both are non-pick children of the eye (AS-0405).
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
  var FEET = ['paw', 'hoof', 'claw', 'none'];
  var MARKING_TYPES = ['spots', 'bands'];
  var MAX_MARKINGS = 24;
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

  function validateMarkings(m, seen) {
    if (!m || typeof m !== 'object') fail('markings', 'must be an object { type, color, count }');
    oneOf(m.type, MARKING_TYPES, 'markings.type');
    if (!HEX.test(m.color)) fail('markings.color', 'must be a "#rrggbb" colour (got ' + JSON.stringify(m.color) + ')');
    if (!Number.isInteger(m.count) || m.count < 1 || m.count > MAX_MARKINGS) fail('markings.count', 'must be an integer from 1 to ' + MAX_MARKINGS + ' (got ' + JSON.stringify(m.count) + ')');
    if (!seen.cuerpo) fail('markings', 'needs a cuerpo (body) part to sit on');
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
    if (entry.eyelid !== undefined && !HEX.test(entry.eyelid)) fail(f + '.eyelid', 'must be a "#rrggbb" colour (got ' + JSON.stringify(entry.eyelid) + ')');
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
    if (a.active !== undefined) oneOf(a.active, ['day', 'night'], 'active');
    if (a.feet !== undefined) oneOf(a.feet, FEET, 'feet');
    if (a.markings !== undefined) validateMarkings(a.markings, seen);
    if (a.sleepPose !== undefined) oneOf(a.sleepPose, ['curl', 'hang'], 'sleepPose');
    if (a.herd !== undefined && (!Number.isInteger(a.herd) || a.herd < 1 || a.herd > 5)) fail('herd', 'must be an integer from 1 to 5 (got ' + JSON.stringify(a.herd) + ')');
    if (a.voice !== undefined && (typeof a.voice !== 'string' || !/^[a-z]+:\S+$/.test(a.voice))) fail('voice', 'must be a vocab key like "phrase:oinc"');
    if (a.wag !== undefined) {
      var w = a.wag;
      if (!w || typeof w !== 'object') fail('wag', 'must be an object { part, angle, hz }');
      if (!seen[w.part]) fail('wag.part', 'must be one of this animal\'s part keys (got ' + JSON.stringify(w.part) + ')');
      if (!isNum(w.angle) || w.angle <= 0 || w.angle > 1.2) fail('wag.angle', 'must be a number of radians from 0 to 1.2');
      if (!isNum(w.hz) || w.hz < 0.5 || w.hz > 8) fail('wag.hz', 'must be a number from 0.5 to 8');
    }
    if (a.sounds !== undefined) {
      if (!a.sounds || typeof a.sounds !== 'object') fail('sounds', 'must be an object like { sad: "whine" }');
      Object.keys(a.sounds).forEach(function (mood) {
        if (mood !== 'sad') fail('sounds.' + mood, 'unknown mood (allowed: sad)');
        if (typeof a.sounds[mood] !== 'string' || !/^[A-Za-z0-9]+$/.test(a.sounds[mood])) fail('sounds.' + mood, 'must be an SA.audio sfx name');
      });
    }
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

  SA.animals = { SIZES: SIZES, COLORS: COLORS, MOVEMENTS: MOVEMENTS, DIETS: DIETS, PERCHES: PERCHES, FEET: FEET, MARKING_TYPES: MARKING_TYPES, MAX_MARKINGS: MAX_MARKINGS, BLOCK_RADIUS: BLOCK_RADIUS };
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

  /** The duck's parts (el pato). The duckling (el patito, mission 2) is babyParts of this list. */
  function duckParts() {
    return [
      p('cuerpo', '#f2d33c', 1, 1, [0, 0.75, 0]), p('cabeza', '#f2d33c', 0.55, 1, [0, 1.3, 0.4]),
      p('pico', '#f08a24', [0.3, 0.2, 0.4], 1, [0, 1.25, 0.8]), p('alas', '#e0bd22', [0.1, 0.5, 0.7], 2, [0.5, 0.75, 0]),
      p('patas', '#f08a24', [0.12, 0.4, 0.12], 2, [0.2, 0.2, 0.05]), p('cola', '#e0bd22', 0.25, 1, [0, 0.85, -0.55]),
      eyes(0.13, [0.14, 1.37, 0.61])
    ];
  }

  /** The puppy (el perrito, mission 3): a small brown dog with a round head, a short snout, floppy ears, four stubby legs and an
   *  upright tail that wags (animal.wag). Flat low-poly primitives only; every piece is a registered, raycastable part. */
  function puppyParts() {
    var BROWN = '#b5835a', DARK = '#7a5232', CREAM = '#f1dfc2';
    return [
      p('cuerpo', BROWN, [0.55, 0.5, 0.95], 1, [0, 0.55, 0]), p('cabeza', BROWN, 0.5, 1, [0, 0.85, 0.55]),
      { part: 'hocico', color: CREAM, scale: [0.22, 0.18, 0.24], count: 1, offset: [0, 0.78, 0.86], builder: 'box',
        also: [{ scale: 0.08, count: 1, offset: [0, 0.86, 0.98], builder: 'sphere', color: '#2a1a12' }] },
      { part: 'orejas', color: DARK, builder: 'box', scale: [0.1, 0.3, 0.2], count: 2, offset: [0.27, 0.9, 0.5], rot: [0, 0, 0.35] },
      eyes(0.1, [0.13, 0.92, 0.78]),
      { part: 'patas', color: DARK, builder: 'cylinder', scale: [0.14, 0.4, 0.14], count: 4, offset: [0.17, 0.2, 0], row: 0.32 },
      { part: 'cola', color: DARK, builder: 'cylinder', scale: [0.08, 0.4, 0.08], count: 1, offset: [0, 0.85, -0.55], rot: [-0.7, 0, 0] },
      p('barriga', CREAM, [0.4, 0.2, 0.6], 1, [0, 0.38, 0.05])
    ];
  }

  /** The field mouse (el ratón de campo, mission 8): a small grey-brown mouse with round pink ears, a pink nose and a long thin tail.
   *  The mouse babies (los ratoncitos) are babyParts of this list. Original design; flat primitives only, every piece a registered part. */
  function fieldMouseParts() {
    var FUR = '#b8a58c', PINK_EAR = '#e9b9b0';
    return [
      p('cuerpo', FUR, [0.6, 0.5, 0.85], 1, [0, 0.5, 0]), p('cabeza', '#c4b196', 0.5, 1, [0, 0.85, 0.5]),
      p('hocico', '#e58f9a', 0.1, 1, [0, 0.8, 0.78]), p('orejas', PINK_EAR, [0.3, 0.3, 0.08], 2, [0.2, 1.12, 0.42]),
      eyes(0.09, [0.12, 0.92, 0.72]),
      { part: 'patas', color: '#9c8a72', builder: 'cylinder', scale: [0.11, 0.42, 0.11], count: 4, offset: [0.2, 0.21, 0], row: 0.28 },
      { part: 'cola', color: PINK_EAR, builder: 'cylinder', scale: [0.05, 0.7, 0.05], count: 1, offset: [0, 0.58, -0.88], rot: [-1.2, 0, 0] }
    ];
  }

  /** The rabbit's parts (el conejo). The kits (los conejitos, mission 9) are babyParts of this list. */
  function rabbitParts() {
    return [
      p('cuerpo', '#a9a9b0', 1, 1, [0, 0.5, 0]), p('cabeza', '#a9a9b0', 0.7, 1, [0, 1.0, 0.5]),
      p('orejas', '#c9c9d0', [0.25, 1.4, 0.25], 2, [0.14, 1.75, 0.45]), p('cola', '#ffffff', 0.3, 1, [0, 0.5, -0.55]),
      p('patas', '#8e8e96', 0.35, 4, [0.28, 0.18, 0]), eyes(0.16, [0.17, 1.08, 0.77]),
      p('hocico', '#f4b6c2', 0.14, 1, [0, 0.96, 0.84]),
      p('pelo', '#d4d4da', [0.5, 0.16, 0.6], 1, [0, 0.94, -0.1]), p('barriga', '#e8e8ee', [0.5, 0.3, 0.5], 1, [0, 0.3, 0.3])
    ];
  }

  var RABBIT_BABY = { of: 'conejo', scale: 0.6, headScale: 1.4, eyeScale: 1.6 };   // AS-0350: a small, big-headed, big-eyed kit

  var MOUSE_BABY ={ of: 'ratoncampo', scale: 0.62, headScale: 1.4, eyeScale: 1.6 };   // AS-0346: a small, big-headed, big-eyed mouse baby

  var DUCKLING = { of: 'pato', scale: 0.5, headScale: 1.4, eyeScale: 1.6 };   // AS-0315: a small, big-headed, big-eyed hatchling

  var PIGLET = { of: 'cerda', scale: 0.55, headScale: 1.45, eyeScale: 1.7 };   // AS-0232: ~55% size, bigger head, much bigger eyes

  SA.data.register('animals', [
    { id: 'conejo', feet: 'paw', name: { es: 'conejo', en: 'rabbit', gender: 'm' }, icon: '🐰', biome: 'bosque', herd: 5,
      traits: { size: 'pequeño', color: 'gris', movement: 'salta', diet: 'herbívoro', legs: 4 },
      parts: rabbitParts(), easterEgg: false },
    { id: 'pato', feet: 'claw', name: { es: 'pato', en: 'duck', gender: 'm' }, icon: '🦆', biome: 'bosque', herd: 4,
      traits: { size: 'mediano', color: 'amarillo', movement: 'nada', diet: 'omnívoro', legs: 2 },
      parts: duckParts(), easterEgg: false },
    { id: 'tortuga', feet: 'claw', name: { es: 'tortuga', en: 'turtle', gender: 'f' }, icon: '🐢', biome: 'bosque', herd: 3,
      traits: { size: 'mediano', color: 'verde', movement: 'camina lento', alsoMoves: ['nada'], diet: 'herbívoro', legs: 4 },
      parts: [
        p('cuerpo', '#7ab86b', [1.1, 0.4, 1.3], 1, [0, 0.4, 0]), p('caparazon', '#3f7d3a', 1.2, 1, [0, 0.7, 0]),
        p('cabeza', '#7ab86b', 0.4, 1, [0, 0.6, 0.75]), p('patas', '#7ab86b', 0.3, 4, [0.35, 0.17, 0]),
        p('cola', '#7ab86b', [0.1, 0.1, 0.3], 1, [0, 0.4, -0.8]), eyes(0.1, [0.11, 0.68, 0.88])
      ], easterEgg: false },
    { id: 'mono', feet: 'paw', name: { es: 'mono', en: 'monkey', gender: 'm' }, icon: '🐵', biome: 'selva', herd: 4, perch: 'tree',
      traits: { size: 'mediano', color: 'marrón', movement: 'trepa', diet: 'omnívoro', legs: 4 },
      parts: [
        p('cuerpo', '#8a5a34', 1, 1, [0, 0.8, 0]), p('cabeza', '#8a5a34', 0.65, 1, [0, 1.45, 0.3]),
        { part: 'orejas', builder: 'sphere', color: '#e8b894', scale: [0.14, 0.28, 0.28], count: 2, offset: [0.3, 1.5, 0.3] }, p('hocico', '#e8b894', 0.25, 1, [0, 1.42, 0.6]),
        p('cola', '#6d4423', [0.12, 0.12, 1.8], 1, [0, 0.8, -0.9]), p('patas', '#6d4423', [0.2, 0.7, 0.2], 4, [0.3, 0.35, 0]),
        eyes(0.14, [0.15, 1.53, 0.56]),
        p('pelo', '#a06a40', [0.6, 0.16, 0.7], 1, [0, 1.28, -0.05]), p('barriga', '#e8b894', [0.6, 0.35, 0.5], 1, [0, 0.45, 0.4])
      ], easterEgg: false },
    { id: 'tucan', feet: 'claw', name: { es: 'tucán', en: 'toucan', gender: 'm' }, icon: '🦜', biome: 'selva', herd: 3, perch: 'tree',
      traits: { size: 'mediano', color: 'negro', movement: 'vuela', diet: 'herbívoro', legs: 2 },
      parts: [
        p('cuerpo', '#1e1e24', 0.9, 1, [0, 0.8, 0]), p('cabeza', '#1e1e24', 0.5, 1, [0, 1.4, 0.3]),
        p('pico', '#f5a623', [0.35, 0.3, 1.1], 1, [0, 1.35, 0.9]), p('alas', '#2b2b34', [0.1, 0.7, 0.75], 2, [0.55, 0.9, 0]),
        p('cola', '#2b2b34', [0.3, 0.1, 0.75], 1, [0, 0.7, -0.8]), p('patas', '#4aa3c7', [0.1, 0.5, 0.1], 2, [0.15, 0.25, 0]),
        eyes(0.17, [0.15, 1.48, 0.47])
      ], easterEgg: false },
    { id: 'rana', feet: 'paw', name: { es: 'rana', en: 'frog', gender: 'f' }, icon: '🐸', biome: 'selva', herd: 5,
      markings: { type: 'spots', color: '#237a2c', count: 7 },   // AS-0408: darker green spots; paw = broad flat webbed feet
      traits: { size: 'pequeño', color: 'verde', movement: 'salta', diet: 'insectívoro', legs: 4 },
      parts: [
        p('cuerpo', '#4cc04a', [0.9, 0.6, 1], 1, [0, 0.4, 0]), p('cabeza', '#4cc04a', 0.5, 1, [0, 0.7, 0.5]),
        eyes(0.22, [0.18, 1.0, 0.55], '#f4f4a0'), p('patas', '#2f9a35', [0.15, 0.5, 0.3], 4, [0.3, 0.25, 0])
      ], easterEgg: false },
    { id: 'camello', feet: 'none', name: { es: 'camello', en: 'camel', gender: 'm' }, icon: '🐫', biome: 'desierto', herd: 3,
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
    { id: 'serpiente', feet: 'none', name: { es: 'serpiente', en: 'snake', gender: 'f' }, icon: '🐍', biome: 'desierto', herd: 3,
      markings: { type: 'bands', color: '#7a3a14', count: 9 },   // AS-0407: dark bands along the body
      traits: { size: 'mediano', color: 'naranja', movement: 'repta', diet: 'carnívoro', legs: 0 },
      parts: [
        p('cuerpo', '#e08a3c', [0.45, 0.45, 2.4], 1, [0, 0.3, 0]), p('cabeza', '#e08a3c', 0.55, 1, [0, 0.4, 1.4]),
        eyes(0.1, [0.15, 0.52, 1.58]), p('cola', '#c06a24', [0.2, 0.2, 0.7], 1, [0, 0.2, -1.5])
      ], easterEgg: false },
    { id: 'cabra', feet: 'hoof', name: { es: 'cabra', en: 'goat', gender: 'f' }, icon: '🐐', biome: 'montana', herd: 4,
      traits: { size: 'mediano', color: 'blanco', movement: 'trepa', diet: 'herbívoro', legs: 4 },
      parts: [
        p('cuerpo', '#f2efe6', [0.9, 0.8, 1.3], 1, [0, 0.9, 0]), p('cabeza', '#f2efe6', 0.55, 1, [0, 1.25, 0.62]),
        p('cuernos', '#8a7a62', [0.1, 0.4, 0.1], 2, [0.16, 1.65, 0.58]), p('orejas', '#d8d2c4', [0.3, 0.14, 0.1], 2, [0.3, 1.3, 0.62]),
        p('hocico', '#d8d2c4', 0.2, 1, [0, 1.21, 0.88]), p('cola', '#d8d2c4', [0.15, 0.15, 0.45], 1, [0, 1.15, -0.65]),
        p('patas', '#c8c2b4', [0.14, 0.75, 0.14], 4, [0.28, 0.375, 0]), eyes(0.09, [0.16, 1.31, 0.82]),
        p('pelo', '#ffffff', [0.55, 0.2, 0.8], 1, [0, 1.3, -0.1]), p('barriga', '#e6e0d0', [0.55, 0.3, 0.6], 1, [0, 0.55, 0.3])
      ], easterEgg: false },
    { id: 'aguila', feet: 'claw', name: { es: 'águila', en: 'eagle', gender: 'f' }, icon: '🦅', biome: 'montana', herd: 3,
      traits: { size: 'grande', color: 'marrón', movement: 'vuela', diet: 'carnívoro', legs: 2 },
      parts: [
        p('cuerpo', '#6b4a2b', 0.95, 1, [0, 0.9, 0]), p('cabeza', '#f4f1ea', 0.5, 1, [0, 1.42, 0.32]),
        p('pico', '#f2b01e', [0.22, 0.2, 0.5], 1, [0, 1.37, 0.75]), p('alas', '#4e331b', [0.1, 0.9, 1.7], 2, [0.45, 1.0, 0]),
        p('cola', '#f4f1ea', [0.4, 0.1, 0.7], 1, [0, 0.8, -0.75]), p('patas', '#f2b01e', [0.1, 0.55, 0.1], 2, [0.2, 0.275, 0]),
        eyes(0.1, [0.14, 1.5, 0.49])
      ], easterEgg: false },
    // Story animals (AS-0232): mission 1 places them; they are not in the normal world population (story: true).
    { id: 'cerda', feet: 'hoof', name: { es: 'cerda', en: 'sow', gender: 'f' }, icon: '🐖', biome: 'bosque', story: true, voice: 'phrase:oinc',
      traits: { size: 'mediano', color: 'rosa', movement: 'camina lento', diet: 'omnívoro', legs: 4 },
      parts: pigParts(), easterEgg: false },
    { id: 'cerdito', feet: 'hoof', name: { es: 'cerdito', en: 'piglet', gender: 'm' }, icon: '🐷', biome: 'bosque', story: true, voice: 'phrase:oincbebe',
      baby: PIGLET, traits: { size: 'pequeño', color: 'rosa', movement: 'corre', diet: 'omnívoro', legs: 4 },
      parts: babyParts(pigParts(), PIGLET), easterEgg: false },
    // The duckling (AS-0315, mission 2): hatches next to mamá pato; a story animal, so it never joins the normal population.
    { id: 'patito', feet: 'claw', name: { es: 'patito', en: 'duckling', gender: 'm' }, icon: '🐥', biome: 'bosque', story: true, voice: 'phrase:pio',
      baby: DUCKLING, traits: { size: 'pequeño', color: 'amarillo', movement: 'nada', diet: 'omnívoro', legs: 2 },
      parts: babyParts(duckParts(), DUCKLING), easterEgg: false },
    // The puppy (AS-0318, mission 3: stranded on a river rock): a story animal, so it is not in the world until a mission places it.
    { id: 'perrito', feet: 'paw', name: { es: 'perrito', en: 'puppy', gender: 'm' }, icon: '🐶', biome: 'bosque', story: true, voice: 'phrase:guau',
      traits: { size: 'pequeño', color: 'marrón', movement: 'corre', diet: 'omnívoro', legs: 4 },
      wag: { part: 'cola', angle: 0.6, hz: 4 }, sounds: { sad: 'whine' },
      parts: puppyParts(), easterEgg: false },
    // The mouse family of Mission 8 (AS-0346): mamá and papá are el ratón de campo, the three babies los ratoncitos; story animals,
    // placed by the mission in the hollow tree (game/mission-pantry.js). Not the yellow easter-egg mouse below.
    { id: 'ratoncampo', feet: 'paw', name: { es: 'ratón de campo', en: 'field mouse', gender: 'm' }, icon: '🐭', biome: 'bosque', story: true,
      traits: { size: 'pequeño', color: 'gris', movement: 'corre', diet: 'omnívoro', legs: 4 },
      parts: fieldMouseParts(), easterEgg: false },
    { id: 'ratoncito', feet: 'paw', name: { es: 'ratoncito', en: 'baby mouse', gender: 'm' }, icon: '🐭', biome: 'bosque', story: true,
      baby: MOUSE_BABY, traits: { size: 'pequeño', color: 'gris', movement: 'camina lento', diet: 'omnívoro', legs: 4 },
      parts: babyParts(fieldMouseParts(), MOUSE_BABY), easterEgg: false },
    // The kits of Mission 9's rabbit family (AS-0350): a story animal (not in the world population), placed beside the build spot by game/mission-home.js.
    { id: 'conejito', feet: 'paw', name: { es: 'conejito', en: 'baby rabbit', gender: 'm' }, icon: '🐰', biome: 'bosque', story: true,
      baby: RABBIT_BABY, traits: { size: 'pequeño', color: 'gris', movement: 'camina lento', diet: 'herbívoro', legs: 4 },
      parts: babyParts(rabbitParts(), RABBIT_BABY), easterEgg: false },
    // Easter egg #1 (original design): a blocky yellow mouse. Hidden until the player has 10 stars AND has tapped the
    // same tree of the forest 5 times. The condition is plain data (see game/unlocks.js).
    { id: 'raton', feet: 'paw', name: { es: 'ratón chispa', en: 'spark mouse', gender: 'm' }, icon: '🐭', biome: 'bosque',
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
      ] } },
    // AS-0268: three more desert species (desierto now has 5). Listed LAST on purpose: herd homes are drawn from one shared seeded
    // sequence in list order (SA.animalPlan.herdPlacements), so appending leaves every earlier species exactly where it was.
    { id: 'zorrodesierto', feet: 'paw', name: { es: 'zorro del desierto', en: 'fennec fox', gender: 'm' }, icon: '🦊', biome: 'desierto', herd: 4,
      traits: { size: 'pequeño', color: 'amarillo', movement: 'corre', diet: 'omnívoro', legs: 4 },
      parts: [
        // A small sandy fox with VERY large ears (taller than its head), a pale belly, a dark nose and a bushy dark-tipped tail.
        // Ears 1.5 tall: the only ones above the "orejas grandes" clue threshold (game/data/clues.js), so the clue names it.
        p('cuerpo', '#e6c88e', [0.7, 0.55, 1.0], 1, [0, 0.6, 0]), p('cabeza', '#ecd2a0', 0.55, 1, [0, 0.95, 0.62]),
        p('orejas', '#e6c88e', [0.34, 1.5, 0.12], 2, [0.22, 1.85, 0.5]), p('hocico', '#3a2c22', 0.14, 1, [0, 0.9, 0.92]),
        eyes(0.11, [0.14, 1.02, 0.82]), p('patas', '#d6b27a', [0.11, 0.5, 0.11], 4, [0.22, 0.25, 0]),
        { part: 'cola', color: '#e0be84', scale: [0.26, 0.26, 0.75], count: 1, offset: [0, 0.65, -0.85],
          also: [{ scale: [0.28, 0.28, 0.3], count: 1, offset: [0, 0.65, -1.25], color: '#4a3a2c', builder: 'sphere' }] },
        p('pelo', '#f2e0b8', [0.5, 0.14, 0.55], 1, [0, 0.88, 0.05]), p('barriga', '#f4e6c4', [0.5, 0.2, 0.8], 1, [0, 0.4, 0.05])
      ], easterEgg: false },
    { id: 'lagartija', feet: 'claw', name: { es: 'lagartija', en: 'lizard', gender: 'f' }, icon: '🦎', biome: 'desierto', herd: 5,
      markings: { type: 'bands', color: '#2d6aa0', count: 6 },   // AS-0408: darker cross-bands down the back
      traits: { size: 'pequeño', color: 'azul', movement: 'corre', diet: 'insectívoro', legs: 4 },
      parts: [
        // Low and flat: four short splayed legs and a tail longer than the body (two pieces, both answer as la cola).
        // Blue (a collared/blue-tailed lizard) because green, brown and orange are taken by the other clue answers.
        p('cuerpo', '#4f93c9', [0.45, 0.28, 1.1], 1, [0, 0.3, 0]), p('cabeza', '#62a6da', [0.4, 0.26, 0.45], 1, [0, 0.32, 0.62]),
        eyes(0.1, [0.14, 0.43, 0.78]), { part: 'patas', color: '#3f7fb0', scale: [0.12, 0.34, 0.12], count: 4, offset: [0.15, 0.17, 0], row: 0.4 },
        { part: 'cola', color: '#3f7fb0', scale: [0.18, 0.14, 0.75], count: 1, offset: [0, 0.27, -0.92],
          also: [{ scale: [0.12, 0.1, 0.7], count: 1, offset: [0, 0.25, -1.6] }] },
        p('barriga', '#bfe0ee', [0.35, 0.15, 0.8], 1, [0, 0.2, 0])
      ], easterEgg: false },
    { id: 'correcaminos', feet: 'claw', name: { es: 'correcaminos', en: 'roadrunner', gender: 'm' }, icon: '🐦', biome: 'desierto', herd: 3,
      markings: { type: 'spots', color: '#e6d5b0', count: 9 },   // AS-0408: the streaky pale speckles of its plumage
      traits: { size: 'mediano', color: 'marrón', movement: 'corre', diet: 'omnívoro', legs: 2 },
      parts: [
        // A long, level body on two tall legs, a long flat tail, a spiky crest and a strong beak.
        // Short wings (<= 0.4: the "alas cortas" clue names it), legs just under the "patas largas" threshold (the camel's).
        p('cuerpo', '#8a6a46', [0.5, 0.5, 1.1], 1, [0, 0.9, 0]), p('cabeza', '#9a7a52', 0.4, 1, [0, 1.22, 0.6]),
        p('pico', '#d8b04a', [0.12, 0.12, 0.4], 1, [0, 1.17, 1.0]), p('cresta', '#3b2c20', [0.16, 0.4, 0.2], 1, [0, 1.55, 0.5]),
        p('alas', '#76583a', [0.08, 0.4, 0.35], 2, [0.3, 0.9, -0.05]), eyes(0.1, [0.12, 1.29, 0.75]),
        p('patas', '#b9a58a', [0.1, 0.75, 0.1], 2, [0.15, 0.375, 0.05]),
        { part: 'cola', color: '#6e5236', scale: [0.25, 0.1, 0.75], count: 1, offset: [0, 0.95, -0.92], builder: 'box',
          also: [{ scale: [0.2, 0.08, 0.6], count: 1, offset: [0, 0.95, -1.55] }] }
      ], easterEgg: false },
    // AS-0269: three more mountain species (montana now has 5), appended last for the same herd-placement reason.
    { id: 'oso', feet: 'paw', name: { es: 'oso', en: 'bear', gender: 'm' }, icon: '🐻', biome: 'montana', herd: 3,
      traits: { size: 'grande', color: 'marrón', movement: 'camina lento', diet: 'omnívoro', legs: 4 },
      parts: [
        // A big, heavy, dark-brown bear: thick body, round ball ears, a pale snout, a stub tail and a deep coat on the back.
        // Coat 1.3 long (the only one over the "pelo largo" threshold in game/data/clues.js); legs 0.75 stay under "patas largas".
        p('cuerpo', '#5a3b22', [1.3, 1.2, 1.8], 1, [0, 1.1, 0]), p('cabeza', '#5a3b22', 0.8, 1, [0, 1.45, 1.0]),
        p('hocico', '#c9a27a', [0.4, 0.34, 0.4], 1, [0, 1.35, 1.4]),
        { part: 'orejas', builder: 'sphere', color: '#4a2f1a', scale: 0.22, count: 2, offset: [0.28, 1.85, 0.9] },
        eyes(0.12, [0.2, 1.55, 1.3]), p('cola', '#4a2f1a', 0.25, 1, [0, 1.0, -0.95]),
        { part: 'patas', color: '#4a2f1a', builder: 'cylinder', scale: [0.35, 0.75, 0.35], count: 4, offset: [0.4, 0.375, 0], row: 0.6 },
        p('pelo', '#3f2916', [1.0, 0.3, 1.3], 1, [0, 1.75, -0.1]), p('barriga', '#7a5232', [0.9, 0.4, 1.0], 1, [0, 0.7, 0.2])
      ], easterEgg: false },
    { id: 'llama', feet: 'hoof', name: { es: 'llama', en: 'llama', gender: 'f' }, icon: '🦙', biome: 'montana', herd: 4,
      traits: { size: 'mediano', color: 'blanco', movement: 'camina lento', diet: 'herbívoro', legs: 4 },
      parts: [
        // Slim cream body on long legs, a long straight neck (part cuello, 1.0: "cuello largo" names it), a small head with tall
        // pointed ears and a fluffy woolly coat (0.9, under the bear's "pelo largo").
        p('cuerpo', '#efe6d2', [0.8, 0.8, 1.3], 1, [0, 1.1, 0]),
        { part: 'cuello', color: '#efe6d2', builder: 'cylinder', scale: [0.25, 1.1, 0.25], count: 1, offset: [0, 1.95, 0.6], rot: [0.26, 0, 0] },
        p('cabeza', '#efe6d2', [0.35, 0.35, 0.5], 1, [0, 2.5, 0.75]), p('hocico', '#cdbfa5', 0.2, 1, [0, 2.42, 1.02]),
        p('orejas', '#e2d6bd', [0.14, 0.55, 0.14], 2, [0.12, 2.9, 0.7]), eyes(0.09, [0.14, 2.55, 0.92]),
        p('cola', '#efe6d2', [0.12, 0.12, 0.4], 1, [0, 1.35, -0.75]),
        p('patas', '#d9ceb4', [0.14, 0.95, 0.14], 4, [0.25, 0.475, 0]),
        p('pelo', '#fbf5e6', [0.75, 0.35, 0.9], 1, [0, 1.55, -0.05]), p('barriga', '#d9ceb4', [0.55, 0.3, 0.8], 1, [0, 0.8, 0.1])
      ], easterEgg: false },
    { id: 'condor', feet: 'claw', name: { es: 'cóndor', en: 'condor', gender: 'm' }, icon: '🐦‍⬛', biome: 'montana', herd: 3,
      traits: { size: 'grande', color: 'negro', movement: 'vuela', diet: 'carnívoro', legs: 2 },
      parts: [
        // Black body and huge black wings (2.4: the only ones over the "alas grandes" threshold), a white feather collar, a bare
        // pinkish head and a pale hooked beak.
        p('cuerpo', '#1c1c22', [0.8, 0.8, 1.1], 1, [0, 1.0, 0]),
        { part: 'plumas', color: '#f6f4ee', builder: 'cylinder', scale: [0.62, 0.2, 0.62], count: 1, offset: [0, 1.33, 0.42] },
        p('cabeza', '#b78f86', 0.4, 1, [0, 1.52, 0.5]), p('pico', '#e6dfc8', [0.18, 0.2, 0.4], 1, [0, 1.45, 0.85]),
        p('alas', '#15151a', [0.12, 0.9, 2.4], 2, [0.55, 1.05, 0]), p('cola', '#1c1c22', [0.4, 0.1, 0.8], 1, [0, 0.9, -0.85]),
        p('patas', '#8a8a92', [0.1, 0.75, 0.1], 2, [0.2, 0.375, 0]), eyes(0.09, [0.12, 1.57, 0.66])
      ], easterEgg: false },
    // AS-0270: forest (ciervo, ardilla) and jungle (jaguar, perezoso) species: bosque and selva now have 5 each. Appended last
    // so earlier species keep their herd homes.
    { id: 'ciervo', feet: 'hoof', name: { es: 'ciervo', en: 'deer', gender: 'm' }, icon: '🦌', biome: 'bosque', herd: 3,
      markings: { type: 'spots', color: '#f3e6cc', count: 10 },   // AS-0407: a fawn's pale back spots
      traits: { size: 'mediano', color: 'marrón', movement: 'corre', diet: 'herbívoro', legs: 4 },
      parts: shrink([
        // Tawny deer: slim body on four long thin legs, a leaning neck (extra pieces of la cabeza), a dark nose, a small white tail
        // and tall branching antlers (cuernos 1.1 before shrinking: the only ones over the "cuernos largos" threshold).
        p('cuerpo', '#a9753f', [0.8, 0.85, 1.5], 1, [0, 1.3, 0]),
        { part: 'cabeza', color: '#a9753f', scale: [0.4, 0.4, 0.6], count: 1, offset: [0, 2.05, 0.9],
          also: [{ scale: [0.28, 0.8, 0.28], count: 1, offset: [0, 1.7, 0.72], rot: [0.4, 0, 0], builder: 'cylinder' }] },
        p('hocico', '#4a3220', [0.18, 0.18, 0.2], 1, [0, 1.98, 1.22]), eyes(0.09, [0.15, 2.12, 1.05]),
        p('orejas', '#8f5f30', [0.12, 0.3, 0.12], 2, [0.2, 2.3, 0.75]),
        { part: 'cuernos', color: '#d8c8a0', builder: 'cylinder', scale: [0.06, 1.1, 0.06], count: 2, offset: [0.1, 2.75, 0.8],
          also: [{ scale: [0.05, 0.5, 0.05], count: 2, offset: [0.2, 2.85, 0.92] }, { scale: [0.05, 0.4, 0.05], count: 2, offset: [0.2, 3.0, 0.68] }] },
        p('cola', '#f2ead8', [0.12, 0.2, 0.12], 1, [0, 1.6, -0.8]),
        { part: 'patas', color: '#8f5f30', builder: 'cylinder', scale: [0.12, 1.3, 0.12], count: 4, offset: [0.25, 0.65, 0], row: 0.5 },
        p('barriga', '#e8d6b0', [0.5, 0.3, 0.9], 1, [0, 1.05, 0.1])
      ], 0.8), easterEgg: false },
    { id: 'ardilla', feet: 'paw', name: { es: 'ardilla', en: 'squirrel', gender: 'f' }, icon: '🐿️', biome: 'bosque', herd: 3,
      traits: { size: 'pequeño', color: 'rojo', movement: 'trepa', diet: 'omnívoro', legs: 4 },
      parts: [
        // Small red-brown squirrel with tufted ears and a big bushy tail standing up behind it (cola 1.0, tipped with a paler ball).
        p('cuerpo', '#b5532a', [0.45, 0.5, 0.7], 1, [0, 0.55, 0]), p('cabeza', '#b5532a', 0.4, 1, [0, 0.9, 0.3]),
        p('hocico', '#e8c9a0', 0.12, 1, [0, 0.85, 0.5]), eyes(0.1, [0.11, 0.96, 0.46]),
        p('orejas', '#8f3f1c', [0.1, 0.2, 0.1], 2, [0.12, 1.15, 0.25]),
        p('patas', '#8f3f1c', [0.1, 0.45, 0.1], 4, [0.15, 0.225, 0]),
        { part: 'cola', color: '#c4622f', builder: 'sphere', scale: [0.45, 1.0, 0.5], count: 1, offset: [0, 0.95, -0.55],
          also: [{ scale: 0.32, count: 1, offset: [0, 1.4, -0.6], color: '#e8a070' }] },
        p('barriga', '#f0d9b0', [0.3, 0.3, 0.4], 1, [0, 0.45, 0.2])
      ], easterEgg: false },
    { id: 'jaguar', feet: 'paw', name: { es: 'jaguar', en: 'jaguar', gender: 'm' }, icon: '🐆', biome: 'selva', herd: 3,
      markings: { type: 'spots', color: '#2a1c10', count: 14 },   // AS-0408: rosette spots all over the golden coat (decor, beside the pickable manchas)
      traits: { size: 'mediano', color: 'amarillo', movement: 'corre', diet: 'carnívoro', legs: 4 },
      parts: [
        // Golden cat: long low body, broad round head, short thick legs, a medium tail, and black spots (manchas) on the back
        // and flanks: the part that makes it the one answer of "Toca las manchas".
        p('cuerpo', '#d9a441', [0.8, 0.75, 1.7], 1, [0, 0.85, 0]), p('cabeza', '#d9a441', 0.6, 1, [0, 1.0, 1.0]),
        p('hocico', '#ecd29a', [0.3, 0.25, 0.3], 1, [0, 0.9, 1.3]), eyes(0.1, [0.17, 1.08, 1.25], '#f4f4a0'),
        p('orejas', '#c48f30', 0.15, 2, [0.2, 1.35, 0.95]), p('cola', '#d9a441', [0.14, 0.14, 0.7], 1, [0, 0.95, -1.05]),
        { part: 'patas', color: '#c48f30', builder: 'cylinder', scale: [0.2, 0.72, 0.2], count: 4, offset: [0.25, 0.36, 0], row: 0.5 },
        { part: 'manchas', color: '#2a1c10', builder: 'sphere', scale: [0.2, 0.12, 0.2], count: 4, offset: [0.15, 1.17, 0.45], row: 0.45,
          also: [{ scale: [0.08, 0.2, 0.2], count: 2, offset: [0.37, 0.95, 0.3] }, { scale: [0.08, 0.2, 0.2], count: 2, offset: [0.37, 0.95, -0.4] }] },
        p('barriga', '#ecd29a', [0.5, 0.3, 0.9], 1, [0, 0.6, 0.1])
      ], easterEgg: false },
    { id: 'perezoso', feet: 'claw', name: { es: 'perezoso', en: 'sloth', gender: 'm' }, icon: '🦥', biome: 'selva', herd: 4, perch: 'tree',
      traits: { size: 'mediano', color: 'gris', movement: 'camina lento', diet: 'herbívoro', legs: 4 },
      parts: [
        // Shaggy grey-brown sloth with a pale round face, very long limbs ending in pale curved claws (garras).
        p('cuerpo', '#8c8068', [0.8, 0.8, 1.0], 1, [0, 0.9, 0]), p('cabeza', '#b3a58a', 0.55, 1, [0, 1.4, 0.45]),
        p('hocico', '#3a2a20', 0.15, 1, [0, 1.33, 0.72]), eyes(0.12, [0.14, 1.46, 0.7]),
        p('pelo', '#6f6450', [0.7, 0.2, 0.8], 1, [0, 1.3, -0.1]), p('cola', '#8c8068', 0.15, 1, [0, 0.7, -0.55]),
        { part: 'patas', color: '#7d7058', builder: 'cylinder', scale: [0.14, 1.2, 0.14], count: 4, offset: [0.3, 0.6, 0], row: 0.25 },
        { part: 'garras', color: '#efe6d0', scale: [0.08, 0.22, 0.08], count: 4, offset: [0.3, 0.08, 0.05], row: 0.25 }, p('barriga', '#a89c82', [0.5, 0.3, 0.6], 1, [0, 0.55, 0.3])
      ], easterEgg: false },
    // Night animals (AS-0171): awake from dusk to dawn, asleep by day (SA.sleep). Both perch in trees; the bat hangs upside down asleep.
    // They are listed LAST so the seeded herd placement of every older animal stays exactly where it was.
    { id: 'buho', feet: 'claw', name: { es: 'búho', en: 'owl', gender: 'm' }, icon: '🦉', biome: 'bosque', herd: 3, perch: 'tree', active: 'night',
      markings: { type: 'spots', color: '#d9c29a', count: 10 },   // AS-0408: pale flecks on the brown feathers
      traits: { size: 'mediano', color: 'marrón', movement: 'vuela', diet: 'carnívoro', legs: 2 },
      parts: [
        // A round brown owl with a paler head, big yellow eyes with dark pupils, ear tufts and a tiny hooked beak.
        p('cuerpo', '#7a5a3a', [0.85, 0.95, 0.8], 1, [0, 0.8, 0]), p('cabeza', '#8b6a47', 0.62, 1, [0, 1.5, 0.15]),
        p('pico', '#e8a317', [0.14, 0.14, 0.26], 1, [0, 1.42, 0.5]), eyes(0.26, [0.17, 1.58, 0.38], '#ffd84a'),
        p('orejas', '#5e432a', [0.14, 0.26, 0.14], 2, [0.2, 1.88, 0.1]), p('alas', '#5e432a', [0.1, 0.7, 0.6], 2, [0.5, 0.85, -0.05]),
        p('cola', '#5e432a', [0.3, 0.1, 0.5], 1, [0, 0.45, -0.55]), p('patas', '#e8a317', [0.1, 0.4, 0.1], 2, [0.15, 0.2, 0.1]),
        p('barriga', '#e8d9b8', [0.55, 0.55, 0.3], 1, [0, 0.75, 0.35]),
        p('cuello', '#a58660', [0.35, 0.15, 0.35], 1, [0, 1.22, 0.1])   // a fluffy feather collar: "cuello corto" is the búho's own clue
      ], easterEgg: false },
    { id: 'murcielago', feet: 'claw', name: { es: 'murciélago', en: 'bat', gender: 'm' }, icon: '🦇', biome: 'selva', herd: 3, perch: 'tree', active: 'night', sleepPose: 'hang',
      traits: { size: 'pequeño', color: 'negro', movement: 'vuela', diet: 'insectívoro', legs: 2 },
      parts: [
        // A small dark bat: furry body, pointed ears, wide wings, little pale eyes and a pink nose ("nariz corta" is its own clue).
        p('cuerpo', '#2a2630', [0.45, 0.5, 0.6], 1, [0, 0.5, 0]), p('cabeza', '#3a3440', 0.34, 1, [0, 0.85, 0.2]),
        p('orejas', '#2a2630', [0.1, 0.3, 0.1], 2, [0.12, 1.1, 0.18]), eyes(0.12, [0.09, 0.9, 0.34], '#f4e8a0'),
        p('alas', '#4a4252', [0.05, 0.7, 1.1], 2, [0.4, 0.55, 0]), p('patas', '#2a2630', [0.06, 0.25, 0.06], 2, [0.1, 0.2, 0]),
        p('nariz', '#d98aa0', 0.07, 1, [0, 0.82, 0.38])
      ], easterEgg: false }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
