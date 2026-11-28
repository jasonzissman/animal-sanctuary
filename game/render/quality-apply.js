/* SA.render.applyQuality(opts) (AS-0412): writes the current SA.quality params onto the renderer. Thin, THREE-free (plain property
 * writes and method calls only), so a stub renderer tests it.
 *   opts: { renderer, sun, params, dpr }  params = SA.quality.params(); dpr = the device pixel ratio.
 * Pixel ratio = min(dpr, params.pixelRatio). The sun's shadow map is resized by dropping the old render target (three r128 rebuilds it
 * on the next render) - only when the size really changed. Returns { pixelRatio, shadow }.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.applyQuality = function (opts) {
    var p = opts.params, renderer = opts.renderer, sun = opts.sun;
    var pr = Math.min(opts.dpr || 1, p.pixelRatio);
    if (renderer.getPixelRatio ? renderer.getPixelRatio() !== pr : true) renderer.setPixelRatio(pr);
    var sh = sun && sun.shadow;
    if (sh && sh.mapSize && (sh.mapSize.width !== p.shadow || sh.mapSize.height !== p.shadow)) {
      sh.mapSize.width = sh.mapSize.height = p.shadow;
      if (sh.map) { if (sh.map.dispose) sh.map.dispose(); sh.map = null; }
    }
    return { pixelRatio: pr, shadow: p.shadow };
  };
})(typeof window !== 'undefined' ? window : globalThis);
