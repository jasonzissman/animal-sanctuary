/* SA.groundCoverPlan: pure, seeded placement of grass tufts and tiny plants (no THREE, no DOM; node:vm tested). AS-0294.
 * Load after game/map.js, game/data/biomes.js and game/peaks.js, game/station.js, game/player.js (the last three are optional).
 *
 *   SA.groundCoverPlan.RULES                data rows { biome, kind: 'grass'|'plant', count, scale: [lo, hi], accentMix, from }
 *   SA.groundCoverPlan.palette(biomeId)     -> { grass: [hex, hex, hex], plant: [hex, hex, hex] } tints from the biome data
 *                                           (ground colour, shaded; `accentMix` blends the biome accent in; plants use `from`: 'ground' | 'accent')
 *   SA.groundCoverPlan.plan(opts?)          -> [{ kind, biome, x, z, y, scale, rot, tone, rank }]  (opts.seed, default 7)
 *       A jittered grid over each biome strip, so cover is even and identical on every load. Nothing lands in water, on the spawn
 *       clearing, on the station footprint or on a peak. `tone` 0..1 picks a colour across the palette, `rank` 0..1 is the entry's
 *       stable thinning key: it is kept while the player is closer than radius * (1 - rank), so density falls off with distance.
 *   SA.groundCoverPlan.makeGrid(entries)    -> grid (a coarse cell index over the entries, built once)
 *   SA.groundCoverPlan.select(grid, px, pz, radius, out) -> count; writes the entry indices to keep into the Int32Array `out`
 *       (stops when full). Allocates nothing, so the renderer can call it as the player walks.
 * Ground cover is soft: it is never an obstacle (SA.blocking and the decor list never see it). game/render/ground-cover.js draws it.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var DRY = 0.3;        // ground must be this far above the water level
  var CELL = 8;         // grid cell size for select()
  var EDGE = 1;         // keep this far inside BOUNDS

  // ~1 tuft per m2 of dry ground; plants are rarer. `accentMix` blends the biome accent into the grass tint; plants take their tint
  // from the biome ground (ferns) or accent (flowers, desert shrubs).
  var RULES = [
    { biome: 'bosque', kind: 'grass', count: 4000, scale: [0.7, 1.3], accentMix: 0, from: 'ground' },
    { biome: 'bosque', kind: 'plant', count: 900, scale: [0.7, 1.2], accentMix: 0, from: 'ground' },
    { biome: 'selva', kind: 'grass', count: 4000, scale: [0.8, 1.5], accentMix: 0, from: 'ground' },
    { biome: 'selva', kind: 'plant', count: 1000, scale: [0.8, 1.4], accentMix: 0, from: 'accent' },
    { biome: 'desierto', kind: 'grass', count: 2600, scale: [0.6, 1.1], accentMix: 0.45, from: 'ground' },
    { biome: 'desierto', kind: 'plant', count: 500, scale: [0.6, 1.0], accentMix: 0, from: 'accent' },
    { biome: 'montana', kind: 'grass', count: 2600, scale: [0.6, 1.1], accentMix: 0.3, from: 'ground' },
    { biome: 'montana', kind: 'plant', count: 700, scale: [0.6, 1.0], accentMix: 0, from: 'accent' },
  ];

  function parse(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function toHex(c) {
    return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function scaleBy(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }

  function biomeData(id) {
    var list = SA.data && SA.data.all ? SA.data.all('biomes') : [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return { id: id, ground: '#7cb86a', accent: '#4aa3c7' };
  }

  function ruleFor(biome, kind) {
    for (var i = 0; i < RULES.length; i++) if (RULES[i].biome === biome && RULES[i].kind === kind) return RULES[i];
    return { accentMix: 0, from: 'ground' };
  }

  /** Three tints per kind: dark, mid, light. */
  function palette(biomeId) {
    var b = biomeData(biomeId), ground = parse(b.ground), accent = parse(b.accent), out = {};
    ['grass', 'plant'].forEach(function (kind) {
      var r = ruleFor(biomeId, kind);
      var base = kind === 'grass' ? mix(ground, accent, r.accentMix) : r.from === 'accent' ? accent : scaleBy(ground, 0.8);
      out[kind] = [toHex(scaleBy(base, 0.72)), toHex(base), toHex(mix(scaleBy(base, 1.12), [255, 255, 255], 0.12))];
    });
    return out;
  }

  function usable(x, z) {
    var M = SA.map;
    if (M.groundHeight(x, z) < M.WATER_LEVEL + DRY) return false;
    if (SA.player && SA.player.inSpawnZone(x, z)) return false;
    if (SA.station && SA.station.inFootprint(x, z, 1)) return false;
    if (SA.peaks) {
      for (var i = 0; i < SA.peaks.LIST.length; i++) {
        var p = SA.peaks.LIST[i];
        if (Math.hypot(x - p.x, z - p.z) < SA.peaks.BASE_R + 0.5) return false;
      }
    }
    return true;
  }

  function plan(opts) {
    var M = SA.map, rand = M.rng(opts && opts.seed !== undefined ? opts.seed : 7), B = M.BOUNDS, out = [];
    RULES.forEach(function (rule) {
      var range = M.biomeRange(rule.biome);
      if (!range) return;
      var x0 = Math.max(range.lo, B.minX) + EDGE, x1 = Math.min(range.hi, B.maxX) - EDGE, z0 = B.minZ + EDGE, z1 = B.maxZ - EDGE;
      var w = x1 - x0, h = z1 - z0, cols = Math.max(1, Math.round(Math.sqrt(rule.count * w / h))), rows = Math.max(1, Math.round(rule.count / cols));
      var cw = w / cols, ch = h / rows;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var x = x0 + (c + rand()) * cw, z = z0 + (r + rand()) * ch;
        var scale = rule.scale[0] + rand() * (rule.scale[1] - rule.scale[0]), rot = rand() * Math.PI * 2, tone = rand(), rank = rand();
        if (!usable(x, z)) continue;
        out.push({ kind: rule.kind, biome: rule.biome, x: x, z: z, y: M.groundHeight(x, z), scale: scale, rot: rot, tone: tone, rank: rank });
      }
    });
    return out;
  }

  function cellIndex(grid, ix, iz) { return (ix - grid.ix0) * grid.nz + (iz - grid.iz0); }

  function makeGrid(entries) {
    var minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, i;
    for (i = 0; i < entries.length; i++) {
      minX = Math.min(minX, entries[i].x); maxX = Math.max(maxX, entries[i].x);
      minZ = Math.min(minZ, entries[i].z); maxZ = Math.max(maxZ, entries[i].z);
    }
    if (!entries.length) { minX = minZ = maxX = maxZ = 0; }
    var ix0 = Math.floor(minX / CELL), iz0 = Math.floor(minZ / CELL), nx = Math.floor(maxX / CELL) - ix0 + 1, nz = Math.floor(maxZ / CELL) - iz0 + 1;
    var grid = { ix0: ix0, iz0: iz0, nx: nx, nz: nz, cells: [], x: new Float32Array(entries.length), z: new Float32Array(entries.length), rank: new Float32Array(entries.length) };
    for (i = 0; i < nx * nz; i++) grid.cells.push([]);
    for (i = 0; i < entries.length; i++) {
      grid.x[i] = entries[i].x; grid.z[i] = entries[i].z; grid.rank[i] = entries[i].rank;
      grid.cells[cellIndex(grid, Math.floor(entries[i].x / CELL), Math.floor(entries[i].z / CELL))].push(i);
    }
    return grid;
  }

  function select(grid, px, pz, radius, out) {
    var n = 0, cap = out.length;
    var cx0 = Math.max(grid.ix0, Math.floor((px - radius) / CELL)), cx1 = Math.min(grid.ix0 + grid.nx - 1, Math.floor((px + radius) / CELL));
    var cz0 = Math.max(grid.iz0, Math.floor((pz - radius) / CELL)), cz1 = Math.min(grid.iz0 + grid.nz - 1, Math.floor((pz + radius) / CELL));
    for (var cx = cx0; cx <= cx1; cx++) for (var cz = cz0; cz <= cz1; cz++) {
      var cell = grid.cells[cellIndex(grid, cx, cz)];
      for (var k = 0; k < cell.length; k++) {
        var i = cell[k], dx = grid.x[i] - px, dz = grid.z[i] - pz, reach = radius * (1 - grid.rank[i]);
        if (dx * dx + dz * dz < reach * reach) { if (n >= cap) return n; out[n++] = i; }
      }
    }
    return n;
  }

  SA.groundCoverPlan = { RULES: RULES, CELL: CELL, palette: palette, plan: plan, makeGrid: makeGrid, select: select };
})(typeof window !== 'undefined' ? window : globalThis);
