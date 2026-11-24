// AS-0291: SA.terrain.groundColor, seeded per-vertex ground colours per biome (pure, node:vm, no THREE).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/map.js', 'game/terrain-color.js']);
const T = SA.terrain;
const SEED = 7;
const key = (c) => `${c.r.toFixed(3)},${c.g.toFixed(3)},${c.b.toFixed(3)}`;
const lum = (c) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
const mid = (id) => { const r = SA.map.biomeRange(id); return r.centerX; };

function sample(id, h = 0.5, n = 400) {
  const cx = mid(id), out = [];
  for (let i = 0; i < n; i++) out.push({ ...T.groundColor(cx - 10 + (i % 20), -20 + Math.floor(i / 20), h, SEED) });
  return out;
}

test('same inputs give the same colour; the seed changes it; channels stay in 0..1', () => {
  const a = T.groundColor(-20.5, 3.25, 0.4, SEED), b = T.groundColor(-20.5, 3.25, 0.4, SEED);
  assert.deepEqual({ ...a }, { ...b });
  const seeds = new Set();
  for (let s = 1; s <= 6; s++) seeds.add(key(T.groundColor(-20.5, 3.25, 0.4, s)));
  assert.ok(seeds.size > 1, 'different seeds give different ground');
  for (let x = -112; x <= 112; x += 3.7) {
    const c = T.groundColor(x, x * 0.3, 1.2, SEED);
    for (const v of [c.r, c.g, c.b]) assert.ok(v >= 0 && v <= 1);
  }
});

test('an out object is reused (no allocation) and returned', () => {
  const out = { r: 9, g: 9, b: 9 };
  assert.equal(T.groundColor(10, 10, 0, SEED, out), out);
  assert.ok(out.r <= 1);
});

test('every biome varies from place to place', () => {
  for (const id of ['bosque', 'selva', 'desierto', 'montana']) {
    const distinct = new Set(sample(id).map(key));
    assert.ok(distinct.size > 20, `${id} has ${distinct.size} distinct colours`);
  }
});

test('biomes look different: forest is green, jungle is dark soil, desert is sandy, scree is grey', () => {
  const avg = (id) => {
    const s = sample(id), m = { r: 0, g: 0, b: 0 };
    for (const c of s) { m.r += c.r / s.length; m.g += c.g / s.length; m.b += c.b / s.length; }
    return m;
  };
  const f = avg('bosque'), j = avg('selva'), d = avg('desierto'), m = avg('montana');
  assert.ok(f.g > f.r && f.g > f.b, 'forest green');
  assert.ok(lum(j) < lum(f) - 0.1 && j.r > j.b, 'jungle is darker and earthy');
  assert.ok(d.r > d.b + 0.2 && lum(d) > lum(f), 'desert is sand');
  assert.ok(Math.abs(m.r - m.g) < 0.1 && Math.abs(m.g - m.b) < 0.1, 'scree is grey');
});

test('forest has dry and flowery patches among the greens', () => {
  const s = sample('bosque', 0.5, 2000);
  const cx = mid('bosque');
  const more = [];
  for (let i = 0; i < 2000; i++) more.push({ ...T.groundColor(cx - 25 + (i % 50), -30 + Math.floor(i / 50), 0.5, SEED) });
  const all = s.concat(more);
  assert.ok(all.some((c) => c.r > c.g * 0.95), 'a dry (yellowish) patch');
  assert.ok(all.some((c) => c.b > 0.6 || c.r > 0.85), 'a flower');
});

test('desert has ripple stripes: light crests and darker troughs repeat along x', () => {
  const cx = mid('desierto'), ls = [];
  for (let x = cx - 12; x <= cx + 12; x += 0.25) ls.push(lum(T.groundColor(x, 0, 0.3, SEED)));
  let flips = 0;
  for (let i = 2; i < ls.length; i++) if ((ls[i] - ls[i - 1]) * (ls[i - 1] - ls[i - 2]) < 0 && Math.abs(ls[i] - ls[i - 1]) > 0.002) flips++;
  assert.ok(flips >= 3, `${flips} ripple turning points over 24 m`);
  assert.ok(Math.max(...ls) - Math.min(...ls) > 0.08, 'crests are visibly lighter than troughs');
});

