/* SA.skyViewUi.create(doc, { onToggle?, mission?, raf? }) -> { show(), hide(), isOpen(), aimBy(dx, dy), element } (DOM only; AS-0371, Mission 12).
 * The controls over the telescope's night-sky view (the sky itself is game/render/sky-view.js): a full-screen layer that takes drags (the sky follows the
 * finger or mouse), the arrow keys / WASD (they never walk the player while it is open), a BIG exit button (✕, top right; Escape too) and, on the photo step,
 * a big 📷 button (a flash, then SA.missionSky.snap(); a finished mission closes the view after a moment). Hooked to SA.missionSky.onView, so it shows and
 * hides itself. onToggle(open) lets main.js pause the world's taps. No text but icons.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var DRAG = 0.006, KEY_SPEED = 1.1;                       // radians per pixel dragged; radians per second held
  var KEYS = { ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], ArrowUp: [0, 1], w: [0, 1], ArrowDown: [0, -1], s: [0, -1] };
  var BTN = 'position:absolute;border:.1em solid #fff;border-radius:50%;color:#fff;font:700 2.6rem system-ui,sans-serif;cursor:pointer;' +
    'touch-action:manipulation;display:flex;align-items:center;justify-content:center;margin:0;padding:0;';

  function create(doc, o) {
    o = o || {};
    var none = { show: function () {}, hide: function () {}, isOpen: function () { return false; }, aimBy: function () {}, tapAt: function () {}, element: null };
    var M = o.mission || SA.missionSky;
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !M) return none;
    function el(tag, css) { var e = doc.createElement(tag); e.style.cssText = css || ''; return e; }

    var layer = el('div', 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:40;display:none;touch-action:none;cursor:grab;');
    layer.setAttribute('data-sky-view', '1');
    var exit = el('button', BTN + 'right:16px;top:16px;width:84px;height:84px;background:rgba(160,40,40,.85);');
    exit.type = 'button'; exit.textContent = '✕'; exit.setAttribute('aria-label', 'Salir');
    var cam = el('button', BTN + 'left:50%;bottom:24px;margin-left:-48px;width:96px;height:96px;background:rgba(40,110,170,.9);display:none;');
    cam.type = 'button'; cam.textContent = '📷'; cam.setAttribute('aria-label', 'Foto');
    var flash = el('div', 'position:absolute;left:0;top:0;right:0;bottom:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .5s;');
    // Progress (AS-0372): the animal icons of the constellations, dim until found, with "0/3"; a big icon pops with a glow when one is found. No text but icons and numbers.
    var prog = el('div', 'position:absolute;left:50%;top:16px;transform:translateX(-50%);display:none;align-items:center;gap:.5rem;padding:.3rem .8rem;border-radius:2rem;' +
      'background:rgba(10,16,48,.7);color:#fff;font:700 1.6rem system-ui,sans-serif;pointer-events:none;');
    var pop = el('div', 'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%) scale(.4);font-size:7rem;opacity:0;pointer-events:none;' +
      'transition:transform .5s,opacity .5s;text-shadow:0 0 .4em #ffd36b,0 0 1em #ffd36b;');
    layer.appendChild(flash); layer.appendChild(prog); layer.appendChild(pop); layer.appendChild(exit); layer.appendChild(cam);
    doc.body.appendChild(layer);

    var opened = false, held = {}, drag = null, loop = null, snapped = false;
    var raf = o.raf || (root.requestAnimationFrame ? function (f) { return root.requestAnimationFrame(f); } : null);

    function aimBy(dx, dy) { M.aim(-dx * DRAG, dy * DRAG); }
    function sync() {
      var v = M.view();
      cam.style.display = v && v.photo && !snapped ? 'flex' : 'none';
      var cs = v && v.constellations || [];
      prog.style.display = cs.length && (v.gaze || v.photo || v.found) ? 'flex' : 'none';
      var key = cs.map(function (c) { return c.id + (c.lit ? 1 : 0); }).join();
      if (key !== progKey) {
        progKey = key;
        prog.textContent = '';
        cs.forEach(function (c) { var s = el('span', c.lit ? '' : 'opacity:.3;filter:grayscale(1);'); s.textContent = c.icon; prog.appendChild(s); });
        var n = el('span', 'margin-left:.4rem;'); n.textContent = v.found + '/' + v.total; prog.appendChild(n);
      }
    }
    var progKey = '';
    function celebrate(e) {                                           // a found constellation: its animal pops up glowing, then fades
      if (!e || !e.icon) return;
      pop.textContent = e.icon;
      pop.style.transition = 'none'; pop.style.opacity = '1'; pop.style.transform = 'translate(-50%,-50%) scale(.4)';
      if (root.setTimeout) {
        root.setTimeout(function () { pop.style.transition = 'transform .6s,opacity .6s'; pop.style.transform = 'translate(-50%,-50%) scale(1)'; }, 40);
        root.setTimeout(function () { pop.style.opacity = '0'; }, 1700);
      }
      sync();
    }
    // A tap on the sky (a press that barely moved) centres the view there.
    function tapAt(x, y) {
      var w = root.innerWidth || 800, h = root.innerHeight || 600;
      M.aimTowards((x - w / 2) / (w / 2), (y - h / 2) / (h / 2), w / h);
    }
    var last = 0;
    function tick(t) {
      if (!opened) return;
      var dt = last ? Math.min(0.1, (t - last) / 1000) : 0.016;
      last = t;
      var x = 0, y = 0;
      Object.keys(held).forEach(function (k) { x += KEYS[k][0]; y += KEYS[k][1]; });
      if (x || y) M.aim(x * KEY_SPEED * dt, y * KEY_SPEED * dt);
      sync();
      if (raf) loop = raf(tick);
    }

    function show() {
      if (opened) return;
      opened = true; snapped = false; held = {}; last = 0;
      layer.style.display = 'block';
      sync();
      if (o.onToggle) o.onToggle(true);
      if (raf) loop = raf(tick);
    }
    function hide() {
      if (!opened) return;
      opened = false; held = {}; drag = null;
      layer.style.display = 'none';
      if (o.onToggle) o.onToggle(false);
    }
    function exitNow() { M.close(); hide(); }

    exit.addEventListener('click', function (e) { if (e.stopPropagation) e.stopPropagation(); exitNow(); });
    cam.addEventListener('click', function (e) {
      if (e.stopPropagation) e.stopPropagation();
      var r = M.snap();
      if (!r || (r.status !== 'complete' && r.status !== 'step')) return;
      snapped = true; sync();
      flash.style.transition = 'none'; flash.style.opacity = '0.9';
      if (root.setTimeout) {
        root.setTimeout(function () { flash.style.transition = 'opacity .5s'; flash.style.opacity = '0'; }, 40);
        root.setTimeout(exitNow, 1100);                                   // the cheer plays over the world once the view is gone
      }
    });
    layer.addEventListener('pointerdown', function (e) { if (e.target !== layer) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false }; layer.style.cursor = 'grabbing'; });
    layer.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) drag.moved = true;
      aimBy(e.clientX - drag.x, e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    function endDrag() { drag = null; layer.style.cursor = 'grab'; }
    layer.addEventListener('pointerup', function (e) { var d = drag; endDrag(); if (d && !d.moved && d.id === e.pointerId) tapAt(e.clientX, e.clientY); });
    layer.addEventListener('pointercancel', endDrag);

    // Capture phase on the window: the walking keys of the camera rig never see these while the view is open.
    var win = root.addEventListener ? root : null;
    if (win) {
      win.addEventListener('keydown', function (e) {
        if (!opened || !e) return;
        var k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); exitNow(); return; }
        if (!KEYS[k] || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault(); e.stopPropagation();
        held[k] = true;
      }, true);
      win.addEventListener('keyup', function (e) { var k = e && e.key && e.key.length === 1 ? e.key.toLowerCase() : e && e.key; if (k) delete held[k]; }, true);
    }

    M.onView = function (on) { if (on) show(); else hide(); };
    M.onFound = celebrate;
    return { show: show, hide: hide, isOpen: function () { return opened; }, aimBy: aimBy, tapAt: tapAt, element: layer };
  }

  SA.skyViewUi = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
