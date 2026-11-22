/* SA.render.zigzagGeometry(THREE): the unit "zigzag" part builder (a lightning-bolt tail) used when a part entry says
 * `builder: 'zigzag'`. Fits a 1x1x1 box like the other unit primitives: x = sideways swing, y = length (bottom to
 * top), z = thickness. Four flat-shaded boxes are merged into one non-indexed BufferGeometry.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var POINTS = [[-0.3, -0.4], [0.3, -0.13], [-0.3, 0.13], [0.3, 0.4]];   // [x, y] corners of the bolt
  var THICK = 0.26;

  SA.render.zigzagGeometry = function (THREE) {
    var pos = [], nor = [];
    for (var i = 0; i + 1 < POINTS.length; i++) {
      var a = POINTS[i], b = POINTS[i + 1];
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var len = Math.hypot(dx, dy) + THICK * 0.5;   // a little overlap so the corners close up
      var m = new THREE.Matrix4().makeRotationZ(Math.atan2(dy, dx));
      m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
      var box = new THREE.BoxGeometry(len, THICK, 1).toNonIndexed();
      box.applyMatrix4(m);
      var p = box.attributes.position.array, n = box.attributes.normal.array;
      for (var k = 0; k < p.length; k++) { pos.push(p[k]); nor.push(n[k]); }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return geo;
  };
})(typeof window !== 'undefined' ? window : globalThis);
