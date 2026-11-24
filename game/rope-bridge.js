/* SA.ropeBridge: the montaña's rope-and-plank bridge between two peaks (AS-0159; pure, no THREE, no DOM; node:vm tested).
 * Load after game/map.js, game/peaks.js and game/surfaces.js (and before game/render/rope-bridge.js). It registers its deck with SA.surfaces.addFixed.
 *
 * The bridge joins the flat summits of the peaks 'pico-n1' and 'pico-n2' (the northern pair, beside the trail's lower legs; they are climbed like any
 * peak). The deck is a normal SA.surfaces deck (rope: true) whose height profile runs from one summit's height to the other's and then stays flat, so you
 * step off a summit (SA.climb 'top' mode hands over through SA.surfaces.exitTo) onto the planks at the same height and walk across. Rails (rope posts)
 * run along both sides, so nobody can fall off; they block only while you are ON the deck (SA.surfaces.ropeSolidsAt).
 *
 *   SA.ropeBridge.get()        -> the deck { id, x, z, dx, dz, halfLen, halfWid, y, profile, ramp: 0, railR, rope: true, peakA, peakB } or null (a peak is missing)
 *   SA.ropeBridge.ends()       -> [{ x, z, y, peak }, { ... }] the two summit centres the deck is anchored on (y = the summit top)
 *   SA.ropeBridge.near(x, z, pad?)   true within pad of the deck's rectangle
 *   SA.ropeBridge.sway(t, weight)    -> { roll, lift } the VISUAL swing only (radians / metres): never feeds the walking surface. weight 0..1 = someone on it
 *   SA.ropeBridge.creak(state, input, dt) -> { state, event: { sfx, volume, rate } | null }   soft creak while walking on the planks (rate-limited, a fixed pitch cycle)
 *   SA.ropeBridge.create()           the creak state
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var PEAKS = ['pico-n1', 'pico-n2'];
  var HALF_WID = 1.3, RAIL_R = 0.14;
  var PAST = 0.9;           // the deck reaches this far past each summit centre, so it covers the whole flat top it starts from
  var FLAT = 1.6;           // the planks are level with the summit this far from its centre (the cone's rim is 1.55 out), then climb to the other summit
  var CREAK_GAP = 0.85, CREAK_VOLUME = 0.5, RATES = [1, 0.92, 1.07, 0.97];   // a fixed pitch cycle, never random
  var SWAY_ROLL = 0.012, SWAY_LIFT = 0.02, SWAY_WEIGHT = 0.02;
  var cached;

  function peakById(id) {
    var list = SA.peaks ? SA.peaks.LIST : [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function build() {
    var a = peakById(PEAKS[0]), b = peakById(PEAKS[1]);
    if (!a || !b || !SA.map) return null;
    var ya = SA.map.groundHeight(a.x, a.z), yb = SA.map.groundHeight(b.x, b.z), len = Math.hypot(b.x - a.x, b.z - a.z), half = len / 2;
    return { id: 'puente-cuerda', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len,
      halfLen: half + PAST, halfWid: HALF_WID, y: (ya + yb) / 2, profile: { u0: -half + FLAT, y0: ya, u1: half - FLAT, y1: yb }, ramp: 0, railR: RAIL_R, rope: true,
      peakA: { id: a.id, x: a.x, z: a.z, y: ya }, peakB: { id: b.id, x: b.x, z: b.z, y: yb } };
  }

  function get() {
    if (cached === undefined) {
      cached = build();
      if (cached && SA.surfaces && SA.surfaces.addFixed) SA.surfaces.addFixed([cached]);
    }
    return cached;
  }

  function ends() {
    var d = get();
    return d ? [{ x: d.peakA.x, z: d.peakA.z, y: d.peakA.y, peak: d.peakA.id }, { x: d.peakB.x, z: d.peakB.z, y: d.peakB.y, peak: d.peakB.id }] : [];
  }

  function near(x, z, pad) {
    var d = get(), p = pad || 0;
    if (!d) return false;
    var rx = x - d.x, rz = z - d.z, u = rx * d.dx + rz * d.dz, v = -rx * d.dz + rz * d.dx;
    return Math.abs(u) <= d.halfLen + p && Math.abs(v) <= d.halfWid + p;
  }

  function sway(t, weight) {
    var w = weight > 0 ? (weight > 1 ? 1 : weight) : 0, amp = 1 + SWAY_WEIGHT / SWAY_ROLL * w;
    return { roll: SWAY_ROLL * amp * Math.sin(t * 1.4) + 0.004 * Math.sin(t * 2.9), lift: SWAY_LIFT * (1 + w) * Math.sin(t * 1.9 + 1) };
  }

  function create() { return { gap: CREAK_GAP, n: 0 }; }

  function creak(state, input, dt) {
    var s = state || create(), d = dt > 0 ? Math.min(dt, 0.25) : 0, i = input || {};
    if (!i.onDeck || !i.moving) return { state: { gap: CREAK_GAP, n: s.n || 0 }, event: null };   // the first step back on creaks at once
    var gap = (s.gap === undefined ? CREAK_GAP : s.gap) + d, n = s.n || 0;
    if (gap < CREAK_GAP) return { state: { gap: gap, n: n }, event: null };
    return { state: { gap: 0, n: n + 1 }, event: { sfx: 'creak', volume: CREAK_VOLUME, rate: RATES[n % RATES.length] } };
  }

  SA.ropeBridge = { PEAKS: PEAKS, HALF_WID: HALF_WID, CREAK_GAP: CREAK_GAP, get: get, ends: ends, near: near, sway: sway, create: create, creak: creak };
  get();   // register the deck now so SA.surfaces.heightAt / near see it from the first frame
})(typeof window !== 'undefined' ? window : globalThis);
