/* SA.render.createNeedIcons(THREE, { scene, animals, doc? }) -> { update(dt, needs), count(), group }
 * The small emoji that floats above an animal that needs help (AS-0245, part of AS-0179). Only game/render/* touches THREE.
 *
 *   icons.update(dt, needs)   once per frame. needs = [{ animalId, icon }] (SA.encounterFlow.needs(), via stage.getNeeds); an empty list
 *                             or null hides every icon. Each icon bobs gently over its animal's head and follows it (position only).
 *
 * The picture is drawn on a tiny canvas (an emoji as text, one texture per distinct emoji, made once and reused); no image files. One pooled
 * sprite per needy animal is made on first use and reused, nothing is allocated per frame. Sprites have no raycast, so they never block
 * picking. Without a canvas (doc missing) it quietly does nothing: the ring and prompt still work.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SIZE = 64, ICON_SCALE = 0.9, LIFT = 0.55, BOB = 0.12, BOB_SPEED = 2.4;

  // Height of an animal from its part meshes (group-local; pick volumes are ignored), like the task ring's measure.
  function heightOf(group) {
    var h = 0;
    (group.children || []).forEach(function (m) {
      if (!m || !m.position || !m.scale || (m.userData && m.userData.pick)) return;
      h = Math.max(h, m.position.y + m.scale.y / 2);
    });
    return Math.max(0.6, Math.min(h, 5));
  }

  SA.render.createNeedIcons = function (THREE, opts) {
    var doc = opts.doc || (typeof root.document !== 'undefined' ? root.document : null);
    var group = new THREE.Group();
    group.name = 'needIcons';
    opts.scene.add(group);
    var textures = {};        // emoji -> texture
    var sprites = {};         // animalId -> { sprite, icon, h }
    var t = 0, shown = 0;

    function textureFor(icon) {
      if (textures[icon] !== undefined) return textures[icon];
      var tex = null;
      try {
        var canvas = doc && doc.createElement('canvas');
        var ctx = canvas && canvas.getContext && canvas.getContext('2d');
        if (ctx) {
          canvas.width = SIZE; canvas.height = SIZE;
          ctx.clearRect(0, 0, SIZE, SIZE);
          ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);      // a soft white bubble so any emoji reads on the grass
          ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
          ctx.font = '38px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#000'; ctx.fillText(icon, SIZE / 2, SIZE / 2 + 3);
          tex = new THREE.CanvasTexture(canvas);
        }
      } catch (e) { tex = null; }
      textures[icon] = tex;
      return tex;
    }

    function spriteFor(animalId, icon, g) {
      var rec = sprites[animalId];
      if (rec && rec.icon === icon) return rec;
      var tex = textureFor(icon);
      if (!tex) return null;
      if (!rec) {
        var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
        sprite.raycast = function () {};
        sprite.scale.set(ICON_SCALE, ICON_SCALE, 1);
        sprite.name = 'needIcon';
        group.add(sprite);
        rec = sprites[animalId] = { sprite: sprite, icon: icon, h: heightOf(g) };
      } else { rec.sprite.material.map = tex; rec.sprite.material.needsUpdate = true; rec.icon = icon; }
      return rec;
    }

    function update(dt, needs) {
      t += dt > 0 ? dt : 0;
      var live = {};
      shown = 0;
      (needs || []).forEach(function (n) {
        if (!n || typeof n.animalId !== 'string' || !n.icon) return;
        var g = opts.animals ? SA.render.instances.get(opts.animals, n.animalId) : null;   // AS-0255: the nearest instance of the species
        if (!g || !g.visible) return;
        var rec = spriteFor(n.animalId, n.icon, g);
        if (!rec) return;
        live[n.animalId] = true;
        rec.sprite.visible = true;
        rec.sprite.position.set(g.position.x, g.position.y + rec.h + LIFT + Math.sin(t * BOB_SPEED) * BOB, g.position.z);
        shown++;
      });
      Object.keys(sprites).forEach(function (id) { if (!live[id]) sprites[id].sprite.visible = false; });
    }

    return { update: update, count: function () { return shown; }, group: group };
  };
})(typeof window !== 'undefined' ? window : globalThis);
