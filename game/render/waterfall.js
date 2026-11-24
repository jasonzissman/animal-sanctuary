/* SA.render.createWaterfall(THREE, { scene }): the montaña's small waterfall (SA.mountainPlan.get().waterfall, AS-0310, slice 4/4 of AS-0136).
 *   - A stone cliff of three flat-shaded boxes (the middle one lower: the water runs through the notch), a stone-rimmed round pool at its foot
 *     (open rim wall + flat ring + a translucent water disc) and the falling sheet: ONE plane whose stripes scroll down in the fragment shader
 *     (a `uScroll` uniform), so the animation costs advancing one number.
 *   - Spray: SPRAY little white blobs in ONE InstancedMesh, each looping a short ballistic hop from the foot of the sheet; update() rewrites their matrices
 *     through pre-allocated scratch objects and typed arrays, so nothing is allocated per frame.
 * Built once; null when the layout found no site. Only code here touches THREE.
 *
 *   fall.group  THREE.Group (already added to the scene)   fall.update(dt)  advances the animation, allocates nothing
 *   fall.stats() { cliffBlocks, sprayParticles, drawCalls }   fall.uScroll  the scroll uniform { value }
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SPRAY = 14, LIFE = 1.1, SCROLL_SPEED = 1.5;

  function sheetMaterial(THREE, uScroll) {
    var mat = new THREE.MeshBasicMaterial({ color: '#9fdcf0', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uScroll = uScroll;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uScroll;\nvarying vec3 vP;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n' +
          'float s = fract(vP.y * 0.8 + uScroll + sin(vP.x * 7.0) * 0.18);\n' +
          'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), smoothstep(0.5, 0.9, s) * 0.75);\n' +
          'diffuseColor.a *= 0.6 + 0.35 * s;');
    };
    mat.customProgramCacheKey = function () { return 'waterfall-sheet'; };
    return mat;
  }

  SA.render.createWaterfall = function (THREE, opts) {
    var W = SA.mountainPlan && SA.mountainPlan.get().waterfall;
    if (!W) return null;
    var group = new THREE.Group(), stone = new THREE.MeshPhongMaterial({ color: '#8d9096', flatShading: true, specular: 0x000000 });
    group.name = 'waterfall';
    var drawCalls = 0;
    function add(mesh, name) { mesh.name = name; group.add(mesh); drawCalls++; return mesh; }

    W.cliff.forEach(function (c, i) {
      var m = add(new THREE.Mesh(new THREE.BoxGeometry(c.d, c.h, c.w), stone), 'waterfall-cliff-' + i);
      m.position.set(c.x, c.y + c.h / 2, c.z);
      m.castShadow = true;
    });

    // The pool: an open rim wall from the lowest ground up to the rim, a flat ring on top and the water disc a little lower.
    var rimTop = W.poolY + 0.22, wallH = rimTop - W.lowY + 0.5;
    var wall = add(new THREE.Mesh(new THREE.CylinderGeometry(W.poolR + 0.45, W.poolR + 0.55, wallH, 12, 1, true), new THREE.MeshPhongMaterial({ color: '#767a80', flatShading: true, specular: 0x000000, side: THREE.DoubleSide })), 'waterfall-rim');
    wall.position.set(W.x, rimTop - wallH / 2, W.z);
    var ring = add(new THREE.Mesh(new THREE.RingGeometry(W.poolR - 0.05, W.poolR + 0.45, 12), stone), 'waterfall-rim-top');
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(W.x, rimTop, W.z);
    var water = add(new THREE.Mesh(new THREE.CircleGeometry(W.poolR, 14), new THREE.MeshPhongMaterial({ color: '#5bb4cf', transparent: true, opacity: 0.85, flatShading: true, specular: 0x000000, depthWrite: false })), 'waterfall-pool');
    water.rotation.x = -Math.PI / 2;
    water.position.set(W.x, W.poolY + 0.1, W.z);
    water.renderOrder = 1;

    // The sheet: from just under the notch's lip down to the pool, a hair in front of the cliff face.
    var lip = W.topY - 0.5, sheetH = lip - W.poolY - 0.05, uScroll = { value: 0 };
    var sheet = add(new THREE.Mesh(new THREE.PlaneGeometry(W.sheetW, sheetH, 1, 6), sheetMaterial(THREE, uScroll)), 'waterfall-sheet');
    sheet.rotation.y = Math.PI / 2;   // faces +x, downhill
    sheet.position.set(W.fx + 0.06, W.poolY + 0.05 + sheetH / 2, W.z);
    sheet.renderOrder = 2;

    // Spray: one InstancedMesh; each particle i loops with its own phase and a fixed launch velocity (all from typed arrays).
    var blob = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 5, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }), SPRAY);
    var phase = new Float32Array(SPRAY), vx = new Float32Array(SPRAY), vy = new Float32Array(SPRAY), vz = new Float32Array(SPRAY), ox = new Float32Array(SPRAY);
    for (var i = 0; i < SPRAY; i++) {   // deterministic spread, no RNG needed
      phase[i] = (i * 0.6180339) % 1;
      vx[i] = 0.5 + ((i * 7) % 5) * 0.28;
      vy[i] = 1.6 + ((i * 3) % 4) * 0.5;
      vz[i] = (((i * 5) % 7) - 3) * 0.28;
      ox[i] = (((i * 11) % 9) - 4) * 0.13;
    }
    var o = new THREE.Object3D(), clock = 0, baseX = W.fx + 0.25, baseY = W.poolY + 0.15;
    function placeSpray() {
      for (var k = 0; k < SPRAY; k++) {
        var u = (clock / LIFE + phase[k]) % 1, t = u * LIFE, fade = Math.sin(u * Math.PI);
        o.position.set(baseX + vx[k] * t, baseY + vy[k] * t - 4.9 * t * t * 0.6, W.z + ox[k] + vz[k] * t);
        o.scale.setScalar(0.35 + fade * 0.9);
        o.updateMatrix();
        blob.setMatrixAt(k, o.matrix);
      }
      blob.instanceMatrix.needsUpdate = true;
    }
    blob.name = 'waterfall-spray';
    blob.frustumCulled = false;
    group.add(blob);
    drawCalls++;
    placeSpray();

    if (opts && opts.scene) opts.scene.add(group);
    return {
      group: group, uScroll: uScroll,
      update: function (dt) { dt = dt || 0; uScroll.value += dt * SCROLL_SPEED; clock += dt; placeSpray(); },
      stats: function () { return { cliffBlocks: W.cliff.length, sprayParticles: SPRAY, drawCalls: drawCalls }; },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
