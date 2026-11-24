/* SA.desertPlan: pure, seeded layout of the desierto landmarks, one rock arch and one small oasis (pool + palms). AS-0308, slice 2/4 of AS-0136.
 * No THREE, no DOM; node:vm tested. Load after game/map.js (optionally game/station.js, game/player.js, game/peaks.js).
 *
 *   SA.desertPlan.layout(seed?) -> { arch, oasis }, the same for the same seed.
 *       arch  { x, z, ang, gap, pillarR, height, groundY, pillars: [{ x, z }, { x, z }], r }
 *             (x, z) the centre of the gap, `ang` the direction of the line joining the two pillars, `gap` the clear walkway between
 *             the pillar surfaces, `height` the top of the lintel above groundY (the lowest ground under the arch). r = footprint radius.
 *       oasis { x, z, poolR, groundY (highest ground under the pool), lowY (lowest), palms: [{ x, z, h, lean, rot, tone }], r }   (the pool is a flat disc at groundY, r = footprint radius)
 *   SA.desertPlan.get()          the cached default layout
 *   SA.desertPlan.solids()       -> [[x, z, r, h], ...] what blocks the player (scene.js adds it to the obstacles): the two arch pillars (tall,
 *       so a jump never clears them), the pool (you do not wade in) and the palm trunks. The gap under the arch is NOT a solid: it stays walkable.
 *   SA.desertPlan.near(x, z, pad?) true within pad of either footprint; decor, plants, pickups and animals keep out (decor-plan.js,
 *       ground-cover-plan.js, pickups.js, animal-plan.js, wander.js)
 *   SA.desertPlan.inPool(x, z, pad?) true over the oasis pool
 * Both sit well inside the desierto (away from the biome borders and the dune fade-in), far from the spawn and the station, on gentle ground.
 * Rendering: game/render/desert-landmarks.js.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var SEED = 308;
  var TRIES = 3000;
  var BORDER = 10;          // metres kept clear of every biome border and the map edge
  var ARCH_GAP = 3.4, PILLAR_R = 1.3, ARCH_H = 6.2, ARCH_SPAN_PAD = 1.2;
  var POOL_R = 3.4, OASIS_R = 7.5, PALMS = 5;
  var MIN_APART = 20;       // metres between the arch and the oasis centres
  var MAX_STEP = 0.9;        // largest ground-height spread allowed under a footprint
  var cached = null, cachedSolids = null;

  function spread(x, z, r) {
    var M = SA.map, lo = Infinity, hi = -Infinity;
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6, h = M.groundHeight(x + r * Math.cos(a), z + r * Math.sin(a));
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    var c = M.groundHeight(x, z);
    return { lo: Math.min(lo, c), hi: Math.max(hi, c) };
  }

  function siteOk(x, z, r) {
    var M = SA.map, range = M.biomeRange('desierto'), B = M.BOUNDS;
    var lo = Math.max(range.lo, M.DUNE_EDGE) + BORDER + r, hi = range.hi - BORDER - r;
    if (x < lo || x > hi || z < B.minZ + BORDER || z > B.maxZ - BORDER) return false;
    if (SA.player && SA.player.inSpawnZone(x, z, r + 2)) return false;
    if (SA.station && SA.station.inFootprint(x, z, r + 2)) return false;
    if (SA.peaks) for (var i = 0; i < SA.peaks.LIST.length; i++) if (Math.hypot(x - SA.peaks.LIST[i].x, z - SA.peaks.LIST[i].z) < SA.peaks.BASE_R + r) return false;
    return true;
  }

  /** The flattest of a few seeded candidate sites that passes `ok` (null when none does). */
  function flattest(rand, r, flatR, ok) {
    var M = SA.map, range = M.biomeRange('desierto'), B = M.BOUNDS, best = null, bestScore = Infinity, found = 0;
    for (var t = 0; t < TRIES && found < 12; t++) {
      var x = range.lo + rand() * (range.hi - range.lo), z = B.minZ + rand() * (B.maxZ - B.minZ);
      if (!siteOk(x, z, r) || (ok && !ok(x, z))) continue;
      var s = spread(x, z, flatR), score = s.hi - s.lo;
      if (score > MAX_STEP) continue;
      found++;
      if (score < bestScore) { bestScore = score; best = { x: x, z: z, lo: s.lo, hi: s.hi }; }
    }
    return best;
  }

  function makeArch(rand) {
    var site = flattest(rand, OASIS_R * 0.6, OASIS_R * 0.6, null);
    if (!site) return null;
    var ang = rand() * Math.PI, ux = Math.cos(ang), uz = Math.sin(ang), off = ARCH_GAP / 2 + PILLAR_R;
    var pillars = [{ x: site.x - ux * off, z: site.z - uz * off }, { x: site.x + ux * off, z: site.z + uz * off }];
    return { x: site.x, z: site.z, ang: ang, gap: ARCH_GAP, pillarR: PILLAR_R, height: ARCH_H, groundY: site.lo, topY: site.hi + ARCH_H, pillars: pillars,
      r: off + PILLAR_R + ARCH_SPAN_PAD };
  }

  function makeOasis(rand, arch) {
    var site = flattest(rand, OASIS_R, POOL_R + 1.6, function (x, z) { return !arch || Math.hypot(x - arch.x, z - arch.z) >= MIN_APART; });
    if (!site) return null;
    var M = SA.map, palms = [], rot0 = rand() * Math.PI * 2;
    for (var i = 0; i < PALMS; i++) {
      var a = rot0 + i * (Math.PI * 2 / PALMS) + (rand() - 0.5) * 0.5, d = POOL_R + 1.3 + rand() * 1.6;
      var px = site.x + Math.cos(a) * d, pz = site.z + Math.sin(a) * d;
      palms.push({ x: px, z: pz, h: 3.4 + rand() * 1.6, lean: 0.12 + rand() * 0.18, rot: a, tone: rand(), y: M.groundHeight(px, pz) });
    }
    return { x: site.x, z: site.z, poolR: POOL_R, groundY: site.hi, lowY: site.lo, palms: palms, r: OASIS_R };
  }

  function layout(seed) {
    var rand = SA.map.rng(seed === undefined ? SEED : seed), arch = makeArch(rand), oasis = makeOasis(rand, arch);
    return { arch: arch, oasis: oasis };
  }

  function get() { return cached || (cached = layout()); }

  function solids() {
    if (cachedSolids) return cachedSolids;
    var L = get(), out = [];
    if (L.arch) L.arch.pillars.forEach(function (p) { out.push([p.x, p.z, L.arch.pillarR, 99]); });
    if (L.oasis) {
      out.push([L.oasis.x, L.oasis.z, L.oasis.poolR, 99]);
      L.oasis.palms.forEach(function (p) { out.push([p.x, p.z, 0.35, 99]); });
    }
    return (cachedSolids = out);
  }

  function near(x, z, pad) {
    var L = get(), p = pad || 0;
    return !!((L.arch && Math.hypot(x - L.arch.x, z - L.arch.z) < L.arch.r + p) || (L.oasis && Math.hypot(x - L.oasis.x, z - L.oasis.z) < L.oasis.r + p));
  }

  function inPool(x, z, pad) {
    var o = get().oasis;
    return !!o && Math.hypot(x - o.x, z - o.z) < o.poolR + (pad || 0);
  }

  SA.desertPlan = { SEED: SEED, MIN_APART: MIN_APART, layout: layout, get: get, solids: solids, near: near, inPool: inPool };
})(typeof window !== 'undefined' ? window : globalThis);
