/* SA.surfaces: generic walkable decks (no THREE, no DOM; node:vm tested). AS-0158. Needs SA.map. Optional: SA.station, SA.player (layout keeps clear).
 * A deck is a flat rectangle you stand ON above the ground or water, with side rails that block and sloped ends that join the ground:
 *   { id, x, z, dx, dz, halfLen, halfWid, y, ramp, railR }
 *     (x, z) centre, (dx, dz) unit direction along the deck, halfLen/halfWid half-sizes, y the absolute deck top,
 *     ramp the length at each end where the deck eases from the ground up to y (0 = the deck is flat to its ends),
 *     railR the radius of the rail posts that block the player (rails run along both sides of the flat part only).
 *
 *   SA.surfaces.heightAt(x, z)        -> the deck top under (x, z) (ground height in the ramp zones), or null off every deck.
 *                                        SA.player.heightAt uses it, so the avatar stands on the deck above the water.
 *   SA.surfaces.onDeck(x, z)          true over any deck      SA.surfaces.walkable(x, z, margin)  true that far inside a deck's edges (animals)
 *   SA.surfaces.near(x, z, pad?)      true within pad of a river bridge's rectangle (trees, plants and animals keep off the ends)
 *   SA.surfaces.solids()              -> [[x, z, r], ...] rail circles of every deck (no height: a jump never clears a rail)
 *   SA.surfaces.layout(seed?)         -> the seeded river bridges (deterministic): 2 decks across the river, away from the ford
 *   SA.surfaces.bridges()             the cached default layout
 *   SA.surfaces.propDeck(rec)         -> the deck of a placed 'puente' record { prop, x, z }, or null for other props
 *   SA.surfaces.setPlaced(records)    registers the decks of the placed puente props (scene.js calls it whenever props change)
 *   SA.surfaces.decks()               river bridges + placed puente decks
 * Rendering: game/render/bridges.js (river bridges) and the 'bridge' builder in game/render/props.js (the sandbox puente).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SEED = 58;
  var COUNT = 2;
  var HALF_WID = 1.6;
  var RAIL_R = 0.14, RAIL_STEP = 0.4;
  var RAMP = 2;
  var DECK_ABOVE = 0.35;      // the deck sits this far above the highest bank it joins
  var MIN_ABOVE_WATER = 0.9;  // and never lower than this above the water level
  var MIN_GAP = 16;           // metres between the two bridges
  var FORD_CLEAR = 8;
  var PROP_HALF_LEN = 1.925, PROP_HALF_WID = 1.3, PROP_TOP = 0.27;   // the sandbox puente: seven 0.55 planks, deck top 0.27 above the ground/water
  var cached = null, placed = [], placedSolids = [], cachedSolids = null, allSolids = null;

  function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

  /** Where (x, z) lies on deck d: { u, v } along / across its centre line. */
  function local(d, x, z) {
    var rx = x - d.x, rz = z - d.z;
    return { u: rx * d.dx + rz * d.dz, v: -rx * d.dz + rz * d.dx };
  }

  /** Standing height on deck d at (x, z), or null off it. */
  function deckHeight(d, x, z) {
    var rx = x - d.x, rz = z - d.z, u = rx * d.dx + rz * d.dz, v = -rx * d.dz + rz * d.dx;
    if (Math.abs(v) > d.halfWid || Math.abs(u) > d.halfLen) return null;
    var g = SA.map.groundHeight(x, z), k = d.ramp > 0 ? smooth((d.halfLen - Math.abs(u)) / d.ramp) : 1;
    var h = g + (d.y - g) * k;
    return h > g ? h : g;
  }

  /** The rail posts of a deck: both sides, along the flat part. */
  function railCircles(d) {
    var out = [], span = d.halfLen - d.ramp, n = Math.max(1, Math.ceil(2 * span / RAIL_STEP)), off = d.halfWid - d.railR;
    for (var i = 0; i <= n; i++) {
      var u = -span + (2 * span * i) / n;
      [-1, 1].forEach(function (side) {
        out.push([d.x + d.dx * u - d.dz * off * side, d.z + d.dz * u + d.dx * off * side, d.railR]);
      });
    }
    return out;
  }

  /** A river bridge across the river at height z, perpendicular to the river's line. */
  function riverDeck(z, id) {
    var M = SA.map, R = M.RIVER, cx = M.riverX(z), slope = R.wiggle * R.freq * Math.cos(R.freq * z), n = Math.hypot(1, slope);
    var d = { id: id, x: cx, z: z, dx: 1 / n, dz: -slope / n, halfLen: R.halfWidth + 2 + RAMP, halfWid: HALF_WID, y: 0, ramp: RAMP, railR: RAIL_R };   // the river bed ends 4.6 from the centre line; the ramps run from there to the banks
    var top = M.WATER_LEVEL + MIN_ABOVE_WATER;
    [-1, 1].forEach(function (s) {
      [d.halfLen, d.halfLen - RAMP].forEach(function (u) { top = Math.max(top, M.groundHeight(d.x + d.dx * u * s, d.z + d.dz * u * s) + DECK_ABOVE); });
    });
    d.y = top;
    return d;
  }

  function dryEnds(d, pad) {
    var M = SA.map, range = M.biomeRange('bosque');
    for (var i = 0; i < 2; i++) {
      var s = i ? 1 : -1, ex = d.x + d.dx * d.halfLen * s, ez = d.z + d.dz * d.halfLen * s, c = [ex, ez];
      if (ex < range.lo + 3 || ex > range.hi - 3 || ez < M.BOUNDS.minZ + 4 || ez > M.BOUNDS.maxZ - 4) return false;
      if (M.groundHeight(c[0], c[1]) < M.WATER_LEVEL + 0.05) return false;   // the tip is on the bank (the banks hover just above the water level), not in the water
      if (SA.station && SA.station.inFootprint(ex, ez, pad + 2)) return false;
      if (SA.player && SA.player.inSpawnZone(ex, ez, pad)) return false;
    }
    return true;
  }

  function layout(seed) {
    var M = SA.map, rand = M.rng(seed === undefined ? SEED : seed), out = [], lo = M.BOUNDS.minZ + 6, hi = M.BOUNDS.maxZ - 6;
    function ok(z) {
      if (Math.abs(z - M.FORD.z) < FORD_CLEAR) return false;
      for (var i = 0; i < out.length; i++) if (Math.abs(out[i].z - z) < MIN_GAP) return false;
      return dryEnds(riverDeck(z, ''), 2);
    }
    for (var t = 0; t < 200 && out.length < COUNT; t++) {
      var z = lo + rand() * (hi - lo);
      if (ok(z)) out.push(riverDeck(z, ''));
    }
    for (var zz = lo; out.length < COUNT && zz <= hi; zz += 1) if (ok(zz)) out.push(riverDeck(zz, ''));   // seeded picks fell short: scan
    out.sort(function (a, b) { return a.z - b.z; });
    out.forEach(function (d, i) { d.id = 'puente' + (i + 1); });
    return out;
  }

  function bridges() { return cached || (cached = layout()); }

  /** The deck of a placed sandbox puente (it lies along x, on the ground or water level under its centre). */
  function propDeck(rec) {
    if (!rec || rec.prop !== 'puente' || !isFinite(rec.x) || !isFinite(rec.z)) return null;
    var base = Math.max(SA.map.groundHeight(rec.x, rec.z), SA.map.WATER_LEVEL);
    return { id: rec.id || 'puente', x: rec.x, z: rec.z, dx: 1, dz: 0, halfLen: PROP_HALF_LEN, halfWid: PROP_HALF_WID, y: base + PROP_TOP, ramp: 0, railR: 0.1 };
  }

  function setPlaced(records) {
    placed = []; placedSolids = []; allSolids = null;
    (records || []).forEach(function (r) {
      var d = propDeck(r);
      if (d) { placed.push(d); placedSolids = placedSolids.concat(railCircles(d)); }
    });
    if (placedSolids.length) allSolids = solids().concat(placedSolids);   // built once per change, not per frame
  }

  function decks() { return bridges().concat(placed); }

  function heightAt(x, z) {
    var list = bridges(), best = null, i, h;
    for (i = 0; i < list.length; i++) { h = deckHeight(list[i], x, z); if (h !== null && (best === null || h > best)) best = h; }
    for (i = 0; i < placed.length; i++) { h = deckHeight(placed[i], x, z); if (h !== null && (best === null || h > best)) best = h; }
    return best;
  }

  function onDeck(x, z) { return heightAt(x, z) !== null; }

  function walkable(x, z, margin) {
    var list = decks(), m = margin || 0;
    for (var i = 0; i < list.length; i++) {
      var l = local(list[i], x, z);
      if (Math.abs(l.v) <= list[i].halfWid - m && Math.abs(l.u) <= list[i].halfLen) return true;
    }
    return false;
  }

  function near(x, z, pad) {
    var list = bridges(), p = pad || 0;
    for (var i = 0; i < list.length; i++) {
      var l = local(list[i], x, z);
      if (Math.abs(l.v) <= list[i].halfWid + p && Math.abs(l.u) <= list[i].halfLen + p) return true;
    }
    return false;
  }

  function solids() {
    if (!cachedSolids) { cachedSolids = []; bridges().forEach(function (d) { cachedSolids = cachedSolids.concat(railCircles(d)); }); }
    return allSolids || cachedSolids;
  }

  SA.surfaces = { SEED: SEED, HALF_WID: HALF_WID, RAMP: RAMP, layout: layout, bridges: bridges, propDeck: propDeck, setPlaced: setPlaced, decks: decks,
    deckHeight: deckHeight, railCircles: railCircles, heightAt: heightAt, onDeck: onDeck, walkable: walkable, near: near, solids: solids };
})(typeof window !== 'undefined' ? window : globalThis);
