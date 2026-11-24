/* SA.groundCoverPlan: pure, seeded placement of grass tufts and the per-biome ground plants (no THREE, no DOM; node:vm tested). AS-0294, AS-0295.
 * Load after game/map.js, game/data/biomes.js, game/data/plants.js and game/peaks.js, game/station.js, game/player.js (the last three are optional).
 *
 *   SA.groundCoverPlan.RULES                grass rows { biome, kind: 'grass', count, scale: [lo, hi], accentMix }
 *   SA.groundCoverPlan.plants()             the plant data rows (game/data/plants.js: id, biome, family, shape, count, scale, tints, sway)
 *   SA.groundCoverPlan.palette(biomeId)     -> { grass: [hex, hex, hex] } tints from the biome data (ground colour, shaded; `accentMix` blends the accent in)
 *   SA.groundCoverPlan.plan(opts?)          -> [{ kind: 'grass'|'plant', plant?: plant id, biome, x, z, y, scale, rot, tone, rank }]  (opts.seed, default 7)
 *       Grass is placed first, so adding or editing plant data never moves a tuft.
 *       A jittered grid over each biome strip, so cover is even and identical on every load. Nothing lands in water, on the spawn
 *       clearing, on the station footprint, on a peak or on a forest dirt path (SA.forestPaths). `tone` 0..1 picks a colour across the palette, `rank` 0..1 is the entry's
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

  // ~1 tuft per m2 of dry ground. `accentMix` blends the biome accent into the grass tint. Plants are data (game/data/plants.js).
  var RULES = [
    { biome: 'bosque', kind: 'grass', count: 4000, scale: [0.7, 1.3], accentMix: 0 },
    { biome: 'selva', kind: 'grass', count: 4000, scale: [0.8, 1.5], accentMix: 0 },
    { biome: 'desierto', kind: 'grass', count: 2600, scale: [0.6, 1.1], accentMix: 0.45 },
    { biome: 'montana', kind: 'grass', count: 2600, scale: [0.6, 1.1], accentMix: 0.3 },
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

  function ruleFor(biome) {
    for (var i = 0; i < RULES.length; i++) if (RULES[i].biome === biome) return RULES[i];
    return { accentMix: 0 };
  }

  function plants() { return SA.data && SA.data.all ? SA.data.all('plant') : []; }

  /** Grass tints: dark, mid, light. */
  function palette(biomeId) {
    var b = biomeData(biomeId), base = mix(parse(b.ground), parse(b.accent), ruleFor(biomeId).accentMix);
    return { grass: [toHex(scaleBy(base, 0.72)), toHex(base), toHex(mix(scaleBy(base, 1.12), [255, 255, 255], 0.12))] };
  }

  function usable(x, z, pad) {
    var M = SA.map;
    if (M.groundHeight(x, z) < M.WATER_LEVEL + DRY) return false;
    if (SA.player && SA.player.inSpawnZone(x, z)) return false;
    if (SA.station && SA.station.inFootprint(x, z, 1)) return false;
    if (SA.forestPaths && SA.forestPaths.onPath(x, z, pad)) return false;   // bare dirt on the forest paths (AS-0300)
    if (SA.peaks) {
      for (var i = 0; i < SA.peaks.LIST.length; i++) {
        var p = SA.peaks.LIST[i];
        if (Math.hypot(x - p.x, z - p.z) < SA.peaks.BASE_R + 0.5) return false;
      }
    }
    return true;
  }

  /** A jittered grid of ~`count` cells over the biome strip; calls add(x, z) once per cell (the caller rolls the rest from `rand`). */
  function scatter(rand, biome, count, add) {
    var M = SA.map, B = M.BOUNDS, range = M.biomeRange(biome);
    if (!range) return;
    var x0 = Math.max(range.lo, B.minX) + EDGE, x1 = Math.min(range.hi, B.maxX) - EDGE, z0 = B.minZ + EDGE, z1 = B.maxZ - EDGE;
    var w = x1 - x0, h = z1 - z0, cols = Math.max(1, Math.round(Math.sqrt(count * w / h))), rows = Math.max(1, Math.round(count / cols));
    var cw = w / cols, ch = h / rows;
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) add(x0 + (c + rand()) * cw, z0 + (r + rand()) * ch);
  }

  function plan(opts) {
    var M = SA.map, rand = M.rng(opts && opts.seed !== undefined ? opts.seed : 7), out = [];
    function put(kind, plant, biome, range) {
      return function (x, z) {
        var scale = range[0] + rand() * (range[1] - range[0]), rot = rand() * Math.PI * 2, tone = rand(), rank = rand();
        if (!usable(x, z, plant ? 0.8 : 0.2)) return;
        var e = { kind: kind, biome: biome, x: x, z: z, y: M.groundHeight(x, z), scale: scale, rot: rot, tone: tone, rank: rank };
        if (plant) e.plant = plant;
        out.push(e);
      };
    }
    RULES.forEach(function (rule) { scatter(rand, rule.biome, rule.count, put('grass', null, rule.biome, rule.scale)); });
    plants().forEach(function (p) { scatter(rand, p.biome, p.count, put('plant', p.id, p.biome, p.scale)); });
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

  /** Instances the renderer reserves for one pool: grass is a fixed 1400; a plant gets ~45% of its entries (about 3x what select() ever returns). */
  function poolSize(kind, entryCount) { return kind === 'grass' ? 1400 : Math.ceil(entryCount * 0.45) + 32; }

  SA.groundCoverPlan = { poolSize: poolSize, RULES: RULES, CELL: CELL, plants: plants, palette: palette, plan: plan, makeGrid: makeGrid, select: select };
})(typeof window !== 'undefined' ? window : globalThis);
