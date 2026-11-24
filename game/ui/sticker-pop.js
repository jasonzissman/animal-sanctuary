/* SA.stickerPop: the sticker celebration when a badge is earned (AS-0168). Never blocks play: every layer is pointer-events:none and
 * nothing waits on it, a second sticker just queues behind the first.
 *
 *   SA.stickerPop.frame(t, from, to, w) -> { x, y, scale, rot, glow, sparkles: [{ x, y, scale, opacity }], phase, done }   PURE (node:vm tested)
 *       t seconds since the pop began. Total DURATION_S (~2.4 s): it flies in from `from` to the screen centre (IN_S), holds there
 *       shining with a ring of sparkles (the Spanish name is spoken as it lands), then SLAP_S: it shrinks onto `to` (the album's corner).
 *       phase 'in' | 'hold' | 'slap' | 'done'.
 *   SA.stickerPop.create({ doc, audio?, stickers?, viewport?, raf? }) -> { show(row), update(dt), isShowing(), pending(), element }
 *       Subscribes to SA.stickers.onEarn. Each sticker: sparkle SFX + fanfare jingle at the start (silent when muted: SA.audio.sfx
 *       honours Mute), '¡<name>!' spoken when it lands, a pop SFX on the slap. update(dt) is driven by requestAnimationFrame when there is
 *       one (tests call it directly). A no-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var IN_S = 0.6, HOLD_S = 1.3, SLAP_S = 0.5, DURATION_S = IN_S + HOLD_S + SLAP_S, SPARKLES = 8, SIZE = 120;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(p) { return p * p * (3 - 2 * p); }

  function frame(t, from, to, w) {
    t = Math.max(0, +t || 0);
    var cx = (w && w.x) || 0, cy = (w && w.y) || 0, out = { sparkles: [] };
    if (t >= DURATION_S) { out.x = to.x; out.y = to.y; out.scale = 0.3; out.rot = 0; out.glow = 0; out.phase = 'done'; out.done = true; return out; }
    if (t < IN_S) {
      var p = ease(t / IN_S);
      out.x = from.x + (cx - from.x) * p; out.y = from.y + (cy - from.y) * p;
      out.scale = 0.3 + 1.2 * p; out.rot = -25 * (1 - p); out.glow = p * 0.5; out.phase = 'in';
    } else if (t < IN_S + HOLD_S) {
      var h = (t - IN_S) / HOLD_S;
      out.x = cx; out.y = cy; out.scale = 1.5 + 0.08 * Math.sin(h * Math.PI * 4); out.rot = 4 * Math.sin(h * Math.PI * 2); out.glow = 1; out.phase = 'hold';
    } else {
      var s = ease((t - IN_S - HOLD_S) / SLAP_S);
      out.x = cx + (to.x - cx) * s; out.y = cy + (to.y - cy) * s; out.scale = 1.5 - 1.2 * s; out.rot = 12 * s; out.glow = 1 - s; out.phase = 'slap';
    }
    out.done = false;
    var spin = t * 2.2, radius = 90 * out.scale, vis = clamp01((t - 0.2) / 0.4) * (out.phase === 'slap' ? out.glow : 1);
    for (var i = 0; i < SPARKLES; i++) {
      var a = spin + (i * 2 * Math.PI) / SPARKLES;
      out.sparkles.push({ x: out.x + Math.cos(a) * radius, y: out.y + Math.sin(a) * radius * 0.8,
        scale: 0.6 + 0.4 * Math.abs(Math.sin(t * 6 + i)), opacity: vis });
    }
    return out;
  }

  function create(o) {
    o = o || {};
    var doc = o.doc;
    var none = { show: function () {}, update: function () {}, isShowing: function () { return false; }, pending: function () { return 0; }, element: null };
    var stickers = o.stickers || SA.stickers;
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !stickers || typeof stickers.onEarn !== 'function') return none;
    function audio() { return o.audio || SA.audio; }
    function sfx(name) { try { var a = audio(); if (a && a.sfx) a.sfx(name); } catch (e) { /* sound never breaks play */ } }
    function say(text) { try { var a = audio(); if (a && a.say && text) a.say(text); } catch (e) { /* neither does speech */ } }
    function size() {
      var v = o.viewport ? o.viewport() : null;
      return v || { w: root.innerWidth || 800, h: root.innerHeight || 600 };
    }

    var layer = doc.createElement('div');
    layer.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:12;display:none;pointer-events:none;margin:0;padding:0;';
    function node(css, text) {
      var e = doc.createElement('div');
      e.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;display:none;line-height:1;text-align:center;will-change:transform,opacity;' + css;
      if (text !== undefined) e.textContent = text;
      layer.appendChild(e);
      return e;
    }
    var badge = node('width:' + SIZE + 'px;height:' + SIZE + 'px;box-sizing:border-box;border-radius:28%;border:6px solid #f0a020;' +
      'background:linear-gradient(135deg,#fff8d6,#ffe27a);font:700 ' + Math.round(SIZE * 0.5) + 'px/' + (SIZE - 12) + 'px system-ui,sans-serif;');
    var stars = [];
    for (var i = 0; i < SPARKLES; i++) stars.push(node('width:32px;height:32px;font-size:28px;', '✨'));
    doc.body.appendChild(layer);

    var queue = [], cur = null, t = 0, spoken = false, slapped = false, ticking = false;

    function place(e, x, y, scale, rot, opacity, half) {
      e.style.display = 'block';
      e.style.opacity = String(opacity);
      e.style.transform = 'translate(' + Math.round(x - half) + 'px,' + Math.round(y - half) + 'px) rotate(' + Math.round(rot) + 'deg) scale(' + scale.toFixed(2) + ')';
    }
    function hideAll() { layer.style.display = 'none'; badge.style.display = 'none'; stars.forEach(function (s) { s.style.display = 'none'; }); }

    function begin(row) {
      cur = row; t = 0; spoken = false; slapped = false;
      badge.textContent = row.icon || '🏅';
      badge.setAttribute('aria-label', row.es || '');
      layer.style.display = 'block';
      sfx('sparkle'); sfx('fanfare');
    }

    function update(dt) {
      if (!cur) { if (!queue.length) return; begin(queue.shift()); }
      t += Math.max(0, +dt || 0);
      var v = size(), from = { x: v.w / 2, y: v.h + SIZE }, to = { x: v.w - 36, y: 36 };
      var f = frame(t, from, to, { x: v.w / 2, y: v.h / 2 });
      if (f.done) { cur = null; hideAll(); if (queue.length) update(0); return; }
      if (!spoken && f.phase === 'hold') { spoken = true; say(stickers.lines(cur)); }
      if (!slapped && f.phase === 'slap') { slapped = true; sfx('pop'); }
      place(badge, f.x, f.y, f.scale, f.rot, 1, SIZE / 2);
      f.sparkles.forEach(function (s, k) { place(stars[k], s.x, s.y, s.scale, 0, s.opacity, 16); });
    }

    var lastTs = 0;
    function loop(ts) {
      if (!cur && !queue.length) { ticking = false; lastTs = 0; return; }
      var dt = typeof ts === 'number' && lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 1 / 60;
      lastTs = typeof ts === 'number' ? ts : 0;
      update(dt);
      var raf = o.raf || root.requestAnimationFrame;
      if (raf) raf(loop); else ticking = false;
    }
    function show(row) {
      if (!row || !row.id) return;
      queue.push(row);
      if (!ticking && (o.raf || root.requestAnimationFrame)) { ticking = true; (o.raf || root.requestAnimationFrame)(loop); }
    }

    stickers.onEarn(show);
    return { show: show, update: update, isShowing: function () { return !!cur; }, pending: function () { return queue.length; }, element: layer };
  }

  SA.stickerPop = { create: create, frame: frame, DURATION_S: DURATION_S };
})(typeof window !== 'undefined' ? window : globalThis);
