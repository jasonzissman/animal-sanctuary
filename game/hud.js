/* SA.hud: the one pure layout of the screen (no THREE, no DOM; loadable in node:vm).
 *
 *   SA.hud.layout({ width, height }, visibleIds?) -> { id: { left, top, width, height } }   (CSS px, integers)
 *       A rect for EVERY id in SA.hud.IDS. visibleIds (default: all) says which elements are on screen right now: those are
 *       packed into their zone and never overlap each other and stay fully on-screen. A hidden id gets the rect it would
 *       have if everything were visible (its reserved slot), so showing it later needs no re-layout of the others.
 *   SA.hud.mode(size) -> 'regular' | 'compact'     (compact below COMPACT_BELOW px wide: phones; smaller element sizes)
 *   SA.hud.SIZES / SA.hud.ZONES: the data tables (element sizes per mode, and which ids live in which zone).
 *
 * Zones (stacking rules):
 *   topLeft       the mission prompt, then the star badge below it            (stack down)
 *   topRight      audioUi, settings, sandbox, album, then the snapshot card   (stack down, right-aligned)
 *   transient     toast, pickupsToast, hotbarChip, pickingChip, reachCue      (stack down in the strip left of the right column,
 *                 under the star badge; each shows only while it has a message, so nothing is ever pushed off-screen)
 *   bottomCenter  the hotbar at the very bottom, the feed tray above it       (stack up, centred)
 *   bottomLeft    the joystick                                                (stack up, above the tray if it reaches it)
 *   bottomRight   orbit pad (2x2), and left of it use / jump / climb          (stack up, above the tray if it reaches it)
 *   floating      hintArrow and clickFx follow the camera / pointer; their rect is a free parking spot (nothing overlaps it)
 * Side columns always reserve the feed tray's slot, so touch buttons never jump when feeding starts.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  var COMPACT_BELOW = 560;

  // [width, height] per element and mode; width 0 = flexible (filled by the zone). Element sizes live only here.
  var SIZES = {
    regular: {
      prompt: [0, 84], stars: [110, 52], audioUi: [64, 64], settings: [48, 48], sandbox: [76, 76], album: [76, 76],
      snapshot: [130, 130], toast: [360, 56], pickupsToast: [300, 52], hotbarChip: [260, 44], pickingChip: [380, 64],
      reachCue: [300, 52], hotbar: [712, 72], feedTray: [535, 152], joystick: [136, 136], orbitPad: [120, 120],
      use: [84, 84], jump: [84, 84], climb: [72, 72], hintArrow: [72, 72], clickFx: [64, 64],
    },
    compact: {
      prompt: [0, 64], stars: [90, 40], audioUi: [48, 48], settings: [44, 44], sandbox: [56, 56], album: [56, 56],
      snapshot: [84, 100], toast: [360, 36], pickupsToast: [300, 32], hotbarChip: [260, 28], pickingChip: [380, 36],
      reachCue: [300, 32], hotbar: [712, 48], feedTray: [535, 100], joystick: [88, 88], orbitPad: [96, 96],
      use: [52, 52], jump: [52, 52], climb: [44, 44], hintArrow: [48, 48], clickFx: [44, 44],
    },
  };
  var GAP = { regular: 8, compact: 6 };
  var MARGIN = 12;

  var ZONES = {
    topLeft: ['prompt', 'stars'],
    topRight: ['audioUi', 'settings', 'sandbox', 'album', 'snapshot'],
    transient: ['toast', 'pickupsToast', 'hotbarChip', 'pickingChip', 'reachCue'],
    bottomCenter: ['hotbar', 'feedTray'],
    bottomLeft: ['joystick'],
    bottomRight: ['orbitPad', 'use', 'jump', 'climb'],
    floating: ['hintArrow', 'clickFx'],
  };
  var IDS = [];
  Object.keys(ZONES).forEach(function (z) { IDS = IDS.concat(ZONES[z]); });

  function mode(size) { return size.width < COMPACT_BELOW ? 'compact' : 'regular'; }
  function rect(l, t, w, h) { return { left: Math.round(l), top: Math.round(t), width: Math.round(w), height: Math.round(h) }; }
  function hit(a, b) { return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height; }
  function inside(r, W, H) { return r.left >= 0 && r.top >= 0 && r.left + r.width <= W && r.top + r.height <= H; }

  // All of `ids` present in the `on` set, in zone order.
  function pick(zone, on) { return ZONES[zone].filter(function (id) { return on[id]; }); }

  function compute(size, on) {
    var W = size.width, H = size.height, m = mode(size), S = SIZES[m], G = GAP[m], M = MARGIN, out = {};
    function dim(id) { return S[id]; }

    // topRight column (right-aligned), the snapshot card last.
    var colW = Math.max.apply(null, ZONES.topRight.slice(0, 4).map(function (id) { return dim(id)[0]; }));
    var y = M;
    pick('topRight', on).forEach(function (id) {
      var d = dim(id);
      out[id] = rect(W - M - d[0], y, d[0], d[1]);
      y += d[1] + G;
    });
    var rightLimit = W - M - Math.max(colW, on.snapshot ? dim('snapshot')[0] : 0) - M;   // content left of the right column ends here

    // topLeft: the prompt fills the width left of the buttons, the star badge sits under it.
    var ly = M;
    pick('topLeft', on).forEach(function (id) {
      var d = dim(id), w = d[0] || Math.max(0, W - M - colW - M - M);
      out[id] = rect(M, ly, w, d[1]);
      ly += d[1] + G;
    });

    // transient strip under the star badge, centred in the space left of the right column.
    var tw = Math.max(0, rightLimit - M), ty = ly;
    pick('transient', on).forEach(function (id) {
      var d = dim(id), w = Math.min(d[0], tw);
      out[id] = rect(M + (tw - w) / 2, ty, w, d[1]);
      ty += d[1] + G;
    });

    // bottomCenter: hotbar at the bottom, feed tray above it.
    var hb = dim('hotbar'), hw = Math.min(hb[0], W - 2 * M), hotbarTop = H - M - hb[1];
    if (on.hotbar) out.hotbar = rect((W - hw) / 2, hotbarTop, hw, hb[1]);
    var ft = dim('feedTray'), fw = Math.min(ft[0], W - 2 * M);
    var tray = rect((W - fw) / 2, hotbarTop - G - ft[1], fw, ft[1]);   // always reserved, shown or not
    if (on.feedTray) out.feedTray = tray;

    // side columns stack up from just above the hotbar, or above the tray's reserved slot when they would reach it.
    function baseFor(left, width) {
      var probe = rect(left, 0, width, H);
      return hit(probe, tray) ? tray.top - G : hotbarTop - G;
    }
    var js = dim('joystick');
    if (on.joystick) {
      var jl = M + 4, jb = baseFor(jl, js[0]);
      out.joystick = rect(jl, jb - js[1], js[0], js[1]);
    }
    var op = dim('orbitPad'), colB = pick('bottomRight', on).filter(function (id) { return id !== 'orbitPad'; });
    var bw = colB.length ? Math.max.apply(null, colB.map(function (id) { return dim(id)[0]; })) : 0;
    var rb = baseFor(W - M - op[0] - G - bw, op[0] + G + bw);
    if (on.orbitPad) out.orbitPad = rect(W - M - op[0], rb - op[1], op[0], op[1]);
    var by = rb;
    colB.forEach(function (id) {
      var d = dim(id);
      by -= d[1];
      out[id] = rect(W - M - op[0] - G - d[0], by, d[0], d[1]);
      by -= G;
    });
    // use sits lowest, then jump, then climb (zone order: use, jump, climb)

    // floating elements: park each at the free spot nearest the screen centre.
    var placed = Object.keys(out).map(function (k) { return out[k]; });
    pick('floating', on).forEach(function (id) {
      var d = dim(id), best = null, bestD = Infinity, cx = W / 2, cy = H / 2;
      for (var yy = M; yy + d[1] <= H - M; yy += 8) {
        for (var xx = M; xx + d[0] <= W - M; xx += 8) {
          var dist = Math.pow(xx + d[0] / 2 - cx, 2) + Math.pow(yy + d[1] / 2 - cy, 2);
          if (dist >= bestD) continue;
          var r = rect(xx, yy, d[0], d[1]);
          if (placed.some(function (p) { return hit(p, r); })) continue;
          best = r; bestD = dist;
        }
      }
      out[id] = best || rect(cx - d[0] / 2, cy - d[1] / 2, d[0], d[1]);
      placed.push(out[id]);
    });
    return out;
  }

  function layout(size, visibleIds) {
    var all = {}, on = {};
    IDS.forEach(function (id) { all[id] = true; });
    if (Array.isArray(visibleIds)) visibleIds.forEach(function (id) { on[id] = true; }); else on = all;
    var full = compute(size, all), vis = compute(size, on), res = {};
    IDS.forEach(function (id) { res[id] = on[id] ? vis[id] : full[id]; });
    return res;
  }

  // A copy of `r` kept on-screen (inside the margin) and moved the shortest way (left/right/up/down) clear of every rect in `others`.
  function nudge(r, others, W, H) {
    function clamp(x, y) { return rect(Math.max(MARGIN, Math.min(x, W - MARGIN - r.width)), Math.max(MARGIN, Math.min(y, H - MARGIN - r.height)), r.width, r.height); }
    var base = clamp(r.left, r.top), blockers = others.filter(function (o) { return hit(base, o); });
    if (!blockers.length) return base;
    var cands = [];
    others.forEach(function (o) {
      cands.push(clamp(o.left - r.width - 4, base.top), clamp(o.left + o.width + 4, base.top),
        clamp(base.left, o.top - r.height - 4), clamp(base.left, o.top + o.height + 4));
    });
    var best = null, bestD = Infinity;
    cands.forEach(function (c) {
      if (others.some(function (o) { return hit(c, o); })) return;
      var d = Math.abs(c.left - base.left) + Math.abs(c.top - base.top);
      if (d < bestD) { best = c; bestD = d; }
    });
    return best || base;
  }

  SA.hud = { IDS: IDS, ZONES: ZONES, SIZES: SIZES, COMPACT_BELOW: COMPACT_BELOW, mode: mode, layout: layout, nudge: nudge, overlaps: hit, onScreen: inside };
})(typeof window !== 'undefined' ? window : globalThis);
