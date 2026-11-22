/* SA.render.createPicking(THREE, { canvas, camera, animals, container }): pointer -> pick volumes -> SA.picking.
 * - Raycasts ONLY the pick volumes of the animals (animalGroup.userData.pickVolumes), never the whole scene,
 *   and lets SA.animalPlan.choosePick decide which overlapping volume the player meant.
 * - A tap is a pointerdown + pointerup that did not drag (SA.picking.createTapTracker), so camera drags and
 *   pinches never pick. Mouse hover brightens the part under the cursor; a tap glows it more, plays its
 *   reaction (data: part.reaction) and shows a big chip: icon + Spanish label (+ English if settings.english).
 * - Speaks the part's Spanish label with SA.audio.say('part:<key>') (respects mute).
 * - Calls SA.picking.emit({ animalId, part }) so round/care loops can subscribe with SA.picking.onPick.
 * - Forgiving aim (SA.aim): every frame the in-reach parts are projected to the screen and the nearest one within ~48px of the
 *   mouse (or the screen centre for keyboard/touch play) is the sticky target; it stays highlighted. Space, a click or a tap
 *   on it uses the equipped item (SA.picking.emit gets `item`); empty hands just pet/inspect. A click or tap that misses every
 *   pick volume falls back to the nearest in-reach part within the radius (larger for touch).
 * - Arrow keys/WASD always move the player (no part-cycling mode, no Escape to unlock); only Space acts, and only when a target
 *   is highlighted (it then wins over the climb key and the pickup collector, so Space never both uses a part and grabs a
 *   find; with no highlighted part Space reaches them as before).
 * - Reach: with opts.getPlayer() (the walking avatar) a pick on an out-of-reach animal never reaches SA.picking.emit; it
 *   shows opts.reachCue ("¡Acércate!") and calls SA.reach.notifyFar instead. Rubbing out of reach is silently ignored.
 * Returns { update(dt), pickAt(clientX, clientY) -> {animalId, part, ...}|null, target() -> {animalId, part, mesh}|null, useTarget() -> bool }. Call update(dt) every frame.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var CHIP_SECONDS = 2.6, GLOW_SECONDS = 1.1;
  var RUB_PX = 45;                  // pointer travel over a care target that counts as one rub
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
      animals.children.forEach(function (g) {
        if (g.visible !== false && g.userData && g.userData.pickVolumes) out = out.concat(g.userData.pickVolumes);   // hidden eggs are not pickable
      });
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
    function restLevel(mesh) { return mesh === hovered ? 1 : 0; }

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

    var lastType = 'mouse';
    function tap(x, y) {
      var paused = SA.picking.isPaused && SA.picking.isPaused();
      select(pickAt(x, y) || (paused ? null : aimedHit(x, y, lastType === 'touch')));
    }

    // The one pick path: a mouse click or a tap (never the keyboard) ends up here.
    // Reach rule (SA.reach): too far from the animal = a friendly "¡Acércate!" bubble, the part glows and the hint arrow
    // points the way. It is never a wrong pick: nothing is emitted, so rounds and care tasks just keep waiting.
    var wp = new THREE.Vector3();
    function inReach(hit) {
      var player = opts.getPlayer && opts.getPlayer();
      var g = animals.getObjectByName(hit.animalId);
      if (!player || !g || !SA.reach) return true;   // no walking player (or no rule): behave as before
      hit.mesh.getWorldPosition(wp);
      return SA.reach.canReach({ x: player.x, y: player.y || 0, z: player.z }, { x: g.position.x, y: g.position.y, z: g.position.z }, { y: wp.y },
        // Canopy perchers (userData.perched) are reachable from under their tree until a climb system (SA.climb) exists.
        { ignoreHeight: !!(g.userData && g.userData.perched && !SA.climb) });
    }

    function nudgeCloser(hit) {
      tapped.forEach(function (t) { if (t.mesh !== hit.mesh) setGlow(t.mesh, restLevel(t.mesh)); });
      tapped = [{ mesh: hit.mesh, left: GLOW_SECONDS }];
      setGlow(hit.mesh, 2);
      if (opts.reachCue) opts.reachCue.show();
      SA.reach.notifyFar({ animalId: hit.animalId, part: hit.part });
    }

    // ---- Forgiving aim: project the in-reach parts to the screen, keep the nearest one highlighted (SA.aim). ----
    var aim = SA.aim ? SA.aim.create() : null;
    var pointer = null;               // mouse position (client px) while it is over the canvas; null = aim from the screen centre
    var pv = new THREE.Vector3();

    function partRadiusPx(mesh, depth, h) {
      var g = mesh.geometry;
      if (!g || !(depth > 0)) return 0;
      if (!g.boundingSphere && g.computeBoundingSphere) g.computeBoundingSphere();
      if (!g.boundingSphere) return 0;
      var s = mesh.matrixWorld.getMaxScaleOnAxis ? mesh.matrixWorld.getMaxScaleOnAxis() : 1;
      return g.boundingSphere.radius * s / (2 * depth * Math.tan((camera.fov || 50) * Math.PI / 360)) * h;
    }

    function candidates(at) {
      var r = canvas.getBoundingClientRect(), out = [];
      if (!r.width || !r.height) return out;
      var direct = at ? pickAt(at.x, at.y) : null;
      camera.updateMatrixWorld();
      animals.children.forEach(function (g) {
        if (g.visible === false) return;
        g.children.forEach(function (m) {
          var u = m.userData;
          if (!u || u.pick || !u.part || m.visible === false) return;
          var hit = { animalId: g.name || u.animalId, part: u.part, index: u.index, side: u.side || null, mesh: m };
          if (!inReach(hit)) return;
          m.getWorldPosition(pv);
          var depth = camera.position.distanceTo(pv);
          pv.project(camera);
          if (pv.z > 1 || pv.z < -1) return;
          out.push({
            id: hit.animalId + ':' + hit.part + ':' + hit.index, hit: hit,
            x: r.left + (pv.x * 0.5 + 0.5) * r.width, y: r.top + (-pv.y * 0.5 + 0.5) * r.height,
            r: partRadiusPx(m, depth, r.height),
            direct: !!(direct && direct.animalId === hit.animalId && direct.part === hit.part && direct.index === hit.index),
          });
        });
      });
      return out;
    }

    function centre() {
      var r = canvas.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function refreshAim() {
      if (!aim) return;
      var t = null;
      if (SA.picking.isPaused && SA.picking.isPaused()) aim.clear();
      else t = aim.update(pointer || centre(), candidates(pointer));
      setHover(t ? t.hit.mesh : null);
    }

    function targetHit() { var t = aim && aim.target(); return t ? t.hit : null; }

    // Space / the use button: act on the highlighted part with whatever is in hand (nothing = pet / inspect).
    function useTarget() {
      var hit = targetHit();
      if (!hit || !hit.mesh) return false;
      select(hit);
      return true;
    }

    // A tap or click that missed every pick volume: take the nearest in-reach part within the (touch-scaled) radius.
    function aimedHit(x, y, touch) {
      if (!aim) return null;
      var n = SA.aim.nearest({ x: x, y: y }, candidates(null), { touch: touch });
      return n ? n.candidate.hit : null;
    }

    function select(hit) {
      if (!hit || !hit.mesh) return;
      if (!inReach(hit)) { nudgeCloser(hit); return; }
      var def = SA.data.get('parts', hit.part);
      tapped.forEach(function (t) { if (t.mesh !== hit.mesh) setGlow(t.mesh, restLevel(t.mesh)); });
      tapped = [{ mesh: hit.mesh, left: GLOW_SECONDS }];
      setGlow(hit.mesh, 2);
      react(hit.mesh, def ? def.reaction : 'wobble');
      var settings = (SA.save && SA.save.get && SA.save.get().settings) || {};
      var label = SA.picking.labelFor(hit.animalId, hit.part, !!settings.english);
      if (label) showChip(label);
      SA.picking.speakPart(hit.part);
      var item = SA.inventory && SA.inventory.equipped ? SA.inventory.equipped() : null;
      SA.picking.emit({ animalId: hit.animalId, part: hit.part, item: item || undefined });
    }

    // Rubbing a care target: one rub per RUB_PX of travel over the part (quiet: no chip or part reaction).
    var rubDist = 0, rubLast = null;
    function rub(e) {
      var hit = pickAt(e.clientX, e.clientY);
      if (!SA.picking.isRubTarget(hit) || !hit.mesh || !inReach(hit)) { rubLast = null; return; }
      if (rubLast) rubDist += Math.hypot(e.clientX - rubLast.x, e.clientY - rubLast.y);
      rubLast = { x: e.clientX, y: e.clientY };
      if (rubDist >= RUB_PX) {
        rubDist = 0;
        if (hit.mesh) setGlow(hit.mesh, 1);
        SA.picking.emit({ animalId: hit.animalId, part: hit.part });
      }
    }

    canvas.addEventListener('pointerdown', function (e) { rubLast = null; rubDist = 0; tracker.down(e.pointerId, e.clientX, e.clientY); });
    canvas.addEventListener('pointermove', function (e) {
      tracker.move(e.pointerId, e.clientX, e.clientY);
      if (e.buttons && SA.picking.hasRubTarget()) rub(e);
      if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', function (e) {
      var t = tracker.up(e.pointerId, e.clientX, e.clientY);
      lastType = e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse';
      if (t) tap(t.x, t.y);
    });
    canvas.addEventListener('pointercancel', function () { tracker.cancel(); });
    canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') pointer = null; });

    // Space uses the equipped item on the highlighted part. Capture phase + stopImmediatePropagation so it beats the climb key.
    root.addEventListener('keydown', function (e) {
      if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || t === 'BUTTON') return;
      if (!targetHit()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) useTarget();
    }, true);

    return {
      pickAt: pickAt,
      useTarget: useTarget,
      target: targetHit,
      update: function (dt) {
        refreshAim();
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
          setGlow(t.mesh, restLevel(t.mesh));
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