test('mountain: scree is grey low down and snow takes over with height', () => {
  const cx = mid('montana');
  const bright = (h) => {
    let t = 0;
    for (let i = 0; i < 100; i++) { const c = T.groundColor(cx - 10 + (i % 10) * 2, -20 + Math.floor(i / 10) * 2, h, SEED); t += c.r + c.g + c.b; }
    return t / 100;
  };
  const lo = bright(0.2), mid2 = bright(2.6), hi = bright(4.2);
  assert.ok(lo < mid2 && mid2 < hi, `brighter with height: ${lo.toFixed(2)} < ${mid2.toFixed(2)} < ${hi.toFixed(2)}`);
  assert.ok(hi > 2.6, 'high ground is near white');
  assert.ok(lo < 2.2, 'low ground is grey scree');
  // At the snow line some spots are snowy and some are bare: patches.
  const set = new Set();
  for (let i = 0; i < 200; i++) { const c = T.groundColor(cx - 20 + i * 0.2, 5 + (i % 7), 2.4, SEED); set.add(c.r + c.g + c.b > 2.4 ? 'snow' : 'bare'); }
  assert.equal(set.size, 2, 'snow patches and bare scree both occur at the snow line');
});

test('colours blend softly across a biome border over a few metres', () => {
  const border = SA.map.STRIPS[1].hi;   // bosque | selva
  const step = 0.25;
  const xs = [], cs = [];
  // Column means over many z (averages out the per-vertex speckle, leaving the biome-to-biome trend).
  for (let x = border - 8; x <= border + 8; x += step) {
    let r = 0;
    for (let z = -30; z <= 30; z += 1) r += T.groundColor(x, z, 0.3, SEED).r;
    xs.push(x); cs.push({ r: r / 61 });
  }
  const mean = (arr, f) => arr.reduce((a, c) => a + f(c), 0) / arr.length;
  const west = mean(cs.slice(0, 8), (c) => c.r), east = mean(cs.slice(-8), (c) => c.r);
  assert.ok(west > east + 0.1, 'forest side is redder than the jungle soil side');
  // Smooth: no step between neighbouring samples anywhere near the border is a big part of the full contrast.
  const contrast = Math.abs(west - east);
  for (let i = 1; i < cs.length; i++) {
    if (Math.abs(xs[i] - border) > T.BLEND_HALF + 1.5) continue;
    assert.ok(Math.abs(cs[i].r - cs[i - 1].r) < contrast * 0.3, `no hard edge at x=${xs[i]}`);
  }
  // The transition region is metres wide: values between the two sides' averages occur over >= 2 m of travel.
  const between = xs.filter((x, i) => cs[i].r < west - contrast * 0.2 && cs[i].r > east + contrast * 0.2);
  assert.ok(between.length * step >= 2, `${between.length * step} m of blended ground`);
});

test('every border in the map blends (no hard edge between neighbouring strips)', () => {
  for (let i = 0; i < SA.map.STRIPS.length - 1; i++) {
    const b = SA.map.STRIPS[i].hi;
    for (const z of [-20, 0, 20]) {
      let worst = 0, prev = T.groundColor(b - 6, z, 0.3, SEED), p = { ...prev };
      for (let x = b - 6 + 0.25; x <= b + 6; x += 0.25) {
        const c = T.groundColor(x, z, 0.3, SEED);
        worst = Math.max(worst, Math.abs(lum(c) - lum(p)));
        p = { ...c };
      }
      assert.ok(worst < 0.2, `border ${i} z=${z}: biggest step ${worst.toFixed(3)}`);
    }
  }
});
