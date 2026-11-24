/* SA.render.createGroundCover(THREE, { scene, getPlayer }): instanced grass tufts and the per-biome ground plants (AS-0294, AS-0295).
 * Where things go is the pure, seeded SA.groundCoverPlan; what each plant is (biome, shape, size, colours, sway) is game/data/plants.js;
 * the geometry is game/render/plant-shapes.js. Here each biome's grass and each plant is ONE THREE.InstancedMesh holding a fixed pool of
 * instances that is recycled around the player: every metre the player walks, SA.groundCoverPlan.select() picks the nearby entries
 * (dense close, thinning with distance) and their matrices and colours are written straight into the preallocated buffers.
 * Sway is a vertex-shader bend driven by one shared time uniform (onBeforeCompile) for grass and plants alike, so update() allocates nothing.
 * Ground cover is soft: it is never added to the obstacle lists, so the player walks straight through it.
 *
 *   gc.group      THREE.Group (already added to the scene)      gc.update(dt)   advance the wind, refill the pools when the player moved
 *   gc.stats()    { meshes, instances }                          gc.meshes       the InstancedMeshes (tests); mesh.userData.plant = the plant id
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var RADIUS = 30;        // metres around the player that get ground cover
  var REFILL = 1;         // refill the pools after the player moved this far
  var GRASS_SWAY = 0.16;  // bend (m) at the top of a unit-height shape

  function windMaterial(THREE, uTime, amp) {
    var m = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, specular: 0x000000 });
    m.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
          'float swayPhase = uTime * 1.7 + instanceMatrix[3].x * 0.45 + instanceMatrix[3].z * 0.6;\n' +
          'float swayBend = position.y * position.y * ' + amp.toFixed(3) + ';\n' +
          'transformed.x += sin(swayPhase) * swayBend;\n' +
          'transformed.z += cos(swayPhase * 0.8) * swayBend * 0.6;');
    };
    m.customProgramCacheKey = function () { return 'ground-cover-sway-' + amp.toFixed(3); };
    return m;
  }

  function lerpTo(out, o, a, b, t) { out[o] = a[0] + (b[0] - a[0]) * t; out[o + 1] = a[1] + (b[1] - a[1]) * t; out[o + 2] = a[2] + (b[2] - a[2]) * t; }

  function rgb(THREE, hex) { var c = new THREE.Color(hex); return [c.r, c.g, c.b]; }

  /** Per-entry colour (3 floats each) across three tints: dark -> mid -> light by `tone`. */
  function colorsFor(THREE, entries, tints) {
    var cols = new Float32Array(entries.length * 3), p = tints.map(function (h) { return rgb(THREE, h); });
    entries.forEach(function (e, i) {
      if (e.tone < 0.5) lerpTo(cols, i * 3, p[0], p[1], e.tone * 2); else lerpTo(cols, i * 3, p[1], p[2], (e.tone - 0.5) * 2);
    });
    return cols;
  }

  SA.render.createGroundCover = function (THREE, opts) {
    var P = SA.groundCoverPlan, S = SA.render.plantShapes, group = new THREE.Group(), meshes = [], pools = [], uTime = { value: 0 };
    group.name = 'ground-cover';
    var geos = {}, mats = {};   // geometry per shape, material per sway amplitude (shared by everything that bends alike)
    function matFor(amp) { var k = amp.toFixed(3); return mats[k] || (mats[k] = windMaterial(THREE, uTime, amp)); }
    function geoFor(shape) { return geos[shape] || (geos[shape] = shape === 'grass' ? S.grass(THREE) : S.SHAPES[shape](THREE)); }

    // One pool: its entries, shape, tints and sway all come from the plan and the data rows.
    function addPool(name, plantId, entries, shape, tints, sway, kind) {
      if (!entries.length || (shape !== 'grass' && !S.SHAPES[shape])) return;
      var size = P.poolSize(kind, entries.length);
      var mesh = new THREE.InstancedMesh(geoFor(shape), matFor(sway), size);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));   // creates instanceColor; the pool writes its array directly
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;   // instances are anywhere around the player; the geometry's own sphere would cull them wrongly
      mesh.name = name;
      mesh.userData.groundCover = true;
      if (plantId) mesh.userData.plant = plantId;
      group.add(mesh);
      meshes.push(mesh);
      pools.push({ mesh: mesh, entries: entries, grid: P.makeGrid(entries), colors: colorsFor(THREE, entries, tints), picked: new Int32Array(size) });
    }

    var plan = P.plan();
    SA.map.STRIPS.forEach(function (strip) {
      var grass = plan.filter(function (e) { return e.biome === strip.id && e.kind === 'grass'; });
      addPool('ground-cover-' + strip.id + '-grass', null, grass, 'grass', P.palette(strip.id).grass, GRASS_SWAY, 'grass');
    });
    P.plants().forEach(function (p) {
      var entries = plan.filter(function (e) { return e.plant === p.id; });
      addPool('ground-cover-' + p.biome + '-' + p.id, p.id, entries, p.shape, p.tints, p.sway, 'plant');
    });
    opts.scene.add(group);

    var lastX = 1e9, lastZ = 1e9;

    function fill(pool, px, pz) {
      var n = P.select(pool.grid, px, pz, RADIUS, pool.picked), m = pool.mesh.instanceMatrix.array, c = pool.mesh.instanceColor.array;
      for (var j = 0; j < n; j++) {
        var i = pool.picked[j], e = pool.entries[i], cs = Math.cos(e.rot) * e.scale, sn = Math.sin(e.rot) * e.scale, o = j * 16;
        m[o] = cs; m[o + 1] = 0; m[o + 2] = -sn; m[o + 3] = 0;
        m[o + 4] = 0; m[o + 5] = e.scale; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = sn; m[o + 9] = 0; m[o + 10] = cs; m[o + 11] = 0;
        m[o + 12] = e.x; m[o + 13] = e.y - 0.03; m[o + 14] = e.z; m[o + 15] = 1;
        c[j * 3] = pool.colors[i * 3]; c[j * 3 + 1] = pool.colors[i * 3 + 1]; c[j * 3 + 2] = pool.colors[i * 3 + 2];
      }
      pool.mesh.count = n;
      pool.mesh.instanceMatrix.needsUpdate = true;
      pool.mesh.instanceColor.needsUpdate = true;
    }

    return {
      group: group, meshes: meshes,
      update: function (dt) {
        uTime.value += dt || 0;
        var p = opts.getPlayer && opts.getPlayer();
        if (!p || (Math.abs(p.x - lastX) < REFILL && Math.abs(p.z - lastZ) < REFILL)) return;
        lastX = p.x; lastZ = p.z;
        for (var k = 0; k < pools.length; k++) fill(pools[k], p.x, p.z);
      },
      stats: function () { return { meshes: meshes.length, instances: meshes.reduce(function (s, m) { return s + m.count; }, 0) }; },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
