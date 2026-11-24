/* SA.render.createSunShadow(THREE, opts): turns the scene's DirectionalLight into a shadow-casting sun (AS-0292).
 *   opts: { renderer, scene, sun, getPlayer, world, casters: [nodes], dynamic: [groups] }
 * One shadow map (SA.render.SUN_SHADOW.mapSize, PCFSoft) whose orthographic camera only covers the area around the player: each
 * frame the sun and its target move with the player (snapped to whole shadow texels so edges never shimmer). Animals, avatar, trees,
 * rocks and peaks cast; the terrain mesh (the vertex-coloured ground) receives. Water, flowers and invisible pick volumes do not.
 * `dynamic` groups (the wandering animals) are re-marked when their child count changes. No per-frame allocation. THREE is touched
 * only through plain property writes, so a stub THREE is enough to test it. Returns { update(), mark(node) }.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var CFG = SA.render.SUN_SHADOW = {
    mapSize: 2048,                      // one map; 2048 over a 64-unit window = 32 texels per world unit
    halfExtent: 32,                     // the shadow camera covers +-32 around the player
    offset: { x: -30, y: 50, z: 20 },   // the sun's direction from whatever it follows (the old fixed light position)
    near: 1, far: 140, bias: -0.0006, normalBias: 0.04,
    noCast: { flor: true },             // decor ids too small to be worth a shadow
  };

  function skip(o) { return o.visible === false || (o.userData && (o.userData.pick || o.userData.decor && CFG.noCast[o.userData.decor])); }

  /** Mark every real mesh under `node` as a caster (skips invisible pick volumes, flowers and their children). */
  function markCasters(node) {
    if (!node || skip(node)) return;
    if (node.isMesh) node.castShadow = true;
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) markCasters(kids[i]);
  }

  /** The vertex-coloured ground mesh receives; water (no vertex colours) never does. */
  function markReceivers(node) {
    if (!node) return;
    if (node.isMesh && node.material && node.material.vertexColors) node.receiveShadow = true;
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) markReceivers(kids[i]);
  }

  SA.render.createSunShadow = function (THREE, opts) {
    var renderer = opts.renderer, sun = opts.sun, scene = opts.scene;
    renderer.shadowMap.enabled = true;
    if (THREE.PCFSoftShadowMap !== undefined) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = true;
    var sh = sun.shadow, cam = sh.camera, e = CFG.halfExtent;
    sh.mapSize.width = sh.mapSize.height = CFG.mapSize;
    sh.bias = CFG.bias;
    sh.normalBias = CFG.normalBias;
    cam.left = -e; cam.right = e; cam.top = e; cam.bottom = -e; cam.near = CFG.near; cam.far = CFG.far;
    if (cam.updateProjectionMatrix) cam.updateProjectionMatrix();
    if (sun.target && scene && scene.add) scene.add(sun.target);   // the target must be in the scene for the light to aim at it

    markReceivers(opts.world);
    (opts.casters || []).forEach(markCasters);
    var dynamic = opts.dynamic || [], counts = dynamic.map(function (g) { markCasters(g); return (g.children || []).length; });
    var texel = (2 * e) / CFG.mapSize, lastX = NaN, lastZ = NaN, lastKey = NaN;

    function follow() {
      var p = opts.getPlayer && opts.getPlayer();
      if (!p) return;
      // Snap to the texel grid in world x/z so the shadow map does not swim as the player walks.
      var x = Math.round(p.x / texel) * texel, z = Math.round(p.z / texel) * texel;
      var o = CFG.offset, key = o.x + o.y * 1e3 + o.z * 1e6;   // the day/night cycle (AS-0170) moves the sun's offset: re-aim when it changes too
      if (x === lastX && z === lastZ && key === lastKey) return;
      lastX = x; lastZ = z; lastKey = key;
      sun.target.position.set(x, 0, z);
      sun.position.set(x + CFG.offset.x, CFG.offset.y, z + CFG.offset.z);
      if (sun.target.updateMatrixWorld) sun.target.updateMatrixWorld();
    }
    follow();

    return {
      mark: markCasters,
      update: function () {
        for (var i = 0; i < dynamic.length; i++) {
          var n = (dynamic[i].children || []).length;
          if (n !== counts[i]) { counts[i] = n; markCasters(dynamic[i]); }
        }
        follow();
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
