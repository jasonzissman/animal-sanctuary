/* Hand models: registers kind "handmodels" (SA.data), one per item in game/data/items.js. Pure data; no THREE, no DOM.
 * Load after game/data/items.js. Built into low-poly meshes by game/render/hand-item.js (the only code that touches THREE).
 *
 * Spec shape (JSON-serialisable):
 *   id      an item id from items.js
 *   parts   1-8 primitives, authored in "grip space": origin = the fist, +y = up out of the fist, +z = forward, units = metres
 *     shape  'box' size [w,h,d] | 'cylinder' size [rTop,rBottom,h] | 'sphere' size [r] | 'cone' size [r,h]
 *     color  flat colour, integer 0x000000..0xffffff
 *     pos    [x,y,z] centre of the primitive
 *     rot    optional [x,y,z] radians
 *     scale  optional [x,y,z] > 0, squashes/stretches the primitive (a fish is a flattened sphere)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;

  var SIZES = { box: 3, cylinder: 3, sphere: 1, cone: 2 };

  function vec3(v, name, positive) {
    if (!Array.isArray(v) || v.length !== 3 || !v.every(function (n) { return typeof n === 'number' && isFinite(n) && (!positive || n > 0); })) {
      fail(name, 'must be an array of 3 ' + (positive ? 'positive ' : '') + 'numbers');
    }
  }

  function validateHandModel(m) {
    if (!SA.data.get('items', m.id)) fail('id', 'must be an item id from items.js');
    if (!Array.isArray(m.parts) || m.parts.length < 1 || m.parts.length > 8) fail('parts', 'must be 1 to 8 primitives');
    m.parts.forEach(function (p, i) {
      var at = 'parts[' + i + ']';
      if (!p || typeof p !== 'object') fail(at, 'must be an object');
      if (!Object.prototype.hasOwnProperty.call(SIZES, p.shape)) fail(at + '.shape', 'must be one of ' + Object.keys(SIZES).join(', '));
      if (!Array.isArray(p.size) || p.size.length !== SIZES[p.shape] || !p.size.every(function (n) { return typeof n === 'number' && n > 0 && n <= 1; })) {
        fail(at + '.size', p.shape + ' needs ' + SIZES[p.shape] + ' positive numbers up to 1');
      }
      if (typeof p.color !== 'number' || p.color !== Math.floor(p.color) || p.color < 0 || p.color > 0xffffff) fail(at + '.color', 'must be an integer 0..0xffffff');
      vec3(p.pos, at + '.pos');
      if (p.rot !== undefined) vec3(p.rot, at + '.rot');
      if (p.scale !== undefined) vec3(p.scale, at + '.scale', true);
    });
  }

  function clean(p) {   // drop undefined optionals so the data stays plain JSON
    Object.keys(p).forEach(function (k) { if (p[k] === undefined) delete p[k]; });
    return p;
  }
  function box(w, h, d, color, x, y, z, rot) { return clean({ shape: 'box', size: [w, h, d], color: color, pos: [x, y, z], rot: rot }); }
  function cyl(rt, rb, h, color, x, y, z, rot) { return clean({ shape: 'cylinder', size: [rt, rb, h], color: color, pos: [x, y, z], rot: rot }); }
  function ball(r, color, x, y, z, scale) { return clean({ shape: 'sphere', size: [r], color: color, pos: [x, y, z], scale: scale }); }
  function cone(r, h, color, x, y, z, rot) { return clean({ shape: 'cone', size: [r, h], color: color, pos: [x, y, z], rot: rot }); }
  function model(id, parts) { return { id: id, parts: parts }; }

  var HALF_PI = Math.PI / 2;
  var models = [
    model('camara', [box(0.22, 0.14, 0.09, 0x3b3f46, 0, 0.08, 0), cyl(0.045, 0.045, 0.06, 0x4aa3df, 0, 0.08, 0.07, [HALF_PI, 0, 0]),
      box(0.05, 0.03, 0.04, 0xe8553d, 0.07, 0.16, 0)]),
    model('cepillo', [box(0.05, 0.2, 0.04, 0x8a5a2b, 0, 0.08, 0), box(0.14, 0.04, 0.07, 0xf2c94c, 0, 0.2, 0), box(0.12, 0.04, 0.05, 0xfff4cc, 0, 0.24, 0)]),
    model('esponja', [box(0.16, 0.1, 0.12, 0xf5d547, 0, 0.06, 0), box(0.05, 0.04, 0.02, 0xd9ae1f, -0.03, 0.08, 0.065), box(0.04, 0.04, 0.02, 0xd9ae1f, 0.04, 0.04, 0.065)]),
    model('venda', [cyl(0.075, 0.075, 0.09, 0xfaf6ee, 0, 0.06, 0, [HALF_PI, 0, 0]), box(0.07, 0.025, 0.1, 0xe8553d, 0, 0.06, 0), box(0.025, 0.07, 0.1, 0xe8553d, 0, 0.06, 0)]),
    model('platano', [box(0.05, 0.14, 0.05, 0xf5d547, 0, 0.07, 0, [0.35, 0, 0]), box(0.05, 0.12, 0.05, 0xf5d547, 0, 0.19, 0.04, [-0.35, 0, 0]), box(0.03, 0.03, 0.03, 0x5a3a22, 0, 0.26, 0.07)]),
    model('fresa', [cone(0.07, 0.14, 0xe8553d, 0, 0.09, 0, [Math.PI, 0, 0]), box(0.08, 0.025, 0.08, 0x4caf50, 0, 0.17, 0)]),
    model('zanahoria', [cone(0.05, 0.22, 0xf08a24, 0, 0.11, 0, [Math.PI, 0, 0]), box(0.02, 0.07, 0.02, 0x4caf50, 0, 0.25, 0), box(0.02, 0.06, 0.02, 0x4caf50, 0.03, 0.24, 0, [0, 0, -0.5])]),
    model('pez', [ball(0.1, 0x4aa3df, 0, 0.1, 0, [1.6, 0.8, 0.5]), cone(0.06, 0.1, 0x2f7fb8, 0, 0.1, -0.15, [-HALF_PI, 0, 0]), box(0.015, 0.015, 0.015, 0x222222, 0.01, 0.12, 0.17)]),
    model('roca', [ball(0.1, 0x8d8d92, 0, 0.09, 0, [1.1, 0.8, 1]), ball(0.05, 0xa6a6ab, 0.05, 0.14, 0.03)])
  ];

  SA.data.defineKind('handmodels', validateHandModel);
  SA.data.register('handmodels', models);
})(typeof window !== 'undefined' ? window : globalThis);
