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
 * - Arrow keys/WASD always move the player (no part-cycling mode, no Escape to unlock). This module has no key handler: the
 *   single Space dispatcher (SA.spaceUse, game/space-use.js) calls useTarget() when the highlighted part is Space's one target
 *   (parts beat trees and pickups there, so Space never both uses a part and grabs a find).
 * - Reach: with opts.getPlayer() (the walking avatar) a pick on an out-of-reach animal never reaches SA.picking.emit; it
 *   shows opts.reachCue ("¡Acércate!") and calls SA.reach.notifyFar instead. Rubbing out of reach is silently ignored.
 * - Click feedback (SA.clickOutcome): a click that picks nothing (empty ground, sky, the player's own avatar, which is never a
 *   pick volume so it never blocks) shows opts.clickFx.ripple(x, y) and, when an animal is on screen but out of reach, the
 *   opts.reachCue "¡Acércate!". Gentle only: nothing is emitted, nothing counts as a miss.
 * - AS-0128: parts exist as targets ONLY while a care/help task is active on that animal (SA.picking.partsActive, rule SA.aim.partsActive).
 *   Otherwise the animal is ONE target: pickAt/aim give { animalId, part: null, mesh: its body, node: the group } (the Space outline wraps
 *   `node`), nothing glows, no chip, no part speech, and SA.picking.emit carries { animalId, item? } with no part.
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
    var chip = null, chipLeft = 0, chipHit = null;   // chipHit = the picked part the bubble names

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
      if (!partsOn(u.animalId)) return wholeHit(u.animalId);
      return { animalId: u.animalId, part: u.part, index: u.index, side: u.side || null, mesh: visibleMesh(u) };
    }

    // AS-0128: parts are individually pickable only while a care/help task is active on that animal; otherwise it is ONE target.
    function partsOn(animalId) { return !!SA.picking.partsActive && SA.picking.partsActive(animalId); }

    // The whole animal as a target: no part (so no glow, chip or part speech); `mesh` (its body, for reach and aim position) and
    // `node` (the animal group, what the Space outline wraps) are only for the renderer.
    function wholeHit(animalId) {
      var g = animals.getObjectByName(animalId), body = null;
      if (!g) return null;
      g.children.forEach(function (m) {
        var u = m.userData || {};
        if (u.pick || !u.part || m.geometry === undefined) return;
        if (!body || u.part === 'cuerpo') body = m;
      });
      return body ? { animalId: animalId, part: null, index: 0, side: null, mesh: body, node: g } : null;
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

    // The bubble's gate (SA.picking.labelVisible): a real, visible animal within reach; the avatar is never in `animals`.
    function chipCtx(hit) {
      var g = animals.getObjectByName(hit.animalId), u = g && g.userData || {};
      var walking = !opts.getPlayer || !!opts.getPlayer();   // a walking game with no player yet has nothing in reach
      return { exists: !!g, visible: !g || g.visible !== false, avatar: !!u.avatar, inReach: walking && !!hit.mesh && inReach(hit) };
    }

    function hideChip() { chipHit = null; chipLeft = 0; if (chip) { chip.style.display = 'none'; if (SA.hudPlace) SA.hudPlace.refresh(); } }

    function showChip(label) {
      if (!chip) {
        chip = root.document.createElement('div');
        chip.setAttribute('aria-live', 'polite');
        chip.setAttribute('data-sa-message', '1');   // the hotbar's item chip stays hidden while this is showing
        chip.style.cssText = 'position:fixed;z-index:3;box-sizing:border-box;justify-content:center;white-space:nowrap;overflow:hidden;' +
          'pointer-events:none;display:none;align-items:center;gap:.6em;padding:0 .9em;' +
          'background:#fff;color:#24543a;border:.12em solid #24543a;border-radius:1em;' +
          'box-shadow:0 .15em .6em rgba(0,0,0,.3);font:700 2.4rem system-ui,sans-serif;';
        container.appendChild(chip);
        // Rect from SA.hud 'pickingChip' (transient zone, so it never covers the hotbar, joystick or buttons).
        if (SA.hudPlace) SA.hudPlace.register('pickingChip', chip, { onPlace: function (r) { chip.style.fontSize = Math.round(r.height * 0.55) + 'px'; } });
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
      if (SA.hudPlace) SA.hudPlace.refresh();
    }

    var pv = new THREE.Vector3();
    var lastType = 'mouse';
    function tap(x, y) {
      var paused = !!(SA.picking.isPaused && SA.picking.isPaused());
      var hit = pickAt(x, y) || (paused ? null : aimedHit(x, y, lastType === 'touch'));
      if (!SA.clickOutcome) { select(hit); return; }
      // SA.clickOutcome decides the feedback; a click that picks nothing (ground, sky, the avatar) gets a ripple and,
      // with an animal in view but out of reach, the friendly ¡Acércate! (never a wrong pick, nothing is emitted).
      var o = SA.clickOutcome.decide({ hit: hit && hit.mesh ? hit : null, inReach: !!(hit && hit.mesh && inReach(hit)), paused: paused,
        farVisible: !hit && !paused && SA.clickOutcome.farVisible(opts.getPlayer && opts.getPlayer(), onScreenAnimals()) });
      if (o.kind === 'pick' || o.kind === 'far') select(hit);
      else if (o.cue && opts.reachCue) opts.reachCue.show();
      if (o.ripple && opts.clickFx) opts.clickFx.ripple(x, y);
    }

    // Visible animals (never the avatar) with whether they are on screen, for SA.clickOutcome.farVisible.
    function onScreenAnimals() {
      var out = [];
      camera.updateMatrixWorld();
      animals.children.forEach(function (g) {
        if (g.visible === false || (g.userData && g.userData.avatar)) return;
        pv.set(g.position.x, g.position.y + 0.6, g.position.z).project(camera);
        out.push({ x: g.position.x, y: g.position.y, z: g.position.z,
          onScreen: pv.z > -1 && pv.z < 1 && Math.abs(pv.x) <= 1 && Math.abs(pv.y) <= 1,
          ignoreHeight: !!(g.userData && g.userData.perched && !SA.climb) });
      });
      return out;
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
      if (hit.part) {   // a whole animal (no task) never glows a part
        tapped.forEach(function (t) { if (t.mesh !== hit.mesh) setGlow(t.mesh, restLevel(t.mesh)); });
        tapped = [{ mesh: hit.mesh, left: GLOW_SECONDS }];
        setGlow(hit.mesh, 2);
      }
      if (opts.reachCue) opts.reachCue.show();
      SA.reach.notifyFar({ animalId: hit.animalId, part: hit.part });
    }

    // ---- Forgiving aim: project the in-reach parts to the screen, keep the nearest one highlighted (SA.aim). ----
    var aim = SA.aim ? SA.aim.create() : null;
    var pointer = null;               // mouse position (client px) while it is over the canvas; null = aim from the screen centre
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
        var gid = g.name || (g.userData && g.userData.animalId);
        if (!partsOn(gid)) {            // no task here: the whole animal is ONE candidate (AS-0128)
          var whole = wholeHit(gid);
          if (whole && inReach(whole)) {
            whole.mesh.getWorldPosition(pv);
            var wd = camera.position.distanceTo(pv);
            pv.project(camera);
            if (pv.z <= 1 && pv.z >= -1) out.push({
              id: gid + ':*', hit: whole, x: r.left + (pv.x * 0.5 + 0.5) * r.width, y: r.top + (-pv.y * 0.5 + 0.5) * r.height,
              r: partRadiusPx(whole.mesh, wd, r.height), direct: !!(direct && direct.animalId === gid),
            });
          }
          return;
        }
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
      setHover(t && t.hit.part ? t.hit.mesh : null);   // only a part (during a task) glows; a whole animal gets the Space outline
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
      var heldItem = SA.inventory && SA.inventory.equipped ? SA.inventory.equipped() : null;
      if (!hit.part) {   // the whole animal: no glow, chip or part name; the loops get { animalId, item? }
        SA.picking.emit({ animalId: hit.animalId, item: heldItem || undefined });
        return;
      }
      var def = SA.data.get('parts', hit.part);
      tapped.forEach(function (t) { if (t.mesh !== hit.mesh) setGlow(t.mesh, restLevel(t.mesh)); });
      tapped = [{ mesh: hit.mesh, left: GLOW_SECONDS }];
      setGlow(hit.mesh, 2);
      react(hit.mesh, def ? def.reaction : 'wobble');
      var settings = (SA.save && SA.save.get && SA.save.get().settings) || {};
      var label = SA.picking.labelFor(hit.animalId, hit.part, !!settings.english);
      if (label && SA.picking.labelVisible(hit, chipCtx(hit))) { chipHit = hit; showChip(label); }
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
        var held = SA.inventory && SA.inventory.equipped ? SA.inventory.equipped() : null;
        SA.picking.emit({ animalId: hit.animalId, part: hit.part, item: held || undefined });   // rubbing counts with the tool in hand
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

    // No Space key here: the one Space dispatcher (SA.spaceUse) calls useTarget() when the aim part is the chosen target.

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
          // Gone when the timer ends or the picked part is no longer a valid target (walked out of reach, animal hidden).
          if (chipLeft <= 0 || !chipHit || !SA.picking.labelVisible(chipHit, chipCtx(chipHit))) hideChip();
        } else if (chip && chip.style.display !== 'none') hideChip();
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
