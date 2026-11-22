/* SA.render.createPickups(THREE, { getPlayer, trees, avoid?, seed?, container? }) -> { group, world, update(dt), collectNear(radius) }
 * Draws the collectable finds from SA.pickups (game/pickups.js): each one is the item's low-poly model (the same spec as the
 * hand model) that bobs, spins and sparkles. Walking into one collects it; so does Space next to one. Collecting adds it to
 * SA.inventory (inside SA.pickups), plays the pop SFX, speaks "¡Un plátano!" (vocab key found:<item>) and shows it in a bubble.
 * A collected find disappears and pops back in when its respawn time is up. All placement/respawn logic is in SA.pickups.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var MODEL_SCALE = 2.2;     // hand models are small; on the ground they should read from the chase camera
  var TOAST_SECONDS = 1.8;
  var GROW_SECONDS = 0.4;

  SA.render.createPickups = function (THREE, opts) {
    var world = SA.pickups.create({ trees: opts.trees, avoid: opts.avoid, seed: opts.seed });
    var group = new THREE.Group();
    group.name = 'pickups';
    var protos = {}, sparkMat = new THREE.MeshBasicMaterial({ color: 0xfff3a0 }), sparkGeo = new THREE.OctahedronGeometry(0.09, 0);
    var nodes = {};
    var t = 0, toast = null, toastLeft = 0;

    function modelFor(item) {
      if (!protos[item]) protos[item] = SA.render.buildItemModel(THREE, item);
      return protos[item] ? protos[item].clone() : new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), sparkMat);
    }

    world.list().forEach(function (s, i) {
      var g = new THREE.Group(), m = modelFor(s.item), sp = [];
      m.scale.setScalar(MODEL_SCALE);
      g.add(m);
      for (var k = 0; k < 2; k++) { var d = new THREE.Mesh(sparkGeo, sparkMat); sp.push(d); g.add(d); }
      g.position.set(s.x, s.y, s.z);
      g.userData = { pickup: s.id };
      group.add(g);
      nodes[s.id] = { g: g, model: m, spark: sp, phase: i * 1.7, grow: 1, y: s.y };
    });

    function showToast(item) {
      var doc = root.document, def = SA.data.get('items', item), v = SA.vocab && SA.vocab.get ? SA.vocab.get('found:' + item) : null;
      if (!doc || !def) return;
      if (!toast) {
        toast = doc.createElement('div');
        toast.setAttribute('aria-live', 'polite');
        toast.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:3;pointer-events:none;display:none;' +
          'align-items:center;gap:.4em;padding:.3em .9em;background:#fff;color:#24543a;border:.1em solid #24543a;border-radius:1em;' +
          'box-shadow:0 .15em .6em rgba(0,0,0,.3);font:700 2rem system-ui,sans-serif;white-space:nowrap;';
        (opts.container || doc.body).appendChild(toast);
      }
      toast.textContent = def.icon + ' ' + (v ? v.es : def.name.es);
      toast.style.display = 'flex';
      toastLeft = TOAST_SECONDS;
    }

    function celebrate(got) {
      if (SA.audio) {
        try { SA.audio.sfx('pop'); } catch (e) { /* sound is best effort */ }
        try { SA.audio.say('found:' + got.item); } catch (e) { /* speech is best effort */ }
      }
      showToast(got.item);
      if (nodes[got.id]) nodes[got.id].g.visible = false;
      if (root.SAT && root.SAT.track) root.SAT.track('pickup.collect', { item: got.item, where: got.spot.where, biome: got.spot.biome });
    }

    function collectNear(radius) {
      var p = opts.getPlayer && opts.getPlayer();
      var got = p ? world.collectNear(p, radius) : null;
      if (got) celebrate(got);
      return got;
    }

    function update(dt) {
      t += dt;
      world.update(dt).forEach(function (s) { var n = nodes[s.id]; if (n) { n.grow = 0; n.g.visible = true; } });
      collectNear(SA.pickups.WALK_RADIUS);   // walking into one collects it
      var id, n;
      for (id in nodes) {
        n = nodes[id];
        if (!n.g.visible) continue;
        n.grow = Math.min(1, n.grow + dt / GROW_SECONDS);
        n.g.scale.setScalar(0.01 + 0.99 * n.grow);
        n.g.position.y = n.y + 0.14 * Math.sin(t * 2.2 + n.phase);
        n.model.rotation.y = t * 1.4 + n.phase;
        for (var k = 0; k < n.spark.length; k++) {
          var a = t * 2 + n.phase + k * Math.PI, pulse = 0.5 + 0.5 * Math.sin(t * 5 + n.phase + k * 2);
          n.spark[k].position.set(Math.cos(a) * 0.45, 0.35 + 0.25 * Math.sin(a * 1.3), Math.sin(a) * 0.45);
          n.spark[k].scale.setScalar(0.3 + pulse);
        }
      }
      if (toastLeft > 0) { toastLeft -= dt; if (toastLeft <= 0 && toast) toast.style.display = 'none'; }
    }

    // Space next to a find picks it up (a wider radius than walking into it). Space does nothing otherwise here.
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('keydown', function (e) {
        if (e.key !== ' ' && e.code !== 'Space') return;
        var tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
        collectNear(SA.pickups.SPACE_RADIUS);
      });
    }

    return { group: group, world: world, update: update, collectNear: collectNear };
  };
})(typeof window !== 'undefined' ? window : globalThis);
