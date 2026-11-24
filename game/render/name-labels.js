/* SA.render.createNameLabels(THREE, { scene, animals, doc? }) -> { update(dt, player), count(), group }
 * The pet name ('Luna la rápida') that floats above a named animal while the player is near it (AS-0169). Only game/render/* touches THREE.
 *
 *   labels.update(dt, player)   once per frame; player = { x, z } (rig.getPlayer()). Every individual in SA.names.friends() whose group
 *                               (SA.render.instances.byId: the herd instance 'conejo#2') is visible and within SHOW_RANGE of the player gets
 *                               its label, bobbing over its head; the label fades out towards FADE_FROM. No player or no names hides all.
 *
 * Each distinct text is drawn once on a small canvas (white pill, dark text; no image files) and reused; sprites are pooled per individual and
 * never raycast, so they cannot block picking. Without a canvas it quietly does nothing.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SHOW_RANGE = 9, FADE_FROM = 6.5, LIFT = 0.45, BOB = 0.06, BOB_SPEED = 2;
  var W = 320, H = 64, WORLD_H = 0.5;

  function heightOf(group) {
    var h = 0;
    (group.children || []).forEach(function (m) {
      if (!m || !m.position || !m.scale || (m.userData && m.userData.pick)) return;
      h = Math.max(h, m.position.y + m.scale.y / 2);
    });
    return Math.max(0.6, Math.min(h, 5));
  }

  SA.render.createNameLabels = function (THREE, opts) {
    var doc = opts.doc || (typeof root.document !== 'undefined' ? root.document : null);
    var group = new THREE.Group();
    group.name = 'nameLabels';
    opts.scene.add(group);
    var textures = {}, sprites = {}, t = 0, shown = 0;

    function textureFor(text) {
      if (textures[text] !== undefined) return textures[text];
      var tex = null;
      try {
        var canvas = doc && doc.createElement('canvas');
        var ctx = canvas && canvas.getContext && canvas.getContext('2d');
        if (ctx) {
          canvas.width = W; canvas.height = H;
          ctx.clearRect(0, 0, W, H);
          ctx.fillStyle = 'rgba(255,255,255,0.88)';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(2, 2, W - 4, H - 4, 24); else ctx.rect(2, 2, W - 4, H - 4);
          ctx.fill();
          ctx.font = '700 34px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#24543a'; ctx.fillText(text, W / 2, H / 2 + 2, W - 24);
          tex = new THREE.CanvasTexture(canvas);
        }
      } catch (e) { tex = null; }
      textures[text] = tex;
      return tex;
    }

    function spriteFor(id, text, g) {
      var rec = sprites[id];
      if (rec && rec.text === text) return rec;
      var tex = textureFor(text);
      if (!tex) return null;
      if (!rec) {
        var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
        sprite.raycast = function () {};
        sprite.scale.set(WORLD_H * W / H, WORLD_H, 1);
        sprite.name = 'nameLabel';
        group.add(sprite);
        rec = sprites[id] = { sprite: sprite, text: text, h: heightOf(g) };
      } else { rec.sprite.material.map = tex; rec.sprite.material.needsUpdate = true; rec.text = text; }
      return rec;
    }

    function update(dt, player) {
      t += dt > 0 ? dt : 0;
      var live = {};
      shown = 0;
      if (player && SA.names && opts.animals) {
        SA.names.friends().forEach(function (f) {
          var g = SA.render.instances.byId(opts.animals, f.id);
          if (!g || g.visible === false) return;
          var d = Math.hypot(g.position.x - player.x, g.position.z - player.z);
          if (d > SHOW_RANGE) return;
          var rec = spriteFor(f.id, f.text, g);
          if (!rec) return;
          live[f.id] = true;
          rec.sprite.visible = true;
          rec.sprite.material.opacity = d <= FADE_FROM ? 1 : Math.max(0, (SHOW_RANGE - d) / (SHOW_RANGE - FADE_FROM));
          rec.sprite.position.set(g.position.x, g.position.y + rec.h + LIFT + Math.sin(t * BOB_SPEED) * BOB, g.position.z);
          shown++;
        });
      }
      Object.keys(sprites).forEach(function (id) { if (!live[id]) sprites[id].sprite.visible = false; });
    }

    return { update: update, count: function () { return shown; }, group: group };
  };
})(typeof window !== 'undefined' ? window : globalThis);
