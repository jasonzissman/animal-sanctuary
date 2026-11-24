/* SA.render.createRopeBridge(THREE, { scene }): draws the montaña's rope-and-plank bridge (SA.ropeBridge, AS-0159) as ONE merged mesh of flat-coloured boxes:
 * planks across the deck at exactly the standing height SA.surfaces gives the player, two rope rails (a top and a low rope) with posts along both sides,
 * and a stake at each end. Built once. The whole mesh sways gently (a tiny roll about the deck's axis and a small bob) and sways a bit more when someone is on
 * it; this is VISUAL ONLY: the walking surface and the rails come from SA.surfaces and never move. A soft 'creak' plays while you walk on it.
 * Needs SA.render.deckBox (game/render/bridges.js), SA.ropeBridge and SA.surfaces.
 *
 *   rb.group  THREE.Group (already in the scene)   rb.mesh  the merged mesh, named 'rope-bridge'   rb.stats() { triangles }
 *   rb.update(dt, player)   player { x, y, z }: sway time, creak sounds (SA.audio.sfx; silent when muted). Allocates nothing per frame beyond the creak event.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var PLANK = 0.46, PLANK_T = 0.1, TOP = 0.95, LOW = 0.5, STEP = 1.2, POST_STEP = 2.4;
  var WOOD = [[0.6, 0.43, 0.25], [0.52, 0.37, 0.21]], ROPE = [0.78, 0.68, 0.48], DARK = [0.38, 0.26, 0.15];

  function build(THREE, d, out) {
    var S = SA.surfaces, box = SA.render.deckBox, k, side;
    function at(u, v) { return [d.x + d.dx * u - d.dz * v, d.z + d.dz * u + d.dx * v]; }
    function slopeAt(u) { var e = 0.2; return (S.topAt(d, u + e) - S.topAt(d, u - e)) / (2 * e); }
    var n = Math.floor(2 * d.halfLen / PLANK);
    for (k = 0; k < n; k++) {   // planks
      var u = -d.halfLen + (k + 0.5) * (2 * d.halfLen / n), p = at(u, 0);
      box(THREE, out, d, [p[0], S.topAt(d, u) - PLANK_T / 2 + 0.02, p[1]], PLANK - 0.05, PLANK_T, 2 * d.halfWid - 0.1, slopeAt(u), WOOD[k % 2]);
    }
    var rail = d.halfWid - d.railR, segs = Math.max(1, Math.round(2 * d.halfLen / STEP)), segLen = 2 * d.halfLen / segs;
    for (side = -1; side <= 1; side += 2) {
      for (k = 0; k < segs; k++) {   // the two ropes, one short pitched box per segment so they follow the deck's slope
        var su = -d.halfLen + (k + 0.5) * segLen, sp = at(su, rail * side), sl = slopeAt(su), top = S.topAt(d, su);
        box(THREE, out, d, [sp[0], top + TOP, sp[1]], segLen + 0.02, 0.09, 0.09, sl, ROPE);
        box(THREE, out, d, [sp[0], top + LOW, sp[1]], segLen + 0.02, 0.07, 0.07, sl, ROPE);
      }
      var posts = Math.max(1, Math.round(2 * d.halfLen / POST_STEP));
      for (k = 0; k <= posts; k++) {
        var pu = -d.halfLen + (2 * d.halfLen * k) / posts, pp = at(pu, rail * side), ptop = S.topAt(d, pu);
        box(THREE, out, d, [pp[0], ptop + TOP / 2 - 0.05, pp[1]], 0.14, TOP + 0.1, 0.14, 0, DARK);
      }
    }
    [-1, 1].forEach(function (e) {   // a chunky stake across each end, where the ropes are tied to the summit
      var q = at(e * (d.halfLen - 0.1), 0);
      box(THREE, out, d, [q[0], S.topAt(d, e * d.halfLen) + 0.15, q[1]], 0.2, 0.3, 2 * d.halfWid + 0.2, 0, DARK);
    });
  }

  SA.render.createRopeBridge = function (THREE, opts) {
    var d = SA.ropeBridge && SA.ropeBridge.get();
    if (!d || !SA.render.deckBox) return null;
    var pivot = [d.x, d.y, d.z], out = { pos: [], col: [], idx: [] }, group = new THREE.Group();
    group.name = 'rope-bridge-group';
    build(THREE, d, out);
    for (var i = 0; i < out.pos.length; i += 3) { out.pos[i] -= pivot[0]; out.pos[i + 1] -= pivot[1]; out.pos[i + 2] -= pivot[2]; }   // sway about the deck's middle
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
    geo.setIndex(out.idx);
    geo.computeVertexNormals();
    var mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, specular: 0x000000 }));
    mesh.name = 'rope-bridge';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    group.position.set(pivot[0], pivot[1], pivot[2]);
    opts.scene.add(group);

    var axis = new THREE.Vector3(d.dx, 0, d.dz), time = 0, weight = 0, creak = SA.ropeBridge.create(), last = null;
    function update(dt, player) {
      if (!(dt > 0)) return;
      time += dt;
      var h = player && SA.surfaces.ropeSolidsAt(player.x, player.z, player.y) ? SA.surfaces.heightAt(player.x, player.z, player.y) : null;
      var on = h !== null && Math.abs(player.y - h) < 0.8;
      weight += ((on ? 1 : 0) - weight) * Math.min(1, dt * 2);
      var moved = !!(last && player && Math.hypot(player.x - last.x, player.z - last.z) > 1e-4);
      last = player ? { x: player.x, z: player.z } : null;
      var c = SA.ropeBridge.creak(creak, { onDeck: on, moving: moved }, dt);
      creak = c.state;
      if (c.event && SA.audio && SA.audio.sfx) SA.audio.sfx(c.event.sfx, c.event.volume, c.event.rate);
      var sw = SA.ropeBridge.sway(time, weight);
      group.quaternion.setFromAxisAngle(axis, sw.roll);
      group.position.y = pivot[1] + sw.lift;
    }
    return { group: group, mesh: mesh, update: update, stats: function () { return { triangles: out.idx.length / 3 }; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
