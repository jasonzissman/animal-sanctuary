/* SA.render.createPhotoCapture(THREE, o) -> capture(animalId) -> 'data:image/jpeg;base64,...' | null  (AS-0236)
 * Thin render glue for the photobook: when a photo of an animal is taken (SA.photo.record -> SA.albumPics.shot), this renders one frame
 * and copies the part of the canvas around that animal into a small (~240 px wide) JPEG. Rendering right before reading the canvas means
 * the drawing buffer is still valid, so the renderer does not need preserveDrawingBuffer. Any failure returns null (the photo still counts).
 *   o = { renderer, scene, camera, animals (Group; children are named by animal id), doc?, width? (240), quality? (0.6) }
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.createPhotoCapture = function (THREE, o) {
    var WIDTH = o.width || 240, ASPECT = 4 / 3, QUALITY = o.quality || 0.6;
    var doc = o.doc || root.document;
    var box = new THREE.Box3();
    var v = new THREE.Vector3();
    var canvas = null;

    return function capture(animalId) {
      try {
        var g = SA.render.instances.get(o.animals, animalId);   // AS-0255: the tapped / nearest instance
        if (!g || g.visible === false || !doc) return null;
        o.scene.updateMatrixWorld(true);
        o.renderer.render(o.scene, o.camera);
        var src = o.renderer.domElement;
        var cw = src.width, ch = src.height;
        if (!cw || !ch) return null;
        box.setFromObject(g);
        var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, front = 0;
        for (var i = 0; i < 8; i++) {   // the 8 corners of the animal's box, in canvas pixels
          v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(o.camera);
          if (v.z > -1 && v.z < 1) front++;
          var px = (v.x + 1) / 2 * cw, py = (1 - v.y) / 2 * ch;
          b.x0 = Math.min(b.x0, px); b.x1 = Math.max(b.x1, px); b.y0 = Math.min(b.y0, py); b.y1 = Math.max(b.y1, py);
        }
        if (!front || b.x1 < 0 || b.y1 < 0 || b.x0 > cw || b.y0 > ch) return null;   // the animal is not on screen
        var r = SA.albumPics.cropRect(b, cw, ch, ASPECT);
        if (!canvas) { canvas = doc.createElement('canvas'); canvas.width = WIDTH; canvas.height = Math.round(WIDTH / ASPECT); }
        var c2 = canvas.getContext('2d');
        if (!c2) return null;
        c2.drawImage(src, r.sx, r.sy, r.sw, r.sh, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', QUALITY);
      } catch (e) {
        return null;
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
