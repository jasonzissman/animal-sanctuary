/* SA.render.createPicking(THREE, { canvas, camera, animals, container }): pointer -> pick volumes -> SA.picking.
 * - Raycasts ONLY the pick volumes of the animals (animalGroup.userData.pickVolumes), never the whole scene,
 *   and lets SA.animalPlan.choosePick decide which overlapping volume the player meant.
 * - A tap is a pointerdown + pointerup that did not drag (SA.picking.createTapTracker), so camera drags and
 *   pinches never pick. Mouse hover brightens the part under the cursor; a tap glows it more, plays its
 *   reaction (data: part.reaction) and shows a big chip: icon + Spanish label (+ English if settings.english).
 * - Speaks the part's Spanish label with SA.audio.say('part:<key>') (respects mute).
 * - Calls SA.picking.emit({ animalId, part }) so round/care loops can subscribe with SA.picking.onPick.
 * Returns { update(dt), pickAt(clientX, clientY) -> {animalId, part, ...}|null }. Call update(dt) every frame.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var CHIP_SECONDS = 2.6, GLOW_SECONDS = 1.1;
  var GLOW = { 1: 0.28, 2: 0.6 };   // emissive strength: 1 = hover, 2 = tapped

  SA.render.createPicking = function (THREE, opts) {
    var canvas = opts.canvas, camera = opts.camera, animals = opts.animals, container = opts.container || root.document.body;
    var raycaster = new THREE.Raycaster();
    var ndc = new THREE.Vector2();
    var tracker = SA.picking.createTapTracker();
    var glowMats = {};
    var hovered = null;               // visible mesh currently under the mouse
    var tapped = [];                  // { mesh, left }
    var playing = [];                 // { mesh, reaction, t, base }
    var chip = null, chipLeft = 0;

    function volumes() {
      var out = [];
      animals.children.forEach(function (g) { if (g.userData && g.userData.pickVolumes) out = out.concat(g.userData.pickVolumes); });
      return out;
    }

    function pickAt(clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      var hit = SA.animalPlan.choosePick(raycaster.intersectObjects(volumes(), false));
      if (!hit) return null;
      var u = hit.object.userData;
      return { animalId: u.animalId, part: u.part, index: u.index, side: u.side || null, mesh: visibleMesh(u) };
    }

    function visibleMesh(u) {
      var g = animals.getObjectByName(u.animalId), found = null;
      if (g) g.children.forEach(function (m) {
        if (!m.userData.pick && m.userData.part === u.part && m.userData.index === u.index) found = m;
      });
      return found;
    }

    function setGlow(mesh, level) {
      if (!mesh) return;
      if (!mesh.userData.baseMaterial) mesh.userData.baseMaterial = mesh.material;
      var base = mesh.userData.baseMaterial;
      if (!level) { mesh.material = base; return; }
      var key = base.uuid + ':' + level;
      if (!glowMats[key]) {
        glowMats[key] = base.clone();
        glowMats[key].emissive = new THREE.Color(0xffffff);
        glowMats[key].emissiveIntensity = GLOW[level];
      }
      mesh.material = glowMats[key];
    }

    function setHover(mesh) {
      if (mesh === hovered) return;
      if (hovered && !isTapped(hovered)) setGlow(hovered, 0);
      hovered = mesh;
      if (hovered && !isTapped(hovered)) setGlow(hovered, 1);
    }

    function isTapped(mesh) { return tapped.some(function (t) { return t.mesh === mesh; }); }

    function react(mesh, name) {
      playing = playing.filter(function (p) {
        if (p.mesh !== mesh) return true;
        restore(p);
        return false;
      });
      playing.push({ mesh: mesh, reaction: name, t: 0, base: {
        pos: mesh.position.clone(), rot: mesh.rotation.clone(), scale: mesh.scale.clone() } });
    }

    function restore(p) {
      p.mesh.position.copy(p.base.pos);
      p.mesh.rotation.copy(p.base.rot);
      p.mesh.scale.copy(p.base.scale);
    }

    function showChip(label) {
      if (!chip) {
        chip = root.document.createElement('div');
        chip.setAttribute('aria-live', 'polite');
        chip.style.cssText = 'position:fixed;left:50%;bottom:8%;transform:translateX(-50%);z-index:3;' +
          'pointer-events:none;display:none;align-items:center;gap:.6em;padding:.35em .9em;' +
          'background:#fff;color:#24543a;border:.12em solid #24543a;border-radius:1em;' +
          'box-shadow:0 .15em .6em rgba(0,0,0,.3);font:700 2.4rem system-ui,sans-serif;';
        container.appendChild(chip);
      }
      chip.innerHTML = '';
      var icon = root.document.createElement('span');
      icon.textContent = label.icon;
      var es = root.document.createElement('span');
      es.textContent = label.es;
      chip.appendChild(icon);
      chip.appendChild(es);
      if (label.en) {
        var en = root.document.createElement('small');
        en.style.cssText = 'font-size:.5em;font-weight:500;opacity:.75';
        en.textContent = label.en;
        chip.appendChild(en);
      }
      chip.style.display = 'flex';
      chipLeft = CHIP_SECONDS;
    }

    function tap(x, y) {
      var hit = pickAt(x, y);
      if (!hit || !hit.mesh) return;
      var def = SA.data.get('parts', hit.part);
      tapped.forEach(function (t) { if (t.mesh !== hit.mesh) setGlow(t.mesh, t.mesh === hovered ? 1 : 0); });
      tapped = [{ mesh: hit.mesh, left: GLOW_SECONDS }];
      setGlow(hit.mesh, 2);
      react(hit.mesh, def ? def.reaction : 'wobble');
      var settings = (SA.save && SA.save.get && SA.save.get().settings) || {};
      var label = SA.picking.labelFor(hit.animalId, hit.part, !!settings.english);
      if (label) showChip(label);
      if (SA.audio && SA.audio.say) SA.audio.say('part:' + hit.part);
      SA.picking.emit({ animalId: hit.animalId, part: hit.part });
    }

    canvas.addEventListener('pointerdown', function (e) { tracker.down(e.pointerId, e.clientX, e.clientY); });
    canvas.addEventListener('pointermove', function (e) {
      tracker.move(e.pointerId, e.clientX, e.clientY);
      if (e.pointerType === 'mouse' && !e.buttons) {
        var h = pickAt(e.clientX, e.clientY);
        setHover(h && h.mesh);
      }
    });
    canvas.addEventListener('pointerup', function (e) {
      var t = tracker.up(e.pointerId, e.clientX, e.clientY);
      if (t) tap(t.x, t.y);
    });
    canvas.addEventListener('pointercancel', function () { tracker.cancel(); });
    canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') setHover(null); });

    return {
      pickAt: pickAt,
      update: function (dt) {
        playing = playing.filter(function (p) {
          p.t += dt;
          if (p.t >= SA.picking.DURATION) { restore(p); return false; }
          var o = SA.picking.reactionPose(p.reaction, p.t);
          p.mesh.rotation.set(p.base.rot.x + o.rx, p.base.rot.y + o.ry, p.base.rot.z + o.rz);
          p.mesh.scale.set(p.base.scale.x * o.sx, p.base.scale.y * o.sy, p.base.scale.z * o.sz);
          p.mesh.position.set(p.base.pos.x, p.base.pos.y + o.py, p.base.pos.z);
          return true;
        });
        tapped = tapped.filter(function (t) {
          t.left -= dt;
          if (t.left > 0) return true;
          setGlow(t.mesh, t.mesh === hovered ? 1 : 0);
          return false;
        });
        if (chipLeft > 0) {
          chipLeft -= dt;
          if (chipLeft <= 0 && chip) chip.style.display = 'none';
        }
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
