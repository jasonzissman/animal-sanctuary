/* SA.render.createGroundCover(THREE, { scene, getPlayer }): instanced grass tufts and tiny plants per biome (AS-0294).
 * Where things go is the pure, seeded SA.groundCoverPlan. Here each biome/kind is ONE THREE.InstancedMesh holding a fixed pool of
 * instances that is recycled around the player: every metre the player walks, SA.groundCoverPlan.select() picks the nearby entries
 * (dense close, thinning with distance) and their matrices and colours are written straight into the preallocated buffers.
 * Sway is a vertex-shader bend driven by one shared time uniform (onBeforeCompile), so update() allocates nothing.
 * Ground cover is soft: it is never added to the obstacle lists, so the player walks straight through it.
 *
 *   gc.group      THREE.Group (already added to the scene)      gc.update(dt)   advance the wind, refill the pools when the player moved
 *   gc.stats()    { meshes, instances }                          gc.meshes       the InstancedMeshes (tests)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var RADIUS = 30;        // metres around the player that get ground cover
  var REFILL = 1;         // refill the pools after the player moved this far
  var POOL = { grass: 1400, plant: 500 };
  var SWAY = { grass: '0.16', plant: '0.1' };   // bend (m) at the top of a unit-height shape

  /** Merge parts [{ geo, shade0, shade1 }] into one non-indexed BufferGeometry with a grey vertex-colour ramp (dark base, light tip). */
  function merge(THREE, parts) {
    var pos = [], nor = [], col = [];
    parts.forEach(function (p) {
      var g = p.geo.index ? p.geo.toNonIndexed() : p.geo, pa = g.attributes.position.array, na = g.attributes.normal.array;
      g.computeBoundingBox();
      var y0 = g.boundingBox.min.y, span = Math.max(0.001, g.boundingBox.max.y - y0);
      for (var i = 0; i < pa.length; i += 3) {
        pos.push(pa[i], pa[i + 1], pa[i + 2]); nor.push(na[i], na[i + 1], na[i + 2]);
        var s = p.shade0 + (p.shade1 - p.shade0) * Math.min(1, Math.max(0, (pa[i + 1] - y0) / span));
        col.push(s, s, s);
      }
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }

  /** One part, placed: tilted `lean` rad out toward `yaw`, standing at radius `off` from the tuft centre. */
  function placed(THREE, geo, yaw, lean, off, lift) {
    var m = new THREE.Matrix4().makeRotationY(yaw);
    m.multiply(new THREE.Matrix4().makeTranslation(off, lift, 0));
    m.multiply(new THREE.Matrix4().makeRotationZ(-lean));
    return geo.applyMatrix4(m);
  }

  /** A tuft: five thin tapered blades fanning out, each a different height. */
  function grassGeometry(THREE) {
    var parts = [], heights = [0.55, 0.42, 0.5, 0.36, 0.46];
    heights.forEach(function (h, i) {
      var blade = new THREE.ConeGeometry(0.045, h, 3);
      blade.translate(0, h / 2, 0);
      parts.push({ geo: placed(THREE, blade, i * 1.26, 0.18 + (i % 3) * 0.1, 0.05, 0), shade0: 0.55, shade1: 1 });
    });
    return merge(THREE, parts);
  }

  /** A tiny plant (fern / shrub): a ring of flat leaves around a short centre leaf. */
  function plantGeometry(THREE) {
    var parts = [];
    for (var i = 0; i < 6; i++) {
      var leaf = new THREE.ConeGeometry(0.11, 0.42, 4);
      leaf.scale(1, 1, 0.3); leaf.translate(0, 0.21, 0);
      parts.push({ geo: placed(THREE, leaf, i * 1.047, 0.85, 0.04, 0.02), shade0: 0.6, shade1: 1 });
    }
    var mid = new THREE.ConeGeometry(0.09, 0.32, 5);
    mid.translate(0, 0.16, 0);
    parts.push({ geo: mid, shade0: 0.75, shade1: 1.1 });
    return merge(THREE, parts);
  }

  function windMaterial(THREE, uTime, amp) {
    var m = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, specular: 0x000000 });
    m.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
          'float swayPhase = uTime * 1.7 + instanceMatrix[3].x * 0.45 + instanceMatrix[3].z * 0.6;\n' +
          'float swayBend = position.y * position.y * ' + amp + ';\n' +
          'transformed.x += sin(swayPhase) * swayBend;\n' +
          'transformed.z += cos(swayPhase * 0.8) * swayBend * 0.6;');
    };
    m.customProgramCacheKey = function () { return 'ground-cover-sway-' + amp; };
    return m;
  }

  function lerpTo(out, o, a, b, t) { out[o] = a[0] + (b[0] - a[0]) * t; out[o + 1] = a[1] + (b[1] - a[1]) * t; out[o + 2] = a[2] + (b[2] - a[2]) * t; }

  function rgb(THREE, hex) { var c = new THREE.Color(hex); return [c.r, c.g, c.b]; }

  /** Per-entry colour (3 floats each) across the biome palette: dark -> mid -> light by `tone`. */
  function colorsFor(THREE, entries, tints) {
    var cols = new Float32Array(entries.length * 3), p = tints.map(function (h) { return rgb(THREE, h); });
    entries.forEach(function (e, i) {
      if (e.tone < 0.5) lerpTo(cols, i * 3, p[0], p[1], e.tone * 2); else lerpTo(cols, i * 3, p[1], p[2], (e.tone - 0.5) * 2);
    });
    return cols;
  }

  SA.render.createGroundCover = function (THREE, opts) {
    var P = SA.groundCoverPlan, group = new THREE.Group(), meshes = [], pools = [], uTime = { value: 0 };
    group.name = 'ground-cover';
    var geos = { grass: grassGeometry(THREE), plant: plantGeometry(THREE) };
    var mats = { grass: windMaterial(THREE, uTime, SWAY.grass), plant: windMaterial(THREE, uTime, SWAY.plant) };
    var plan = P.plan();
    SA.map.STRIPS.forEach(function (strip) {
      var pal = P.palette(strip.id);
      ['grass', 'plant'].forEach(function (kind) {
        var entries = plan.filter(function (e) { return e.biome === strip.id && e.kind === kind; });
        if (!entries.length) return;
        var mesh = new THREE.InstancedMesh(geos[kind], mats[kind], POOL[kind]);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.setColorAt(0, new THREE.Color(1, 1, 1));   // creates instanceColor; the pool writes its array directly
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.frustumCulled = false;   // instances are anywhere around the player; the geometry's own sphere would cull them wrongly
        mesh.name = 'ground-cover-' + strip.id + '-' + kind;
        mesh.userData.groundCover = true;
        group.add(mesh);
        meshes.push(mesh);
        pools.push({ mesh: mesh, entries: entries, grid: P.makeGrid(entries), colors: colorsFor(THREE, entries, pal[kind]), picked: new Int32Array(POOL[kind]) });
      });
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
