/* SA.render.createGrotto(THREE, { scene, falls?, container?, reachCue? }) -> { update(dt, player), stats() }: the hidden grottos behind the waterfalls (AS-0174).
 * Geometry comes from SA.grottoPlan (a tunnel through the middle cliff block that the water curtain hides, then a round rock cave on the terrain), what was
 * found from SA.treasure. Per grotto: an inner rock dome (always drawn) and an outer rock shell (hidden while you stand inside, with the cliff meshes of
 * `falls[id].cliffMeshes`, so the chase camera sees in), a few glowing crystals, and an old wooden chest (el cofre).
 *   Walking through the curtain: a splash sound and water drips run down the screen (a DOM overlay, ~1.6 s, never blocks input).
 *   Walking up to the chest opens it: the lid creaks up, golden light and sparkles, "¡Un tesoro!" (spoken) and then the reward's name; SA.treasure.open() then
 *   saves it once and tells the sticker book. A chest opened before (a reload) is drawn open and quiet. Only SA.grottoPlan.zone() allocates (one small object per frame, and only within 14 m of a fall).
 * Only code here touches THREE.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SPARKS = 10, CRYSTALS = 7, LID_OPEN = 1.9, T_LID = 1.1, T_CUE = 0.6, T_SAVE = 2.4, T_REWARD = 3.0, T_END = 5.2, DRIP_FOR = 1.7;
  var CRYSTAL_COLORS = [0x6fe8ff, 0xff8fe0, 0xffe36a, 0x9fffa8];

  function mat(THREE, color, extra) {
    return new THREE.MeshPhongMaterial(Object.assign({ color: color, flatShading: true, specular: 0x000000 }, extra || {}));
  }
  function glowMat(THREE, color, opacity) {
    return new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  }

  SA.render.createGrotto = function (THREE, opts) {
    opts = opts || {};
    var GP = SA.grottoPlan, views = [], dripEl = null, dripLeft = 0;
    if (!GP) return { update: function () {}, stats: function () { return { grottos: 0 }; } };

    function ground(site, lx, lz) { var w = GP.toWorld(site, lx, lz); return SA.map.groundHeight(w.x, w.z); }

    function dome(THREE_, site, radius, material, side, y) {
      var open = site.chamber.open, gapHalf = 0.95, g = Math.PI - open;   // sphere phi 0 points to local -x; the gap faces the tunnel
      var geo = new THREE_.SphereGeometry(radius, 14, 7, g + gapHalf, Math.PI * 2 - 2 * gapHalf, 0, Math.PI / 2);
      var m = new THREE_.Mesh(geo, material);
      material.side = side;
      m.scale.y = 1.2;
      m.position.set(site.chamber.lx, y, site.chamber.lz);
      return m;
    }

    function buildChest(site, y) {
      var c = new THREE.Group(), wood = mat(THREE, '#8a5a2b'), iron = mat(THREE, '#4b4b55'), gold = new THREE.MeshBasicMaterial({ color: 0xffd54a });
      c.position.set(site.chest.lx, y, site.chest.lz);
      c.rotation.y = -site.chamber.open;   // its front (+x) faces the way in
      var body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.9), wood); body.position.y = 0.225; c.add(body);
      [-0.2, 0.2].forEach(function (x) { var b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.47, 0.92), iron); b.position.set(x, 0.235, 0); c.add(b); });
      var coins = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 8), gold); coins.position.y = 0.46; c.add(coins);
      var pivot = new THREE.Group(); pivot.position.set(-0.3, 0.45, 0); c.add(pivot);
      var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8, 1, false, Math.PI / 2, Math.PI), wood);
      lid.rotation.x = Math.PI / 2; lid.position.x = 0.3; pivot.add(lid);
      var band = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.08, 8, 1, false, Math.PI / 2, Math.PI), iron);
      band.rotation.x = Math.PI / 2; band.position.set(0.3, 0, 0.25); pivot.add(band);
      var lock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.1), gold); lock.position.set(0.31, 0.42, 0); c.add(lock);
      return { group: c, pivot: pivot };
    }

    function build(site) {
      var group = new THREE.Group(), floor = Infinity, i;
      group.name = 'grotto-' + site.id;
      group.position.set(site.origin.x, 0, site.origin.z);
      group.rotation.y = site.yaw;
      for (i = 0; i < 12; i++) { var a = i / 12 * Math.PI * 2; floor = Math.min(floor, ground(site, site.chamber.lx + Math.cos(a) * site.chamber.r, site.chamber.lz + Math.sin(a) * site.chamber.r)); }
      floor = Math.min(floor, ground(site, site.chamber.lx, site.chamber.lz)) - 0.3;
      var R = site.chamber.r, moss = site.id === 'selva';
      var inner = dome(THREE, site, R, mat(THREE, '#5b4f66'), THREE.BackSide, floor);
      var outer = dome(THREE, site, R + 0.18, mat(THREE, moss ? '#667a5c' : '#8d9096'), THREE.FrontSide, floor);
      inner.name = 'grotto-inner'; outer.name = 'grotto-outer';
      group.add(inner); group.add(outer);

      var crystalGeo = new THREE.ConeGeometry(0.17, 0.85, 5), crystals = [];
      for (i = 0; i < CRYSTALS; i++) {   // round the back wall, away from the way in (deterministic spread)
        var ang = site.chamber.open + Math.PI + (i - (CRYSTALS - 1) / 2) * 0.62, cx = site.chamber.lx + Math.cos(ang) * (R - 0.35), cz = site.chamber.lz + Math.sin(ang) * (R - 0.35);
        var cm = new THREE.Mesh(crystalGeo, new THREE.MeshBasicMaterial({ color: CRYSTAL_COLORS[i % CRYSTAL_COLORS.length], fog: false }));
        cm.position.set(cx, ground(site, cx, cz) + 0.3, cz);
        cm.rotation.set((i % 3 - 1) * 0.25, i, (i % 2 ? 0.2 : -0.2));
        cm.scale.setScalar(0.8 + (i % 3) * 0.25);
        group.add(cm); crystals.push(cm);
      }

      var chestY = ground(site, site.chest.lx, site.chest.lz), chest = buildChest(site, chestY);
      group.add(chest.group);
      var glow = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), glowMat(THREE, 0xffd24a, 0));
      glow.position.set(site.chest.lx, chestY + 0.55, site.chest.lz); glow.visible = false; glow.renderOrder = 3; group.add(glow);
      var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.8, 3.2, 10, 1, true), glowMat(THREE, 0xffe27a, 0));
      beam.position.set(site.chest.lx, chestY + 1.9, site.chest.lz); beam.visible = false; beam.renderOrder = 3; group.add(beam);
      var sparkGeo = new THREE.OctahedronGeometry(0.07), sparks = [];
      for (i = 0; i < SPARKS; i++) {
        var s = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xfff0a0 : 0xffc83a, fog: false }));
        s.visible = false; group.add(s); sparks.push(s);
      }
      opts.scene.add(group);
      var fall = opts.falls && opts.falls[site.id];
      var v = { site: site, group: group, outer: outer, crystals: crystals, chest: chest, glow: glow, beam: beam, sparks: sparks, chestY: chestY, fall: fall,
        open: SA.treasure ? SA.treasure.isOpen(site.id) : false, t: -1, saved: false, said: false, rewardShown: false, hidden: false, lastLx: 99 };
      if (v.open) setLid(v, 1);
      views.push(v);
    }

    function setLid(v, k) { v.chest.pivot.rotation.z = LID_OPEN * k; }
    function showHidden(v, hide) {
      if (v.hidden === hide) return;
      v.hidden = hide;
      v.outer.visible = !hide;
      if (v.fall && v.fall.cliffMeshes) for (var i = 0; i < v.fall.cliffMeshes.length; i++) v.fall.cliffMeshes[i].visible = !hide;
    }

    function showDrips() {
      var doc = root.document;
      if (!doc || !opts.container) return;
      if (!dripEl) {
        var st = doc.createElement('style');
        st.textContent = '.sa-drips{position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:2;display:none;overflow:hidden}' +
          '.sa-drips i{position:absolute;top:-8%;width:1vmin;height:3vmin;border-radius:50%;background:rgba(190,232,255,.8)}' +
          '.sa-drips.on{animation:sa-wet 1.6s ease-out forwards}.sa-drips.on i{animation:sa-drip 1.4s ease-in forwards}' +
          '@keyframes sa-drip{from{transform:translateY(0);opacity:.9}to{transform:translateY(118vh);opacity:.2}}' +
          '@keyframes sa-wet{from{background:rgba(150,214,240,.4)}to{background:rgba(150,214,240,0)}}';
        doc.head.appendChild(st);
        dripEl = doc.createElement('div');
        dripEl.className = 'sa-drips';
        dripEl.setAttribute('aria-hidden', 'true');
        for (var i = 0; i < 12; i++) { var d = doc.createElement('i'); d.style.left = (4 + i * 8.1 + (i % 3) * 1.7) + '%'; d.style.animationDelay = ((i * 0.37) % 0.55) + 's'; dripEl.appendChild(d); }
        opts.container.appendChild(dripEl);
      }
      dripEl.style.display = 'block';
      dripEl.classList.remove('on');
      void dripEl.offsetWidth;   // restart the animation
      dripEl.classList.add('on');
      dripLeft = DRIP_FOR;
    }

    function cue(icon, es) { try { if (opts.reachCue && opts.reachCue.show) opts.reachCue.show({ icon: icon, es: es }); } catch (e) { /* a cue never breaks play */ } }
    function sfx(name, vol) { try { if (SA.audio && SA.audio.sfx) SA.audio.sfx(name, vol); } catch (e) { /* silent when audio is missing */ } }

    function startOpening(v) {
      v.t = 0; v.saved = false; v.said = false; v.rewardShown = false;
      v.glow.visible = true; v.beam.visible = true;
      sfx('creak', 0.9);
    }

    function stepOpening(v, dt) {
      v.t += dt;
      var t = v.t, k = Math.min(1, t / T_LID);
      setLid(v, 1 - (1 - k) * (1 - k));
      if (t > T_CUE && !v.said) {
        v.said = true; sfx('fanfare', 0.8); sfx('sparkle', 0.7);
        var line = SA.treasure ? SA.treasure.line : { es: '¡Un tesoro!', key: 'phrase:untesoro' };
        cue('💎', line.es);
        try { if (SA.audio && SA.audio.say) SA.audio.say(line.key); } catch (e) { /* the text is shown anyway */ }
      }
      if (t > T_SAVE && !v.saved) { v.saved = true; v.open = true; if (SA.treasure) SA.treasure.open(v.site.id); }
      if (t > T_REWARD && !v.rewardShown) {
        v.rewardShown = true;
        var r = SA.treasure && SA.treasure.rewards[v.site.id];
        if (r) cue(r.icon, r.es);
      }
      var u = Math.min(1, t / 1.4), fade = t > 3.6 ? Math.max(0, 1 - (t - 3.6) / 1.6) : 1;
      v.glow.material.opacity = 0.55 * u * fade;
      v.glow.scale.setScalar(0.8 + u * 0.9 + Math.sin(t * 7) * 0.05);
      v.beam.material.opacity = 0.4 * u * fade;
      for (var i = 0; i < SPARKS; i++) {
        var s = v.sparks[i], life = ((t * 0.5 + i * 0.1) % 1), a = i * 2.4;
        s.visible = t > 0.4 && fade > 0;
        s.position.set(v.site.chest.lx + Math.cos(a) * life * 0.9, v.chestY + 0.6 + life * 2.4, v.site.chest.lz + Math.sin(a) * life * 0.9);
        s.scale.setScalar(Math.max(0.01, (1 - life) * 1.6) * fade);
        s.rotation.y = t * 4 + i;
      }
      if (t > T_END) { v.t = -1; v.glow.visible = false; v.beam.visible = false; for (var j = 0; j < SPARKS; j++) v.sparks[j].visible = false; }
    }

    GP.sites().forEach(function (site) {
      try { build(site); } catch (e) { if (root.SAT && root.SAT.error) root.SAT.error('grotto.create', e); }
    });

    var clock = 0;
    return {
      views: views,
      update: function (dt, player) {
        dt = dt || 0; clock += dt;
        if (dripLeft > 0) { dripLeft -= dt; if (dripLeft <= 0 && dripEl) dripEl.style.display = 'none'; }
        var i, v, z = player ? GP.zone(player.x, player.z) : null;
        for (i = 0; i < views.length; i++) {
          v = views[i];
          for (var c = 0; c < v.crystals.length; c++) v.crystals[c].scale.y = 0.9 + 0.12 * Math.sin(clock * 2 + c * 1.3);
          if (v.open && v.t < 0) { v.glow.visible = false; }
          if (v.t >= 0) stepOpening(v, dt);
          var mine = z && z.site === v.site;
          showHidden(v, !!(mine && z.zone === 'chamber'));
          if (mine) {   // through the curtain: a splash and drips on the screen
            if (Math.abs(z.lz) < GP.HALF_W + 0.3 && ((v.lastLx > 0.2 && z.lx <= 0.2) || (v.lastLx < -0.1 && z.lx >= -0.1 && v.lastLx > -3))) { sfx('splash', 0.9); showDrips(); }
            v.lastLx = z.lx;
          } else v.lastLx = 99;
        }
        var near = player ? GP.nearChest(player.x, player.z) : null;
        if (near) for (i = 0; i < views.length; i++) if (views[i].site === near && !views[i].open && views[i].t < 0) startOpening(views[i]);
      },
      stats: function () { return { grottos: views.length, sparks: SPARKS, crystals: CRYSTALS }; }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
